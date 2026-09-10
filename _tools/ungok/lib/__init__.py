"""운곡본초학 ingestion toolkit — shared library.

Design rule for every module here: never invent source facts.
Anything that cannot be confirmed against the原서 text is emitted as
`ocr_uncertain: true` / `review_status: OCR_REVIEW`, never as a silent guess.
"""
