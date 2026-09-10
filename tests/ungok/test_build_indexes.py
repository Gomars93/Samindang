import ungok_build_indexes as bi
import ungok_build_notes as bn


def _kb(tmp_path, fake_cache, fake_index):
    kb = tmp_path / "07_본초_Library"
    vault = kb / "01_약재별"
    bn.run(fake_index, fake_cache, vault, apply=True, only=None)
    return kb, vault


def test_all_22_action_axes_are_created(tmp_path, fake_cache, fake_index):
    kb, vault = _kb(tmp_path, fake_cache, fake_index)
    bi.build_efficacy(bi.load_vault(vault), kb / "02_효능-병기색인")
    for axis in bi.ACTION_AXES:
        assert (kb / "02_효능-병기색인" / f"{axis}_INDEX.md").exists(), axis


def test_axis_index_lists_only_notes_that_carry_the_keyword(tmp_path, fake_cache, fake_index):
    kb, vault = _kb(tmp_path, fake_cache, fake_index)
    bi.build_efficacy(bi.load_vault(vault), kb / "02_효능-병기색인")
    boeum = (kb / "02_효능-병기색인" / "보음_INDEX.md").read_text(encoding="utf-8")
    assert "[[석곡]]" in boeum and "[[석결명]]" not in boeum
    haepyo = (kb / "02_효능-병기색인" / "해표_INDEX.md").read_text(encoding="utf-8")
    assert "해당 note 없음" in haepyo


def test_all_8_safety_indexes_exist_and_say_unreviewed_where_empty(tmp_path, fake_cache, fake_index):
    kb, vault = _kb(tmp_path, fake_cache, fake_index)
    bi.build_safety(bi.load_vault(vault), kb / "04_안전성색인")
    for fname in bi.SAFETY_INDEX_FILES:
        p = kb / "04_안전성색인" / fname
        assert p.exists(), fname
        body = p.read_text(encoding="utf-8")
        # 비어 있음을 "안전함"으로 읽지 않도록 명시적 경고가 있어야 한다
        assert "'안전하다'는 뜻이 아니다" in body
    suyu = (kb / "04_안전성색인" / "수유주의_INDEX.md").read_text(encoding="utf-8")
    assert "미검토" in suyu


def test_pregnancy_index_picks_up_source_flag(tmp_path, fake_cache, fake_index):
    kb, vault = _kb(tmp_path, fake_cache, fake_index)
    bi.build_safety(bi.load_vault(vault), kb / "04_안전성색인")
    txt = (kb / "04_안전성색인" / "임신주의_INDEX.md").read_text(encoding="utf-8")
    assert "[[석결명]]" in txt


def test_combo_index_only_from_real_compositions(tmp_path, fake_cache, fake_index):
    kb, vault = _kb(tmp_path, fake_cache, fake_index)
    res = bi.build_combos(bi.load_vault(vault), fake_index, fake_cache,
                          kb / "03_배오색인", min_count=1)
    txt = (kb / "03_배오색인" / "핵심배오_INDEX.md").read_text(encoding="utf-8")
    assert res["compositions"] >= 2
    assert "石決明" in txt or "[[석결명]]" in txt
    # 서로 다른 처방의 약재끼리 묶이지 않는다
    assert "沙參 + 熟地黃" not in txt
