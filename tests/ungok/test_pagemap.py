"""페이지 매핑: 근거 없는 페이지 번호를 절대 만들어내지 않는다."""
from lib.pagemap import PageMap, Run, build_pagemap, detect_printed_page


def test_detect_standalone_number_only():
    assert detect_printed_page("1178\n石決明\n출전") == 1178
    assert detect_printed_page("石決明\n출전\n1178") == 1178
    assert detect_printed_page("본문 3~12g 사용") is None
    assert detect_printed_page("") is None


def test_conflicting_numbers_are_not_resolved():
    assert detect_printed_page("1178\n본문\n1200") is None


def test_run_requires_minimum_evidence():
    assert build_pagemap([(10, 1), (11, 2)]).runs == []
    pm = build_pagemap([(10, 1), (11, 2), (12, 3)])
    assert len(pm.runs) == 1 and pm.runs[0].offset == 9


def test_lookup_outside_runs_returns_none():
    pm = build_pagemap([(p, p - 9) for p in range(10, 20)])
    assert pm.pdf_to_printed(15) == 6
    assert pm.pdf_to_printed(500) is None
    assert pm.printed_to_pdf(9999) is None


def test_two_offsets_produce_two_runs():
    pairs = [(p, p - 9) for p in range(10, 15)] + [(p, p - 20) for p in range(30, 35)]
    pm = build_pagemap(pairs)
    assert {r.offset for r in pm.runs} == {9, 20}
    assert pm.pdf_to_printed(32) == 12


def test_ambiguous_printed_page_returns_none():
    pm = PageMap([Run(10, 20, 9, 5), Run(100, 110, 99, 5)])
    # 두 구간이 같은 인쇄면 1을 주장 -> 확정 불가
    assert pm.printed_to_pdf(1) is None


def test_unmapped_pages_are_reported():
    pm = build_pagemap([(p, p - 9) for p in range(10, 15)])
    assert 1 in pm.unmapped_pdf_pages(20)
    assert 12 not in pm.unmapped_pdf_pages(20)
