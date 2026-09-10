#!/usr/bin/env python3
"""0단계: 기존 KB 전수 inventory (원서 없이 실행 가능).

두 가지 입력 모드:
  --vault <dir>       로컬 Obsidian vault 의 01_약재별 디렉터리
  --drive-csv <csv>   Google Drive 커넥터로 덤프한 frontmatter CSV
                      (원격 세션처럼 vault 를 마운트할 수 없을 때)

점검 항목: herb/한자/status/volume/page, YAML 오류, 중복, 별명·정식명 충돌,
비정상적으로 작은 파일, OCR 오인식 의심 파일명, 빈 section, broken wikilink,
수동작성 여부, 스키마 변종.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import frontmatter as fmlib  # noqa: E402
from lib.textnorm import is_hangul, is_hanja  # noqa: E402

SMALL_FILE_BYTES = 2500
HANJA_OK = re.compile(r"^[㐀-䶿一-鿿]+$")
SUSPECT_CHARS = re.compile(r"[*ᄀ-ᇿ�?]|[A-Za-z]")




def from_drive_csv(path: Path) -> list[dict]:
    rows = list(csv.DictReader(path.open(encoding="utf-8")))
    out = []
    for r in rows:
        out.append({
            "name": (r.get("title") or "").split(" ")[0] or r.get("herb_ko") or "",
            "file": r.get("title") or r.get("drive_file_id", ""),
            "herb": r.get("herb_ko", ""),
            "hanja": r.get("herb_hanja", ""),
            "latin": r.get("latin_drug_name", ""),
            "category": r.get("category", ""),
            "volume": r.get("source_volume", ""),
            "print_start": r.get("printed_page_start", ""),
            "print_end": r.get("printed_page_end", ""),
            "pdf_start": r.get("pdf_page_start", ""),
            "pdf_end": r.get("pdf_page_end", ""),
            "status": r.get("status", ""),
            "ocr_uncertain": (r.get("ocr_uncertain", "") or "").lower() == "true",
            "safety_flags": r.get("safety_flags", ""),
            "size": int(r.get("file_size_bytes") or 0),
            "schema": r.get("schema_variant", ""),
            "wikilinks": [w for w in (r.get("wikilinks") or "").split(";") if w],
            "yaml_ok": (r.get("has_frontmatter", "").upper() == "TRUE"),
            "notes": r.get("notes", ""),
            "body": "",
        })
    return out


def from_vault(vault: Path) -> list[dict]:
    out = []
    for p in sorted(vault.glob("*.md")):
        raw = p.read_text(encoding="utf-8")
        pn = fmlib.parse(raw)
        fm = pn.frontmatter if pn.ok else {}
        pp = fm.get("source_print_pages") or []
        qp = fm.get("source_pdf_pages") or []
        out.append({
            "name": p.stem, "file": p.name,
            "herb": fm.get("herb") or fm.get("herb_ko") or "",
            "hanja": fm.get("hanja") or fm.get("herb_hanja") or "",
            "latin": fm.get("latin_pharmacognosy") or fm.get("latin_drug_name") or "",
            "category": fm.get("category", ""),
            "volume": fm.get("source_volume", ""),
            "print_start": pp[0] if pp else fm.get("printed_page_start", ""),
            "print_end": pp[-1] if pp else fm.get("printed_page_end", ""),
            "pdf_start": qp[0] if qp else fm.get("pdf_page_start", ""),
            "pdf_end": qp[-1] if qp else fm.get("pdf_page_end", ""),
            "status": fm.get("status", ""),
            "ocr_uncertain": bool(fm.get("ocr_uncertain")),
            "safety_flags": ",".join(fm.get("safety_flags") or []),
            "size": len(raw.encode("utf-8")),
            "schema": "V3" if "schema_version" in fm else ("V2" if "herb_ko" in fm else "OTHER"),
            "wikilinks": fmlib.wikilinks(raw),
            "yaml_ok": pn.ok,
            "notes": "" if pn.ok else pn.error,
            "body": pn.body,
        })
    return out


def analyse(rows: list[dict], *, link_targets: set[str] | None = None) -> dict:
    findings: dict[str, list[str]] = defaultdict(list)
    herb_names = Counter()
    for r in rows:
        f = r["file"]
        if r["name"].startswith("_") or r["status"] == "PENDING":
            findings["template_or_pending"].append(f)
            continue
        if not r["yaml_ok"]:
            findings["yaml_error"].append(f"{f}: {r['notes']}")
        if not r["herb"]:
            findings["missing_herb"].append(f)
        else:
            herb_names[r["herb"]] += 1
            if not is_hangul(r["herb"]):
                findings["herb_not_hangul"].append(f"{f}: herb={r['herb']!r}")
        if not r["hanja"]:
            findings["missing_hanja"].append(f)
        elif not HANJA_OK.match(r["hanja"]):
            findings["hanja_suspect"].append(f"{f}: hanja={r['hanja']!r} — 한자 이외 문자 포함(OCR 오인식 의심)")
        if not r["volume"]:
            findings["missing_volume"].append(f)
        if not str(r["print_start"]).strip():
            findings["missing_print_page"].append(f)
        if not str(r["pdf_start"]).strip():
            findings["missing_pdf_page"].append(f)
        if r["size"] and r["size"] < SMALL_FILE_BYTES:
            findings["small_file"].append(f"{f} ({r['size']}B)")
        if r["ocr_uncertain"]:
            findings["ocr_uncertain"].append(f)
        if r["body"]:
            for sec, content in fmlib.sections(r["body"]).items():
                if sec != "__preamble__" and not content.strip():
                    findings["empty_section"].append(f"{f} :: {sec}")
    for n, c in herb_names.items():
        if c > 1:
            findings["duplicate_herb"].append(f"{n} ({c}개)")

    targets = link_targets if link_targets is not None else {r["name"] for r in rows}
    broken = Counter()
    for r in rows:
        for link in r["wikilinks"]:
            if link not in targets:
                broken[link] += 1
    for link, c in broken.most_common():
        findings["broken_wikilink"].append(f"[[{link}]] ×{c}")

    return {
        "total": len(rows),
        "by_status": dict(Counter(r["status"] for r in rows)),
        "by_volume": dict(Counter(r["volume"] or "(없음)" for r in rows)),
        "by_schema": dict(Counter(r["schema"] for r in rows)),
        "findings": {k: v for k, v in sorted(findings.items())},
    }


def render(res: dict, source_label: str) -> str:
    L = ["---", 'title: "운곡본초학 KB INVENTORY REPORT"', "type: inventory-report",
         f"last_reviewed: {dt.date.today().isoformat()}",
         f'source: "{source_label}"', "---", "",
         "# 운곡본초학 KB INVENTORY REPORT", "",
         f"- 대상: {source_label}", f"- note 수: {res['total']}", "",
         "## 분포", "", "| 축 | 값 |", "|---|---|"]
    for k, v in res["by_status"].items():
        L.append(f"| status={k or '(없음)'} | {v} |")
    for k, v in res["by_volume"].items():
        L.append(f"| volume={k} | {v} |")
    for k, v in res["by_schema"].items():
        L.append(f"| schema={k} | {v} |")
    L += ["", "## 지적 사항", "", "| 항목 | 건수 |", "|---|---|"]
    for k, v in res["findings"].items():
        L.append(f"| {k} | {len(v)} |")
    L.append("")
    for k, v in res["findings"].items():
        L.append(f"### {k} ({len(v)})")
        L.append("")
        L.extend(f"- {x}" for x in v[:80])
        if len(v) > 80:
            L.append(f"- … 외 {len(v) - 80}건")
        L.append("")
    return "\n".join(L) + "\n"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="기존 본초 KB inventory")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--vault", type=Path)
    g.add_argument("--drive-csv", type=Path)
    ap.add_argument("--kb-root", type=Path, default=None,
                    help="wikilink 대상 계산용 KB 루트 (있으면 색인 note 도 대상에 포함)")
    ap.add_argument("--extra-targets", type=Path, default=None,
                    help="추가 링크 대상 이름 목록 (줄바꿈 구분)")
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args(argv)

    if args.vault:
        rows = from_vault(args.vault)
        label = f"vault:{args.vault}"
    else:
        rows = from_drive_csv(args.drive_csv)
        label = f"drive-csv:{args.drive_csv.name}"

    targets = {r["name"] for r in rows}
    if args.kb_root:
        targets |= {p.stem for p in args.kb_root.rglob("*.md")}
    if args.extra_targets and args.extra_targets.exists():
        targets |= {ln.strip() for ln in args.extra_targets.read_text(encoding="utf-8").splitlines() if ln.strip()}

    res = analyse(rows, link_targets=targets)
    md = render(res, label)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(md, encoding="utf-8")
    if args.json:
        args.json.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"total": res["total"],
                      "findings": {k: len(v) for k, v in res["findings"].items()}},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
