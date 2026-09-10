"""검색 메타데이터: 원문에 있는 것만, 한국어 canonical 하나로."""
from pathlib import Path

from lib import keywords as kw

VOCAB = Path(__file__).resolve().parents[2] / "_tools" / "ungok" / "data" / "vocab.tsv"


def test_all_canonical_terms_are_korean():
    """표기 난립 금지: canonical 은 전부 한글이어야 한다."""
    bad = []
    for raw in VOCAB.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        canonical = raw.split("\t")[0].strip()
        if not all("가" <= ch <= "힣" or ch in "-·" for ch in canonical):
            bad.append(canonical)
    assert not bad, f"한글이 아닌 canonical: {bad}"


def test_hanja_and_hangul_surfaces_collapse_to_one_canonical():
    assert kw.extract("氣虛", "pattern") == ["기허"]
    assert kw.extract("기허", "pattern") == ["기허"]
    assert kw.extract("氣虛 기허", "pattern") == ["기허"]


def test_absent_terms_are_not_invented():
    assert kw.extract("아무 관련 없는 문장", "pattern") == []
    assert kw.extract("", "clinical") == []


def test_extract_all_fills_only_requested_fields():
    out = kw.extract_all("暖腎固精縮尿 治遺尿")
    assert "야뇨" in out["clinical_keywords"]
    assert "보양" in out["action_keywords"]
    assert out["processing_keywords"] == []


def test_formula_extraction_requires_real_text():
    assert kw.extract_formulas("縮泉丸 - 烏藥 益智仁") == ["縮泉丸"]
    assert kw.extract_formulas("처방 얘기 없음") == []


def test_unknown_formula_reading_is_left_as_is_and_reported():
    norm, unresolved = kw.normalize_formulas(["縮泉丸", "架空無名湯"])
    assert norm[0] == "축천환"
    assert norm[1] == "架空無名湯"        # 독음을 추정하지 않는다
    assert unresolved == ["架空無名湯"]


def test_safety_flags_only_from_actual_contraindication_text():
    assert kw.safety_flags_from_source("孕婦 忌服") == ["임신금기"]
    assert kw.safety_flags_from_source("") == []


def test_modern_safety_gate_is_separate_layer():
    assert kw.modern_safety_flags("보골지") == ["HILI"]
    assert kw.modern_safety_flags("감초") == []
