"""Campaign Manager — Orchestrates the Red Team, Target, and Judge."""

from __future__ import annotations

import logging
import time
from typing import Any

from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn

from src.agents import JudgeAgent, RedTeamAgent, TargetAgent
from src.agents.handoff_worker import deliver_handoff, run_judge_hop, run_target_hop
from src.attacks.social_engineering import SocialEngineeringAttack
from src.core.campaign_exec import context_from_campaign, publish_exec_context
from src.core.config import settings
from src.core.hmac_handoff import HandoffIntegrityError, nonce_digest, sign_handoff
from src.core.models.hops import HmacState
from src.data import AttackLibrary, ResultsStore, VectorStoreManager
from src.models import (
    AttackCategory,
    AttackPayload,
    CampaignConfig,
    CampaignSummary,
    HopLatencyMs,
    RoundResult,
    JudgeScore,
    TargetResponse,
    Verdict,
)
from src.orchestrator.state_machine import CampaignStateMachine
from src.reporting.cli_reporter import CLIReporter
from src.reporting.markdown_report import MarkdownReportGenerator

logger = logging.getLogger(__name__)
console = Console()


class CampaignManager:
    """Orchestrates an end-to-end wargame campaign with evolutionary learning."""

    reporter = CLIReporter()
    report_gen = MarkdownReportGenerator()

    def __init__(
        self,
        config: CampaignConfig,
        app_config: dict[str, Any],
        *,
        transient_target_api_key: str | None = None,
    ) -> None:
        self.config = config
        self.app_config = app_config
        self.fsm = CampaignStateMachine()

        # Init Data Layer
        self.vector_store = VectorStoreManager(
            persist_dir=app_config["artsa"]["vector_store"]["persist_directory"]
        )
        from pathlib import Path
        backend_dir = Path(__file__).resolve().parent.parent.parent
        lib_dir = backend_dir / "attack_library"
        self.attack_library = AttackLibrary(library_dir=str(lib_dir), vector_store=self.vector_store)
        self.attack_library.load_from_directory()


        self.results_store = ResultsStore(
            data_dir=app_config["artsa"]["data_dir"] + "/results"
        )

        if settings.ARTSA_HMAC_RECEIVER_WORKERS:
            # Workers construct Target/Judge from the exec snapshot and
            # resolve secrets locally. Do not send keys over Redis.
            self.target_agent = None
            self.judge = None
        else:
            self.target_agent = TargetAgent(config.target, explicit_api_key=transient_target_api_key)
            self.judge = JudgeAgent(config=app_config["artsa"]["judge"])

        try:
            publish_exec_context(context_from_campaign(config, app_config))
        except Exception:
            logger.exception("Failed to publish campaign exec context for %s", config.id)
            if settings.ARTSA_HMAC_RECEIVER_WORKERS:
                raise

        self.red_team = RedTeamAgent(
            config=app_config["artsa"]["red_team"],
            attack_profile=config.attack_profile,
            attack_library=self.attack_library,
            target_config=config.target,
        )

        # State tracking
        self.history_stats: dict[str, dict[str, Any]] = {}
        self.total_cost = 0.0
        self._pending_rewrite: AttackPayload | None = None  # Queued LLM rewrite for next round

    def _update_history_stats(self, round_result: RoundResult) -> None:
        cat = round_result.attack.category.value
        if cat not in self.history_stats:
            self.history_stats[cat] = {
                "attempts": 0,
                "total_score": 0.0,
                "avg_score": 0.0,
            }

        self.history_stats[cat]["attempts"] += 1
        self.history_stats[cat]["total_score"] += round_result.score.attack_success_score
        self.history_stats[cat]["avg_score"] = (
            self.history_stats[cat]["total_score"]
            / self.history_stats[cat]["attempts"]
        )

    def _open_handoff(
        self,
        *,
        sender: str,
        receiver: str,
        body: dict[str, Any],
        round_idx: int,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Sign and deliver to the Target/Judge receiver. Verify+audit happen
        on the receiver (in-process agent or independent Redis worker)."""
        envelope = sign_handoff(
            sender=sender,
            receiver=receiver,
            body=body,
            campaign_id=self.config.id,
            round_id=round_idx,
        )
        try:
            opened = deliver_handoff(envelope)
        except HandoffIntegrityError as exc:
            logger.error(
                "HMAC handoff failed sender=%s receiver=%s reason=%s campaign=%s round=%s",
                sender,
                receiver,
                exc.reason,
                self.config.id,
                round_idx,
            )
            raise
        meta = {
            "sender": sender,
            "receiver": receiver,
            "hmac_state": HmacState.OK.value,
            "hmac_verified": True,
            "replay_detected": False,
            "nonce_sha256": nonce_digest(opened.nonce),
            "event_id": opened.event_id,
            "verification_result": "OK",
            "receiver_process": "worker" if settings.ARTSA_HMAC_RECEIVER_WORKERS else "in_process",
        }
        return opened.body, meta

    def _log_hmac_abort(
        self, *, sender: str, receiver: str, round_idx: int, reason: str
    ) -> None:
        logger.error(
            "HMAC handoff failed sender=%s receiver=%s reason=%s campaign=%s round=%s",
            sender,
            receiver,
            reason,
            self.config.id,
            round_idx,
        )

    def _target_hop(
        self,
        payload: AttackPayload,
        round_idx: int,
        *,
        history: list[str] | None = None,
    ) -> dict[str, Any]:
        """Red Team signs; Target verifies, processes, then signs for Judge."""
        envelope = sign_handoff(
            sender="red_team",
            receiver="target",
            body=payload.model_dump(mode="json"),
            campaign_id=self.config.id,
            round_id=round_idx,
        )
        extra = {
            "exec_ref": {"campaign_id": self.config.id, "role": "target"},
            "history": history or [],
        }
        try:
            return run_target_hop(
                envelope,
                agent=None if settings.ARTSA_HMAC_RECEIVER_WORKERS else self.target_agent,
                history=history,
                extra=extra,
            )
        except HandoffIntegrityError as exc:
            self._log_hmac_abort(
                sender="red_team", receiver="target", round_idx=round_idx, reason=exc.reason
            )
            raise

    def _judge_hop(self, judge_envelope: dict[str, Any] | Any, round_idx: int) -> dict[str, Any]:
        """Judge verifies the Target-signed envelope, then scores. Orchestrator never signs as Target."""
        extra = {"exec_ref": {"campaign_id": self.config.id, "role": "judge"}}
        try:
            return run_judge_hop(
                judge_envelope,
                agent=None if settings.ARTSA_HMAC_RECEIVER_WORKERS else self.judge,
                extra=extra,
            )
        except HandoffIntegrityError as exc:
            self._log_hmac_abort(
                sender="target", receiver="judge", round_idx=round_idx, reason=exc.reason
            )
            raise

    def run(self, on_round_complete=None) -> CampaignSummary:
        """Run the campaign with evolutionary attack learning."""
        self.fsm.start()
        self.results_store.save_campaign_config(self.config)

        delay = self.app_config["artsa"]["rate_limit"]["delay_between_rounds_sec"]

        console.print(
            f"\n[bold blue]⚔️  Starting Campaign:[/bold blue] {self.config.name}"
        )
        console.print(
            f"   Target: [cyan]{self.config.target.model}[/cyan] | "
            f"Rounds: [cyan]{self.config.max_rounds}[/cyan] | "
            f"Evolution: [green]ON[/green]\n"
        )

        # Track all round results for reporting
        all_rounds: list[RoundResult] = []

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            console=console,
            transient=True,
        ) as progress:

            task = progress.add_task(
                "[cyan]Running wargame...", total=self.config.max_rounds
            )

            for round_idx in range(1, self.config.max_rounds + 1):
                round_start = time.time()

                # ─── 1. Maybe evolve the population ────────────────
                if round_idx > 1:
                    evolved = self.red_team.maybe_evolve()
                    if evolved:
                        gen = self.red_team.evolution_engine.current_generation
                        progress.update(
                            task,
                            description=f"[yellow]🧬 Evolution cycle! Generation {gen}",
                        )

                # ─── 2. Red Team selects category + generates attack ─
                progress.update(
                    task,
                    description=f"[cyan]Round {round_idx}: Red Team planning...",
                )

                # Use a pending LLM rewrite if one exists
                red_team_ms: float | None = None
                if self._pending_rewrite is not None:
                    attack_payload = self._pending_rewrite
                    category = attack_payload.category
                    self._pending_rewrite = None
                    # Rewrite was generated in a prior round — do not invent latency.
                else:
                    red_t0 = time.perf_counter()
                    category = self.red_team.select_attack_category(self.history_stats)
                    attack_payload = self.red_team.generate_attack(category)
                    red_team_ms = (time.perf_counter() - red_t0) * 1000

                # ─── 3. Target processes the attack (HMAC-verified handoff) ──
                is_chain = False
                hmac_handoffs: list[dict[str, Any]] = []
                judge_envelope: dict | None = None
                target_t0 = time.perf_counter()
                if category == AttackCategory.SOCIAL_ENGINEERING:
                    se_plugin = self.red_team.plugins.get(AttackCategory.SOCIAL_ENGINEERING)
                    if isinstance(se_plugin, SocialEngineeringAttack):
                        template_id = attack_payload.template_id
                        template = self.red_team.attack_library.get_by_id(template_id)
                        if template and se_plugin.is_multi_turn_template(template):
                            is_chain = True
                            chain = se_plugin.generate_chain(template)
                            progress.update(
                                task,
                                description=f"[cyan]Round {round_idx}: Multi-turn chain ({chain.total_turns} turns)...",
                            )
                            last_payload = attack_payload
                            last_response = None
                            judge_envelope = None
                            while not chain.is_complete():
                                last_payload = chain.current_payload()
                                history = chain.conversation_history or None
                                hop = self._target_hop(
                                    last_payload, round_idx, history=history
                                )
                                hmac_handoffs.append(hop["hmac_meta"])
                                last_payload = AttackPayload.model_validate(hop["payload"])
                                last_response = TargetResponse.model_validate(hop["response"])
                                judge_envelope = hop["judge_envelope"]
                                chain.advance(last_response.response)
                                if last_response.blocked:
                                    break
                            if last_response is not None and judge_envelope is not None:
                                attack_payload = last_payload
                                attack_payload.metadata["is_multi_turn"] = True
                                attack_payload.metadata["chain_turns"] = chain.total_turns
                                target_response = last_response
                            else:
                                is_chain = False
                                judge_envelope = None

                if not is_chain:
                    progress.update(
                        task,
                        description=f"[cyan]Round {round_idx}: Target processing...",
                    )
                    hop = self._target_hop(attack_payload, round_idx)
                    hmac_handoffs.append(hop["hmac_meta"])
                    attack_payload = AttackPayload.model_validate(hop["payload"])
                    target_response = TargetResponse.model_validate(hop["response"])
                    judge_envelope = hop["judge_envelope"]

                target_ms = (time.perf_counter() - target_t0) * 1000

                # ─── 4. Judge verifies Target-signed envelope, then scores ──
                progress.update(
                    task,
                    description=f"[cyan]Round {round_idx}: Judge evaluating...",
                )
                judge_t0 = time.perf_counter()
                judge_hop = self._judge_hop(judge_envelope, round_idx)
                hmac_handoffs.append(judge_hop["hmac_meta"])
                attack_payload = AttackPayload.model_validate(judge_hop["payload"])
                target_response = TargetResponse.model_validate(judge_hop["response"])
                score = JudgeScore.model_validate(judge_hop["score"])
                judge_ms = (time.perf_counter() - judge_t0) * 1000

                duration = (time.time() - round_start) * 1000

                # ─── 5. Record result ────────────────────────────────
                result = RoundResult(
                    round_number=round_idx,
                    attack=attack_payload,
                    response=target_response,
                    score=score,
                    duration_ms=duration,
                    hop_latency_ms=HopLatencyMs(
                        red_team=red_team_ms,
                        target=target_ms,
                        judge=judge_ms,
                    ),
                    hmac_handoffs=hmac_handoffs,
                )

                self.results_store.save_round(self.config.id, result)
                self.vector_store.log_attack_result(
                    attack_id=attack_payload.id,
                    template_id=attack_payload.template_id,
                    success=(score.verdict == Verdict.SUCCESS),
                    score=score.attack_success_score,
                    category=category.value,
                )
                self._update_history_stats(result)

                # Abort real runs when the target cannot answer — never fake a green scorecard.
                if score.verdict == Verdict.ERROR:
                    detail = getattr(target_response, "error_detail", None) or score.reasoning
                    raise ValueError(
                        "Target model unreachable — campaign aborted (invalid for security scoring). "
                        f"{detail}. Fix provider billing/API key or use a funded/local target, then re-run."
                    )

                # ─── 6. Feed into evolution engine ───────────────────
                self.red_team.feed_result(attack_payload, score)

                # ─── 6b. Maybe queue LLM rewrite for next round ──────
                if score.verdict in (Verdict.BLOCKED, Verdict.PARTIAL):
                    rewritten = self.red_team.rewrite_attack_with_llm(
                        attack_payload, score, target_response.response
                    )
                    if rewritten:
                        self._pending_rewrite = rewritten

                # ─── 7. Log per-round result ─────────────────────────
                all_rounds.append(result)
                self.reporter.print_round_result(result)

                progress.advance(task)
                if on_round_complete:
                    try:
                        on_round_complete(round_idx, self.config.max_rounds, result)
                    except TypeError:
                        # Legacy callbacks that only accept (completed, total).
                        on_round_complete(round_idx, self.config.max_rounds)

                if round_idx < self.config.max_rounds:
                    time.sleep(delay)

        self.fsm.complete()

        # Generate summary
        summary = self.results_store.generate_summary(self.config.id, self.config)
        self.fsm.report()

        # ─── Print rich CLI reports ──────────────────────────────────
        evo_summary = self.red_team.evolution_engine.get_evolution_summary()
        self.reporter.print_campaign_summary(summary)
        self.reporter.print_category_breakdown(summary)
        self.reporter.print_evolution_summary(evo_summary)
        self.reporter.print_top_findings(summary)

        # ─── Save Markdown report ────────────────────────────────────
        try:
            report_content = self.report_gen.generate(
                summary=summary,
                rounds=all_rounds,
                config=self.config,
                evolution_summary=evo_summary,
            )
            report_path = self.report_gen.save(
                campaign_id=self.config.id,
                content=report_content,
                base_dir=self.app_config["artsa"]["data_dir"] + "/results",
            )
            console.print(
                f"\n[bold green]📄 Report saved:[/bold green] [cyan]{report_path}[/cyan]"
            )
        except Exception as e:
            logger.warning("Failed to generate Markdown report: %s", e)

        return summary
