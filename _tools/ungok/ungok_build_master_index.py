#!/usr/bin/env python3
"""2단계: 캐시 -> 운곡본초학 MASTER INDEX (상/하 각각).

3원 대조: 목차(toc) · 본문 표제(body) · 책 뒤 색인(back index).
- 세 출처 중 2곳 이상에서 확인된 표제만 canonical 로 확정한다.
- 1곳에서만 나온 표제는 버리지 않고 review_status=OCR_REVIEW 로 남긴다.
- 인쇄면/PDF면은 검출된 값만 쓴다. 매핑 근거가 없으면 빈칸으로 둔다 (추측 금지).

출력: <out>/운곡본초학_MASTER_INDEX_<vol>.csv 와 .md
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.boundaries import build_spans, page_heading_candidates, parse_back_index, parse_toc_lines  # noqa: E402
from lib.pagemap import PageMap, Run  # noqa: E402
from lib.registry import load_meta, load_pages, load_readings  # noqa: E402

COLUMNS = [
    "volume", "chapter", "section", "herb", "hanja", "latin_pharmacognosy",
    "aliases", "category", "print_start_page", "print_end_page",
    "pdf_start_page", "pdf_end_page", "extraction_status", "review_status",
    "note_path", "evidence_sources",
]

_CHAPTER_RE = re.compile(r"제\s*(\d{1,2})\s*장\s*([^\n]{0,30})")
_CHAPTER_PREFIX = re.compile(r"^제\s*\d{1,2}\s*장\s*")
_SECTION_RE = re.compile(r"^\s*(?:\d+\.\s*)?([가-힣]{2,10}약)\s*$")
_LATIN_RE = re.compile(r"\b([A-Z][a-z]{2,}(?:\s+[A-Za-z][a-z]{2,}){1,3})\b")


def pagemap_from_meta(meta: dict) -> PageMap:
    return PageMap([Run(r["pdf_start"], r["pdf_end"], r["offset"], r["evidence"])
                    for r in meta.get("pagemap_runs", [])])


def chapter_for_page(pages: list[dict], pdf_page: int) -> tuple[str, str]:
    """해당 페이지 이전에 마지막으로 등장한 '제N장 …' 과 소절명을 돌려준다."""
    chapter = section = ""
    for rec in pages:
        if rec["pdf_page"] > pdf_page:
            break
        m = _CHAPTER_RE.search(rec.get("text", "") or "")
        if m:
            chapter = f"제{int(m.group(1))}장 {m.group(2).strip()}".strip()
        for ln in (rec.get("lines") or []):
            sm = _SECTION_RE.match((ln.get("text") or "").strip())
            if sm:
                section = sm.group(1)
    return chapter, section


def collect_body_headings(pages: list[dict], confirm: set[str]):
    cands = []
    for rec in pages:
        cands.extend(page_heading_candidates(rec["pdf_page"], rec.get("lines") or [],
                                             page_text=rec.get("text") or ""))
    last = pages[-1]["pdf_page"] if pages else 0
    return build_spans(cands, last_pdf_page=last, confirm_set=confirm)


def field_after(text: str, label: str, *, maxlen: int = 120) -> str:
    m = re.search(re.escape(label) + r"[ \t:：]*\n?([^\n]{0,%d})" % maxlen, text or "")
    return m.group(1).strip() if m else ""


def build(volume: str, cache: Path, out: Path, *, toc_range, index_range,
          readings_path: str | None = None) -> dict:
    pages = load_pages(cache, volume)
    meta = load_meta(cache, volume)
    pm = pagemap_from_meta(meta)
    readings = load_readings(readings_path)

    by_page = {r["pdf_page"]: r for r in pages}

    def text_in(rng):
        if not rng:
            return ""
        lo, hi = rng
        return "\n".join((by_page.get(p, {}).get("text") or "") for p in range(lo, hi + 1))

    toc_entries = parse_toc_lines(text_in(toc_range))
    idx_entries = parse_back_index(text_in(index_range))
    toc_names = {n for n, _ in toc_entries}
    idx_names = {n for n, _ in idx_entries}
    confirm = toc_names | idx_names

    spans = collect_body_headings(pages, confirm)

    rows: list[dict] = []
    for sp in spans:
        evidence = ["body"]
        if sp.hanja in toc_names:
            evidence.append("toc")
        if sp.hanja in idx_names:
            evidence.append("index")

        chapter, section = chapter_for_page(pages, sp.pdf_start)
        head_text = "\n".join((by_page.get(p, {}).get("text") or "")
                              for p in range(sp.pdf_start, sp.pdf_end + 1))
        latin_raw = field_after(head_text, "생약명")
        lm = _LATIN_RE.search(latin_raw)
        latin = lm.group(1) if lm else ""
        aliases_raw = field_after(head_text, "이명")

        reading = readings.get(sp.hanja)
        herb_ko = reading.herb_ko if reading else ""

        p_start = pm.pdf_to_printed(sp.pdf_start)
        p_end = pm.pdf_to_printed(sp.pdf_end)

        confirmed = len(evidence) >= 2
        if not confirmed or not herb_ko or p_start is None:
            review = "OCR_REVIEW"
        elif reading and not reading.trustworthy:
            review = "OCR_REVIEW"
        else:
            review = "VERIFIED"

        rows.append({
            "volume": volume,
            "chapter": chapter,
            "section": section,
            "herb": herb_ko,
            "hanja": sp.hanja,
            "latin_pharmacognosy": latin,
            "aliases": aliases_raw,
            "category": section or _CHAPTER_PREFIX.sub("", chapter),
            "print_start_page": p_start if p_start is not None else "",
            "print_end_page": p_end if p_end is not None else "",
            "pdf_start_page": sp.pdf_start,
            "pdf_end_page": sp.pdf_end,
            "extraction_status": "SOURCE_DERIVED" if confirmed else "CANDIDATE",
            "review_status": review,
            "note_path": f"01_약재별/{herb_ko}.md" if herb_ko else "",
            "evidence_sources": "+".join(evidence),
        })

    out.mkdir(parents=True, exist_ok=True)
    csv_path = out / f"운곡본초학_MASTER_INDEX_{volume}.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(rows)

    md_path = out / f"운곡본초학_MASTER_INDEX_{volume}.md"
    md_path.write_text(render_md(volume, rows, meta, toc_entries, idx_entries), encoding="utf-8")

    return {
        "volume": volume,
        "rows": len(rows),
        "confirmed": sum(1 for r in rows if r["extraction_status"] == "SOURCE_DERIVED"),
        "ocr_review": sum(1 for r in rows if r["review_status"] == "OCR_REVIEW"),
        "toc_entries": len(toc_entries),
        "index_entries": len(idx_entries),
        "csv": str(csv_path),
        "md": str(md_path),
    }


def render_md(volume, rows, meta, toc_entries, idx_entries) -> str:
    L = [
        "---",
        f'title: "운곡본초학 MASTER INDEX {volume}권"',
        "type: master-index",
        f'source_volume: {volume}',
        f'pdf_sha256: {meta.get("pdf_sha256", "")}',
        f'pdf_page_count: {meta.get("page_count", "")}',
        f'pagemap_coverage: {meta.get("pagemap_coverage", "")}',
        "---",
        "",
        f"# 운곡본초학 MASTER INDEX — {volume}권",
        "",
        "## 집계",
        f"- 검출 표제: {len(rows)}",
        f"- 2개 출처 이상 확정(SOURCE_DERIVED): {sum(1 for r in rows if r['extraction_status'] == 'SOURCE_DERIVED')}",
        f"- 확정 미달(CANDIDATE): {sum(1 for r in rows if r['extraction_status'] == 'CANDIDATE')}",
        f"- OCR_REVIEW: {sum(1 for r in rows if r['review_status'] == 'OCR_REVIEW')}",
        f"- 목차 항목 수: {len(toc_entries)} / 책뒤 색인 항목 수: {len(idx_entries)}",
        "",
        "> 인쇄면(print)과 PDF면(pdf)은 서로 다른 번호다. 매핑 근거가 없는 칸은 비워 둔다 — 추정하지 않는다.",
        "",
        "| 장 | 절 | 약재 | 한자 | 생약명 | 인쇄면 | PDF면 | 상태 | 검수 | 근거 |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        L.append("| {chapter} | {section} | {herb} | {hanja} | {latin_pharmacognosy} | "
                 "{print_start_page}–{print_end_page} | {pdf_start_page}–{pdf_end_page} | "
                 "{extraction_status} | {review_status} | {evidence_sources} |".format(**r))
    return "\n".join(L) + "\n"


def _range(s: str | None):
    if not s:
        return None
    m = re.match(r"^\s*(\d+)\s*[-:~]\s*(\d+)\s*$", s)
    if not m:
        raise argparse.ArgumentTypeError("범위는 '12-30' 형식")
    return (int(m.group(1)), int(m.group(2)))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="운곡본초학 MASTER INDEX 생성")
    ap.add_argument("--volume", required=True, choices=["상", "하"])
    ap.add_argument("--cache", default=Path("./_cache"), type=Path)
    ap.add_argument("--out", default=Path("./00_Source_Registry"), type=Path)
    ap.add_argument("--toc-pages", type=_range, default=None, help="목차 PDF 페이지 범위 예: 5-18")
    ap.add_argument("--index-pages", type=_range, default=None, help="책뒤 색인 PDF 페이지 범위")
    ap.add_argument("--readings", type=str, default=None,
                    help="한자표제->한국어 약재명 TSV (기본: data/kb_seed_readings.tsv)")
    args = ap.parse_args(argv)
    res = build(args.volume, args.cache, args.out, toc_range=args.toc_pages,
                index_range=args.index_pages, readings_path=args.readings)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
