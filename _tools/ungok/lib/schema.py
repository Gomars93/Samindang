"""Canonical 본초 note YAML schema + 기존 스키마 마이그레이션 표.

CLAUDE.md "경로를 지우거나 교체하기 전에 필드별 대체 경로를 표로 적는다" 규칙의
코드화. 기존 KB(v2 스키마)의 **모든** 키는 아래 LEGACY_FIELD_MAP 에서
목적지를 갖거나, DELIBERATE_DROPS 에 근거와 함께 등재되어야 한다.
테스트(test_schema.py)가 이 완전성을 강제한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

SCHEMA_VERSION = "ungok-herb-note/1.0"

# --- canonical 필드 정의 ------------------------------------------------
SCALAR_FIELDS = (
    "herb", "hanja", "latin_pharmacognosy", "category", "subcategory",
    "source_title", "source_volume", "source_chapter",
    "status", "review_status", "last_reviewed", "schema_version",
)
LIST_FIELDS = (
    "aliases", "source_print_pages", "source_pdf_pages",
    "clinical_keywords", "pattern_keywords", "action_keywords",
    "linked_formulas", "linked_conditions", "safety_flags",
    "processing_keywords", "evidence_layer",
)
BOOL_FIELDS = ("ocr_uncertain",)

REQUIRED_FIELDS = (
    "herb", "hanja", "source_title", "source_volume",
    "source_print_pages", "status", "review_status", "ocr_uncertain",
    "evidence_layer", "schema_version",
)

VALID_STATUS = {"SOURCE_DERIVED", "SOURCE_INGESTED", "PARTIAL", "STUB", "MANUAL"}
VALID_REVIEW = {"VERIFIED", "OCR_REVIEW", "SAFETY_REVIEW", "UNREVIEWED"}
VALID_VOLUME = {"상", "하"}
VALID_EVIDENCE_LAYER = {"SOURCE", "INTERPRETATION", "MODERN_EVIDENCE", "MODERN_SAFETY"}

# --- 기존(v2) → canonical 마이그레이션 표 --------------------------------
# 값이 문자열이면 새 키 이름, 콜러블이면 변환 규칙 이름.
LEGACY_FIELD_MAP: dict[str, str] = {
    "title":               "__derived__:herb+hanja",   # '익지인 益智仁' 로 재조립
    "herb_ko":             "herb",
    "herb_hanja":          "hanja",
    "latin_drug_name":     "latin_pharmacognosy",
    "aliases":             "aliases",
    "category":            "category",
    "subcategory":         "subcategory",
    "source_book":         "source_title",
    "source_volume":       "source_volume",
    "printed_page_start":  "source_print_pages[0]",
    "printed_page_end":    "source_print_pages[-1]",
    "pdf_page_start":      "source_pdf_pages[0]",
    "pdf_page_end":        "source_pdf_pages[-1]",
    "status":              "status",
    "ocr_uncertain":       "ocr_uncertain",
    "extraction_status":   "__body__:0.Provenance/추출 상태",
    "safety_flags":        "safety_flags",
    "last_reviewed":       "last_reviewed",
    "use":                 "__dropped__",
}

# 의도적으로 버리는 필드 + 근거. (버림도 표에 남긴다.)
DELIBERATE_DROPS: dict[str, str] = {
    "use": "모든 note가 'internal_clinical_decision_support' 단일값 — 검색 변별력 0. "
           "KB 전역 정책이므로 00_본초_INDEX 에 1회 명시하고 note 단위에서는 제거.",
}


@dataclass
class ValidationIssue:
    file: str
    level: str          # ERROR | WARN
    code: str
    message: str


@dataclass
class Note:
    """canonical note 의 frontmatter."""

    data: dict[str, Any] = field(default_factory=dict)

    def get(self, k, default=None):
        return self.data.get(k, default)


def empty_frontmatter() -> dict[str, Any]:
    fm: dict[str, Any] = {k: "" for k in SCALAR_FIELDS}
    fm.update({k: [] for k in LIST_FIELDS})
    fm.update({k: False for k in BOOL_FIELDS})
    fm["schema_version"] = SCHEMA_VERSION
    fm["source_title"] = "운곡본초학"
    return fm


def migrate_legacy(fm: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """v2 frontmatter -> canonical frontmatter. (결과, 처리로그) 반환.

    값을 만들어내지 않는다. 없는 값은 없는 채로 둔다.
    """
    out = empty_frontmatter()
    log: list[str] = []
    unknown = [k for k in fm if k not in LEGACY_FIELD_MAP]

    for src, dest in LEGACY_FIELD_MAP.items():
        if src not in fm:
            continue
        val = fm[src]
        if dest == "__dropped__":
            log.append(f"DROP {src}={val!r}: {DELIBERATE_DROPS.get(src, '근거 미기재')}")
            continue
        if dest.startswith("__derived__") or dest.startswith("__body__"):
            log.append(f"MOVE {src} -> {dest}")
            continue
        if dest.endswith("[0]"):
            key = dest[:-3]
            out.setdefault(key, [])
            if val not in ("", None):
                out[key] = _merge_range(out[key], int(val), None)
            continue
        if dest.endswith("[-1]"):
            key = dest[:-4]
            out.setdefault(key, [])
            if val not in ("", None):
                out[key] = _merge_range(out[key], None, int(val))
            continue
        out[dest] = val
        log.append(f"MAP {src} -> {dest}")

    for k in unknown:
        log.append(f"UNMAPPED {k}={fm[k]!r} — LEGACY_FIELD_MAP 에 목적지를 추가해야 함")

    # 기존 KB는 review_status 키가 없다. 상태에서 유도하되, 확신 없으면 UNREVIEWED.
    if not out.get("review_status"):
        out["review_status"] = "OCR_REVIEW" if fm.get("ocr_uncertain") else "UNREVIEWED"
    if not out.get("evidence_layer"):
        out["evidence_layer"] = ["SOURCE"] if out.get("status") else []
    return out, log


def _merge_range(existing: list[int], lo: int | None, hi: int | None) -> list[int]:
    cur = list(existing)
    if lo is not None:
        cur = [lo] if not cur else [lo] + [p for p in cur if p > lo]
    if hi is not None:
        if not cur:
            cur = [hi]
        else:
            start = cur[0]
            cur = list(range(start, hi + 1)) if hi >= start else cur
    return cur


def validate(fm: dict[str, Any], *, path: str = "") -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    def err(code, msg):
        issues.append(ValidationIssue(path, "ERROR", code, msg))

    def warn(code, msg):
        issues.append(ValidationIssue(path, "WARN", code, msg))

    for k in REQUIRED_FIELDS:
        v = fm.get(k)
        if v in ("", None) or (isinstance(v, list) and not v and k != "source_pdf_pages"):
            err("MISSING_REQUIRED", f"필수 필드 누락: {k}")

    if fm.get("status") and fm["status"] not in VALID_STATUS:
        err("BAD_STATUS", f"status={fm['status']!r} 는 허용값 {sorted(VALID_STATUS)} 밖")
    if fm.get("review_status") and fm["review_status"] not in VALID_REVIEW:
        err("BAD_REVIEW_STATUS", f"review_status={fm['review_status']!r} 허용값 밖")
    if fm.get("source_volume") and fm["source_volume"] not in VALID_VOLUME:
        err("BAD_VOLUME", f"source_volume={fm['source_volume']!r} 는 '상'/'하' 가 아님")

    for k in LIST_FIELDS:
        if k in fm and not isinstance(fm[k], list):
            err("NOT_A_LIST", f"{k} 는 리스트여야 함 (현재 {type(fm[k]).__name__})")

    for lay in fm.get("evidence_layer", []) or []:
        if lay not in VALID_EVIDENCE_LAYER:
            err("BAD_EVIDENCE_LAYER", f"evidence_layer 항목 {lay!r} 허용값 밖")

    pp = fm.get("source_print_pages") or []
    if pp and any(not isinstance(p, int) for p in pp):
        err("BAD_PAGE_TYPE", "source_print_pages 는 정수 목록이어야 함")
    if pp and sorted(pp) != list(pp):
        warn("PAGES_UNSORTED", "source_print_pages 가 오름차순이 아님")

    if fm.get("ocr_uncertain") is True and fm.get("review_status") == "VERIFIED":
        err("OCR_VS_VERIFIED", "ocr_uncertain=true 인데 review_status=VERIFIED — 모순")

    if not (fm.get("source_pdf_pages") or []):
        warn("NO_PDF_PAGES", "source_pdf_pages 비어 있음 — provenance 재확인 불가")

    return issues
