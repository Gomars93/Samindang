# Opus Closing Review — LBP Production v1 Batch 1 (fix commit 2f37946) — 2026-09-02

**리뷰어:** Opus (실제 모델 호출, Fable 세션의 subagent invocation; session https://claude.ai/code/session_019JGkicU3oJZVyPn7fMqPS9)
**대상:** `git diff 9533414..2f37946` (Opus delta review 6개 지적의 이행분)
**후속:** 남은 결함 1건(테스트 assertion, 프로덕션 코드 무변경)은 Opus가 제시한 기계적 재검 기준(같은 assertion이 PAIN_SCENARIO_1 HTML에서는 실패해야 함)으로 Sonnet이 검증·수정한 뒤 게이트를 닫는다. 결과는 HANDOFF 참고.

---

## Closing disposition: FAIL

남은 결함은 **1건뿐**이고, 테스트 1줄 수정이다(프로덕션 코드 무변경). 6개 중 5개는 완전 해결, 6번째(item 3)는 절반만 해결됐다 — 그리고 하필 그 절반이 **이전 라운드에 FAIL 사유였던 "vacuous assertion"과 정확히 같은 종류**라 일관성상 통과시킬 수 없다.

검증 실행: `test:lbp-exam-suggestions` 25 PASS · `test:doctor-workspace` 208 PASS · `test:workspace-round3` 133 PASS · `npx tsc -b` exit 0 · `npm run build` OK · (추가) `test:save-conflict` 102 PASS · `test:doctor-reset-key` 11 PASS. FROZEN zero-diff: `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` 출력 없음. working tree clean.

---

## 6개 요구 수정 판정

### 1. 재진 picker dead-end — **RESOLVED (a, b 둘 다)**
- **(a)** `src/doctor/workspace/RevisitWorkspace.tsx:86` import, `:106` `COMBINED_FOLLOW_UP_OPTIONS = [...LBP_TARGET_FUNCTION_OPTIONS, ...PAIN, ...HERBAL]`, `:107-109` + `:573` `groups={COMBINED_FOLLOW_UP_GROUPS}`. carry-forward된 `lbp_tf_*`가 이제 실제 chip을 갖는다.
- **(b)** `FollowUpTargetPicker.tsx:95-97` — `orphanSelected`를 ungrouped row에 append. `:113`이 `chipRow(groups ? ungrouped : options, …)` → `chipRow(ungrouped, …)`로 바뀌었는데, `groups` 미전달 시 `ungrouped = options + orphans`이므로 기존 호출자(Herbal/비-LBP Pain) 렌더는 동일하다 — 208 assertion 무회귀로 실측 확인.
- 회귀 테스트가 실제 컴포넌트를 SSR로 렌더해 검증한다(`tests/doctor-workspace.spec.mjs:2044-2060`, `:2062-2077`): options에 없는 `lbp_tf_walking`이 `aria-pressed="true"`로 렌더되고, orphan 3개가 MAX를 채운 최악 케이스도 전부 pressed chip으로 나온다. 소스 grep 테스트(`:2032-2042`)는 (a)의 배선을 별도로 못박는다.

### 2. vacuous assertion (pending counter) — **RESOLVED**
- `tests/doctor-workspace.spec.mjs:797-805`. `indexOf`/`slice(…,'</p>')`로 교체. 카운터가 `<p className="workspace__pendingCounter">`(`ExamSuggestionList.tsx:27-31`)이므로 `</p>` 경계가 정확하다.
- 실측으로 non-vacuous 확인: 해당 payload의 counter 청크는 `아직 확인 안 됨 · <!-- -->1<!-- -->건 — <!-- -->목표 동작 재현`. `counterIdx !== -1`과 `includes('목표 동작 재현')`이 실제로 실행·통과하고, SLR이 pending으로 새면 즉시 잡힌다.

### 3. PAIN_SCENARIO_2 판별력 — **RESOLVED WITH ISSUE (아래 결함 #1)**
- 양성 절반은 해결: `:1947-1950` `'하지 통증·저림/신경증상 보고(환자 응답)'`는 생성기만 쓰는 문자열이라 자동 병합을 진짜로 증명한다(실측: S1 false / S2 true).
- 음성 절반은 **여전히 vacuous** — 상세는 결함 #1.

### 4. aria-pressed assertion — **RESOLVED**
- `tests/doctor-workspace.spec.mjs:1965-1968` — `/<button[^>]*aria-pressed="true"[^>]*>미시행<\/button>/`. 이 정규식은 `<!-- -->` 문제가 없다(버튼 라벨이 단일 정적 텍스트 자식). 실행·통과 확인.

### 5. `lbp_neuro_baseline_required` 규칙 + 가드 + 테스트 — **RESOLVED**
- 규칙: `lbpExamSuggestions.ts:169-176`, `=== true` 엄격비교. 가드: `:120`, `:128` `typeof f.lbp_neuro_baseline_required === 'boolean'` 추가로 fail-closed 유지. 문서 주석 `:4`, `:17-22`도 "three→four rules"로 갱신.
- 삽입 위치가 규칙표 마지막이라 순서는 선언 순서 고정(점수/정렬 없음) 유지. `확인 추가` 자동 필터로 중복 없음.
- 테스트: `tests/lbp-exam-suggestions.spec.mjs:167-185`(BILATERAL → `lbp_neuro_baseline_required === true` && `lbp_safety_status === 'CLEAR'` sanity 후 id 목록 `deepEqual` + reasonFacts 검증), `:187-192`(RIGHT → false, 미생성), `:194-202`(병합 후 `확인 추가` 후보에서 제거). 전부 production spec builder로 만든 payload를 쓴다.
- 가드 강화로 인한 레거시 위험 없음 확인: `lbp_neuro_baseline_required`는 LBP 모듈 최초 통합 커밋(`8ae809f`, `src/spec/lbpLogic.ts:103`,`:299`)부터 항상 방출되므로 이 필드가 없는 저장 payload는 존재하지 않는다.

### 6. ⓘ 36px 터치 타겟 — **RESOLVED**
- `src/doctor/workspace/workspace.css:1607-1609` width/height/min-height 36px. 배치 컨테이너가 `display:flex; align-items:center; flex-wrap:wrap`(`:375-381`)이라 레이아웃 파손 없음.

---

## 새 결함 유입 여부

- **FROZEN zero-diff: PASS** (위 실행 결과, 출력 없음).
- **scope creep: 없음.** 델타 8파일 중 `package.json`/`.gitignore` 변경은 item 1b 테스트가 요구하는 `FollowUpTargetPicker` esbuild 번들 1개 추가·ignore뿐이며, 다른 스크립트는 무변경.
- **새 임상 의미: 없음.** 신규 규칙 (d)는 이미 승인된 CLOSED FROZEN 계산값 연결이고, 자동 제안 상한은 CLEAR 환자당 최대 4개로 유지된다.
- **테스트가 실제 동작을 검증하는가: 1건 제외 예.** 결함 #1 참조.

---

# 남은 구체적 결함

### 1. [LOW-MED] item 3의 **음성** assertion이 여전히 한 번도 실행되지 않는다 (item 2와 동일한 `<!-- -->` 함정)
- **위치:** `tests/doctor-workspace.spec.mjs:1951-1954`
- **무엇이 잘못됐나:** `!/workspace__addExamBtn[^>]*>\s*\+ 하지직거상/.test(html)` 의 정규식이 **어떤 경우에도 매치되지 않는다.** `LbpAddExamDisclosure`(`src/doctor/workspace/PainWorkspace.tsx:152-154`)의 JSX `+ {e.title}` 는 인접 자식이 둘이라 React 18 SSR이 그 사이에 `<!-- -->`를 넣는다. 실측 마크업:
  ```
  <button type="button" class="workspace__addExamBtn">+ <!-- -->하지직거상 또는 슬럼프검사</button>
  ```
  SLR이 **실제로 `확인 추가` 목록에 남아 있는** PAIN_SCENARIO_1로 검증했더니 그 정규식은 `false`였다. 즉 자동 병합 필터가 완전히 깨져도 이 assertion은 그대로 통과한다 — item 2에서 지적했던 것과 정확히 같은 유형의 무의미 통과이고, 테스트 이름이 약속한 후반부("is no longer offered in 확인 추가")는 지금도 미검증이다.
- **최소 수정 (둘 중 하나, 실측 검증 완료):**
  ```js
  // (A) 마크업에 덜 의존하는 쪽 — 권장
  const addIdx = html.indexOf('workspace__addExamList')
  const addChunk = html.slice(addIdx, html.indexOf('</details>', addIdx))
  assert.ok(!addChunk.includes('하지직거상'), '이미 병합된 SLR/슬럼프는 확인 추가 목록에서 사라진다')
  // (B) 정규식 유지 시
  assert.ok(!/workspace__addExamBtn[^>]*>\+ <!-- -->하지직거상/.test(html), …)
  ```
  두 형태 모두 PAIN_SCENARIO_2에서 통과하고 PAIN_SCENARIO_1(=필터가 깨진 상태의 대리)에서 실패함을 실행으로 확인했다.
- **재검 기준(기계적):** 수정한 assertion을 PAIN_SCENARIO_1 HTML에 대해 돌렸을 때 **실패**해야 한다. 이것만 확인되면 별도 Opus 재검 없이 게이트를 닫아도 된다.

---

# CLINICAL DECISION REQUIRED

**없음.** 이번 델타는 전부 이전 라운드에서 이미 판정된 항목의 이행이며, 새 임상 판단이 필요한 지점은 없었다.

---

# 조치 불필요 관찰

1. **재진 화면은 이제 주호소와 무관하게 목표기능 chip 9개 + "목표 기능" 그룹 헤딩을 보여준다.** `PainWorkspaceNext`는 `isLbp`로 게이팅하지만(`PainWorkspace.tsx:423-426`) `RevisitWorkspace.tsx:106`은 무조건이다. 다만 이 picker는 Batch 1 이전에도 pain+herbal 옵션을 주호소 무관하게 합쳐 보여주던 자리이고(기존 `COMBINED` 관례), `priorSubmission`은 비동기 로드라 조건부로 만들면 chip이 늦게 나타나는 flicker가 생긴다. 현재 선택이 더 낫다고 본다.
2. **재진 picker에는 `LBP_TARGET_FUNCTION_PLACEHOLDERS`가 전달되지 않는다.** 재진에서 "기타 목표 동작"을 고르면 초진과 달리 일반 placeholder가 뜬다. 한 줄로 맞출 수 있으나 기능 결함은 아니다.
3. **orphan chip은 한 번 해제하면 그 세션에서 다시 켤 수 없다**(options에도 selected에도 없어져 chip이 사라짐). item 1b는 "해제 불가"를 막는 안전망이므로 의도상 맞고, item 1a로 `RevisitWorkspace`에서는 orphan 경로 자체가 더 이상 도달 불가다.
4. **`'목표 기능(다음 방문에 같은 동작으로 비교)'` 라벨 문자열이 `PainWorkspace.tsx:425`와 `RevisitWorkspace.tsx:108` 두 곳에 중복 리터럴로 존재한다.** 지금은 테스트가 두 곳을 각각 잡고 있어 조용히 어긋날 위험은 낮다.
5. **이전 라운드 관찰 1~5는 그대로 유효**(help의 서버 저장, safety≠CLEAR 시 사유 문구 부재, 목표 동작 재현 상시 제안, `LBP_CLINICIAN_ADDABLE_EXAMS`의 공유 `reasonFacts` 배열, `확인 추가` `<details>`의 open 조건 부재). 이번 델타가 어느 것도 악화시키지 않았다.
6. **`HANDOFF.md` / `DECISIONS.md`는 이번 커밋에도 없다.** Definition of Done상 PR 생성 전 필수이며, 특히 (i) item 5의 FROZEN 연결 근거와 (ii) 이전 리뷰 D항의 "Batch 2는 원장 입력을 반영해 **재계산된** safety를 치료 게이트로 쓴다"를 `DECISIONS.md`에 남길 것을 다시 권고한다.