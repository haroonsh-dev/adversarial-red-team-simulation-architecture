"""Campaign orchestration routes (unified from api-gateway)."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any

import yaml
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_tenant
from src.api.ws_auth import require_ws_auth
from src.core.config import settings
from src.data.campaign_job_store import campaign_job_store
from src.data.db import get_async_session

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Campaigns"])

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent


class RunCampaignRequest(BaseModel):
    name: str = "Cyber Wargame Run"
    provider: str = "groq"
    model: str = "openai/gpt-oss-120b"
    attack_profile: str = "quick_scan"
    max_rounds: int = Field(default=10, ge=1, le=100)
    base_url: str | None = None
    # When set, the registered target is authoritative for provider/model/
    # base_url/system_prompt, and must be authorized before the run starts.
    target_id: str | None = None
    target_version: str | None = None
    system_prompt: str | None = None
    use_llm_judge: bool | None = None  # None = respect configs/default_config.yaml
    # Explicit AttackCategory codes (DPI, JBK, …) or UI labels ("Prompt Injection").
    categories: list[str] | None = None
    intensity: str | None = None  # Low | Med | High — drives mutation aggressiveness
    mutations_enabled: bool | None = None
    max_mutations_per_attack: int | None = Field(default=None, ge=0, le=8)
    target_agent: str | None = None
    target_tools: str | None = None


class BaselineCampaignRequest(BaseModel):
    """Phase 3 — auto baseline when a customer connects / onboards."""

    name: str = "Baseline quick scan"
    provider: str | None = None
    model: str | None = None
    max_rounds: int = Field(default=3, ge=1, le=100)
    use_llm_judge: bool | None = False
    categories: list[str] | None = None
    intensity: str | None = None
    mutations_enabled: bool | None = None
    max_mutations_per_attack: int | None = Field(default=None, ge=0, le=8)
    target_agent: str | None = None
    target_tools: str | None = None
    target_id: str | None = None


class BaselineScheduleRequest(BaseModel):
    """Phase 4 — weekly (or custom interval) baseline schedule."""

    enabled: bool = True
    interval_days: int = Field(default=7, ge=1, le=90)
    provider: str | None = None
    model: str | None = None
    max_rounds: int = Field(default=3, ge=1, le=100)
    name: str = "Weekly baseline"


def _resolve_baseline_target(
    provider: str | None,
    model: str | None,
) -> tuple[str, str]:
    defaults = {
        "ollama": "llama3.2",
        "groq": "llama-3.1-8b-instant",
        "openai": "gpt-4o-mini",
        "deepseek": "deepseek-chat",
        "anthropic": "claude-3-5-haiku-latest",
    }
    if provider:
        return provider, model or defaults.get(provider, "gpt-4o-mini")
    picked_provider, picked_model = _default_baseline_target()
    return picked_provider, model or picked_model


# UI labels / aliases → AttackCategory enum values (codes with templates in attack_library).
_CATEGORY_ALIASES: dict[str, list[str]] = {
    "prompt injection": ["DPI", "JBK"],
    "tool abuse": ["PEX"],
    "data exfiltration": ["DEX", "SPE"],
    "exfiltration": ["DEX", "SPE"],
    "goal manipulation": ["MSE"],
    "goal drift": ["MSE"],
    "memory poisoning": ["IPI"],
    "memory attack": ["IPI"],
    "privilege": ["PEX"],
    "privilege escalation": ["PEX"],
    "injection": ["DPI", "JBK"],
    "context attack": ["IPI", "DPI"],
    "jailbreak": ["JBK"],
}


def _resolve_attack_categories(
    attack_profile: str,
    raw: list[str] | None,
) -> list[Any]:
    """Map request categories (codes or labels) to AttackCategory enums."""
    from src.models import AttackCategory

    if raw:
        resolved: list[AttackCategory] = []
        seen: set[str] = set()
        for item in raw:
            token = str(item or "").strip()
            if not token:
                continue
            upper = token.upper()
            # Direct enum code (DPI, JBK, …) or enum name
            try:
                cat = AttackCategory(upper)
            except ValueError:
                try:
                    cat = AttackCategory[token.upper()]
                except KeyError:
                    aliases = _CATEGORY_ALIASES.get(token.lower(), [])
                    for code in aliases:
                        if code in seen:
                            continue
                        try:
                            resolved.append(AttackCategory(code))
                            seen.add(code)
                        except ValueError:
                            continue
                    continue
            if cat.value not in seen:
                resolved.append(cat)
                seen.add(cat.value)
        if resolved:
            return resolved

    if attack_profile == "quick_scan":
        return [
            AttackCategory.PROMPT_INJECTION,
            AttackCategory.JAILBREAK,
            AttackCategory.SYSTEM_PROMPT_EXTRACTION,
        ]
    return [
        AttackCategory.PROMPT_INJECTION,
        AttackCategory.JAILBREAK,
        AttackCategory.SYSTEM_PROMPT_EXTRACTION,
        AttackCategory.DATA_EXTRACTION,
    ]


def _mutation_settings(
    intensity: str | None,
    mutations_enabled: bool | None,
    max_mutations: int | None,
) -> tuple[bool, int]:
    if mutations_enabled is not None or max_mutations is not None:
        enabled = True if mutations_enabled is None else mutations_enabled
        cap = 3 if max_mutations is None else max_mutations
        return enabled, cap
    level = (intensity or "").strip().lower()
    if level in ("high", "h"):
        return True, 3
    if level in ("med", "medium", "m"):
        return True, 2
    if level in ("low", "l"):
        return False, 0
    return True, 3


def _launch_baseline(
    *,
    background_tasks: BackgroundTasks,
    tenant_id: str,
    name: str,
    provider: str,
    model: str,
    max_rounds: int,
    use_llm_judge: bool | None = False,
    categories: list[str] | None = None,
    intensity: str | None = None,
    mutations_enabled: bool | None = None,
    max_mutations_per_attack: int | None = None,
    target_agent: str | None = None,
    target_tools: str | None = None,
    target_id: str | None = None,
    system_prompt: str | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    profile = "custom" if categories else "quick_scan"
    req = RunCampaignRequest(
        name=name,
        provider=provider,
        model=model,
        attack_profile=profile,
        max_rounds=max_rounds,
        use_llm_judge=use_llm_judge,
        categories=categories,
        intensity=intensity,
        mutations_enabled=mutations_enabled,
        max_mutations_per_attack=max_mutations_per_attack,
        target_agent=target_agent,
        target_tools=target_tools,
        target_id=target_id,
        system_prompt=system_prompt,
        base_url=base_url,
    )
    campaign_id = str(uuid.uuid4())
    campaign_job_store.create(
        campaign_id,
        name=req.name,
        provider=req.provider,
        model=req.model,
        attack_profile=req.attack_profile,
        max_rounds=req.max_rounds,
        request_json=req.model_dump(),
        tenant_id=tenant_id,
    )
    background_tasks.add_task(execute_campaign_background, campaign_id, req, tenant_id)
    return {
        "phase": 3,
        "campaign_id": campaign_id,
        "status": "RUNNING",
        "provider": provider,
        "model": model,
        "attack_profile": profile,
        "categories": categories or [],
        "intensity": intensity,
        "max_rounds": max_rounds,
        "message": "Campaign started — open Live Monitor for round-by-round results.",
        "wargame_href": f"/red-team/monitor/{campaign_id}",
    }


def _default_baseline_target() -> tuple[str, str]:
    """Pick first usable provider from env for an auto baseline."""
    candidates = (
        ("ollama", "llama3.2"),
        ("groq", "llama-3.1-8b-instant"),
        ("openai", "gpt-4o-mini"),
        ("deepseek", "deepseek-chat"),
        ("anthropic", "claude-3-5-haiku-latest"),
    )
    for provider, model in candidates:
        if provider == "ollama":
            base = getattr(settings, "OLLAMA_BASE_URL", "") or ""
            if base:
                return provider, model
            continue
        if settings.provider_key(provider):
            return provider, model
    raise HTTPException(
        status_code=400,
        detail=(
            "No target provider configured for baseline scan. "
            "Set a provider key (OpenAI/Groq/DeepSeek) or OLLAMA_BASE_URL, "
            "or pass provider+model explicitly."
        ),
    )


def execute_campaign_background(campaign_id: str, req: RunCampaignRequest, tenant_id: str) -> None:
    job_store = campaign_job_store

    def on_round_complete(completed: int, total: int, result=None) -> None:
        job_store.update_progress(campaign_id, completed)
        if result is not None:
            try:
                from src.services.campaign_live_bus import emit_round_events

                emit_round_events(campaign_id, result)
            except Exception:
                logger.exception("Live monitor emit failed for %s", campaign_id)

    try:
        from src.models import AttackProfile, CampaignConfig, TargetConfig
        from src.orchestrator.campaign_manager import CampaignManager
        from src.services.campaign_live_bus import default_agents, emit_campaign_status
        from src.services.provider_resolver import provider_resolver

        emit_campaign_status(
            campaign_id,
            "RUNNING",
            agents=default_agents("running"),
        )

        config_path = BACKEND_DIR / "configs" / "default_config.yaml"
        with config_path.open(encoding="utf-8") as f:
            app_config = yaml.safe_load(f)

        resolved = provider_resolver.resolve_sync(
            tenant_id=tenant_id, provider=req.provider, model=req.model, base_url=req.base_url
        )

        worker_mode = settings.ARTSA_HMAC_RECEIVER_WORKERS
        target_cfg = TargetConfig(
            provider=req.provider,
            model=resolved.model,
            base_url=resolved.base_url,
            system_prompt=req.system_prompt or "",
            target_id=req.target_id,
            target_version=req.target_version,
            tenant_id=tenant_id,
            provider_ref=resolved.provider_id,
        )
        categories = _resolve_attack_categories(req.attack_profile, req.categories)
        mut_on, mut_cap = _mutation_settings(
            req.intensity, req.mutations_enabled, req.max_mutations_per_attack
        )
        profile_name = req.attack_profile if not req.categories else "custom"
        profile_cfg = AttackProfile(
            name=profile_name,
            categories=categories,
            mutations_enabled=mut_on,
            max_mutations_per_attack=mut_cap,
        )
        camp_cfg = CampaignConfig(
            id=campaign_id,
            name=req.name,
            target=target_cfg,
            attack_profile=profile_cfg,
            max_rounds=req.max_rounds,
        )
        if req.use_llm_judge is not None:
            app_config["artsa"]["judge"]["use_llm"] = req.use_llm_judge
        manager = CampaignManager(config=camp_cfg, app_config=app_config)
        summary = manager.run(on_round_complete=on_round_complete)
        job_store.complete(campaign_id, summary.model_dump(mode="json"))
        emit_campaign_status(campaign_id, "COMPLETED", agents=default_agents("done"))
    except Exception as exc:
        logger.exception("Campaign %s failed", campaign_id)
        job_store.fail(campaign_id, str(exc))
        try:
            from src.services.campaign_live_bus import default_agents, emit_campaign_status

            emit_campaign_status(campaign_id, "FAILED", agents=default_agents("idle"))
        except Exception:
            logger.exception("Failed to emit FAILED status for campaign %s", campaign_id)


@router.get("/campaigns")
async def list_campaigns(tenant_id: str = Depends(get_current_tenant)) -> dict[str, Any]:
    results_dir = BACKEND_DIR / "data" / "results"
    campaigns = []

    for job in campaign_job_store.list_jobs(limit=100, tenant_id=tenant_id):
        campaigns.append(
            {
                "id": job["id"],
                "name": job["name"],
                "status": job["status"],
                "provider": job["provider"],
                "model": job["model"],
                "rounds_completed": job["rounds_completed"],
                "total_rounds": job["max_rounds"],
                "summary": job.get("summary_json"),
                "error": job.get("error"),
            }
        )

    if results_dir.exists():
        for d in sorted(results_dir.iterdir(), reverse=True):
            if not d.is_dir() or not (d / "summary.json").exists():
                continue
            cid = d.name
            if any(c["id"] == cid for c in campaigns):
                continue
            try:
                with (d / "summary.json").open(encoding="utf-8") as f:
                    summary_data = json.load(f)
                campaigns.append(
                    {
                        "id": cid,
                        "name": summary_data.get("name", f"Campaign {cid[:8]}"),
                        "status": "COMPLETED",
                        "provider": summary_data.get("provider", "groq"),
                        "model": summary_data.get("model", "openai/gpt-oss-120b"),
                        "rounds_completed": summary_data.get(
                            "completed_rounds", summary_data.get("total_rounds", 0)
                        ),
                        "total_rounds": summary_data.get("total_rounds", 0),
                        "summary": summary_data,
                    }
                )
            except Exception as exc:
                logger.warning("Failed to load campaign detail for %s: %s", cid, exc)

    return {"campaigns": campaigns}


async def _apply_registered_target(
    req: RunCampaignRequest,
    session: AsyncSession,
    tenant_id: str,
) -> None:
    """Fold a registered target's configuration into the run request.

    The target is authoritative for what is being tested, and must be
    authorized first — the same gate discovery enforces. When the target has a
    discovered surface and the request did not pin categories, the campaign
    runs the categories that surface opened.
    """
    from src.core.attack_taxonomy import attack_categories_for
    from src.data import target_store

    target = await target_store.get_target(session, req.target_id or "", tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Target not found")
    if not target.authorized:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Target '{target.name}' is not authorized for testing. "
                "Mark it authorized before running a campaign against it."
            ),
        )

    if target.provider:
        req.provider = target.provider
    if target.model:
        req.model = target.model
    if target.base_url:
        req.base_url = target.base_url
    if target.system_prompt:
        req.system_prompt = target.system_prompt
    req.target_version = target.version

    if not req.categories and target.surface and target.surface.reachable:
        derived = attack_categories_for([i.taxonomy_id for i in target.surface.surface])
        if derived:
            req.categories = derived


@router.post("/campaigns/run")
async def start_campaign(
    req: RunCampaignRequest,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, Any]:
    if req.target_id:
        await _apply_registered_target(req, session, tenant_id)

    campaign_id = str(uuid.uuid4())
    campaign_job_store.create(
        campaign_id,
        name=req.name,
        provider=req.provider,
        model=req.model,
        attack_profile=req.attack_profile,
        max_rounds=req.max_rounds,
        request_json=req.model_dump(),
        tenant_id=tenant_id,
    )
    background_tasks.add_task(execute_campaign_background, campaign_id, req, tenant_id)
    return {
        "campaign_id": campaign_id,
        "message": f"Wargame campaign '{req.name}' started successfully.",
        "status": "RUNNING",
    }


@router.post("/campaigns/baseline")
async def start_baseline_campaign(
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
    payload: BaselineCampaignRequest | None = None,
) -> dict[str, Any]:
    """Phase 3: auto quick-scan baseline for onboarding / first connect.

    Uses an explicit provider/model when given; otherwise the first configured target.
    A registered ``target_id`` is authoritative for provider/model and must be authorized.
    """
    from src.services.endpoint_quota import enforce_baseline_start_quota

    enforce_baseline_start_quota(tenant_id)
    body = payload or BaselineCampaignRequest()

    system_prompt: str | None = None
    base_url: str | None = None
    if body.target_id:
        # Reuse the same authorization + config fold as /campaigns/run.
        tmp = RunCampaignRequest(
            name=body.name,
            provider=body.provider or "",
            model=body.model or "",
            max_rounds=body.max_rounds,
            categories=body.categories,
            intensity=body.intensity,
            mutations_enabled=body.mutations_enabled,
            max_mutations_per_attack=body.max_mutations_per_attack,
            target_id=body.target_id,
        )
        await _apply_registered_target(tmp, session, tenant_id)
        body.provider = tmp.provider
        body.model = tmp.model
        body.categories = tmp.categories
        system_prompt = tmp.system_prompt
        base_url = tmp.base_url

    provider, model = _resolve_baseline_target(body.provider, body.model)
    return _launch_baseline(
        background_tasks=background_tasks,
        tenant_id=tenant_id,
        name=body.name,
        provider=provider,
        model=model,
        max_rounds=body.max_rounds,
        use_llm_judge=body.use_llm_judge,
        categories=body.categories,
        intensity=body.intensity,
        mutations_enabled=body.mutations_enabled,
        max_mutations_per_attack=body.max_mutations_per_attack,
        target_agent=body.target_agent,
        target_tools=body.target_tools,
        target_id=body.target_id,
        system_prompt=system_prompt,
        base_url=base_url,
    )


@router.get("/campaigns/baseline/schedule")
async def get_baseline_schedule(
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, Any]:
    from src.data.baseline_schedule_store import baseline_schedule_store
    from src.services.scheduled_baseline import get_baseline_ticker_meta

    row = baseline_schedule_store.get(tenant_id)
    campaign = None
    if row and row.get("last_campaign_id"):
        job = campaign_job_store.get(str(row["last_campaign_id"]), tenant_id=tenant_id)
        if job:
            campaign = {
                "id": row["last_campaign_id"],
                "status": job.get("status"),
                "rounds_completed": job.get("rounds_completed"),
                "total_rounds": job.get("max_rounds"),
                "error": job.get("error"),
                "wargame_href": f"/campaigns/{row['last_campaign_id']}",
            }
    return {
        "phase": 5,
        "schedule": row,
        "ticker": get_baseline_ticker_meta(),
        "last_campaign": campaign,
    }


@router.put("/campaigns/baseline/schedule")
async def put_baseline_schedule(
    payload: BaselineScheduleRequest,
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, Any]:
    from src.data.baseline_schedule_store import baseline_schedule_store

    row = baseline_schedule_store.upsert(
        tenant_id=tenant_id,
        enabled=payload.enabled,
        interval_days=payload.interval_days,
        provider=payload.provider,
        model=payload.model,
        max_rounds=payload.max_rounds,
        name=payload.name,
    )
    return {"phase": 4, "schedule": row, "status": "ok"}


@router.post("/campaigns/baseline/tick")
async def tick_baseline_schedules(
    background_tasks: BackgroundTasks,
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Run due baseline schedules (call from cron or admin).

    By default only ticks the caller's tenant. Pass ``X-ARTSA-Tick-All: 1`` as admin
    is not required here — we scope to tenant for least privilege.
    """
    from src.data.baseline_schedule_store import baseline_schedule_store

    due = [r for r in baseline_schedule_store.due() if r.get("tenant_id") == tenant_id]
    started: list[dict[str, Any]] = []
    for row in due:
        try:
            provider, model = _resolve_baseline_target(row.get("provider"), row.get("model"))
        except HTTPException as exc:
            started.append(
                {
                    "tenant_id": row.get("tenant_id"),
                    "error": str(exc.detail),
                }
            )
            continue
        result = _launch_baseline(
            background_tasks=background_tasks,
            tenant_id=str(row.get("tenant_id") or tenant_id),
            name=str(row.get("name") or "Weekly baseline"),
            provider=provider,
            model=model,
            max_rounds=int(row.get("max_rounds") or 3),
            use_llm_judge=False,
        )
        baseline_schedule_store.mark_ran(str(row.get("tenant_id") or tenant_id), result["campaign_id"])
        started.append(result)
    return {"phase": 4, "due": len(due), "started": started}


