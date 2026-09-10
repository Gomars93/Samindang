"""QA 게이트: 누락이 있으면 절대 PASS 가 나오지 않는다."""
import ungok_build_indexes as bi
import ungok_build_notes as bn
import ungok_qa as qa


def _full_kb(tmp_path, fake_cache, fake_index):
    kb = tmp_path / "07_본초_Library"
    vault = kb / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    notes = bi.load_vault(vault)
    bi.build_efficacy(notes, kb / "02_효능-병기색인")
    bi.build_safety(notes, kb / "04_안전성색인")
    bi.build_combos(notes, fake_index, fake_cache, kb / "03_배오색인", min_count=1)
    (kb / "00_Source_Registry").mkdir(exist_ok=True)
    return kb, vault


def test_missing_note_forces_fail(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    (vault / "석곡.md").unlink()
    res = qa.run(vault, kb, [fake_index])
    assert res["overall"] == "FAIL"
    assert res["counts"]["missing_notes"] == 1
    codes = {c["code"]: c["status"] for c in res["checks"]}
    assert codes["NOTE_COVERAGE"] == "FAIL"


def test_missing_upper_volume_index_is_a_fail(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    res = qa.run(vault, kb, [fake_index])          # 하권만 있고 상권 없음
    codes = {c["code"]: c["status"] for c in res["checks"]}
    assert codes["MASTER_INDEX"] == "FAIL"
    assert res["overall"] == "FAIL"


def test_broken_wikilink_is_detected(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    (vault / "석곡.md").write_text(
        (vault / "석곡.md").read_text(encoding="utf-8") + "\n[[존재하지않는노트]]\n",
        encoding="utf-8")
    res = qa.run(vault, kb, [fake_index])
    assert res["counts"]["broken_links"] >= 1


def test_yaml_error_is_counted(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    (vault / "석곡.md").write_text("---\nherb: [unclosed\n---\n본문\n", encoding="utf-8")
    res = qa.run(vault, kb, [fake_index])
    assert res["counts"]["yaml_errors"] >= 1
    assert res["overall"] == "FAIL"


def test_high_risk_herb_without_modern_flag_fails(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    (vault / "보골지.md").write_text(
        "---\nherb: 보골지\nhanja: 補骨脂\nsource_title: 운곡본초학\nsource_volume: 하\n"
        "source_print_pages:\n  - 1300\nstatus: SOURCE_DERIVED\nreview_status: VERIFIED\n"
        "ocr_uncertain: false\nevidence_layer:\n  - SOURCE\n"
        "schema_version: ungok-herb-note/1.0\nsafety_flags: []\n---\n" + ("본문 " * 200),
        encoding="utf-8")
    res = qa.run(vault, kb, [fake_index])
    codes = {c["code"]: c["status"] for c in res["checks"]}
    assert codes["SAFETY_FLAG"] == "FAIL"


def test_clean_kb_reports_zero_missing(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    res = qa.run(vault, kb, [fake_index])
    assert res["counts"]["missing_notes"] == 0
    assert res["counts"]["duplicates"] == 0


def test_report_renders_all_required_counts(tmp_path, fake_cache, fake_index):
    kb, vault = _full_kb(tmp_path, fake_cache, fake_index)
    md = qa.render(qa.run(vault, kb, [fake_index]))
    for label in ("상권 canonical herb 수", "하권 canonical herb 수", "전체 canonical herb 수",
                  "VERIFIED", "OCR_REVIEW", "Safety review required", "누락 note",
                  "중복", "broken link", "YAML 오류"):
        assert label in md, label
