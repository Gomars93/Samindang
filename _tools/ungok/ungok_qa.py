#!/usr/bin/env python3
"""5단계: 전수 QA. 실패가 하나라도 있으면 exit code 1.

'누락 note > 0 이면 전수처리 완료라고 하지 않는다' 를 코드로 강제한다.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import frontmatter as fmlib  # noqa: E402
from lib import keywords as kw  # noqa: E402
from lib.schema import validate  # noqa: E402

HIGH_RISK = sorted(kw.MODERN_SAFETY_GATE)


class Check:
    def __init__(self, code, title):
        self.code, self.title = code, title
        self.status = "PASS"
        self.detail: list[str] = []

    def fail(self, msg):
        self.status = "FAIL"
        self.detail.append(msg)

    def warn(self, msg):
        if self.status == "PASS":
            self.status = "WARN"
        self.detail.append(msg)

    def as_dict(self):
        return {"code": self.code, "title": self.title, "status": self.status,
                "detail": self.detail[:50], "detail_total": len(self.detail)}


def load_notes(vault: Path):
    notes = []
    for p in sorted(vault.glob("*.md")):
        raw = p.read_text(encoding="utf-8")
        notes.append((p, fmlib.parse(raw), raw))
    return notes


def run(vault: Path, kb_root: Path, index_paths: list[Path]) -> dict:
    checks: list[Check] = []
    notes = load_notes(vault)
    herb_notes = [(p, pn, raw) for p, pn, raw in notes if not p.name.startswith("_")]

    # --- 1. Master Index 존재 -----------------------------------------
    c = Check("MASTER_INDEX", "상·하권 Master Index 존재")
    found_vols = set()
    master_rows: list[dict] = []
    for ip in index_paths:
        if ip.exists():
            rows = list(csv.DictReader(ip.open(encoding="utf-8")))
            master_rows.extend(rows)
            found_vols |= {r.get("volume") for r in rows if r.get("volume")}
        else:
            c.fail(f"Master Index 없음: {ip}")
    for v in ("상", "하"):
        if v not in found_vols:
            c.fail(f"{v}권 Master Index 항목 없음")
    checks.append(c)

    # --- 2. canonical herb -> note 존재 --------------------------------
    c = Check("NOTE_COVERAGE", "모든 canonical herb 에 note 존재")
    have = {p.stem for p, _, _ in herb_notes}
    missing = []
    for r in master_rows:
        herb = (r.get("herb") or "").strip()
        if r.get("extraction_status") != "SOURCE_DERIVED":
            continue
        if not herb:
            c.fail(f"한국어 약재명 미확정: {r.get('hanja')} (PDF p.{r.get('pdf_start_page')})")
        elif herb not in have:
            missing.append(herb)
    for m in missing:
        c.fail(f"누락 note: {m}")
    checks.append(c)
    missing_count = len(missing)

    # --- 3~8. note 단위 필수 필드 / YAML / 빈 note ----------------------
    c_yaml = Check("YAML", "YAML 파싱 및 스키마 검증")
    c_req = Check("REQUIRED_FIELDS", "herb/hanja/volume/page 필수 필드")
    c_empty = Check("EMPTY_NOTE", "빈 note 없음")
    yaml_errors = 0
    for p, pn, raw in herb_notes:
        if not pn.ok:
            c_yaml.fail(f"{p.name}: {pn.error}")
            yaml_errors += 1
            continue
        for issue in validate(pn.frontmatter, path=p.name):
            if issue.level == "ERROR":
                (c_req if issue.code == "MISSING_REQUIRED" else c_yaml).fail(f"{p.name}: {issue.message}")
                yaml_errors += 1
        if len(pn.body.strip()) < 400:
            c_empty.fail(f"{p.name}: 본문 {len(pn.body.strip())}자 — 사실상 빈 note")
    checks.extend([c_yaml, c_req, c_empty])

    # --- 9. canonical herb 중복 ----------------------------------------
    c = Check("DUPLICATE", "canonical herb 중복 없음")
    names = Counter()
    alias_owner: dict[str, list[str]] = defaultdict(list)
    for p, pn, _ in herb_notes:
        if not pn.ok:
            continue
        names[(pn.frontmatter.get("herb") or p.stem)] += 1
        for a in pn.frontmatter.get("aliases") or []:
            alias_owner[a].append(p.stem)
    dup_count = 0
    for n, cnt in names.items():
        if cnt > 1:
            c.fail(f"약재명 중복: {n} ({cnt}개 note)")
            dup_count += 1
    for a, owners in alias_owner.items():
        if a in names:
            c.warn(f"이명 '{a}' 가 별도 canonical note 로도 존재 (소유: {', '.join(owners)})")
        elif len(owners) > 1:
            c.warn(f"이명 '{a}' 를 {len(owners)}개 note 가 공유: {', '.join(owners)}")
    checks.append(c)

    # --- 10. broken wikilink -------------------------------------------
    c = Check("WIKILINK", "broken wikilink 없음")
    targets = {p.stem for p in kb_root.rglob("*.md")}
    broken = Counter()
    for p in kb_root.rglob("*.md"):
        for link in fmlib.wikilinks(p.read_text(encoding="utf-8")):
            if link not in targets:
                broken[link] += 1
    for link, cnt in broken.most_common():
        c.fail(f"broken link [[{link}]] — {cnt}곳에서 참조")
    checks.append(c)
    broken_count = sum(broken.values())

    # --- 11. OCR_REVIEW 목록 -------------------------------------------
    c = Check("OCR_REVIEW", "OCR_REVIEW 목록 존재")
    ocr = [p.stem for p, pn, _ in herb_notes
           if pn.ok and (pn.frontmatter.get("review_status") == "OCR_REVIEW"
                         or pn.frontmatter.get("ocr_uncertain") is True)]
    if not (kb_root / "00_Source_Registry").exists():
        c.fail("00_Source_Registry 폴더 없음")
    checks.append(c)

    # --- 12. 고위험 본초 safety flag ------------------------------------
    c = Check("SAFETY_FLAG", "고위험 본초 safety flag")
    safety_required = 0
    for p, pn, _ in herb_notes:
        if not pn.ok:
            continue
        herb = pn.frontmatter.get("herb") or p.stem
        if herb in kw.MODERN_SAFETY_GATE:
            safety_required += 1
            sf = pn.frontmatter.get("safety_flags") or []
            if not any(f.startswith("MODERN:") for f in sf):
                c.fail(f"{herb}: 고위험 본초인데 MODERN safety flag 없음")
    checks.append(c)

    # --- 13. 색인 연결 ---------------------------------------------------
    c = Check("INDEX_LINKS", "효능/배오/안전성 색인 연결")
    for sub in ("02_효능-병기색인", "03_배오색인", "04_안전성색인"):
        d = kb_root / sub
        if not d.exists() or not any(d.glob("*.md")):
            c.fail(f"{sub} 비어 있음")
    for fname in ("독성본초_INDEX.md", "HILI_INDEX.md", "신독성_INDEX.md", "임신주의_INDEX.md",
                  "수유주의_INDEX.md", "항응고-출혈주의_INDEX.md", "포제필수_INDEX.md",
                  "장기고용량주의_INDEX.md"):
        if not (kb_root / "04_안전성색인" / fname).exists():
            c.fail(f"안전성 색인 누락: {fname}")
    checks.append(c)

    # --- 14. 수동작성 note 손실 ------------------------------------------
    c = Check("MANUAL_PRESERVED", "기존 수동작성 note 손실 없음")
    manual_marker = "(보존) 기존 note"
    manual = [p.stem for p, pn, raw in herb_notes
              if pn.ok and (pn.frontmatter.get("status") == "MANUAL" or manual_marker in raw)]
    checks.append(c)

    counts = {
        "note_total": len(herb_notes),
        "master_rows_total": len(master_rows),
        "master_rows_상": sum(1 for r in master_rows if r.get("volume") == "상"),
        "master_rows_하": sum(1 for r in master_rows if r.get("volume") == "하"),
        "verified": sum(1 for _, pn, _ in herb_notes
                        if pn.ok and pn.frontmatter.get("review_status") == "VERIFIED"),
        "ocr_review": len(ocr),
        "safety_review_required": safety_required,
        "missing_notes": missing_count,
        "duplicates": dup_count,
        "broken_links": broken_count,
        "yaml_errors": yaml_errors,
        "manual_preserved": len(manual),
    }
    overall = "FAIL" if any(ch.status == "FAIL" for ch in checks) else (
        "WARN" if any(ch.status == "WARN" for ch in checks) else "PASS")
    return {"overall": overall, "counts": counts,
            "checks": [ch.as_dict() for ch in checks],
            "ocr_review_list": sorted(ocr)}


def render(res: dict) -> str:
    c = res["counts"]
    L = ["---", 'title: "QA REPORT — 운곡본초학 전수검수"', "type: qa-report",
         f"last_reviewed: {dt.date.today().isoformat()}",
         f'overall: {res["overall"]}', "---", "",
         "# QA_REPORT_운곡본초학_전수검수", "",
         f"## 판정: **{res['overall']}**", "",
         "> 누락 note > 0 이면 '전수처리 완료'라고 쓰지 않는다.", "",
         "## 수치", "",
         "| 항목 | 값 |", "|---|---|",
         f"| 상권 canonical herb 수 | {c['master_rows_상']} |",
         f"| 하권 canonical herb 수 | {c['master_rows_하']} |",
         f"| 전체 canonical herb 수 | {c['master_rows_total']} |",
         f"| note 파일 수 | {c['note_total']} |",
         f"| VERIFIED | {c['verified']} |",
         f"| OCR_REVIEW | {c['ocr_review']} |",
         f"| Safety review required | {c['safety_review_required']} |",
         f"| 누락 note | {c['missing_notes']} |",
         f"| 중복 | {c['duplicates']} |",
         f"| broken link | {c['broken_links']} |",
         f"| YAML 오류 | {c['yaml_errors']} |",
         f"| 보존된 수동작성 note | {c['manual_preserved']} |", "",
         "## 검사 항목", "", "| 코드 | 항목 | 결과 | 지적 수 |", "|---|---|---|---|"]
    for ch in res["checks"]:
        L.append(f"| {ch['code']} | {ch['title']} | {ch['status']} | {ch['detail_total']} |")
    L.append("")
    for ch in res["checks"]:
        if ch["status"] == "PASS":
            continue
        L.append(f"### {ch['code']} — {ch['status']}")
        L.append("")
        L.extend(f"- {d}" for d in ch["detail"])
        if ch["detail_total"] > len(ch["detail"]):
            L.append(f"- … 외 {ch['detail_total'] - len(ch['detail'])}건")
        L.append("")
    if res["ocr_review_list"]:
        L.append("## OCR_REVIEW 대상")
        L.append("")
        L.append(", ".join(res["ocr_review_list"]))
        L.append("")
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="운곡본초학 KB 전수 QA")
    ap.add_argument("--vault", required=True, type=Path)
    ap.add_argument("--kb-root", required=True, type=Path)
    ap.add_argument("--index", action="append", type=Path, default=[])
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args(argv)

    res = run(args.vault, args.kb_root, args.index)
    md = render(res)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(md, encoding="utf-8")
    if args.json:
        args.json.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"overall": res["overall"], **res["counts"]}, ensure_ascii=False, indent=2))
    return 1 if res["overall"] == "FAIL" else 0


if __name__ == "__main__":
    raise SystemExit(main())
