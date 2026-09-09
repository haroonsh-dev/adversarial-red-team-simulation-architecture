"""Telemetry findings must not hardcode ASI01."""

from src.api.routes.findings import _asi_for_category, _findings_from_telemetry


def test_telemetry_without_detectors_has_no_asi_code():
    rows = _findings_from_telemetry(
        [
            {
                "session_id": "s1",
                "risk_score": 90,
                "severity": "HIGH",
                "tool_name": "read_file",
                "verdict": "SUSPICIOUS",
                "detectors": [],
            }
        ]
    )
    assert rows
    assert rows[0]["asi_code"] is None
    assert rows[0]["hmac_handoff"] == "unwired"


def test_telemetry_prompt_injection_maps_asi01():
    rows = _findings_from_telemetry(
        [
            {
                "session_id": "s2",
                "risk_score": 88,
                "severity": "CRITICAL",
                "tool_name": "send_email",
                "detectors": ["PromptInjectionDetector"],
            }
        ]
    )
    assert rows[0]["asi_code"] == "ASI01"


def test_category_helper_does_not_invent_asi08_without_breaker_evidence():
    assert _asi_for_category("ASI08") == (None, None)
    code, label = _asi_for_category("DPI")
    assert code == "ASI01"
    assert label == "Agent Goal Hijack"


def test_telemetry_findings_hide_other_tenants():
    rows = _findings_from_telemetry(
        [
            {
                "session_id": "s-acme",
                "tenant_id": "acme",
                "risk_score": 90,
                "severity": "HIGH",
                "tool_name": "read_file",
            },
            {
                "session_id": "s-globex",
                "tenant_id": "globex",
                "risk_score": 90,
                "severity": "HIGH",
                "tool_name": "read_file",
            },
        ],
        tenant_id="acme",
    )
    assert len(rows) == 1
    assert rows[0]["source_ref"] == "s-acme"