@router.get("/campaigns/{campaign_id}")
async def get_campaign_detail(
    campaign_id: str, tenant_id: str = Depends(get_current_tenant)
) -> dict[str, Any]:
    job = campaign_job_store.get(campaign_id, tenant_id=tenant_id)
    if job:
        return {
            "id": campaign_id,
            "status": job["status"],
            "request": job.get("request_json", {}),
            "rounds_completed": job["rounds_completed"],
            "total_rounds": job["max_rounds"],
            "summary": job.get("summary_json"),
            "error": job.get("error"),
        }

    results_dir = BACKEND_DIR / "data" / "results" / campaign_id
    if results_dir.exists() and (results_dir / "summary.json").exists():
        with (results_dir / "summary.json").open(encoding="utf-8") as f:
            summary_data = json.load(f)
        report_md = ""
        if (results_dir / "report.md").exists():
            report_md = (results_dir / "report.md").read_text(encoding="utf-8")
        return {
            "id": campaign_id,
            "status": "COMPLETED",
            "summary": summary_data,
            "report_markdown": report_md,
        }

    raise HTTPException(status_code=404, detail="Campaign not found")


@router.get("/campaigns/{campaign_id}/rounds")
async def get_campaign_rounds(
    campaign_id: str, tenant_id: str = Depends(get_current_tenant)
) -> dict[str, Any]:
    """Return per-round transcripts — including mid-run so Live Monitor stays real-time.

    Rounds are persisted as each probe finishes (`ResultsStore.save_round`); this
    endpoint must not withhold them while status is RUNNING.
    """
    from src.data.results_store import ResultsStore

    results_dir = BACKEND_DIR / "data" / "results"
    store = ResultsStore(str(results_dir))
    rounds = store.load_rounds(campaign_id)

    job = campaign_job_store.get(campaign_id, tenant_id=tenant_id)
    if not job and not rounds:
        raise HTTPException(status_code=404, detail="Campaign not found")

    status = str(job.get("status") if job else "COMPLETED")
    terminal = status.upper() in {"COMPLETED", "FAILED", "CANCELLED", "ERROR"}
    return {
        "campaign_id": campaign_id,
        "rounds": [r.model_dump(mode="json") for r in rounds],
        "count": len(rounds),
        "status": status,
        "rounds_completed": int(job.get("rounds_completed") or len(rounds)) if job else len(rounds),
        "live": bool(job) and not terminal,
    }


