"""note 생성: dry-run 안전, 사람 작성 구역 보존, 현대근거 사칭 금지."""
import ungok_build_notes as bn


def test_dry_run_writes_nothing(fake_cache, fake_index, tmp_path):
    vault = tmp_path / "01_약재별"
    res = bn.run(fake_index, fake_cache, vault, apply=False, only=None)
    assert res["created"] == 2
    assert list(vault.glob("*.md")) == []


def test_apply_creates_notes(fake_cache, fake_index, tmp_path):
    vault = tmp_path / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    names = sorted(p.stem for p in vault.glob("*.md"))
    assert names == ["석결명", "석곡"]


def test_note_has_required_sections_and_provenance(fake_cache, fake_index, tmp_path):
    vault = tmp_path / "01_약재별"
    bn.run(fake_cache and fake_index, fake_cache, vault, apply=True, only={"석결명"})
    text = (vault / "석결명.md").read_text(encoding="utf-8")
    for h in ("## 0. AI QUICKREF", "## 1. SOURCE | 운곡본초학", "## 2. INTERPRETATION",
              "## 3. 배오", "## 4. 처방 연결", "## 5. MODERN_EVIDENCE",
              "## 6. SAFETY", "## 7. 원서 위치"):
        assert h in text, h
    assert "인쇄 p.1157–1158" in text and "PDF p.10–11" in text
    assert "현대 임상근거: 미검토" in text
    assert "MODERN SAFETY" in text and "HILI: 미검토" in text


def test_source_keywords_come_from_text_only(fake_cache, fake_index, tmp_path):
    from lib import frontmatter as fmlib
    vault = tmp_path / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    fm = fmlib.parse((vault / "석곡.md").read_text(encoding="utf-8")).frontmatter
    assert "보음" in fm["action_keywords"]
    assert "소갈" in fm["clinical_keywords"]
    assert "야뇨" not in fm["clinical_keywords"]        # 원문에 없는 것은 붙지 않는다
    assert fm["source_print_pages"] == [1159, 1160]


def test_source_contraindication_becomes_flag(fake_cache, fake_index, tmp_path):
    from lib import frontmatter as fmlib
    vault = tmp_path / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    fm = fmlib.parse((vault / "석결명.md").read_text(encoding="utf-8")).frontmatter
    assert "임신금기" in fm["safety_flags"]


def test_existing_human_content_is_preserved_and_backed_up(fake_cache, fake_index, tmp_path):
    vault = tmp_path / "vault" / "01_약재별"
    vault.mkdir(parents=True)
    old = ("---\nherb: 석곡\n---\n\n## 2. INTERPRETATION | 임상 구조화\n"
           "원장이 직접 쓴 임상 구조화 내용이다.\n\n## 5. MODERN_EVIDENCE\n"
           "`[별도 검증 필요]`\n")
    (vault / "석곡.md").write_text(old, encoding="utf-8")
    res = bn.run(fake_index, fake_cache, vault, apply=True, only={"석곡"})
    new = (vault / "석곡.md").read_text(encoding="utf-8")
    assert "원장이 직접 쓴 임상 구조화 내용이다." in new       # 사람 글은 살아남는다
    assert new.count("별도 검증 필요") <= 1                   # placeholder 는 중복 이관 안 함
    assert res["backup_dir"] and (tmp_path / "vault" / "_backup").exists()
    backups = list((tmp_path / "vault" / "_backup").rglob("석곡.md"))
    assert backups and backups[0].read_text(encoding="utf-8") == old


def test_rows_without_korean_name_are_skipped_not_guessed(fake_cache, fake_index, tmp_path):
    import csv
    rows = list(csv.DictReader(fake_index.open(encoding="utf-8")))
    rows[0]["herb"] = ""
    with fake_index.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    res = bn.run(fake_index, fake_cache, tmp_path / "v", apply=True, only=None)
    assert res["skipped"] == 1
    assert not (tmp_path / "v" / ".md").exists()


def test_latin_pharmacognosy_falls_back_to_source_field(fake_cache, fake_index, tmp_path):
    """MASTER INDEX 에 생약명이 비어도 원문 '생약명' 필드에서 채운다 (없으면 빈칸)."""
    import csv

    from lib import frontmatter as fmlib
    rows = list(csv.DictReader(fake_index.open(encoding="utf-8")))
    for r in rows:
        r["latin_pharmacognosy"] = ""
    with fake_index.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    vault = tmp_path / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    fm = fmlib.parse((vault / "석결명.md").read_text(encoding="utf-8")).frontmatter
    assert fm["latin_pharmacognosy"] == "Haliotidis Concha"


def test_quickref_fields_do_not_bleed_next_label(fake_cache, fake_index, tmp_path):
    vault = tmp_path / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    text = (vault / "석결명.md").read_text(encoding="utf-8")
    line = next(l for l in text.splitlines() if l.startswith("- 핵심 성미:"))
    assert "歸" not in line and "效能" not in line
