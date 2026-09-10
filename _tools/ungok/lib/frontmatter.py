"""Obsidian note frontmatter 파서/생성기.

- 파싱 실패를 조용히 넘기지 않는다. 실패는 예외가 아니라 진단 객체로 돌려준다.
- 출력 필드 순서는 고정한다 (diff 안정성 = 재실행해도 무의미한 변경이 안 생김).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import yaml

from .schema import BOOL_FIELDS, LIST_FIELDS, SCALAR_FIELDS

_FM_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", re.DOTALL)

# 스펙 예시(익지인)의 순서를 그대로 따른다.
FIELD_ORDER = (
    "herb", "hanja", "aliases", "latin_pharmacognosy",
    "category", "subcategory",
    "source_title", "source_volume", "source_chapter",
    "source_print_pages", "source_pdf_pages",
    "status", "review_status", "last_reviewed",
    "clinical_keywords", "pattern_keywords", "action_keywords",
    "linked_formulas", "linked_conditions",
    "safety_flags", "processing_keywords",
    "evidence_layer", "ocr_uncertain", "schema_version",
)


@dataclass
class ParsedNote:
    frontmatter: dict[str, Any]
    body: str
    ok: bool
    error: str = ""
    raw_frontmatter: str = ""


def parse(text: str) -> ParsedNote:
    m = _FM_RE.match(text or "")
    if not m:
        return ParsedNote({}, text or "", False, "frontmatter 블록 없음")
    raw = m.group(1)
    body = (text or "")[m.end():]
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:  # 깨진 YAML은 QA 대상이지 예외가 아니다
        return ParsedNote({}, body, False, f"YAML 파싱 오류: {exc}", raw)
    if data is None:
        return ParsedNote({}, body, False, "frontmatter 가 비어 있음", raw)
    if not isinstance(data, dict):
        return ParsedNote({}, body, False, f"frontmatter 최상위가 매핑이 아님 ({type(data).__name__})", raw)
    return ParsedNote(data, body, True, "", raw)


def _scalar(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if v is None:
        return '""'
    s = str(v)
    if s == "":
        return '""'
    if re.search(r'[:#\[\]{}",&*?|<>=!%@`]|^\s|\s$|^-', s):
        return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'
    return s


def dump(fm: dict[str, Any]) -> str:
    """고정 순서 YAML frontmatter 문자열(--- 포함) 생성."""
    lines = ["---"]
    seen = set()
    for key in FIELD_ORDER:
        if key not in fm:
            continue
        seen.add(key)
        val = fm[key]
        if key in LIST_FIELDS or isinstance(val, list):
            items = list(val or [])
            if not items:
                lines.append(f"{key}: []")
            else:
                lines.append(f"{key}:")
                lines.extend(f"  - {_scalar(i)}" for i in items)
        elif key in BOOL_FIELDS or isinstance(val, bool):
            lines.append(f"{key}: {'true' if val else 'false'}")
        else:
            lines.append(f"{key}: {_scalar(val)}")
    # FIELD_ORDER 에 없는 키도 잃지 않는다 (조용한 데이터 손실 금지).
    for key in sorted(k for k in fm if k not in seen):
        lines.append(f"{key}: {_scalar(fm[key])}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def sections(body: str) -> dict[str, str]:
    """'## 3. 배오' 같은 헤딩 단위로 본문을 쪼갠다. 키는 헤딩 텍스트 원문."""
    out: dict[str, str] = {}
    cur = "__preamble__"
    buf: list[str] = []
    for line in (body or "").splitlines():
        if re.match(r"^#{1,3}\s+\S", line):
            out[cur] = "\n".join(buf).strip()
            cur = line.lstrip("#").strip()
            buf = []
        else:
            buf.append(line)
    out[cur] = "\n".join(buf).strip()
    return out


WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")


def wikilinks(text: str) -> list[str]:
    return [m.group(1).strip() for m in WIKILINK_RE.finditer(text or "")]
