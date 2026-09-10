"""배오(藥對) 추출 — 원서 임상응용의 처방 구성에서 실제 동시 등장한 쌍만 센다.

'없는 배오를 창작하지 않는다' 를 지키는 방법:
  처방 구성행('縮泉丸 - 烏藥 益智仁 山藥')을 파싱해 동일 처방 내 동시등장 쌍만 만들고,
  각 쌍에 근거 처방명과 출처 약재 note 를 함께 기록한다.
"""
from __future__ import annotations

import re
from collections import defaultdict
from itertools import combinations

_LINE = re.compile(r"([㐀-䶿一-鿿]{2,8}(?:湯|散|丸|飮|飲|膏|丹|煎|酒|方))\s*[-–—:：]\s*([^\n《]{4,200})")
_HERB_TOKEN = re.compile(r"[㐀-䶿一-鿿]{1,4}")

# 처방 구성행에 자주 섞여 들어오는 비-약재 토큰
STOPWORDS = {"등", "各", "等", "加", "減", "本", "方", "同", "以", "上", "水", "煎", "服", "末", "丸", "散", "湯"}


def parse_compositions(text: str) -> list[tuple[str, list[str]]]:
    """(처방명, [구성약재 한자...]) 목록."""
    out: list[tuple[str, list[str]]] = []
    for m in _LINE.finditer(text or ""):
        formula = m.group(1)
        body = m.group(2)
        herbs = [t for t in _HERB_TOKEN.findall(body) if t not in STOPWORDS and len(t) >= 2]
        # 중복 제거, 순서 유지
        seen, uniq = set(), []
        for h in herbs:
            if h not in seen:
                seen.add(h)
                uniq.append(h)
        if len(uniq) >= 2:
            out.append((formula, uniq))
    return out


def pair_counts(compositions: list[tuple[str, list[str], str]], *, max_herbs: int = 14):
    """compositions: [(처방명, [한자약재...], 출처약재명)]
    반환: {(a,b): {"count":n, "formulas":[...], "sources":[...]}}  (a<b, 한자 기준)
    """
    agg: dict[tuple[str, str], dict] = defaultdict(lambda: {"count": 0, "formulas": [], "sources": []})
    for formula, herbs, src in compositions:
        if len(herbs) > max_herbs:
            continue
        for a, b in combinations(sorted(set(herbs)), 2):
            rec = agg[(a, b)]
            rec["count"] += 1
            if formula not in rec["formulas"]:
                rec["formulas"].append(formula)
            if src and src not in rec["sources"]:
                rec["sources"].append(src)
    return dict(agg)
