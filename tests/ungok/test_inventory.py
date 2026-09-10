"""기존 KB inventory 진단."""
from pathlib import Path

import pytest

import ungok_inventory as inv

REPO = Path(__file__).resolve().parents[2]
REAL_CSV = REPO / "_tools" / "reports" / "raw_inventory_01_yakjaebyeol.csv"


def _rows(**over):
    base = dict(name="석곡", file="석곡.md", herb="석곡", hanja="石斛", latin="",
                category="보익약", volume="하", print_start="1335", print_end="1337",
                pdf_start="586", pdf_end="589", status="SOURCE_INGESTED",
                ocr_uncertain=False, safety_flags="", size=8000, schema="V2",
                wikilinks=[], yaml_ok=True, notes="", body="")
    base.update(over)
    return [base]


def test_clean_row_has_no_findings():
    res = inv.analyse(_rows())
    assert res["findings"] == {}


def test_detects_missing_identity_fields():
    f = inv.analyse(_rows(herb="", hanja="", volume="", print_start="", pdf_start=""))["findings"]
    assert f["missing_herb"] and f["missing_hanja"] and f["missing_volume"]
    assert f["missing_print_page"] and f["missing_pdf_page"]


def test_detects_ocr_garbage_in_hanja():
    f = inv.analyse(_rows(hanja="* 腹皮"))["findings"]
    assert f["hanja_suspect"]


def test_detects_small_file_and_duplicate():
    rows = _rows(size=900) + _rows(file="석곡2.md", name="석곡2", size=900)
    f = inv.analyse(rows)["findings"]
    assert len(f["small_file"]) == 2
    assert f["duplicate_herb"] == ["석곡 (2개)"]


def test_detects_broken_wikilink():
    f = inv.analyse(_rows(wikilinks=["보익약"]))["findings"]
    assert f["broken_wikilink"] == ["[[보익약]] ×1"]


def test_link_target_allowlist_clears_link():
    f = inv.analyse(_rows(wikilinks=["보익약"]), link_targets={"석곡", "보익약"})["findings"]
    assert "broken_wikilink" not in f


def test_detects_empty_section():
    body = "\n## 3. 배오\n\n## 4. 처방 연결\n내용 있음\n"
    f = inv.analyse(_rows(body=body))["findings"]
    assert any("3. 배오" in x for x in f["empty_section"])


def test_template_row_is_bucketed_not_flagged():
    f = inv.analyse(_rows(name="_TEMPLATE_본초", file="_TEMPLATE_본초.md",
                          herb="", status="PENDING"))["findings"]
    assert f["template_or_pending"] and "missing_herb" not in f


@pytest.mark.skipif(not REAL_CSV.exists(), reason="실제 덤프 없음")
def test_real_kb_dump_parses_and_reports():
    rows = inv.from_drive_csv(REAL_CSV)
    assert len(rows) >= 100
    res = inv.analyse(rows)
    # 이 KB 는 상권이 0건이라는 사실이 리포트에 반드시 드러나야 한다
    assert res["by_volume"].get("상", 0) == 0
    assert "ocr_uncertain" in res["findings"]
