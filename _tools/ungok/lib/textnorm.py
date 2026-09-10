"""OCR 텍스트 정규화 및 오인식 후보 판정.

핵심 원칙 (CLAUDE.md "추측을 사실처럼 말하지 않는다"의 코드화):

1. 자동 교정은 **통제된 필드**(약재 제목·한자·생약명)에만 적용한다.
   본문(SOURCE 원문)은 절대 자동 교정하지 않는다 — 주석으로만 기록한다.
2. 교정은 "교정 결과가 canonical 사전에 존재하고, 편집거리가 1이며,
   교정 전 문자열이 사전에 없을 때"만 적용된다.
3. 그 외에는 값을 그대로 두고 ocr_uncertain=True 로 표시한다.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

# 실제 KB 샘플(운곡본초학 하권 추출본)에서 관찰된 한자 오인식 쌍.
# 값은 "관찰된 잘못된 글자 -> 올바른 글자 후보들"이며, 후보 생성용으로만 쓴다.
# 여기 있다는 이유만으로 교정하지 않는다 (규칙 2를 통과해야 한다).
CONFUSABLE_MAP: dict[str, tuple[str, ...]] = {
    "解": ("斛",),      # 石解 -> 石斛
    "民": ("芪",),      # 黃民 -> 黃芪
    "答": ("苓",),      # 获答 -> 茯苓
    "获": ("茯",),
    "葛": ("菖",),      # 葛蒲 -> 菖蒲
    "舊": ("菖",),
    "富": ("菖",),
    "臀": ("腎",),      # 臀 -> 腎
    "肾": ("腎",),      # 간체 -> 정체
    "銅": ("痢",),
    "瘍": ("瘧",),
    "瘡": ("瘧",),
    "溜": ("榴",),      # 石溜皮 -> 石榴皮
    "揺": ("榴",),
    "摇": ("榴",),
    "搭": ("椹",),      # 桑搭子 -> 桑椹子
    "格": ("椹",),
    "掷": ("榔",),      # 樓掷 -> 檳榔
    "德": ("瀉",),
    "湯": ("瀉",),      # 泄湯 -> 泄瀉 (문맥 의존 — 본문에는 적용 금지)
    "誠": ("鹹",),
    "喊": ("鹹",),
    "礙": ("澀",),
    "獨": ("濁",),
    "疲": ("痰",),      # 疲飮 -> 痰飮
    "鼓": ("竅",),
    "敷": ("竅",),
    "窟": ("竅",),
    "蜜": ("竅",),
    "驗": ("竅",),
}

# 본문에는 적용하지 않고 "문맥 의존"으로만 취급할 글자 (오탐 위험이 큼)
CONTEXT_ONLY = {"湯", "蜜", "格", "富"}

_HANJA_RE = re.compile(r"^[㐀-䶿一-鿿]+$")
_HANGUL_RE = re.compile(r"^[가-힣]+$")
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_WS_RE = re.compile(r"[ \t 　]+")


def strip_control(s: str) -> str:
    return _CTRL_RE.sub("", s)


def normalize_ws(s: str) -> str:
    """제목행에 흩어진 공백(石 決 明)을 접고 양끝을 정리한다."""
    s = unicodedata.normalize("NFC", strip_control(s))
    return _WS_RE.sub(" ", s).strip()


def collapse_spaced_hanja(s: str) -> str:
    """'石 決 明' 처럼 자간이 벌어진 한자 제목을 '石決明' 으로 접는다.

    한자 사이의 단일 공백만 제거한다. 한글/라틴이 섞이면 건드리지 않는다.
    """
    s = normalize_ws(s)
    if not s:
        return s
    parts = s.split(" ")
    if len(parts) < 2:
        return s
    if all(_HANJA_RE.match(p) for p in parts):
        return "".join(parts)
    return s


def is_hanja(s: str) -> bool:
    return bool(_HANJA_RE.match(s or ""))


def is_hangul(s: str) -> bool:
    return bool(_HANGUL_RE.match(s or ""))


def edit_distance(a: str, b: str) -> int:
    if a == b:
        return 0
    if abs(len(a) - len(b)) > 3:
        return max(len(a), len(b))
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def candidates(s: str, *, context_only_ok: bool = False) -> list[str]:
    """CONFUSABLE_MAP 기준으로 1글자 치환 후보들을 만든다 (사전 대조 전)."""
    out: list[str] = []
    for i, ch in enumerate(s):
        if ch in CONFUSABLE_MAP:
            if ch in CONTEXT_ONLY and not context_only_ok:
                continue
            for repl in CONFUSABLE_MAP[ch]:
                out.append(s[:i] + repl + s[i + 1:])
    return out


@dataclass
class Decision:
    """통제 필드 1개에 대한 교정 판정 결과."""

    value: str
    ocr_uncertain: bool
    rationale: str
    original: str = ""
    applied: bool = False
    alternatives: list[str] = field(default_factory=list)


def decide_controlled_field(
    raw: str,
    dictionary: set[str],
    *,
    evidence_count: int = 1,
    min_evidence: int = 2,
) -> Decision:
    """제목/한자/생약명 같은 통제 필드 1개를 판정한다.

    dictionary: 3원 대조(목차·본문·색인)로 만들어진 canonical 문자열 집합.
    evidence_count: 이 값이 몇 개의 독립 출처에서 확인됐는가.
    """
    original = raw or ""
    value = collapse_spaced_hanja(original)

    if not value:
        return Decision("", True, "빈 문자열", original, False, [])

    if value in dictionary:
        uncertain = evidence_count < min_evidence
        why = "사전 일치" + ("" if not uncertain else f"; 근거 출처 {evidence_count}개 < {min_evidence}")
        return Decision(value, uncertain, why, original, False, [])

    cands = [c for c in candidates(value) if c in dictionary and edit_distance(value, c) == 1]
    uniq = sorted(set(cands))
    if len(uniq) == 1 and evidence_count >= min_evidence:
        return Decision(uniq[0], False, f"OCR 1글자 교정: {value} -> {uniq[0]} (사전 확인, 근거 {evidence_count}개)", original, True, [])
    if uniq:
        return Decision(value, True, f"교정 후보 {len(uniq)}개, 확정 불가 (근거 {evidence_count}개)", original, False, uniq)
    return Decision(value, True, "사전 미등재·교정 후보 없음", original, False, [])


def annotate_body(text: str) -> list[dict]:
    """본문에서 오인식 의심 지점을 **찾기만** 한다. 절대 고치지 않는다."""
    hits: list[dict] = []
    for i, ch in enumerate(text):
        if ch in CONFUSABLE_MAP and ch not in CONTEXT_ONLY:
            hits.append({
                "offset": i,
                "char": ch,
                "suggests": list(CONFUSABLE_MAP[ch]),
                "context": text[max(0, i - 12): i + 13].replace("\n", " "),
            })
    return hits


def garbled_ratio(text: str) -> float:
    """추출 품질 지표: 대체문자/제어문자 비율."""
    if not text:
        return 1.0
    bad = sum(1 for ch in text if ch in "�□" or _CTRL_RE.match(ch))
    return bad / len(text)
