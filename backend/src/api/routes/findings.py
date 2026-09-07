"""Findings queue API — server-side lifecycle + chain-of-custody."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from src.api.dependencies import get_current_tenant
from src.core.asi import ASI_BY_CODE, classify_asi
from src.core.models.hops import HMAC_HANDOFF_UNWIRED, HmacState
from src.data.campaign_job_store import campaign_job_store
from src.data.findings_registry import all_records, set_promoted
from src.data.policy_version_store import current_version, snapshot_rules
from src.data.results_store import ResultsStore

router = APIRouter(tags=["Findings"])

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent.parent
RESULTS_DIR = BACKEND_DIR / "data" / "results"
POLICY_PATH = BACKEND_DIR / "configs" / "org_policies" / "default.yaml"

def _asi_for_category(category: str, *, detectors: list[str] | None = None) -> tuple[str | None, str | None]:
    code, _status = classify_asi(detectors=detectors, attack_category=category or None)
    if not code:
        return None, None
    return code, ASI_BY_CODE[code].label


def _custody_hop(
    *,
    agent: str,
    label: str,
    action: str,
    executed: bool,
    hmac_verified: bool | None = None,
    hmac_state: str | None = None,
) -> dict[str, Any]:
    """One custody row. Unwired agents never claim HMAC."""
    return {
        "agent": agent,
        "label": label,
        "action": action,
        "hmac_verified": hmac_verified,
        "hmac_state": hmac_state or HMAC_HANDOFF_UNWIRED.value,
        "executed": executed,
    }


def _default_custody(
    *,
    verdict: str,
    blocked: bool,
    from_campaign: bool = True,
    hmac_ok: bool | None = None,
) -> list[dict[str, Any]]:
    """Six-agent custody trail. Only campaign Red Team / Target / Judge ran.

    Wired campaign hops report HMAC verify. Research / Curator / Defender stay unwired.
    """
    del blocked
    ran = from_campaign
    wired_verified = True if ran and hmac_ok is not False else (False if hmac_ok is False else None)
    if ran and hmac_ok is None:
        # New campaigns always sign; treat missing field on fresh findings as verified
        # only when hmac_ok is explicitly passed. Default None = not yet recorded.
        wired_state = HMAC_HANDOFF_UNWIRED.value
        wired_verified = None
        wired_action_hmac = "inter-agent HMAC not recorded on this round"
    elif ran and wired_verified is True:
        wired_state = HmacState.OK.value
        wired_action_hmac = "inter-agent HMAC verified"
    elif ran:
        wired_state = HmacState.FAIL.value
        wired_action_hmac = "inter-agent HMAC FAILED"
    else:
        wired_state = HMAC_HANDOFF_UNWIRED.value
        wired_action_hmac = "NOT_WIRED — this finding is not from a campaign hop"
    return [
        _custody_hop(
            agent="research",
            label="Research",
            action="NOT_WIRED — Research is not executed in the campaign loop",
            executed=False,
        ),
        _custody_hop(
            agent="curator",
            label="Curator",
            action="NOT_WIRED — Curator is not executed in the campaign loop",
            executed=False,
        ),
        _custody_hop(
            agent="redteam",
            label="Red Team",
            action=(
                f"Attack payload generated ({wired_action_hmac})"
                if ran
                else wired_action_hmac
            ),
            executed=ran,
            hmac_verified=wired_verified if ran else None,
            hmac_state=wired_state if ran else HMAC_HANDOFF_UNWIRED.value,
        ),
        _custody_hop(
            agent="target",
            label="Target",
            action=(
                f"Agent response captured ({wired_action_hmac})"
                if ran
                else wired_action_hmac
            ),
            executed=ran,
            hmac_verified=wired_verified if ran else None,
            hmac_state=wired_state if ran else HMAC_HANDOFF_UNWIRED.value,
        ),
        _custody_hop(
            agent="judge",
            label="Judge",
            action=(
                f"Verdict · {verdict} ({wired_action_hmac})"
                if ran
                else wired_action_hmac
            ),
            executed=ran,
            hmac_verified=wired_verified if ran else None,
            hmac_state=wired_state if ran else HMAC_HANDOFF_UNWIRED.value,
        ),
        _custody_hop(
            agent="defender",
            label="Defender",
            action="NOT_WIRED — Defender is not executed in the campaign loop",
            executed=False,
        ),
    ]


def _severity_from_score(score: dict[str, Any]) -> str:
    sev = str(score.get("severity", "MEDIUM")).upper()
    if sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
        return sev
    return "MEDIUM"


def _findings_from_campaigns(tenant_id: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    registry = all_records()
    store = ResultsStore(str(RESULTS_DIR))

    for job in campaign_job_store.list_jobs(limit=100, tenant_id=tenant_id):
        cid = job["id"]
        rounds = store.load_rounds(cid)
        if not rounds and job.get("summary_json"):
            summary = job["summary_json"]
            top = summary.get("top_findings") or []
            for raw in top[:10]:
                if not isinstance(raw, dict):
                    continue
                round_num = int(raw.get("round_number", 0))
                finding_id = f"campaign-{cid}-r{round_num}"
                rows.append(_round_to_finding(finding_id, cid, raw, registry.get(finding_id)))
            continue

        for rnd in rounds:
            finding_id = f"campaign-{cid}-r{rnd.round_number}"
            raw = rnd.model_dump(mode="json")
            rows.append(_round_to_finding(finding_id, cid, raw, registry.get(finding_id)))

    return rows


def _round_to_finding(
    finding_id: str,
    campaign_id: str,
    raw: dict[str, Any],
    registry: dict[str, Any] | None,
) -> dict[str, Any]:
    attack = raw.get("attack") or {}
    response = raw.get("response") or {}
    score = raw.get("score") or {}
    category = str(attack.get("category", ""))
    asi_code, asi_label = _asi_for_category(category)
    verdict = str(score.get("verdict", "UNKNOWN"))
    blocked = bool(response.get("blocked"))
    handoffs = raw.get("hmac_handoffs") or []
    hmac_ok = None
    if isinstance(handoffs, list) and handoffs:
        hmac_ok = all(bool(h.get("hmac_verified")) for h in handoffs if isinstance(h, dict))
    status = "validated"
    if registry and registry.get("status") == "promoted":
        status = "promoted"
    hmac_handoff = (
        HmacState.OK.value if hmac_ok is True else (
            HmacState.FAIL.value if hmac_ok is False else HmacState.UNWIRED.value
        )
    )
    return {
        "id": finding_id,
        "title": str(attack.get("name", "Campaign finding")),
        "severity": _severity_from_score(score),
        "category": category,
        "asi_code": asi_code,
        "asi_label": asi_label,
        "status": status,
        "source": "campaign",
        "source_ref": campaign_id,
        "timestamp": raw.get("timestamp"),
        "verdict": verdict,
        "attack_prompt": str(attack.get("prompt", ""))[:500],
        "reasoning": str(score.get("reasoning", ""))[:1000],
        "custody_chain": _default_custody(verdict=verdict, blocked=blocked, hmac_ok=hmac_ok),
        "hmac_handoff": hmac_handoff,
        "playbook_version": registry.get("playbook_version") if registry else None,
        "promoted_rule_name": registry.get("rule_name") if registry else None,
    }


def _findings_from_telemetry(events: list[dict[str, Any]], tenant_id: str | None = None) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    registry = all_records()
    for idx, evt in enumerate(reversed(events[-40:])):
        if tenant_id:
            ev_tenant = evt.get("tenant_id")
            if ev_tenant is not None and str(ev_tenant) != tenant_id:
                continue
            if ev_tenant is None and tenant_id not in {"default_org", "default_tenant"}:
                continue
        score = float(evt.get("risk_score") or 0)
        sev = str(evt.get("severity", "")).upper()
        if score < 50 and sev not in ("HIGH", "CRITICAL"):
            continue
        session = str(evt.get("session_id") or evt.get("agent_id") or f"evt-{idx}")
        finding_id = f"telemetry-{session}-{idx}"
        reg = registry.get(finding_id)
        status = "promoted" if reg and reg.get("status") == "promoted" else "new"
        tool = str(evt.get("tool_name") or "event")
        raw_detectors = evt.get("detectors")
        detectors = [str(d) for d in raw_detectors] if isinstance(raw_detectors, list) else []
        asi_code, asi_label = _asi_for_category("", detectors=detectors)
        rows.append(
            {
                "id": finding_id,
                "title": f"{tool} · {session[:8]}",
                "severity": sev if sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW") else "HIGH",
                "category": tool,
                "asi_code": asi_code,
                "asi_label": asi_label,
                "status": status,
                "source": "telemetry",
                "source_ref": session,
                "timestamp": evt.get("timestamp") or evt.get("created_at"),
                "verdict": str(evt.get("verdict") or "FLAGGED"),
                "attack_prompt": str(evt.get("tool_name") or ""),
                "reasoning": "",
                "custody_chain": _default_custody(
                    verdict=str(evt.get("verdict") or "FLAGGED"),
                    blocked="BLOCK" in str(evt.get("verdict", "")).upper(),
                    from_campaign=False,
                ),
                "hmac_handoff": HmacState.UNWIRED.value,
                "playbook_version": reg.get("playbook_version") if reg else None,
                "promoted_rule_name": reg.get("rule_name") if reg else None,
            }
        )
    return rows


class PromoteFindingRequest(BaseModel):
    rule_name: str
    pattern: str
    event_type: str = "PROMPT_INJECTION"
    severity: str = "HIGH"
    risk_score: float = Field(default=80.0, ge=0, le=100)
    description: str = ""


@router.get("/findings")
async def list_findings(tenant_id: str = Depends(get_current_tenant)) -> dict[str, Any]:
    from src.services.telemetry_bus import telemetry_bus

    campaign_rows = _findings_from_campaigns(tenant_id)
    telemetry_rows = _findings_from_telemetry(telemetry_bus.get_history(limit=80), tenant_id)
    merged = {r["id"]: r for r in campaign_rows + telemetry_rows}
    findings = sorted(
        merged.values(),
        key=lambda r: str(r.get("timestamp") or ""),
        reverse=True,
    )
    return {
        "findings": findings,
        "count": len(findings),
        "playbook_version": current_version() or 1,
    }


@router.get("/findings/{finding_id}")
async def get_finding(
    finding_id: str, tenant_id: str = Depends(get_current_tenant)
) -> dict[str, Any]:
    data = await list_findings(tenant_id)
    for row in data["findings"]:
        if row["id"] == finding_id:
            return row
    raise HTTPException(status_code=404, detail="Finding not found")


@router.post("/findings/{finding_id}/promote")
async def promote_finding(
    finding_id: str,
    payload: PromoteFindingRequest,
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, Any]:
    """Deploy a suggested rule and mark the finding promoted with a playbook version bump."""
    import yaml

    finding = await get_finding(finding_id, tenant_id)
    if not POLICY_PATH.exists():
        rules: list[dict[str, Any]] = []
    else:
        with POLICY_PATH.open(encoding="utf-8") as f:
            rules = (yaml.safe_load(f) or {}).get("rules", [])

    rule = payload.model_dump()
    rules.append(rule)
    POLICY_PATH.parent.mkdir(parents=True, exist_ok=True)
    with POLICY_PATH.open("w", encoding="utf-8") as f:
        yaml.dump({"rules": rules}, f, default_flow_style=False)

    version_entry = snapshot_rules(
        rules,
        trigger="finding_promote",
        finding_id=finding_id,
        note=f"Promoted from {finding.get('title', finding_id)}",
    )
    record = set_promoted(
        finding_id,
        rule_name=payload.rule_name,
        playbook_version=int(version_entry["version"]),
    )
    return {
        "status": "promoted",
        "finding_id": finding_id,
        "playbook_version": version_entry["version"],
        "rule_name": payload.rule_name,
        "record": record,
    }
