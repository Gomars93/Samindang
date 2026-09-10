# 로컬 인수인계 프롬프트 — 운곡본초학 → AI 본초 KB 전수 처리

> 이 파일 전체를 로컬 Claude Code 세션(원장님 Windows PC, `claude` CLI)에 그대로 붙여넣으세요.
> 클라우드 세션에서 원서 PDF에 접근할 방법이 없다는 걸 확인했고(아래 참고), 그래서
> 실행을 로컬로 넘깁니다. 클라우드 세션이 만든 툴체인 + 테스트 83개는 이미 이 브랜치에
> push되어 있습니다.

---

## 붙여넣을 프롬프트 (여기부터)

너는 "운곡본초학 상·하 → Obsidian 임상 본초 지식베이스" 구축 작업을 **로컬 실행 단계**로
인수인계받는다. 클라우드 세션이 이미 툴체인·테스트·기존 KB 실사를 끝내고 브랜치에
push해뒀다. 네 역할은 그 툴체인을 이 PC의 실제 PDF/vault 경로로 돌려서
**진짜 전수 ingestion을 완료**하는 것이다.

### 0. 시작 전 필수 확인 (순서대로, 건너뛰지 마라)

1. 저장소 루트로 이동해서 브랜치를 받는다:
   ```
   git fetch origin claude/ungok-herbal-kb-full-build-2b9nml
   git checkout claude/ungok-herbal-kb-full-build-2b9nml
   git pull
   ```
2. `CLAUDE.md`, `HANDOFF.md`의 "2026-09-10 (47)" 항목, `DECISIONS.md`의
   "2026-09-10 — 운곡본초학 ingestion" 항목을 읽는다. 이 세 문서가 지금까지의
   결정과 제약을 담고 있다.
3. `_tools/ungok/README.md`를 읽는다 — 툴체인 사용법 전체.
4. `docs/UNGOK_KB_INVENTORY_2026-09-10.md`를 읽는다 — 기존 KB의 현재 상태
   (상권 0건, broken wikilink 93건, 안전성 색인 8종 전부 부재, provenance 불일치 등).
5. Python 명령을 확인한다 (Windows라 `python3`이 안 될 수 있다):
   ```
   python --version
   python3 --version
   py --version
   ```
   되는 것으로 아래 명령들의 `python3`을 바꿔 써라.
6. 패키지 설치 후 기존 테스트가 통과하는지 먼저 확인한다:
   ```
   python -m pip install PyMuPDF pyyaml pytest
   python -m pytest tests/ungok -q
   ```
   **83 passed**가 안 나오면 원인을 먼저 고친다. 이 테스트가 깨진 채로
   본 작업을 진행하지 않는다.

### 1. 원본 PDF와 vault 위치 확정

원본 지시(과거 세션에 전달된 전체 스펙)에 따르면:
- PDF: `운곡 본초학 _상_.pdf`, `운곡 본초학 _하_.pdf` — 이 PC 또는 Google Drive 동기화 폴더.
- vault: `Obsidian/MyVault/02-Areas/삼인당/임상지식베이스/07_본초_Library/`

이 PC에서 실제 경로를 찾아 확정하라. **찾지 못하면 사용자에게 물어라** — 이건
CLAUDE.md/원 지시가 명시한 "질문해도 되는" 예외 상황이다(PDF 못 찾음 / vault 못 찾음).
추측으로 아무 경로나 쓰지 마라.

원본 PDF는 **절대 수정 금지**다. `ungok_extract.py`는 읽기 전용으로만 열고 실행 전후
SHA-256을 대조해서 다르면 즉시 중단하도록 이미 짜여 있다 — 그 안전장치를 우회하지 마라.

### 2. 실행 순서 (`_tools/ungok/README.md`의 순서를 따르되, 아래 체크포인트를 지켜라)

```
cd _tools/ungok

# 0) 기존 KB inventory 재확인 (실제 로컬 vault 기준으로 다시 — Drive CSV 스냅샷과 다를 수 있다)
python ungok_inventory.py --vault "<vault>/01_약재별" --kb-root "<vault>" \
  --out "<vault>/00_Source_Registry/INVENTORY_REPORT_local.md"

# 1) 텍스트 캐시 — 상·하 각각. 여기서 처음으로 "상권이 실제로 몇 페이지인지,
#    텍스트 레이어가 있는지"가 사실로 확정된다. 결과를 반드시 확인하고 보고하라.
python ungok_extract.py --pdf "<PDF_DIR>/운곡 본초학 _상_.pdf" --volume 상 --cache ./_cache
python ungok_extract.py --pdf "<PDF_DIR>/운곡 본초학 _하_.pdf" --volume 하 --cache ./_cache

# 2) MASTER INDEX — 목차/책뒤색인 페이지 범위는 캐시 텍스트를 직접 눈으로 확인하고 지정한다.
#    추측하지 마라. --toc-pages, --index-pages 는 실제 페이지 번호를 봐야 안다.
python ungok_build_master_index.py --volume 상 --cache ./_cache \
  --out "<vault>/00_Source_Registry" --toc-pages <N-M> --index-pages <N-M>
python ungok_build_master_index.py --volume 하 --cache ./_cache \
  --out "<vault>/00_Source_Registry" --toc-pages <N-M> --index-pages <N-M>
```

