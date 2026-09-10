import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[2] / "_tools" / "ungok"
sys.path.insert(0, str(TOOLS))


import json

import pytest


@pytest.fixture
def fake_cache(tmp_path):
    """합성 캐시 1권(하) — 약재 2개, PDF p.10-13."""
    cache = tmp_path / "_cache"
    cache.mkdir()
    pages = []
    body = {
        10: "石決明\n출전 《別錄》\n생약명 Haliotidis Concha\n性 味 寒 鹹 無毒\n"
            "歸 經 肝\n效能主治 平肝潛陽, 淸肝明目. 治頭痛眩暈 目赤.\n"
            "임상응용 1. 平肝潛陽\n石決明丸 - 石決明 熟地黃 山藥\n"
            "2. 사용량 : 9~30g\n해설 본품은 鹹寒하다.\n수치 鹽水로 씻어 煆用한다.\n"
            "금기 脾胃虛寒者는 愼用한다. 孕婦 忌.\n1157",
        11: "이어지는 본문\n1158",
        12: "石斛\n출전 《本經》\n생약명 Dendrobii Herba\n性 味 微寒 甘 無毒\n"
            "歸 經 胃肺腎\n效能主治 益胃生津, 滋陰淸熱. 治熱病傷津 口乾煩渴.\n"
            "임상응용 淸胃養陰湯 - 石斛 沙參 生地黃\n2. 사용량 : 3~15g\n"
            "수치 洗淨하여 切片한다.\n금기 溫熱病 初期에는 忌한다.\n1159",
        13: "이어지는 본문\n1160",
    }
    for pno in range(10, 14):
        text = body[pno]
        lines = [{"text": ln, "size": 18.0 if i == 0 and pno in (10, 12) else 9.0, "y": i * 12.0}
                 for i, ln in enumerate(text.splitlines())]
        pages.append({"pdf_page": pno, "printed_page_detected": 1147 + pno,
                      "char_count": len(text), "garbled_ratio": 0.0,
                      "max_font_size": max(x["size"] for x in lines),
                      "text": text, "lines": lines})
    (cache / "하_pages.jsonl").write_text(
        "\n".join(json.dumps(p, ensure_ascii=False) for p in pages), encoding="utf-8")
    (cache / "하_meta.json").write_text(json.dumps({
        "volume": "하", "pdf_sha256": "deadbeef", "page_count": 13,
        "pagemap_runs": [{"pdf_start": 10, "pdf_end": 13, "offset": -1147, "evidence": 4}],
        "pagemap_coverage": 0.31,
    }, ensure_ascii=False), encoding="utf-8")
    return cache


@pytest.fixture
def fake_index(tmp_path):
    import csv as _csv
    from lib import registry  # noqa: F401
    p = tmp_path / "MASTER_INDEX_하.csv"
    cols = ["volume", "chapter", "section", "herb", "hanja", "latin_pharmacognosy",
            "aliases", "category", "print_start_page", "print_end_page",
            "pdf_start_page", "pdf_end_page", "extraction_status", "review_status",
            "note_path", "evidence_sources"]
    rows = [
        dict(volume="하", chapter="제15장 평간식풍약", section="평간잠양약", herb="석결명",
             hanja="石決明", latin_pharmacognosy="Haliotidis Concha", aliases="",
             category="평간식풍약", print_start_page="1157", print_end_page="1158",
             pdf_start_page="10", pdf_end_page="11", extraction_status="SOURCE_DERIVED",
             review_status="VERIFIED", note_path="01_약재별/석결명.md",
             evidence_sources="body+toc"),
        dict(volume="하", chapter="제17장 보익약", section="보음약", herb="석곡",
             hanja="石斛", latin_pharmacognosy="Dendrobii Herba", aliases="",
             category="보익약", print_start_page="1159", print_end_page="1160",
             pdf_start_page="12", pdf_end_page="13", extraction_status="SOURCE_DERIVED",
             review_status="VERIFIED", note_path="01_약재별/석곡.md",
             evidence_sources="body+index"),
    ]
    with p.open("w", encoding="utf-8", newline="") as fh:
        w = _csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    return p
