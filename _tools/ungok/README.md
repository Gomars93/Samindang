# 운곡본초학 → AI 임상 본초 KB 구축 툴체인

원서 PDF(상·하)를 Obsidian `07_본초_Library` 로 전수 변환하는 재현 가능한 파이프라인.
**PDF 를 MD 로 옮기는 도구가 아니라, 다른 AI 가 임상 추론에 쓸 수 있는 검색 기질(substrate)을
만드는 도구다.**

## 왜 이 저장소에 있고, 왜 로컬에서 돌려야 하는가

원서 PDF(상 588MB / 하 517MB)와 Obsidian vault 는 사용자 로컬 PC + Google Drive 에 있다.
Claude Code 클라우드 세션에서는 **원서 본문에 도달할 경로가 없다** (2026-09-10 확인):

| 경로 | 결과 |
| --- | --- |
| 컨테이너 → `drive.google.com` | 네트워크 정책상 차단 (CONNECT 403) |
| Drive 커넥터 `read_file_content` (상·하 모두) | `{"fileContent": ""}` — 두 파일 모두 0바이트 |
| Drive 커넥터 `download_file_content` | 517MB → base64 약 690MB, 사용 불가 |
| `notebooklm` MCP | `c:\Users\ASUS\...` 로컬 Windows 바이너리 — 컨테이너에서 실행 불가 |

그래서 이 툴체인은 **원서와 vault 가 같이 있는 로컬 PC에서 실행하는 것을 전제**로 만들어졌고,
원서가 없어도 전체 파이프라인이 검증되도록 합성 PDF 기반 테스트가 붙어 있다.

## 설계 원칙 (코드로 강제되는 것)

1. **원본 PDF 무변경** — 실행 전후 SHA-256 을 대조하고 다르면 즉시 중단한다.
2. **페이지 번호를 추측하지 않는다** — 인쇄면↔PDF면 매핑은 판면에서 실제로 검출된
   쌍이 연속 3개 이상인 구간에서만 제공한다. 근거가 없으면 빈칸으로 남긴다.
3. **OCR 교정은 게이트를 통과할 때만** — (a) 교정 결과가 사전에 있고 (b) 편집거리 1이며
   (c) 독립 근거가 2개 이상일 때만 적용한다. 그 외에는 값을 두고 `ocr_uncertain: true`.
   본문(SOURCE)은 어떤 경우에도 자동 교정하지 않는다 — 의심 지점을 표시만 한다.
4. **없는 것을 만들지 않는다** — 처방·배오·키워드는 원문에 실제로 등장한 것만.
   처방 독음이 사전에 없으면 한자 그대로 두고 review 목록에 넣는다.
5. **Evidence layer 를 섞지 않는다** — SOURCE / INTERPRETATION / MODERN_EVIDENCE /
   MODERN_SAFETY 는 별도 구역이며, 현대 근거는 기본값이 `미검토` 다.
   안전성 색인에 없다는 것이 "안전하다"는 뜻이 아님을 색인 자체가 명시한다.
6. **기존 파일 무검토 덮어쓰기 금지** — 기본 dry-run, `--apply` 시에도 백업 후 기록,
   사람이 쓴 구역(INTERPRETATION / MODERN / CLINIC_NOTE)은 보존한다.
7. **QA 게이트** — 누락 note·중복·YAML 오류·broken link 가 하나라도 있으면 exit code 1.

## 요구사항

```bash
pip install PyMuPDF pyyaml pytest
```

## 실행 순서 (로컬)

