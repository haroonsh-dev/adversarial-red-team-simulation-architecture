"""Findings custody: wired hops report HMAC; unwired agents never claim it."""

from src.api.routes.findings import _default_custody, _round_to_finding


def test_unwired_agents_never_claim_hmac():
    chain = _default_custody(verdict="BLOCKED", blocked=True, from_campaign=True, hmac_ok=True)
    by_agent = {h["agent"]: h for h in chain}
    assert by_agent["research"]["hmac_verified"] is None
    assert by_agent["curator"]["hmac_verified"] is None
    assert by_agent["defender"]["hmac_verified"] is None
    assert by_agent["research"]["hmac_state"] == "unwired"


def test_campaign_custody_reports_verified_wired_hops():
    chain = _default_custody(verdict="BLOCKED", blocked=True, from_campaign=True, hmac_ok=True)
    by_agent = {h["agent"]: h for h in chain}
    assert by_agent["redteam"]["hmac_verified"] is True
    assert by_agent["target"]["hmac_state"] == "ok"
    assert "HMAC verified" in by_agent["judge"]["action"]


def test_campaign_custody_marks_only_wired_agents_executed():
    chain = _default_custody(verdict="SUCCESS", blocked=False, from_campaign=True)
    by_agent = {h["agent"]: h for h in chain}
    assert by_agent["research"]["executed"] is False
    assert by_agent["curator"]["executed"] is False
    assert by_agent["defender"]["executed"] is False
    assert by_agent["redteam"]["executed"] is True
    assert by_agent["target"]["executed"] is True
    assert by_agent["judge"]["executed"] is True
    assert "NOT_WIRED" in by_agent["research"]["action"]


def test_telemetry_custody_does_not_claim_campaign_execution():
    chain = _default_custody(verdict="FLAGGED", blocked=False, from_campaign=False)
    assert all(hop["executed"] is False for hop in chain)
    assert all(hop["hmac_verified"] is None for hop in chain)


def test_round_to_finding_exposes_verified_hmac_when_recorded():
    raw = {
        "round_number": 1,
        "timestamp": "2026-09-06T00:00:00Z",
        "attack": {"name": "Probe", "category": "DPI", "prompt": "ignore"},
        "response": {"blocked": True},
        "score": {"verdict": "BLOCKED", "severity": "LOW", "reasoning": "blocked"},
        "hmac_handoffs": [
            {"sender": "red_team", "receiver": "target", "hmac_verified": True, "hmac_state": "ok"},
            {"sender": "target", "receiver": "judge", "hmac_verified": True, "hmac_state": "ok"},
        ],
    }
    finding = _round_to_finding("campaign-abc-r1", "abc", raw, None)
    assert finding["hmac_handoff"] == "ok"
    wired = [h for h in finding["custody_chain"] if h["agent"] in {"redteam", "target", "judge"}]
    assert all(hop["hmac_verified"] is True for hop in wired)
