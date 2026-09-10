"""약재 구간 텍스트 -> 원서 항목별 필드 분해.

운곡본초학의 항목 라벨을 순서대로 찾아 구간을 자른다.
라벨을 못 찾으면 **만들어내지 않고** 빈 값으로 둔다.
"""
from __future__ import annotations

import re

# (canonical 필드명, 판면에 나타나는 라벨 후보들)
LABELS: list[tuple[str, tuple[str, ...]]] = [
    ("출전",     ("출전", "출 전", "줄전", "줄 전")),
    ("이명",     ("이명", "異名")),
    ("생약명",   ("생약명", "생 약 명")),
    ("약성가",   ("약성가", "약 성 가", "약성 가")),
    ("기원",     ("기원", "기 원")),
    ("식물형태", ("식물 형태", "식물형태", "동물 형태")),
    ("성상",     ("성상", "성 상")),
    ("산지",     ("산지", "산 지")),
    ("성분",     ("성분", "성 분")),
    ("약리작용", ("약리 작용", "약리작용", "학리 작용", "향리 작용")),
    ("성미",     ("性 味", "性味", "성미")),
    ("귀경",     ("歸 經", "歸經", "귀경")),
    ("효능주치", ("效能 主 治", "效能主治", "效能 主治", "효능주치", "효능 주치")),
    ("임상응용", ("임상응용", "임상 응용", "주치 해설")),
    ("사용량",   ("사용량", "사용 량")),
    ("해설",     ("해설", "해 설", "M설", "m ¥")),
    ("수치",     ("수치", "수 치", "포제")),
    ("금기",     ("금기", "금 기", "^지", "禁忌")),
    ("참고",     ("참고", "참 고")),
    ("비교본초", ("비교", "비교 본초")),
]

_USAGE_RE = re.compile(r"(?:사용량|사용 량)\s*[:：]?\s*([^\n]{0,80})")
_DOSE_RE = re.compile(r"(\d+(?:\.\d+)?\s*[~〜–-]\s*\d+(?:\.\d+)?\s*g)")


_PAGENUM_LINE = re.compile(r"^[\[\(\-—·\s]*\d{1,4}[\]\)\-—·\s]*$")


def strip_page_numbers(text: str) -> str:
    """판면 머리/꼬리의 단독 페이지 번호 줄을 제거한다 (본문 오염 방지)."""
    return "\n".join(ln for ln in (text or "").splitlines()
                     if not _PAGENUM_LINE.match(ln.strip()))


def split_fields(text: str) -> dict[str, str]:
    """구간 텍스트를 라벨별로 분해. 못 찾은 라벨은 키가 없다.

    각 필드는 자기 라벨 끝에서 **다음 라벨이 시작하는 지점** 직전까지다.
    (다음 라벨의 첫 글자가 앞 필드로 새지 않도록 라벨 시작/끝을 모두 기록한다.)
    """
    text = strip_page_numbers(text)
    hits: list[tuple[int, int, str]] = []
    for field, surfaces in LABELS:
        best = None
        for s in surfaces:
            i = text.find(s)
            if i >= 0 and (best is None or i < best[0]):
                best = (i, i + len(s))
        if best is not None:
            hits.append((best[0], best[1], field))
    hits.sort()
    out: dict[str, str] = {}
    for n, (label_start, label_end, field) in enumerate(hits):
        end = hits[n + 1][0] if n + 1 < len(hits) else len(text)
        chunk = text[label_end:max(label_end, end)].strip(" \t:：\n")
        if chunk and field not in out:
            out[field] = chunk
    return out


def dosage(text: str) -> str:
    m = _USAGE_RE.search(text or "")
    if m:
        d = _DOSE_RE.search(m.group(1))
        if d:
            return d.group(1).replace(" ", "")
        return m.group(1).strip()
    d = _DOSE_RE.search(text or "")
    return d.group(1).replace(" ", "") if d else ""


def cap(text: str, limit: int) -> tuple[str, bool]:
    """장문을 자른다. (잘린 텍스트, 잘렸는지) — 원문 통째 복사 방지."""
    t = re.sub(r"\n{3,}", "\n\n", (text or "").strip())
    if len(t) <= limit:
        return t, False
    cut = t[:limit]
    nl = cut.rfind("\n")
    if nl > limit * 0.6:
        cut = cut[:nl]
    return cut.rstrip() + " …", True