```bash
cd <repo>/_tools/ungok
VAULT="$HOME/Google Drive/.../07_본초_Library"      # 실제 경로로 교체
PDF_DIR="$HOME/Google Drive/..."

# 0) 기존 KB inventory (원서 없이도 가능)
python3 ungok_inventory.py --vault "$VAULT/01_약재별" --kb-root "$VAULT" \
  --out "$VAULT/00_Source_Registry/INVENTORY_REPORT.md"

# 1) 텍스트 캐시 (원본 무변경). 상·하 각각.
python3 ungok_extract.py --pdf "$PDF_DIR/운곡 본초학 _상_.pdf" --volume 상 --cache ./_cache
python3 ungok_extract.py --pdf "$PDF_DIR/운곡 본초학 _하_.pdf" --volume 하 --cache ./_cache

# 2) MASTER INDEX (목차/색인 페이지 범위는 캐시를 보고 지정한다)
python3 ungok_build_master_index.py --volume 상 --cache ./_cache \
  --out "$VAULT/00_Source_Registry" --toc-pages 5-20 --index-pages 800-830
python3 ungok_build_master_index.py --volume 하 --cache ./_cache \
  --out "$VAULT/00_Source_Registry" --toc-pages 5-20 --index-pages 820-845

#    → CSV 의 herb 칸이 빈 행 = 한자표제의 한국어 독음 미확정.
#      data/kb_seed_readings.tsv 를 보완하거나 --readings 로 별도 표를 주고 다시 돌린다.

# 3) note 생성 — 먼저 dry-run 으로 무엇이 바뀌는지 본다
python3 ungok_build_notes.py --index "$VAULT/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" \
  --cache ./_cache --vault "$VAULT/01_약재별" --report /tmp/plan.json
python3 ungok_build_notes.py --index ... --vault "$VAULT/01_약재별" --apply

# 4) 색인
python3 ungok_build_indexes.py --vault "$VAULT/01_약재별" --kb-root "$VAULT" \
  --index "$VAULT/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" --cache ./_cache

# 5) QA — 통과할 때까지 3~5 를 반복한다
python3 ungok_qa.py --vault "$VAULT/01_약재별" --kb-root "$VAULT" \
  --index "$VAULT/00_Source_Registry/운곡본초학_MASTER_INDEX_상.csv" \
  --index "$VAULT/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" \
  --out "$VAULT/QA_REPORT_운곡본초학_전수검수.md"
echo "exit=$?"     # 0 이 아니면 '전수처리 완료'라고 쓰지 않는다
```

## 파일

```
_tools/ungok/
├── ungok_extract.py             PDF -> 페이지 캐시 (+ 인쇄면 검출, OCR_REVIEW 후보)
├── ungok_build_master_index.py  목차·본문·색인 3원 대조 -> MASTER INDEX csv/md
├── ungok_build_notes.py         canonical note 생성/보정 (dry-run 기본, 백업, 병합)
├── ungok_build_indexes.py       효능 22축 + 병기/임상축, 배오, 안전성 8종 색인
├── ungok_qa.py                  전수 QA + QA_REPORT 생성 (실패 시 exit 1)
├── ungok_inventory.py           기존 KB inventory (vault 또는 Drive CSV 덤프)
├── data/
│   ├── vocab.tsv                통제어휘 (canonical 은 전부 한국어)
│   ├── formula_readings.tsv     처방 한자 -> 한국어 (모르면 비워 둔다)
│   └── kb_seed_readings.tsv     한자표제 -> 한국어 약재명 (기존 KB 관찰값, OCR 플래그 포함)
└── lib/
    ├── textnorm.py   OCR 교정 게이트     ├── pagemap.py     인쇄면↔PDF면
    ├── boundaries.py 표제/약재 경계       ├── source_parse.py 원서 항목 분해
    ├── schema.py     스키마 + 마이그레이션 ├── keywords.py    검색 메타데이터
    ├── combos.py     배오 동시등장         └── registry.py    캐시·사전 로딩
```

## 테스트

```bash
python3 -m pytest tests/ungok -q      # 저장소 루트에서
```

합성 PDF 로 추출→MASTER INDEX→note→색인→QA 전 구간을 돌린다. 원서가 없어도 실행된다.
특히 다음이 회귀 테스트로 고정되어 있다:

- 근거 없는 인쇄면이 채워지지 않는다 (`test_master_index_never_guesses_pages_without_evidence`)
- 근거가 부족하면 OCR 교정이 적용되지 않는다 (`test_textnorm.py`)
- 기존 스키마의 모든 필드가 목적지를 갖거나 근거와 함께 버려진다 (`test_schema.py`)
- 사람이 쓴 구역이 재생성에서 살아남고 원본이 백업된다 (`test_build_notes.py`)
- 누락 note 가 있으면 QA 가 반드시 FAIL 한다 (`test_qa.py`)
