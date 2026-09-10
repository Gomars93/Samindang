#!/usr/bin/env python3
"""1단계: 운곡본초학 PDF -> 페이지 단위 텍스트 캐시.

- 원본 PDF는 **열기만** 한다. 저장/수정 경로가 없다 (실행 전후 SHA-256 대조).
- 전체 OCR 을 하지 않는다. 텍스트 레이어가 없거나 심하게 깨진 페이지만
  OCR_REVIEW 목록으로 남긴다.
- 결과: <cache>/<vol>_pages.jsonl, <vol>_meta.json, <vol>_ocr_review.json

사용:
  python3 ungok_extract.py --pdf "운곡 본초학 _상_.pdf" --volume 상 --cache ./_cache
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.pagemap import build_pagemap, detect_printed_page  # noqa: E402
from lib.textnorm import garbled_ratio  # noqa: E402

MIN_CHARS_PER_PAGE = 120        # 이보다 적으면 텍스트 레이어 결손 의심
MAX_GARBLED_RATIO = 0.02


def sha256(path: Path, *, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            b = fh.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def page_lines(page) -> list[dict]:
    """PyMuPDF page -> [{'text','size','y'}] (줄 단위, 대표 폰트 크기 포함)."""
    out: list[dict] = []
    try:
        d = page.get_text("dict")
    except Exception:
        return out
    for block in d.get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            text = "".join(s.get("text", "") for s in spans)
            if not text.strip():
                continue
            size = max((s.get("size", 0.0) for s in spans), default=0.0)
            y = line.get("bbox", [0, 0, 0, 0])[1]
            out.append({"text": text, "size": round(size, 2), "y": round(y, 1)})
    return out


def extract(pdf: Path, volume: str, cache: Path, *, first: int | None, last: int | None) -> dict:
    import fitz  # PyMuPDF

    cache.mkdir(parents=True, exist_ok=True)
    digest_before = sha256(pdf)

    doc = fitz.open(pdf)          # 읽기 전용 사용. doc.save() 를 호출하지 않는다.
    total = doc.page_count
    lo = max(1, first or 1)
    hi = min(total, last or total)

    jsonl = cache / f"{volume}_pages.jsonl"
    ocr_review: list[dict] = []
    pairs: list[tuple[int, int]] = []
    written = 0

    with jsonl.open("w", encoding="utf-8") as fh:
        for pno in range(lo, hi + 1):
            page = doc.load_page(pno - 1)
            text = page.get_text("text") or ""
            lines = page_lines(page)
            printed = detect_printed_page(text)
            if printed is not None:
                pairs.append((pno, printed))
            gr = garbled_ratio(text)
            rec = {
                "pdf_page": pno,
                "printed_page_detected": printed,
                "char_count": len(text.strip()),
                "garbled_ratio": round(gr, 4),
                "max_font_size": max((ln["size"] for ln in lines), default=0.0),
                "text": text,
                "lines": lines,
            }
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            written += 1
            if rec["char_count"] < MIN_CHARS_PER_PAGE or gr > MAX_GARBLED_RATIO:
                ocr_review.append({
                    "pdf_page": pno,
                    "char_count": rec["char_count"],
                    "garbled_ratio": rec["garbled_ratio"],
                    "reason": "텍스트 레이어 결손 의심" if rec["char_count"] < MIN_CHARS_PER_PAGE else "문자 깨짐 비율 높음",
                })
    doc.close()

    digest_after = sha256(pdf)
    if digest_before != digest_after:
        raise RuntimeError(f"원본 PDF가 변경됨! {pdf} — 즉시 중단")

    pm = build_pagemap(pairs)
    meta = {
        "volume": volume,
        "pdf_path": str(pdf),
        "pdf_sha256": digest_before,
        "pdf_unmodified": True,
        "page_count": total,
        "extracted_range": [lo, hi],
        "pages_written": written,
        "printed_page_pairs": len(pairs),
        "pagemap_runs": [
            {"pdf_start": r.pdf_start, "pdf_end": r.pdf_end, "offset": r.offset, "evidence": r.evidence}
            for r in pm.runs
        ],
        "pagemap_coverage": round(pm.coverage(total), 4),
        "unmapped_pdf_pages": pm.unmapped_pdf_pages(total),
        "ocr_review_count": len(ocr_review),
    }
    (cache / f"{volume}_meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    (cache / f"{volume}_ocr_review.json").write_text(
        json.dumps(ocr_review, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="운곡본초학 PDF 텍스트 캐시 생성 (원본 무변경)")
    ap.add_argument("--pdf", required=True, type=Path)
    ap.add_argument("--volume", required=True, choices=["상", "하"])
    ap.add_argument("--cache", default=Path("./_cache"), type=Path)
    ap.add_argument("--first", type=int, default=None)
    ap.add_argument("--last", type=int, default=None)
    args = ap.parse_args(argv)

    if not args.pdf.exists():
        print(f"[FAIL] PDF 를 찾을 수 없음: {args.pdf}", file=sys.stderr)
        return 2
    meta = extract(args.pdf, args.volume, args.cache, first=args.first, last=args.last)
    print(json.dumps({k: v for k, v in meta.items() if k != "unmapped_pdf_pages"},
                     ensure_ascii=False, indent=2))
    print(f"[OK] {meta['pages_written']} 페이지 캐시. "
          f"페이지매핑 커버리지 {meta['pagemap_coverage']:.1%}, "
          f"OCR_REVIEW {meta['ocr_review_count']} 페이지.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
