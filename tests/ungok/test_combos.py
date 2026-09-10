"""배오: 원문 처방 구성에 실제로 같이 나온 쌍만."""
from lib.combos import pair_counts, parse_compositions

TEXT = """1) 縮泉丸 - 烏藥 益智仁 山藥
2) 開心散 - 石菖蒲 遠志 人參
3) 別方 縮泉丸 - 烏藥 益智仁
"""


def test_parse_compositions():
    comps = parse_compositions(TEXT)
    names = [c[0] for c in comps]
    assert "縮泉丸" in names and "開心散" in names
    assert "烏藥" in dict(comps)["縮泉丸"]


def test_pairs_only_from_same_formula():
    comps = [(f, h, "익지인") for f, h in parse_compositions(TEXT)]
    pairs = pair_counts(comps)
    assert ("烏藥", "益智仁") in pairs
    # 서로 다른 처방에 있는 약재끼리는 쌍이 되지 않는다
    assert ("烏藥", "遠志") not in pairs and ("遠志", "烏藥") not in pairs


def test_repeated_pair_counts_up_and_records_evidence():
    comps = [(f, h, "익지인") for f, h in parse_compositions(TEXT)]
    rec = pair_counts(comps)[("烏藥", "益智仁")]
    assert rec["count"] == 2 and "縮泉丸" in rec["formulas"] and rec["sources"] == ["익지인"]


def test_no_composition_no_pairs():
    assert pair_counts([(f, h, "") for f, h in parse_compositions("처방 없음")]) == {}
