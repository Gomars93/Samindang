#!/usr/bin/env python3
"""4단계: vault note 메타데이터 -> 효능·병기 / 배오 / 안전성 색인 생성.

색인은 note frontmatter 에서만 만든다. 색인이 note 보다 더 많이 주장하지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import frontmatter as fmlib  # noqa: E402
from lib import keywords as kw  # noqa: E402
from lib.combos import pair_counts, parse_compositions  # noqa: E402
from lib.registry import load_pages, load_readings  # noqa: E402

ACTION_AXES = ["해표", "청열", "사하", "거풍습", "방향화습", "이수삼습", "온리", "이기",
               "소식", "구충", "지혈", "활혈거어", "화담", "지해평천", "안신", "평간식풍",
               "개규", "보기", "보혈", "보양", "보음", "수렴고삽"]
PATTERN_AXES = ["기허", "혈허", "음허", "양허", "간기울", "어혈", "담습", "식적"]
CLINICAL_AXES = ["불면", "빈뇨", "야뇨", "변비", "설사", "자한", "도한", "출혈", "기침",
                 "요통", "월경부조", "산후복통"]

SAFETY_INDEX_FILES = {
    "독성본초_INDEX.md":        ("유독", "고독성", "중금속"),
    "HILI_INDEX.md":            ("MODERN:HILI",),
    "신독성_INDEX.md":          ("MODERN:신독성", "MODERN:AA함유", "MODERN:AA관련주의"),
    "임신주의_INDEX.md":        ("임신금기",),
    "수유주의_INDEX.md":        (),          # 원서에 층이 없다 — 현대 근거 필요
    "항응고-출혈주의_INDEX.md": ("출혈주의",),
    "포제필수_INDEX.md":        ("포제필수", "MODERN:포제필수"),
    "장기고용량주의_INDEX.md":  ("장기복용주의",),
}


def load_vault(vault: Path) -> list[tuple[Path, dict, str]]:
    out = []
    for p in sorted(vault.glob("*.md")):
        if p.name.startswith("_"):
            continue
        parsed = fmlib.parse(p.read_text(encoding="utf-8"))
        if parsed.ok:
            out.append((p, parsed.frontmatter, parsed.body))
    return out


def _hdr(title: str, kind: str, extra: dict | None = None) -> str:
    L = ["---", f'title: "{title}"', f"type: {kind}",
         f"last_reviewed: {dt.date.today().isoformat()}"]
    for k, v in (extra or {}).items():
        L.append(f"{k}: {v}")
    L.append("---")
    return "\n".join(L)


def build_efficacy(vault_notes, out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    axes = [("action_keywords", ACTION_AXES, "효능"),
            ("pattern_keywords", PATTERN_AXES, "병기"),
            ("clinical_keywords", CLINICAL_AXES, "임상")]
    for field, names, label in axes:
        for axis in names:
            hits = []
            for path, fm, _ in vault_notes:
                if axis in (fm.get(field) or []):
                    hits.append((fm.get("herb") or path.stem, fm))
            fname = f"{axis}_INDEX.md"
            L = [_hdr(f"{axis} {label} 색인", "efficacy-index",
                      {"axis": axis, "axis_kind": label, "herb_count": len(hits)}), ""]
            L.append(f"# {axis} — {label} 색인")
            L.append("")
            L.append(f"> 이 색인은 개별 note 의 `{field}` 에서 자동 생성된다. "
                     "note 에 없는 주장을 색인이 추가하지 않는다.")
            L.append("")
            if not hits:
                L.append("해당 note 없음. (원서 ingestion 미완 또는 키워드 미검출)")
            else:
                L.append("| 약재 | 성분류 | 함께 붙은 병기 | 함께 붙은 증상 | 주의 |")
                L.append("|---|---|---|---|---|")
                for herb, fm in sorted(hits):
                    L.append("| [[{h}]] | {c} | {p} | {cl} | {s} |".format(
                        h=herb, c=fm.get("category", "") or "-",
                        p=", ".join(fm.get("pattern_keywords") or []) or "-",
                        cl=", ".join((fm.get("clinical_keywords") or [])[:6]) or "-",
                        s=", ".join(fm.get("safety_flags") or []) or "-"))
            (out / fname).write_text("\n".join(L) + "\n", encoding="utf-8")
            written.append(fname)
    return written


def build_combos(vault_notes, index_csv: Path, cache: Path, out: Path, *, min_count: int,
                 readings_path: str | None = None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    readings = load_readings(readings_path)
    rows = list(csv.DictReader(index_csv.open(encoding="utf-8"))) if index_csv.exists() else []
    comps: list[tuple[str, list[str], str]] = []
    pages_cache: dict[str, list[dict]] = {}
    for r in rows:
        vol = r.get("volume")
        if not vol:
            continue
        if vol not in pages_cache:
            try:
                pages_cache[vol] = load_pages(cache, vol)
            except FileNotFoundError:
                pages_cache[vol] = []
        by = {p["pdf_page"]: p for p in pages_cache[vol]}
        try:
            lo, hi = int(r["pdf_start_page"]), int(r["pdf_end_page"])
        except (ValueError, KeyError):
            continue
        text = "\n".join((by.get(p, {}).get("text") or "") for p in range(lo, hi + 1))
        for formula, herbs in parse_compositions(text):
            comps.append((formula, herbs, r.get("herb") or r.get("hanja") or ""))

    pairs = pair_counts(comps)
    kept = {k: v for k, v in pairs.items() if v["count"] >= min_count}

    L = [_hdr("핵심 배오 색인", "combo-index",
              {"pair_count": len(kept), "min_cooccurrence": min_count}), ""]
    L.append("# 핵심 배오 색인")
    L.append("")
    L.append(f"> 원서 임상응용의 처방 구성행에서 **실제로 동시 등장**한 쌍만 싣는다 "
             f"(동시등장 {min_count}회 이상). 근거 처방명을 함께 적는다. 없는 배오를 만들지 않는다.")
    L.append("")
    L.append("| 배오 | 동시등장 | 근거 처방 | 출처 약재 note |")
    L.append("|---|---|---|---|")
    for (a, b), rec in sorted(kept.items(), key=lambda kv: -kv[1]["count"]):
        ra = readings.get(a)
        rb = readings.get(b)
        na = f"[[{ra.herb_ko}]]" if ra else a
        nb = f"[[{rb.herb_ko}]]" if rb else b
        L.append(f"| {na} + {nb} | {rec['count']} | {', '.join(rec['formulas'][:6])} | "
                 f"{', '.join(rec['sources'][:6])} |")
    (out / "핵심배오_INDEX.md").write_text("\n".join(L) + "\n", encoding="utf-8")
    return {"pairs_total": len(pairs), "pairs_kept": len(kept), "compositions": len(comps)}


def build_safety(vault_notes, out: Path) -> list[str]:
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for fname, flags in SAFETY_INDEX_FILES.items():
        axis = fname.replace("_INDEX.md", "")
        hits = []
        for path, fm, _ in vault_notes:
            sf = fm.get("safety_flags") or []
            if flags and any(f in sf for f in flags):
                hits.append((fm.get("herb") or path.stem, fm, [f for f in sf if f in flags]))
        L = [_hdr(f"{axis} 안전성 색인", "safety-index",
                  {"axis": axis, "herb_count": len(hits)}), ""]
        L.append(f"# {axis} 안전성 색인")
        L.append("")
        L.append("> **SOURCE(원서 금기) 와 MODERN SAFETY 는 다른 층이다.** "
                 "`MODERN:` 접두 플래그만 현대 안전성 근거 층이며, 그 외는 원서 기술이다. "
                 "여기에 없다는 것이 '안전하다'는 뜻이 아니다 — 미검토일 수 있다.")
        L.append("")
        if not flags:
            L.append("이 축은 원서에 대응 층이 없다. 현대 근거 문서에서 채워야 한다 — 현재 **미검토**.")
        elif not hits:
            L.append("해당 note 없음. (ingestion 미완 또는 플래그 미검출)")
        else:
            L.append("| 약재 | 해당 플래그 | 원서 위치 | 전체 안전 플래그 |")
            L.append("|---|---|---|---|")
            for herb, fm, matched in sorted(hits):
                pp = fm.get("source_print_pages") or []
                loc = f"{fm.get('source_volume','')}권 p.{pp[0]}–{pp[-1]}" if pp else "미확인"
                L.append(f"| [[{herb}]] | {', '.join(matched)} | {loc} | {', '.join(fm.get('safety_flags') or [])} |")
        L.append("")
        L.append("## 별도 Safety Gate 필요 본초 (현대 안전성 층)")
        L.append("")
        for herb, gate in sorted(kw.MODERN_SAFETY_GATE.items()):
            if not flags or any(f"MODERN:{g}" in flags or g in axis for g in gate):
                L.append(f"- {herb}: {', '.join(gate)}")
        (out / fname).write_text("\n".join(L) + "\n", encoding="utf-8")
        written.append(fname)
    return written


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="효능·배오·안전성 색인 생성")
    ap.add_argument("--vault", required=True, type=Path)
    ap.add_argument("--kb-root", required=True, type=Path, help="07_본초_Library 루트")
    ap.add_argument("--index", type=Path, default=None, help="MASTER_INDEX csv (배오 추출용)")
    ap.add_argument("--cache", default=Path("./_cache"), type=Path)
    ap.add_argument("--min-cooccurrence", type=int, default=2)
    ap.add_argument("--readings", type=str, default=None)
    args = ap.parse_args(argv)

    notes = load_vault(args.vault)
    eff = build_efficacy(notes, args.kb_root / "02_효능-병기색인")
    saf = build_safety(notes, args.kb_root / "04_안전성색인")
    combo = {"skipped": "no --index"}
    if args.index:
        combo = build_combos(notes, args.index, args.cache, args.kb_root / "03_배오색인",
                             min_count=args.min_cooccurrence, readings_path=args.readings)
    print(json.dumps({"notes": len(notes), "efficacy_files": len(eff),
                      "safety_files": len(saf), "combo": combo},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
