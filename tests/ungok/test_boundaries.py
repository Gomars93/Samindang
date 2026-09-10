"""약재 경계 검출."""
from lib.boundaries import (build_spans, page_heading_candidates, parse_back_index,
                            parse_toc_lines)


def _lines(title, size=18.0):
    body = ["출전 別錄", "생약명 X", "성상 Y", "성미 寒", "귀경 肝", "효능 平肝", "금기 Z"]
    return [{"text": title, "size": size}] + [{"text": b, "size": 9.0} for b in body]


def test_heading_detected_only_with_big_font_and_markers():
    assert page_heading_candidates(1, _lines("石決明"))[0].normalized == "石決明"
    # 마커가 부족하면 후보로 잡지 않는다
    thin = [{"text": "石決明", "size": 18.0}, {"text": "아무 말", "size": 9.0}]
    assert page_heading_candidates(1, thin) == []


def test_small_font_title_is_not_a_heading():
    lines = _lines("石決明", size=9.0)
    assert all(c.normalized != "石決明" for c in page_heading_candidates(1, lines))


def test_hangul_line_is_not_a_herb_heading():
    lines = _lines("석결명")
    assert page_heading_candidates(1, lines) == []


def test_spans_end_before_next_heading():
    c1 = page_heading_candidates(408, _lines("石決明"))
    c2 = page_heading_candidates(412, _lines("石斛"))
    spans = build_spans(c1 + c2, last_pdf_page=420, confirm_set={"石決明", "石斛"})
    assert (spans[0].pdf_start, spans[0].pdf_end) == (408, 411)
    assert (spans[1].pdf_start, spans[1].pdf_end) == (412, 420)
    assert all(s.confident for s in spans)


def test_span_unconfirmed_when_not_in_index_and_weak_markers():
    lines = [{"text": "石決明", "size": 18.0}] + [
        {"text": t, "size": 9.0} for t in ("출전 x", "생약명 y", "성미 z")]
    spans = build_spans(page_heading_candidates(1, lines), last_pdf_page=3, confirm_set=set())
    assert spans and not spans[0].confident


def test_toc_and_index_parsing():
    assert parse_toc_lines("石決明 ………… 1157\n쓰레기 줄") == [("石決明", 1157)]
    assert parse_back_index("石決明 1157, 1158") == [("石決明", [1157, 1158])]
    assert parse_toc_lines("페이지 없음") == []
