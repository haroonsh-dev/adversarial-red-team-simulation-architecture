"""Phase 2: output-only scanning and pre-execution tool-call enforcement."""

import uuid

from src.containment.detectors.tool_output_scanner import ToolOutputScanner
from src.containment.engine import ContainmentEngine
from src.core.models.events import ToolCallEvent
from src.services.ingest_pipeline import _execution_allowed, _scan_phase

_ENGINE = ContainmentEngine()
_SCANNER = ToolOutputScanner()


def _event(tool: str, args: dict, response: dict | None = None) -> ToolCallEvent:
    return ToolCallEvent(
        session_id=uuid.uuid4(),
        agent_id="test-agent",
        tool_name=tool,
        arguments=args,
        response=response,
    )


def test_output_scanner_ignores_arguments_without_response():
    event = _event("read_file", {"path": "~/.aws/credentials", "api_key": "sk-" + "a" * 24})
    assert _SCANNER.detect(event) is None
    assert _scan_phase(event) == "pre_exec"


def test_output_scanner_kills_on_response_secret():
    event = _event(
        "read_file",
        {"path": "/tmp/notes.txt"},
        response={"content": 'AWS_ACCESS_KEY_ID=AKIATEST\napi_key: "' + "k" * 24 + '"'},
    )
    hit = _SCANNER.detect(event)
    assert hit is not None
    assert hit.event_type == "SENSITIVE_DATA_EXPOSED"
    assert hit.evidence["source"] == "tool_response"

    risk, verdict, events = _ENGINE.evaluate_event(event)
    assert risk.overall_score >= 80.0
    assert verdict.recommended_action == "KILL"
    assert "SENSITIVE_DATA_EXPOSED" in risk.flags
    assert any(e.detector == "ToolOutputScanner" for e in events)


def test_output_scanner_does_not_treat_arguments_as_output():
    event = _event(
        "http_request",
        {"url": "https://example.com", "api_key": "sk-" + "x" * 24},
        response={"status": 200, "body": "ok"},
    )
    assert _SCANNER.detect(event) is None


def test_pre_exec_kill_means_execution_not_allowed():
    assert _execution_allowed("KILL", monitor_only=False) is False
    assert _execution_allowed("QUARANTINE", monitor_only=False) is False
    assert _execution_allowed("NONE", monitor_only=False) is True
    assert _execution_allowed("KILL", monitor_only=True) is True