@router.get("/campaigns/{campaign_id}/live/events")
async def get_campaign_live_events(
    campaign_id: str,
    tenant_id: str = Depends(get_current_tenant),
    limit: int = 200,
) -> dict[str, Any]:
    """REST snapshot of the Live Monitor stream (poll fallback / initial hydrate)."""
    from src.data.results_store import ResultsStore
    from src.services.campaign_live_bus import campaign_live_bus, hydrate_from_rounds

    job = campaign_job_store.get(campaign_id, tenant_id=tenant_id)
    results_dir = BACKEND_DIR / "data" / "results"
    store = ResultsStore(str(results_dir))
    rounds = store.load_rounds(campaign_id)
    if not job and not rounds:
        raise HTTPException(status_code=404, detail="Campaign not found")

    events = campaign_live_bus.history(campaign_id, limit=limit)
    if not events and rounds:
        events = hydrate_from_rounds(campaign_id, rounds)[-limit:]

    status = str(job.get("status") if job else "COMPLETED")
    return {
        "campaign_id": campaign_id,
        "status": status,
        "events": events,
        "count": len(events),
    }


@router.websocket("/campaigns/{campaign_id}/live")
async def campaign_live_websocket(websocket: WebSocket, campaign_id: str) -> None:
    """Single-channel Live Monitor feed for one campaign."""
    import asyncio
    import json as json_lib

    if await require_ws_auth(websocket) is None:
        return

    await websocket.accept()
    from src.data.results_store import ResultsStore
    from src.services.campaign_live_bus import campaign_live_bus, hydrate_from_rounds

    results_dir = BACKEND_DIR / "data" / "results"
    store = ResultsStore(str(results_dir))
    rounds = store.load_rounds(campaign_id)
    history = campaign_live_bus.history(campaign_id, limit=200)
    if not history and rounds:
        history = hydrate_from_rounds(campaign_id, rounds)[-200:]

    await websocket.send_text(
        json_lib.dumps(
            {
                "type": "hello",
                "channel": "campaign_live",
                "campaign_id": campaign_id,
                "events": history,
            }
        )
    )

    queue = await campaign_live_bus.subscribe(campaign_id)
    try:
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=25.0)
                await websocket.send_text(json_lib.dumps({"type": "campaign_live", "event": event}))
            except TimeoutError:
                await websocket.send_text(json_lib.dumps({"type": "ping", "timestamp": time.time()}))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Campaign live WS error for %s", campaign_id)
    finally:
        campaign_live_bus.unsubscribe(campaign_id, queue)
