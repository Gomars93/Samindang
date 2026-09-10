"""인쇄면(printed page) ↔ PDF 페이지 매핑.

원칙: **페이지 번호를 추측하지 않는다.**
- 실제로 판면에서 검출된 (pdf_page, printed_page) 쌍만 근거로 쓴다.
- 오프셋이 일정한 구간(run)을 만들고, 근거 쌍이 MIN_RUN_EVIDENCE 미만인
  구간은 매핑을 제공하지 않는다 (None 반환).
- 검출값끼리 모순되면 그 구간 전체를 UNMAPPED 로 남긴다.
"""
from __future__ import annotations

import re
from bisect import bisect_right
from dataclasses import dataclass

MIN_RUN_EVIDENCE = 3

# 판면 머리/꼬리에 단독으로 놓인 숫자만 인쇄면 후보로 본다.
_STANDALONE_NUM = re.compile(r"^[\[\(\-—·\s]*(\d{1,4})[\]\)\-—·\s]*$")


def detect_printed_page(page_text: str, *, scan_lines: int = 3) -> int | None:
    """판면 텍스트에서 인쇄면 번호를 검출한다. 없으면 None."""
    if not page_text:
        return None
    lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
    if not lines:
        return None
    probes = lines[:scan_lines] + lines[-scan_lines:]
    found: list[int] = []
    for ln in probes:
        m = _STANDALONE_NUM.match(ln)
        if m:
            n = int(m.group(1))
            if 1 <= n <= 3000:
                found.append(n)
    if not found:
        return None
    # 서로 다른 숫자가 여러 개면 확정하지 않는다.
    uniq = set(found)
    return found[0] if len(uniq) == 1 else None


@dataclass(frozen=True)
class Run:
    """오프셋이 일정한 연속 구간. printed = pdf - offset."""

    pdf_start: int
    pdf_end: int          # inclusive
    offset: int
    evidence: int

    def contains_pdf(self, pdf_page: int) -> bool:
        return self.pdf_start <= pdf_page <= self.pdf_end

    def printed_range(self) -> tuple[int, int]:
        return (self.pdf_start - self.offset, self.pdf_end - self.offset)


class PageMap:
    """검출 쌍으로부터 만들어진, 근거 있는 구간만 담는 매핑."""

    def __init__(self, runs: list[Run]):
        self.runs = sorted(runs, key=lambda r: r.pdf_start)
        self._starts = [r.pdf_start for r in self.runs]

    # -- 조회 ---------------------------------------------------------
    def pdf_to_printed(self, pdf_page: int) -> int | None:
        run = self._run_for_pdf(pdf_page)
        return None if run is None else pdf_page - run.offset

    def printed_to_pdf(self, printed_page: int) -> int | None:
        hits = []
        for r in self.runs:
            lo, hi = r.printed_range()
            if lo <= printed_page <= hi:
                hits.append(printed_page + r.offset)
        # 여러 구간이 같은 인쇄면을 주장하면 확정하지 않는다.
        return hits[0] if len(set(hits)) == 1 else None

    def coverage(self, total_pdf_pages: int) -> float:
        covered = sum(r.pdf_end - r.pdf_start + 1 for r in self.runs)
        return covered / total_pdf_pages if total_pdf_pages else 0.0

    def unmapped_pdf_pages(self, total_pdf_pages: int) -> list[int]:
        return [p for p in range(1, total_pdf_pages + 1) if self._run_for_pdf(p) is None]

    def _run_for_pdf(self, pdf_page: int) -> Run | None:
        i = bisect_right(self._starts, pdf_page) - 1
        if i < 0:
            return None
        run = self.runs[i]
        return run if run.contains_pdf(pdf_page) else None


def build_pagemap(pairs: list[tuple[int, int]], *, min_evidence: int = MIN_RUN_EVIDENCE) -> PageMap:
    """(pdf_page, printed_page) 검출 쌍 목록에서 PageMap 을 만든다.

    같은 오프셋이 연속으로 나타나는 구간을 run 으로 묶고,
    근거가 min_evidence 미만인 run 은 버린다(= 매핑 제공 안 함).
    """
    pairs = sorted(set(pairs))
    if not pairs:
        return PageMap([])

    runs: list[Run] = []
    cur_offset = pairs[0][0] - pairs[0][1]
    cur_first_pdf = pairs[0][0]
    cur_last_pdf = pairs[0][0]
    cur_n = 1

    for pdf_p, printed_p in pairs[1:]:
        off = pdf_p - printed_p
        if off == cur_offset:
            cur_last_pdf = pdf_p
            cur_n += 1
        else:
            if cur_n >= min_evidence:
                runs.append(Run(cur_first_pdf, cur_last_pdf, cur_offset, cur_n))
            cur_offset, cur_first_pdf, cur_last_pdf, cur_n = off, pdf_p, pdf_p, 1
    if cur_n >= min_evidence:
        runs.append(Run(cur_first_pdf, cur_last_pdf, cur_offset, cur_n))

    # 구간 사이의 빈 PDF 페이지는 같은 오프셋이 이어지는 동안만 확장한다.
    merged: list[Run] = []
    for r in runs:
        if merged and merged[-1].offset == r.offset:
            prev = merged[-1]
            merged[-1] = Run(prev.pdf_start, r.pdf_end, r.offset, prev.evidence + r.evidence)
        else:
            merged.append(r)
    return PageMap(merged)
