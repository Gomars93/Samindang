from lib.source_parse import cap, dosage, split_fields

SAMPLE = """石決明
출전 《別錄》
생약명 Haliotidis Concha
性 味 寒 鹹 無毒
歸 經 肝
效能主治 平肝潛陽, 淸肝明目.
임상응용 1. 平肝潛陽 ... 2. 사용량 : 9~30g(久煎)
해설 본품은 鹹寒하여 肝經에 들어간다.
수치 鹽分을 물로 씻고 하루동안 끓인다.
금기 脾胃虛寒者는 愼用한다.
참고 珍珠母로 대체한다.
"""


def test_labels_are_split():
    f = split_fields(SAMPLE)
    assert f["생약명"].startswith("Haliotidis")
    assert "肝" in f["귀경"]
    assert "愼用" in f["금기"]


def test_missing_label_is_absent_not_invented():
    f = split_fields("출전 《別錄》\n생약명 X")
    assert "금기" not in f and "효능주치" not in f


def test_dosage_extracted_only_when_present():
    assert dosage(SAMPLE) == "9~30g"
    # 수치 패턴이 없으면 라벨 뒤 원문을 그대로 돌려준다 (추정하지 않는다)
    assert dosage("사용량 : 적당량") == "적당량"
    assert dosage("") == ""


def test_cap_marks_truncation():
    text = "가" * 1000
    out, truncated = cap(text, 100)
    assert truncated and out.endswith("…") and len(out) < 200
    out2, t2 = cap("짧다", 100)
    assert not t2 and out2 == "짧다"


def test_next_label_does_not_bleed_into_previous_field():
    """'性 味 寒 鹹\\n歸 經 肝' 에서 성미 값에 '歸' 가 새지 않아야 한다."""
    f = split_fields("性 味 寒 鹹 無毒\n歸 經 肝\n效能主治 平肝潛陽.")
    assert f["성미"].strip() == "寒 鹹 無毒"
    assert "歸" not in f["성미"]
    assert f["귀경"].strip() == "肝"
    assert "效能" not in f["귀경"]


def test_standalone_page_numbers_are_stripped():
    from lib.source_parse import strip_page_numbers
    assert strip_page_numbers("1157\n본문\n1158") == "본문"
    f = split_fields("금기 脾胃虛寒者는 愼用한다.\n1157\n")
    assert "1157" not in f["금기"]
