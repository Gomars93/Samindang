#!/usr/bin/env python3
"""3단계: MASTER INDEX + 캐시 -> canonical 본초 note 생성/보정.

안전 규칙 (CLAUDE.md "기존 파일 무검토 덮어쓰기 금지"):
  - 기본은 dry-run. --apply 없이는 vault 를 건드리지 않는다.
  - 덮어쓰기 전 반드시 _backup/<timestamp>/ 로 원본을 복사한다.
  - 기존 note 의 사람 작성 구역(INTERPRETATION / MODERN_EVIDENCE / MODERN SAFETY /
    CLINIC_NOTE / 현대근거)은 placeholder 가 아니면 **그대로 보존**한다.
  - SOURCE 구역은 원서에서 나온 것만 쓴다. 원문 장문 복사를 막기 위해 필드별 상한을 둔다.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import difflib
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import frontmatter as fmlib  # noqa: E402
from lib import keywords as kw  # noqa: E402
from lib.registry import load_pages  # noqa: E402
from lib.schema import SCHEMA_VERSION, empty_frontmatter, migrate_legacy, validate  # noqa: E402
from lib.source_parse import cap, dosage, split_fields  # noqa: E402

import re

FIELD_CAP = 900          # SOURCE 개별 필드 최대 길이
_LATIN_IN_FIELD = re.compile(r"\b([A-Z][a-z]{2,}(?:\s+[A-Za-z][a-z]{2,}){1,3})\b")
QUICKREF_CAP = 120

PLACEHOLDER_MARKERS = (
    "별도 검증 필요", "원장 입력 전 비워둠", "미검토", "자동 추론을 기입하지 않음",
    "전수 ingestion 단계", "TODO", "[]",
)

PRESERVE_HEADINGS = (
    "2. INTERPRETATION | 임상 구조화", "INTERPRETATION",
    "5. MODERN_EVIDENCE", "MODERN_EVIDENCE",
    "MODERN SAFETY", "CLINIC_NOTE",
)


def is_placeholder(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return True
    return any(m in t for m in PLACEHOLDER_MARKERS) and len(t) < 400


def load_index(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as fh:
        return list(csv.DictReader(fh))


def herb_source_text(pages: list[dict], lo: int, hi: int) -> str:
    by = {p["pdf_page"]: p for p in pages}
    return "\n".join((by.get(p, {}).get("text") or "") for p in range(lo, hi + 1))


def build_frontmatter(row: dict, fields: dict[str, str], raw: str) -> tuple[dict, list[str]]:
    fm = empty_frontmatter()
    fm["herb"] = row.get("herb", "")
    fm["hanja"] = row.get("hanja", "")
    latin = (row.get("latin_pharmacognosy") or "").strip()
    if not latin:
        m = _LATIN_IN_FIELD.search(fields.get("생약명", ""))
        latin = m.group(1) if m else ""
    fm["latin_pharmacognosy"] = latin
    fm["category"] = row.get("category", "")
    fm["subcategory"] = row.get("section", "")
    fm["source_volume"] = row.get("volume", "")
    fm["source_chapter"] = row.get("chapter", "")
    fm["status"] = "SOURCE_DERIVED" if row.get("extraction_status") == "SOURCE_DERIVED" else "PARTIAL"
    fm["review_status"] = row.get("review_status", "UNREVIEWED")
    fm["last_reviewed"] = dt.date.today().isoformat()
    fm["ocr_uncertain"] = row.get("review_status") == "OCR_REVIEW"
    fm["evidence_layer"] = ["SOURCE"]
    fm["schema_version"] = SCHEMA_VERSION

    def _int(k):
        v = (row.get(k) or "").strip()
        return int(v) if v.isdigit() else None

    ps, pe = _int("print_start_page"), _int("print_end_page")
    fm["source_print_pages"] = list(range(ps, pe + 1)) if ps and pe and pe >= ps else ([ps] if ps else [])
    qs, qe = _int("pdf_start_page"), _int("pdf_end_page")
    fm["source_pdf_pages"] = list(range(qs, qe + 1)) if qs and qe and qe >= qs else ([qs] if qs else [])

    aliases = [a.strip() for a in (fields.get("이명") or row.get("aliases") or "").replace("·", " ").split() if a.strip()]
    fm["aliases"] = aliases[:12]

    kw_text = " ".join(filter(None, [fields.get("효능주치", ""), fields.get("임상응용", ""), fields.get("해설", "")]))
    ks = kw.extract_all(kw_text)
    fm["action_keywords"] = ks["action_keywords"]
    fm["pattern_keywords"] = ks["pattern_keywords"]
    fm["clinical_keywords"] = ks["clinical_keywords"]
    fm["processing_keywords"] = kw.extract(fields.get("수치", ""), "processing")

    formulas_raw = kw.extract_formulas(fields.get("임상응용", ""))
    normalized, unresolved = kw.normalize_formulas(formulas_raw)
    fm["linked_formulas"] = normalized[:20]
    fm["linked_conditions"] = ks["clinical_keywords"]

    flags = kw.safety_flags_from_source(fields.get("금기", "") + "\n" + fields.get("성미", ""))
    flags += [f"MODERN:{f}" for f in kw.modern_safety_flags(fm["herb"])]
    fm["safety_flags"] = sorted(set(flags))

    notes = []
    if unresolved:
        notes.append("처방 독음 미확인: " + ", ".join(unresolved[:10]))
    if not fm["source_print_pages"]:
        notes.append("인쇄면 매핑 근거 없음")
    return fm, notes


def render_note(fm: dict, fields: dict[str, str], row: dict, notes: list[str]) -> str:
    herb, hanja = fm["herb"] or fm["hanja"], fm["hanja"]
    pp = fm["source_print_pages"]
    qp = fm["source_pdf_pages"]
    printed = f"p.{pp[0]}–{pp[-1]}" if pp else "미확인"
    pdfp = f"p.{qp[0]}–{qp[-1]}" if qp else "미확인"

    def f(name, limit=FIELD_CAP):
        v, truncated = cap(fields.get(name, ""), limit)
        if not v:
            return "(원서에서 확인되지 않음)"
        return v + (f"\n\n> 이하 원문 생략 — 원서 {printed} / PDF {pdfp} 확인" if truncated else "")

    L: list[str] = []
    L.append(fmlib.dump(fm))
    L.append(f"# {herb} {hanja}".strip())
    L.append("")
    L.append("> **AI 사용 규칙:** `1. SOURCE` 는 운곡본초학 원문에서 온 내용이다. "
             "전통 효능 기술을 현대 임상근거로 확대하지 않는다. "
             "처방 제안 전 안전성 색인과 질환 SSOT 를 먼저 확인한다.")
    L.append("")
    L.append("## 0. AI QUICKREF")
    L.append("")
    L.append(f"- 분류: {fm['category'] or '미확인'}{' / ' + fm['subcategory'] if fm['subcategory'] else ''}")
    L.append(f"- 핵심 성미: {cap(fields.get('성미', ''), QUICKREF_CAP)[0] or '미확인'}")
    L.append(f"- 귀경: {cap(fields.get('귀경', ''), QUICKREF_CAP)[0] or '미확인'}")
    L.append(f"- 핵심 효능: {cap(fields.get('효능주치', ''), QUICKREF_CAP)[0] or '미확인'}")
    L.append(f"- 핵심 병기: {', '.join(fm['pattern_keywords']) or '미확인'}")
    L.append(f"- 주요 임상 키워드: {', '.join(fm['clinical_keywords']) or '미확인'}")
    L.append(f"- 원서 사용량: {dosage(fields.get('사용량', '') or fields.get('임상응용', '')) or '미확인'}")
    L.append(f"- 핵심 배오: {', '.join(fm['linked_formulas'][:5]) or '미확인'}")
    L.append(f"- 핵심 주의: {', '.join(fm['safety_flags']) or '원서 금기 미검출 — 재확인 필요'}")
    L.append(f"- 원서 위치: {fm['source_volume']}권 인쇄 {printed} / PDF {pdfp}")
    if notes:
        L.append(f"- ⚠ 자동생성 경고: {'; '.join(notes)}")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 1. SOURCE | 운곡본초학")
    L.append("")
    for label in ("출전", "생약명", "이명", "기원", "성미", "귀경", "효능주치",
                  "임상응용", "사용량", "수치", "금기", "참고", "해설"):
        title = {"수치": "수치·포제", "금기": "금기·주의", "해설": "원서 해설",
                 "참고": "비교 본초·참고"}.get(label, label)
        L.append(f"### {title}")
        L.append("")
        L.append(f(label))
        L.append("")
    L.append("---")
    L.append("")
    L.append("## 2. INTERPRETATION | 임상 구조화")
    L.append("")
    L.append("`[자동 생성하지 않음 — SOURCE 를 임상적으로 구조화하는 영역. "
             "새 치료효과를 창작하는 영역이 아니다.]`")
    L.append("")
    L.append("### 주 병기")
    L.append(f"- SOURCE 유래 후보: {', '.join(fm['pattern_keywords']) or '미확인'}")
    L.append("")
    L.append("### 적합한 증상군")
    L.append(f"- SOURCE 유래 후보: {', '.join(fm['clinical_keywords']) or '미확인'}")
    L.append("")
    L.append("### 덜 적합한 상황 / 처방 내 역할 / 가감 시 의미 / 유사 본초와의 차이")
    L.append("`[원장 검토 필요]`")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 3. 배오")
    L.append("")
    L.append("`[원서·기존 KB 에서 실제 확인된 것만 기록한다. 없는 배오를 만들지 않는다.]`")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 4. 처방 연결")
    L.append("")
    if fm["linked_formulas"]:
        L.extend(f"- [[{x}]]" for x in fm["linked_formulas"])
    else:
        L.append("- (원문에서 처방명 미검출)")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 5. MODERN_EVIDENCE")
    L.append("")
    L.append("현대 임상근거: 미검토")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 6. SAFETY")
    L.append("")
    L.append("### SOURCE | 원서상 금기")
    L.append("")
    L.append(f("금기"))
    L.append("")
    L.append("### MODERN SAFETY")
    L.append("")
    for k in ("임신", "수유", "HILI", "신독성", "항응고/출혈", "장기복용", "포제필수", "기타"):
        L.append(f"- {k}: 미검토")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 7. 원서 위치")
    L.append("")
    L.append(f"- 운곡본초학 {fm['source_volume']}권")
    L.append(f"- 인쇄 {printed}")
    L.append(f"- PDF {pdfp}")
    L.append("")
    return "\n".join(L)


def merge_preserved(new_text: str, old_text: str) -> tuple[str, list[str]]:
    """기존 note 의 사람 작성 구역을 새 note 로 옮긴다."""
    old = fmlib.parse(old_text)
    if not old.ok:
        return new_text, ["기존 note frontmatter 파싱 실패 — 사람 작성 구역 이관 못 함"]
    old_secs = fmlib.sections(old.body)
    kept: list[str] = []
    out = new_text
    for heading, content in old_secs.items():
        if not any(h in heading for h in PRESERVE_HEADINGS):
            continue
        if is_placeholder(content):
            continue
        out += "\n---\n\n## (보존) 기존 note: " + heading + "\n\n" + content.strip() + "\n"
        kept.append(heading)
    return out, ([f"보존한 사람 작성 구역: {', '.join(kept)}"] if kept else [])


def run(index_csv: Path, cache: Path, vault: Path, *, apply: bool, only: set[str] | None) -> dict:
    rows = load_index(index_csv)
    volumes = {r["volume"] for r in rows}
    pages_by_vol = {v: load_pages(cache, v) for v in volumes}

    vault.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = vault.parent / "_backup" / stamp

    created = updated = unchanged = skipped = 0
    report: list[dict] = []

    for row in rows:
        herb = (row.get("herb") or "").strip()
        if not herb:
            skipped += 1
            report.append({"hanja": row.get("hanja"), "action": "SKIP", "why": "한국어 약재명 미확정"})
            continue
        if only and herb not in only:
            continue
        lo, hi = int(row["pdf_start_page"]), int(row["pdf_end_page"])
        raw = herb_source_text(pages_by_vol[row["volume"]], lo, hi)
        fields = split_fields(raw)
        fm, notes = build_frontmatter(row, fields, raw)
        issues = validate(fm, path=f"{herb}.md")
        errors = [i for i in issues if i.level == "ERROR"]
        if errors:
            notes.append("schema ERROR: " + "; ".join(i.code for i in errors))
        text = render_note(fm, fields, row, notes)

        target = vault / f"{herb}.md"
        if target.exists():
            old = target.read_text(encoding="utf-8")
            text, merge_notes = merge_preserved(text, old)
            if old == text:
                unchanged += 1
                report.append({"herb": herb, "action": "UNCHANGED"})
                continue
            diff = list(difflib.unified_diff(old.splitlines(), text.splitlines(),
                                             fromfile="old", tofile="new", lineterm="", n=0))
            report.append({"herb": herb, "action": "UPDATE", "diff_lines": len(diff),
                           "notes": notes + merge_notes})
            if apply:
                backup.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup / target.name)
                target.write_text(text, encoding="utf-8")
            updated += 1
        else:
            report.append({"herb": herb, "action": "CREATE", "notes": notes})
            if apply:
                target.write_text(text, encoding="utf-8")
            created += 1

    return {"apply": apply, "created": created, "updated": updated,
            "unchanged": unchanged, "skipped": skipped,
            "backup_dir": str(backup) if apply and updated else "",
            "report": report}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="canonical 본초 note 생성 (기본 dry-run)")
    ap.add_argument("--index", required=True, type=Path)
    ap.add_argument("--cache", default=Path("./_cache"), type=Path)
    ap.add_argument("--vault", required=True, type=Path, help="01_약재별 디렉터리")
    ap.add_argument("--apply", action="store_true", help="실제로 파일을 쓴다 (없으면 dry-run)")
    ap.add_argument("--only", default="", help="쉼표구분 약재명만 처리")
    ap.add_argument("--report", type=Path, default=None)
    args = ap.parse_args(argv)

    only = {s.strip() for s in args.only.split(",") if s.strip()} or None
    res = run(args.index, args.cache, args.vault, apply=args.apply, only=only)
    if args.report:
        args.report.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    summary = {k: v for k, v in res.items() if k != "report"}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not args.apply:
        print("[DRY-RUN] --apply 를 붙여야 실제로 씁니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
