"""본초 항목 경계 검출 (heading detection + herb boundary detection).

운곡본초학 판면 구조:
  <큰 글씨 한자 표제>  예) 石決明
  이명 / 출전 / 생약명 / 약성가
  기원 / 식물형태 / 성상 / 산지 / 성분 / 약리작용
  약성(性味·歸經) / 效能主治 / 임상응용 / 사용량 / 해설 / 수치 / 금기 / 참고

검출 규칙 (추측 금지):
  후보 = 그 페이지에서 폰트가 가장 큰 축에 속하고, 한자 1~6자(자간 공백 허용)이며,
         같은 페이지 안에 마커 키워드가 MIN_MARKERS 개 이상 있는 줄.
  확정 = 후보가 목차/색인 중 최소 1곳에서 재확인되거나, 마커가 MIN_MARKERS_STRONG 개 이상.
  그 외 = 후보로만 남기고 review 대상.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .textnorm import collapse_spaced_hanja, is_hanja

MARKERS = ("출전", "생약명", "약성가", "기원", "성상", "산지", "성분",
           "약리", "성미", "귀경", "效能", "효능", "임상응용", "사용량",
           "수치", "금기", "참고", "해설", "이명")
MIN_MARKERS = 3
HEADING_SIZE_RATIO = 1.15
MIN_MARKERS_STRONG = 5
_TITLE_RE = re.compile(r"^[㐀-䶿一-鿿](?:[ 　]?[㐀-䶿一-鿿]){0,5}$")


@dataclass
class HeadingCandidate:
    pdf_page: int
    text: str
    font_size: float
    marker_count: int
    strong: bool
    line_index: int = 0

    @property
    def normalized(self) -> str:
        return collapse_spaced_hanja(self.text)


@dataclass
class HerbSpan:
    hanja: str
    pdf_start: int
    pdf_end: int
    evidence: list[str] = field(default_factory=list)
    confident: bool = False


def page_heading_candidates(
    pdf_page: int,
    lines: list[dict],
    *,
    page_text: str | None = None,
) -> list[HeadingCandidate]:
    """lines: [{'text':str,'size':float}, ...] (PyMuPDF span 에서 만든 줄 목록)"""
    if not lines:
        return []
    sizes = [ln.get("size", 0.0) for ln in lines if (ln.get("text") or "").strip()]
    if not sizes:
        return []
    max_size = max(sizes)
    # 판면 전체 글자 크기가 균일하면 '큰 표제'가 없는 판면이다.
    # 이때 한자 짧은 줄을 표제로 오인하지 않는다.
    ordered = sorted(sizes)
    median = ordered[len(ordered) // 2]
    if median <= 0 or max_size < median * HEADING_SIZE_RATIO:
        return []
    text = page_text if page_text is not None else "\n".join(ln.get("text", "") for ln in lines)
    marker_count = sum(1 for m in MARKERS if m in text)

    out: list[HeadingCandidate] = []
    for i, ln in enumerate(lines):
        t = (ln.get("text") or "").strip()
        if not t:
            continue
        size = ln.get("size", 0.0)
        if size < max_size * 0.92:
            continue
        if not _TITLE_RE.match(t):
            continue
        norm = collapse_spaced_hanja(t)
        if not is_hanja(norm) or not (1 <= len(norm) <= 6):
            continue
        if marker_count < MIN_MARKERS:
            continue
        out.append(HeadingCandidate(pdf_page, t, size, marker_count,
                                    marker_count >= MIN_MARKERS_STRONG, i))
    return out


def build_spans(
    candidates: list[HeadingCandidate],
    *,
    last_pdf_page: int,
    confirm_set: set[str] | None = None,
) -> list[HerbSpan]:
    """페이지 순 후보 목록 -> 약재별 페이지 구간.

    구간 끝 = 다음 확정 표제 페이지 - 1. 마지막 항목은 last_pdf_page 까지.
    같은 페이지에 표제가 2개면 둘 다 그 페이지를 공유한다 (겹침 허용, 추측 금지).
    """
    confirm_set = confirm_set or set()
    ordered = sorted(candidates, key=lambda c: (c.pdf_page, c.line_index))
    spans: list[HerbSpan] = []
    for idx, c in enumerate(ordered):
        norm = c.normalized
        evidence = ["body"]
        if norm in confirm_set:
            evidence.append("index")
        if c.strong:
            evidence.append("markers")
        nxt = ordered[idx + 1] if idx + 1 < len(ordered) else None
        if nxt is None:
            end = last_pdf_page
        elif nxt.pdf_page == c.pdf_page:
            end = c.pdf_page
        else:
            end = nxt.pdf_page - 1
        spans.append(HerbSpan(
            hanja=norm,
            pdf_start=c.pdf_page,
            pdf_end=max(end, c.pdf_page),
            evidence=evidence,
            confident=(norm in confirm_set) or c.strong,
        ))
    return spans


_TOC_LINE = re.compile(r"^\s*(?P<name>[^\.…\s][^\.…]*?)\s*[\.…]{2,}\s*(?P<page>\d{1,4})\s*$")


def parse_toc_lines(text: str) -> list[tuple[str, int]]:
    """목차 줄('石決明 ……… 1157')에서 (표제, 인쇄면) 을 뽑는다."""
    out: list[tuple[str, int]] = []
    for line in (text or "").splitlines():
        m = _TOC_LINE.match(line.strip())
        if not m:
            continue
        name = collapse_spaced_hanja(m.group("name"))
        try:
            page = int(m.group("page"))
        except ValueError:
            continue
        if name and 1 <= page <= 3000:
            out.append((name, page))
    return out


_INDEX_LINE = re.compile(r"^\s*(?P<name>\S[^\d]*?)\s+(?P<pages>\d{1,4}(?:\s*[,·]\s*\d{1,4})*)\s*$")


def parse_back_index(text: str) -> list[tuple[str, list[int]]]:
    """책 뒤 한약명/생약명 색인에서 (표제, [인쇄면...]) 를 뽑는다."""
    out: list[tuple[str, list[int]]] = []
    for line in (text or "").splitlines():
        m = _INDEX_LINE.match(line.strip())
        if not m:
            continue
        name = collapse_spaced_hanja(m.group("name"))
        pages = [int(p) for p in re.findall(r"\d{1,4}", m.group("pages"))]
        pages = [p for p in pages if 1 <= p <= 3000]
        if name and pages:
            out.append((name, pages))
    return out
