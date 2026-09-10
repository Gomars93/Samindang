"""PDF 추출: 원본을 절대 건드리지 않는다 (합성 PDF로 end-to-end)."""
import json

import pytest

fitz = pytest.importorskip("fitz")

import ungok_extract as ue


def _make_pdf(path):
    doc = fitz.open()
    for title, printed in (("石決明", 1157), ("石斛", 1159)):
        page = doc.new_page(width=400, height=600)
        page.insert_text((50, 60), title, fontsize=20, fontname="korea")
        y = 100
        for ln in ("출전 別錄", "생약명 X", "성상 Y", "성미 寒", "귀경 肝",
                   "효능 平肝潛陽", "사용량 9~30g", "금기 脾胃虛寒"):
            page.insert_text((50, y), ln, fontsize=9, fontname="korea")
            y += 18
        page.insert_text((190, 570), str(printed), fontsize=9)
    doc.save(path)
    doc.close()


def test_extract_builds_cache_and_leaves_pdf_unmodified(tmp_path):
    pdf = tmp_path / "book.pdf"
    _make_pdf(pdf)
    before = ue.sha256(pdf)
    meta = ue.extract(pdf, "하", tmp_path / "cache", first=None, last=None)
    assert meta["pdf_sha256"] == before == ue.sha256(pdf)
    assert meta["pdf_unmodified"] is True
    assert meta["pages_written"] == 2


def test_cache_records_page_text_fonts_and_printed_numbers(tmp_path):
    pdf = tmp_path / "book.pdf"
    _make_pdf(pdf)
    ue.extract(pdf, "하", tmp_path / "cache", first=None, last=None)
    recs = [json.loads(x) for x in
            (tmp_path / "cache" / "하_pages.jsonl").read_text(encoding="utf-8").splitlines()]
    assert recs[0]["printed_page_detected"] == 1157
    assert recs[0]["max_font_size"] >= 18
    assert "石決明" in recs[0]["text"]
    assert recs[0]["lines"] and recs[0]["lines"][0]["size"] >= 18


def test_low_text_pages_go_to_ocr_review(tmp_path):
    pdf = tmp_path / "blank.pdf"
    doc = fitz.open()
    doc.new_page(width=200, height=200)
    doc.save(pdf)
    doc.close()
    meta = ue.extract(pdf, "상", tmp_path / "cache", first=None, last=None)
    assert meta["ocr_review_count"] == 1
    review = json.loads((tmp_path / "cache" / "상_ocr_review.json").read_text(encoding="utf-8"))
    assert review[0]["pdf_page"] == 1


def test_page_range_limits_extraction(tmp_path):
    pdf = tmp_path / "book.pdf"
    _make_pdf(pdf)
    meta = ue.extract(pdf, "하", tmp_path / "cache", first=2, last=2)
    assert meta["pages_written"] == 1 and meta["extracted_range"] == [2, 2]
