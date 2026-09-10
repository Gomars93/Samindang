"""전 파이프라인 end-to-end: 합성 PDF -> 캐시 -> MASTER INDEX -> note -> 색인 -> QA.

원서 PDF 없이도 파이프라인 전체가 동작하고, QA 게이트가 실제로 작동함을 보증한다.
"""
import json

import pytest

fitz = pytest.importorskip("fitz")

import ungok_build_indexes as bi
import ungok_build_master_index as bmi
import ungok_build_notes as bn
import ungok_extract as ue
import ungok_qa as qa
from lib.registry import load_readings

HERBS = [("石決明", 1157, "평간식풍약"), ("石斛", 1159, "보익약"),
         ("桑白皮", 1161, "화담지해평천약"), ("甘草", 1163, "보기약")]
READINGS = "hanja\therb_ko\tkb_status\tkb_ocr_uncertain\n" + "".join(
    f"{h}\t{k}\tSOURCE_DERIVED\tfalse\n"
    for h, k in (("石決明", "석결명"), ("石斛", "석곡"),
                 ("桑白皮", "상백피"), ("甘草", "감초")))


def _make_book(path):
    doc = fitz.open()
    # p1-2: 목차
    toc = doc.new_page(width=420, height=620)
    toc.insert_text((50, 60), "목차", fontsize=11, fontname="korea")
    y = 90
    for name, printed, _ in HERBS:
        toc.insert_text((50, y), f"{name} ………… {printed}", fontsize=9, fontname="korea")
        y += 16
    toc.insert_text((200, 590), "3", fontsize=9)

    # 본문: 약재당 2면
    for i, (name, printed, chapter) in enumerate(HERBS):
        for j in range(2):
            page = doc.new_page(width=420, height=620)
            if j == 0:
                page.insert_text((50, 50), f"제{15 + i}장 {chapter}", fontsize=10, fontname="korea")
                page.insert_text((50, 90), name, fontsize=22, fontname="korea")
                y = 130
                for ln in ("출전 本經", "생약명 Haliotidis Concha", "성상 貝殼",
                           "산지 韓國", "성분 炭酸", "性 味 寒 鹹 無毒", "歸 經 肝",
                           "效能主治 平肝潛陽, 淸肝明目. 治頭痛眩暈.",
                           "임상응용 石決明丸 - 石決明 熟地黃 山藥",
                           "사용량 : 9~30g", "수치 煆用한다.", "금기 孕婦 忌.",
                           "해설 본품은 鹹寒하다.", "참고 珍珠母 대체."):
                    page.insert_text((50, y), ln, fontsize=9, fontname="korea")
                    y += 17
            else:
                page.insert_text((50, 90), "이어지는 본문이며 충분한 분량의 설명이 계속된다." * 3,
                                 fontsize=9, fontname="korea")
            page.insert_text((200, 590), str(printed + j), fontsize=9)

    # 마지막 면: 책 뒤 색인
    idx = doc.new_page(width=420, height=620)
    idx.insert_text((50, 60), "색인", fontsize=11, fontname="korea")
    y = 90
    for name, printed, _ in HERBS:
        idx.insert_text((50, y), f"{name} {printed}", fontsize=9, fontname="korea")
        y += 16
    idx.insert_text((200, 590), str(HERBS[-1][1] + 2), fontsize=9)
    doc.save(path)
    doc.close()


def test_full_pipeline_runs_and_qa_gate_works(tmp_path, monkeypatch):
    pdf = tmp_path / "ungok_ha.pdf"
    _make_book(pdf)
    cache = tmp_path / "_cache"

    meta = ue.extract(pdf, "하", cache, first=None, last=None)
    assert meta["pdf_unmodified"] and meta["pages_written"] == 2 + 2 * len(HERBS)

    readings_file = tmp_path / "readings.tsv"
    readings_file.write_text(READINGS, encoding="utf-8")
    load_readings.cache_clear()

    kb = tmp_path / "07_본초_Library"
    last = 2 + 2 * len(HERBS)
    res = bmi.build("하", cache, kb / "00_Source_Registry",
                    toc_range=(1, 1), index_range=(last, last),
                    readings_path=str(readings_file))
    assert res["rows"] == len(HERBS)
    assert res["confirmed"] == len(HERBS)
    index_csv = kb / "00_Source_Registry" / "운곡본초학_MASTER_INDEX_하.csv"
    assert index_csv.exists()

    import csv as _csv
    rows = list(_csv.DictReader(index_csv.open(encoding="utf-8")))
    # 인쇄면 매핑 근거(연속 구간)가 확보되면 인쇄면 칸이 실제로 채워져야 한다
    assert all(r["print_start_page"] for r in rows), rows
    assert rows[0]["print_start_page"] == "1157"

    vault = kb / "01_약재별"
    build = bn.run(index_csv, cache, vault, apply=True, only=None)
    assert build["created"] == len(HERBS) and build["skipped"] == 0

    notes = bi.load_vault(vault)
    bi.build_efficacy(notes, kb / "02_효능-병기색인")
    bi.build_safety(notes, kb / "04_안전성색인")
    bi.build_combos(notes, index_csv, cache, kb / "03_배오색인", min_count=1)

    out = tmp_path / "QA_REPORT.md"
    result = qa.run(vault, kb, [index_csv])
    out.write_text(qa.render(result), encoding="utf-8")

    # 상권 Master Index 가 없으므로 QA 는 반드시 FAIL 이어야 한다 (게이트가 살아 있다)
    assert result["overall"] == "FAIL"
    assert any(c["code"] == "MASTER_INDEX" and c["status"] == "FAIL" for c in result["checks"])
    assert "QA_REPORT" in out.read_text(encoding="utf-8")


def test_master_index_never_guesses_pages_without_evidence(tmp_path):
    """인쇄면 검출이 없는 책이면 인쇄면 칸은 빈칸으로 남아야 한다."""
    doc = fitz.open()
    for _ in range(4):
        page = doc.new_page(width=420, height=620)
        page.insert_text((50, 90), "石決明", fontsize=22, fontname="korea")
        y = 130
        for ln in ("출전 本經", "생약명 X", "성상 Y", "성미 寒", "귀경 肝",
                   "效能主治 平肝", "임상응용 A", "사용량 : 9g", "금기 忌"):
            page.insert_text((50, y), ln, fontsize=9, fontname="korea")
            y += 17
    pdf = tmp_path / "nopage.pdf"
    doc.save(pdf)
    doc.close()

    cache = tmp_path / "_cache"
    ue.extract(pdf, "하", cache, first=None, last=None)
    bmi.build("하", cache, tmp_path / "reg", toc_range=None, index_range=None)
    rows = (tmp_path / "reg" / "운곡본초학_MASTER_INDEX_하.csv").read_text(encoding="utf-8")
    body = [ln for ln in rows.splitlines()[1:] if ln.strip()]
    assert body, "표제가 하나도 검출되지 않음"
    for ln in body:
        cols = ln.split(",")
        assert cols[8] == "" and cols[9] == "", f"근거 없는 인쇄면이 채워짐: {ln}"
        assert "OCR_REVIEW" in ln
