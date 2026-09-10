"""OCR 교정 게이트: '확신 없으면 고치지 않는다' 를 테스트로 고정한다."""
from lib import textnorm as t


def test_collapse_spaced_hanja_only_when_all_hanja():
    assert t.collapse_spaced_hanja("石 決 明") == "石決明"
    assert t.collapse_spaced_hanja("石決明") == "石決明"
    # 한글/라틴이 섞이면 접지 않는다 (의미 훼손 방지)
    assert t.collapse_spaced_hanja("석곡 石斛") == "석곡 石斛"
    assert t.collapse_spaced_hanja("Acori Graminei") == "Acori Graminei"


def test_correction_requires_dictionary_and_two_sources():
    d = {"石斛"}
    ok = t.decide_controlled_field("石解", d, evidence_count=2)
    assert ok.value == "石斛" and ok.applied and not ok.ocr_uncertain

    weak = t.decide_controlled_field("石解", d, evidence_count=1)
    assert weak.value == "石解" and not weak.applied and weak.ocr_uncertain


def test_no_correction_when_not_in_dictionary():
    r = t.decide_controlled_field("石解", set(), evidence_count=5)
    assert r.value == "石解" and not r.applied and r.ocr_uncertain


def test_dictionary_hit_with_single_source_is_flagged():
    r = t.decide_controlled_field("石斛", {"石斛"}, evidence_count=1)
    assert r.value == "石斛" and r.ocr_uncertain


def test_ambiguous_candidates_are_not_resolved():
    # 같은 편집거리 후보가 2개면 확정하지 않는다
    d = {"石斛", "石菖"}
    r = t.decide_controlled_field("石解", d | {"石解X"}, evidence_count=9)
    assert not r.applied or r.value in d


def test_context_only_chars_never_auto_corrected():
    assert all("湯" not in c for c in t.candidates("泄湯"))
    assert any("瀉" in c for c in t.candidates("泄湯", context_only_ok=True))


def test_annotate_body_never_mutates():
    src = "疲飮이 臀에 있다"
    hits = t.annotate_body(src)
    assert hits and all("suggests" in h for h in hits)
    assert src == "疲飮이 臀에 있다"


def test_empty_value_is_uncertain():
    r = t.decide_controlled_field("", {"石斛"}, evidence_count=9)
    assert r.ocr_uncertain and r.value == ""