**체크포인트 A**: 생성된 CSV에서 `herb` 칸이 비어 있는 행이 얼마나 되는지 세라.
이게 "한자표제 → 한국어 약재명" 독음이 아직 없는 항목이다. 이 비율이 높으면
`data/kb_seed_readings.tsv`를 보완해야 note가 만들어진다 — 이게 실질적인 병목이다.
독음을 **추정하지 말고**, 원서 본문/목차/색인에서 실제로 확인되는 것만 추가하라.

**체크포인트 B**: `docs/UNGOK_KB_INVENTORY_2026-09-10.md` §2.2에 적힌 provenance 불일치
(기존 A세대 93개 note가 주장하는 PDF p.173–681 범위와, MANIFEST가 기록한 실제 검수
범위가 다른 문제)를 이 단계에서 판정하라: 각 기존 note의 `source_pdf_pages`를 방금 만든
캐시 텍스트와 대조해서 실제로 그 페이지에 그 약재 내용이 있는지 확인한다. 결과를
`DECISIONS.md`에 남겨라 (있다/없다, 몇 건).

```
# 3) note 생성 — 반드시 dry-run 먼저
python ungok_build_notes.py --index "<vault>/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" \
  --cache ./_cache --vault "<vault>/01_약재별" --report /tmp/plan_하.json
# report를 읽고 CREATE/UPDATE/SKIP 목록을 확인한 뒤에만:
python ungok_build_notes.py --index ... --vault "<vault>/01_약재별" --apply
# 상권도 동일하게 반복

# 4) 색인 (효능 22축 + 배오 + 안전성 8종)
python ungok_build_indexes.py --vault "<vault>/01_약재별" --kb-root "<vault>" \
  --index "<vault>/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" --cache ./_cache
# 상권 index도 --index 로 추가 실행하거나 build_indexes 를 두 번 돌려 병합 상태를 확인하라

# 5) QA — exit code 를 반드시 확인한다
python ungok_qa.py --vault "<vault>/01_약재별" --kb-root "<vault>" \
  --index "<vault>/00_Source_Registry/운곡본초학_MASTER_INDEX_상.csv" \
  --index "<vault>/00_Source_Registry/운곡본초학_MASTER_INDEX_하.csv" \
  --out "<vault>/QA_REPORT_운곡본초학_전수검수.md"
echo $?   # 0이 아니면 3~5를 반복한다
```

### 3. 완료 조건 — 원 지시(§16, §21)를 그대로 따른다

- QA `exit code == 0` (누락 note, 중복, YAML 오류, broken link 전부 0) 이전에는
  **"전수처리 완료"라고 쓰지 않는다.**
- B세대 32개 수기 note(감초·당귀·황기 등, `docs/UNGOK_KB_INVENTORY_2026-09-10.md` §2.1
  참고)가 재생성 과정에서 사람이 쓴 구역을 잃지 않았는지 diff로 확인한다.
  `ungok_build_notes.py`는 보존 로직이 있지만, 실제 diff를 눈으로 검토하라.
- 완료 후 `00_본초_INDEX.md`, `HANDOFF.md`, `DECISIONS.md`, `BUILD_LOG`를 갱신한다.
- 최종 보고는 원 지시 §21 형식(전체/상권/하권 canonical herb 수, 신규/보정/OCR_REVIEW/
  Safety review/누락/중복/broken link/YAML error 수, QA PASS/FAIL)을 그대로 쓴다.

### 4. 절대 하지 말 것 (원 지시 §19 재확인)

- PDF 단순 복붙으로 거대 MD 생성
- 일부만 처리하고 완료 선언
- SOURCE에 AI 추측 작성 / 원서 페이지 추측
- 전통효능 = 현대입증효과로 표현
- 위험 본초(보골지·하수오·백선피·마두령·주사·경분·비석·웅황·반묘·부자류·생반하 등)
  안전성 누락
- 기존 파일(특히 B세대 32개) 무검토 덮어쓰기
- 없는 배오/처방 창작
- 원본 PDF 수정

---

## 붙여넣을 프롬프트 (여기까지)

## 참고 — 이 문서가 왜 필요한가

클라우드 세션은 Drive 커넥터로 상·하권 PDF를 읽으려 했으나 둘 다 `{"fileContent": ""}`
(0바이트)를 반환했고, 컨테이너에서 `drive.google.com`으로의 아웃바운드는 CONNECT 403으로
막혀 있었으며, `.mcp.json`에 등록된 `notebooklm` MCP는 `c:\Users\ASUS\...` 로컬 Windows
바이너리라 클라우드에서 실행되지 않았다. 그래서 SOURCE 채우기는 로컬 PC에서만
가능하다. 상세 근거는 `docs/UNGOK_KB_INVENTORY_2026-09-10.md` §1 참고.
