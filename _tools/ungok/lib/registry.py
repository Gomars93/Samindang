"""캐시(JSONL) 로딩 + 한자표제 -> 한국어 약재명 사전."""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


@dataclass
class Reading:
    herb_ko: str
    source: str          # 'kb_seed' | 'curated'
    trustworthy: bool    # kb 에서 ocr_uncertain 이었으면 False


@lru_cache(maxsize=4)
def load_readings(path: str | None = None) -> dict[str, Reading]:
    p = Path(path) if path else DATA / "kb_seed_readings.tsv"
    out: dict[str, Reading] = {}
    if not p.exists():
        return out
    for raw in p.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip("\n")
        if not line.strip() or line.startswith("#") or line.startswith("hanja\t"):
            continue
        cols = line.split("\t")
        if len(cols) < 2:
            continue
        hanja, ko = cols[0].strip(), cols[1].strip()
        ocr_uncertain = (cols[3].strip().lower() == "true") if len(cols) > 3 else True
        if hanja and ko:
            out[hanja] = Reading(ko, "kb_seed", not ocr_uncertain)
    return out


def load_pages(cache: Path, volume: str) -> list[dict]:
    p = cache / f"{volume}_pages.jsonl"
    if not p.exists():
        raise FileNotFoundError(f"캐시 없음: {p} — 먼저 ungok_extract.py 를 실행하라")
    return [json.loads(ln) for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]


def load_meta(cache: Path, volume: str) -> dict:
    p = cache / f"{volume}_meta.json"
    if not p.exists():
        raise FileNotFoundError(f"메타 없음: {p}")
    return json.loads(p.read_text(encoding="utf-8"))
