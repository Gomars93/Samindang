"""통제어휘 기반 검색 메타데이터 추출.

원칙:
- 어휘집(data/vocab.tsv)에 등재된 표현이 **원문에 실제로 등장할 때만** 키워드를 단다.
- canonical 은 한국어 하나로 통일한다 (氣虛/기허 -> '기허'). 표기 난립 금지.
- 어휘집에 없는 표현을 근거로 키워드를 만들어내지 않는다.
"""
from __future__ import annotations

import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "vocab.tsv"

KIND_TO_FIELD = {
    "action": "action_keywords",
    "pattern": "pattern_keywords",
    "clinical": "clinical_keywords",
    "processing": "processing_keywords",
}


@lru_cache(maxsize=1)
def load_vocab(path: str | None = None) -> dict[str, list[tuple[str, str]]]:
    """kind -> [(canonical, surface), ...]  (surface 긴 것 먼저)"""
    p = Path(path) if path else DATA
    by_kind: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        canonical, kind, surfaces = parts[0].strip(), parts[1].strip(), parts[2]
        for s in surfaces.split("|"):
            s = s.strip()
            if s:
                by_kind[kind].append((canonical, s))
    for kind in by_kind:
        by_kind[kind].sort(key=lambda cs: -len(cs[1]))
    return dict(by_kind)


def extract(text: str, kind: str, *, vocab_path: str | None = None) -> list[str]:
    """text 안에서 실제로 발견된 canonical 키워드를 등장순으로 중복 없이 반환."""
    if not text:
        return []
    entries = load_vocab(vocab_path).get(kind, [])
    found: list[tuple[int, str]] = []
    seen: set[str] = set()
    for canonical, surface in entries:
        idx = text.find(surface)
        if idx >= 0 and canonical not in seen:
            seen.add(canonical)
            found.append((idx, canonical))
    found.sort()
    return [c for _, c in found]


def extract_all(text: str, *, vocab_path: str | None = None) -> dict[str, list[str]]:
    return {field: extract(text, kind, vocab_path=vocab_path) for kind, field in KIND_TO_FIELD.items()}


# --- 처방명 추출 --------------------------------------------------------
# 원서 임상응용은 '처방명 - 약재 약재 ...' 형태다. 처방명은 湯/散/丸/飮/膏/丹/煎 으로 끝난다.
_FORMULA_RE = re.compile(r"([㐀-䶿一-鿿]{2,8}(?:湯|散|丸|飮|飲|膏|丹|煎|酒|方))")
_FORMULA_KO_RE = re.compile(r"([가-힣]{2,10}(?:탕|산|환|음|고|단|전))\b")


def extract_formulas(text: str) -> list[str]:
    """원문에 실제로 적힌 처방명만 뽑는다. 없는 처방을 만들지 않는다."""
    out: list[str] = []
    seen: set[str] = set()
    for m in _FORMULA_RE.finditer(text or ""):
        name = m.group(1)
        if name not in seen:
            seen.add(name)
            out.append(name)
    return out


# --- 안전성 플래그 ------------------------------------------------------
# 금기/주의 원문에서 확인된 표현만 플래그로 승격한다.
SAFETY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("임신금기",      ("孕婦", "임부", "妊娠", "임신")),
    ("유독",          ("有毒", "小毒", "大毒", "有小毒", "有大毒")),
    ("음허화왕주의",  ("陰虛火旺", "陰虛陽亢", "虛火")),
    ("비위허한주의",  ("脾胃虛寒", "脾虛便溏", "脾胃虛")),
    ("실증금기",      ("實證", "實熱")),
    ("포제필수",      ("必須炮製", "生用則", "生用有毒", "法製", "修治")),
    ("장기복용주의",  ("久服", "長期服用", "대량 사용은 피", "大量")),
    ("출혈주의",      ("出血", "血證", "崩漏")),
    ("중금속",        ("水銀", "汞", "砒", "砷", "鉛", "硫化水銀")),
]

# 원서 근거와 무관하게 별도 Safety Gate 가 필요한 본초 (현대 안전성 이슈).
# 이 목록은 '현대 안전성' 레이어이며 SOURCE 로 표기하지 않는다.
MODERN_SAFETY_GATE: dict[str, tuple[str, ...]] = {
    "보골지":   ("HILI",),
    "하수오":   ("HILI",),
    "백선피":   ("HILI",),
    "마두령":   ("신독성", "발암성", "AA함유"),
    "관목통":   ("신독성", "AA함유"),
    "청목향":   ("신독성", "AA함유"),
    "세신":     ("AA관련주의",),
    "주사":     ("중금속", "수은"),
    "경분":     ("중금속", "수은"),
    "비석":     ("중금속", "비소"),
    "웅황":     ("중금속", "비소"),
    "반묘":     ("고독성",),
    "반모":     ("고독성",),
    "부자":     ("심독성", "포제필수"),
    "초오":     ("심독성", "포제필수"),
    "천오":     ("심독성", "포제필수"),
    "백부자":   ("포제필수",),
    "생반하":   ("포제필수",),
    "반하":     ("포제필수",),
    "감수":     ("축수·준하",),
    "대극":     ("축수·준하",),
    "원화":     ("축수·준하",),
    "견우자":   ("축수·준하",),
    "파두":     ("축수·준하", "고독성"),
    "상산":     ("최토",),
    "과체":     ("최토",),
    "담반":     ("최토", "중금속"),
}


def safety_flags_from_source(contraindication_text: str) -> list[str]:
    out: list[str] = []
    for flag, surfaces in SAFETY_PATTERNS:
        if any(s in (contraindication_text or "") for s in surfaces):
            out.append(flag)
    return out


def modern_safety_flags(herb: str) -> list[str]:
    return list(MODERN_SAFETY_GATE.get(herb, ()))


FORMULA_READINGS = Path(__file__).resolve().parent.parent / "data" / "formula_readings.tsv"


@lru_cache(maxsize=1)
def load_formula_readings(path: str | None = None) -> dict[str, str]:
    p = Path(path) if path else FORMULA_READINGS
    out: dict[str, str] = {}
    if not p.exists():
        return out
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2 and parts[0].strip() and parts[1].strip():
            out[parts[0].strip()] = parts[1].strip()
    return out


def normalize_formulas(names: list[str], *, path: str | None = None) -> tuple[list[str], list[str]]:
    """(한국어로 정규화된 처방명, 독음 미확인으로 한자 그대로 둔 것) 반환.

    독음 사전에 없으면 **추정하지 않고** 한자 그대로 두고 review 목록에 넣는다.
    """
    table = load_formula_readings(path)
    normalized: list[str] = []
    unresolved: list[str] = []
    for n in names:
        if n in table:
            normalized.append(table[n])
        else:
            normalized.append(n)
            unresolved.append(n)
    return normalized, unresolved
