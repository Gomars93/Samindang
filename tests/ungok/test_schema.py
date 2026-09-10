"""스키마 교체 안전장치 — CLAUDE.md '필드별 대체 경로 표' 규칙의 테스트화."""
import csv
from pathlib import Path

import pytest

from lib.schema import (DELIBERATE_DROPS, LEGACY_FIELD_MAP, empty_frontmatter,
                        migrate_legacy, validate)

REPO = Path(__file__).resolve().parents[2]
INVENTORY_CSV = REPO / "_tools" / "reports" / "raw_inventory_01_yakjaebyeol.csv"

LEGACY_KEYS_IN_KB = {
    "title", "herb_ko", "herb_hanja", "latin_drug_name", "aliases", "category",
    "subcategory", "source_book", "source_volume", "printed_page_start",
    "printed_page_end", "pdf_page_start", "pdf_page_end", "status",
    "ocr_uncertain", "extraction_status", "safety_flags", "last_reviewed", "use",
}


def test_every_legacy_key_has_a_destination_or_documented_drop():
    """옛 경로가 나르던 필드를 한 개도 조용히 잃지 않는다."""
    for key in LEGACY_KEYS_IN_KB:
        assert key in LEGACY_FIELD_MAP, f"{key} 가 마이그레이션 표에 없음"
        dest = LEGACY_FIELD_MAP[key]
        if dest == "__dropped__":
            assert key in DELIBERATE_DROPS and DELIBERATE_DROPS[key].strip(), \
                f"{key} 를 버리는 근거가 기재되지 않음"


def test_migration_preserves_page_ranges():
    fm, _ = migrate_legacy({"printed_page_start": 1335, "printed_page_end": 1337,
                            "pdf_page_start": 586, "pdf_page_end": 589})
    assert fm["source_print_pages"] == [1335, 1336, 1337]
    assert fm["source_pdf_pages"] == [586, 587, 588, 589]


def test_migration_reports_unmapped_keys():
    _, log = migrate_legacy({"herb_ko": "석곡", "made_up_key": 1})
    assert any("UNMAPPED made_up_key" in line for line in log)


def test_migration_does_not_invent_values():
    fm, _ = migrate_legacy({"herb_ko": "마황근"})
    assert fm["hanja"] == ""          # 없는 한자를 만들지 않는다
    assert fm["source_print_pages"] == []


def test_validate_flags_missing_required():
    codes = {i.code for i in validate(empty_frontmatter())}
    assert "MISSING_REQUIRED" in codes


def test_validate_rejects_ocr_uncertain_plus_verified():
    fm = empty_frontmatter()
    fm.update(herb="석곡", hanja="石斛", source_volume="하",
              source_print_pages=[1335], status="SOURCE_DERIVED",
              review_status="VERIFIED", ocr_uncertain=True, evidence_layer=["SOURCE"])
    assert "OCR_VS_VERIFIED" in {i.code for i in validate(fm)}


def test_validate_rejects_bad_enums():
    fm = empty_frontmatter()
    fm.update(herb="x", hanja="y", source_volume="중", source_print_pages=[1],
              status="WHATEVER", review_status="NOPE", ocr_uncertain=False,
              evidence_layer=["PUBMED"])
    codes = {i.code for i in validate(fm)}
    assert {"BAD_VOLUME", "BAD_STATUS", "BAD_REVIEW_STATUS", "BAD_EVIDENCE_LAYER"} <= codes


@pytest.mark.skipif(not INVENTORY_CSV.exists(), reason="inventory dump 없음")
def test_real_kb_rows_migrate_without_unmapped_keys():
    """실제 KB 덤프의 모든 컬럼이 표에 있는지 확인한다."""
    with INVENTORY_CSV.open(encoding="utf-8") as fh:
        row = next(csv.DictReader(fh))
    kb_keys = {"herb_ko", "herb_hanja", "latin_drug_name", "category", "subcategory",
               "source_book", "source_volume", "printed_page_start", "printed_page_end",
               "pdf_page_start", "pdf_page_end", "status", "ocr_uncertain",
               "safety_flags", "last_reviewed"}
    assert kb_keys <= set(row)
    assert kb_keys <= set(LEGACY_FIELD_MAP)
