"""ASI catalog honesty — never fabricate unsupported detections."""

from src.core.asi import ASI_BY_CODE, HMAC_STATUS, HMAC_THREAT_CODE, AsiStatus, classify_asi


def test_catalog_covers_asi01_to_asi10():
    assert [e.code for e in ASI_BY_CODE.values()] == [f"ASI{i:02d}" for i in range(1, 11)]


def test_asi08_session_breaker_is_supported_and_classified():
    assert ASI_BY_CODE["ASI08"].status == AsiStatus.SUPPORTED
    code, status = classify_asi(detectors=["SessionCircuitBreaker"])
    assert (code, status) == ("ASI08", AsiStatus.SUPPORTED)


def test_prompt_injection_classifies_asi01():
    code, status = classify_asi(detectors=["PromptInjectionDetector"])
    assert code == "ASI01"
    assert status == AsiStatus.SUPPORTED


def test_unknown_detector_does_not_invent_a_code():
    assert classify_asi(detectors=["TotallyFakeDetector"]) == (None, None)


def test_hmac_is_not_an_asi_code():
    assert HMAC_THREAT_CODE == "HMAC"
    assert HMAC_STATUS == AsiStatus.SUPPORTED
    assert HMAC_THREAT_CODE not in ASI_BY_CODE


def test_not_implemented_categories_do_not_classify():
    assert classify_asi(attack_category="MSE") == (None, None)
    assert ASI_BY_CODE["ASI07"].status == AsiStatus.PARTIAL
    assert classify_asi(attack_category="HMAC") == (None, None)
