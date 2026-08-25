# TMJ_V1 — Integration Report v1.0

작성일: 2026-08-26
브랜치: `clinical/tmj-v1-integration`
PR: #16
임상 상태: **PASS / CLINICAL DECISIONS CLOSED** (T1–T8, recommended values 그대로 승인)
통합 상태: **TMJ_V1: PASS / FROZEN**

---

## 1. Branch / commit 정보

```text
Final branch:        clinical/tmj-v1-integration
Base main SHA:        77e3bdda7598a0209f42bba7b6b29d797cf027df
Port commit (0):      5bed29c43e3dc1d1c609a1d6e5d9fa81fd4762b2  (feat(clinical): port TMJ_V1 closed engine onto current main)
Integration commit 1: 4749a352965fa39b63299cbe9b535389c66860cf  feat(tmj): wire HFJ routing and TMJ safety payload into coreSpec
Integration commit 2: 627a6e81696ba65cc5dbf5d301a22548d84929c3  feat(doctor): surface TMJ safety assessment cues in DoctorView
Integration commit 3: 4591bbc38bef1c6e79883644e2ff8ddbbd6c94f8  test(tmj): wire TMJ regression into integration/doctor suites
Final head SHA:        4591bbc38bef1c6e79883644e2ff8ddbbd6c94f8  (before this report's own commit)
```

이 리포트 자신을 포함하는 최종 commit SHA는 `git log -1`로 확정되며(리포트 작성 시점에는 자기 자신의 SHA를 알 수 없는 통상적 제약), 커밋 직후 push된 실제 SHA가 authoritative하다.

---

## 2. 기준 CLOSED 문서

- `docs/TMJ_V1_Evidence_Matrix_v0.1_HANDOFF.md`
- `docs/TMJ_V1_Clinical_Decision_Packet_v0.1.md`
- `docs/TMJ_V1_Clinical_Decisions_v1.0_CLOSED.md` — **PASS / CLINICAL DECISIONS CLOSED**, T1–T8 recommended values 승인
- `docs/TMJ_V1_Tablet_Question_Set_v0.1.md`
- `docs/TMJ_V1_Final_Verification_v1.0_CLOSED.md` — **PASS / CLINICAL DECISIONS CLOSED**
- `docs/TMJ_V1_Fable_Integration_Plan_v0.1.md` — **FABLE INTEGRATION PLAN COMPLETE / IMPLEMENTATION READY**

T1–T8 threshold는 이 통합 과정에서 재해석하거나 수정하지 않았다.

---

## 3. Ported unchanged (port commit `5bed29c`, git blob 그대로)

```text
src/spec/tmjLogic.ts
src/spec/tmjAdapter.ts (toTmjState만 -- toTmjStateFromDoctorPayload는 이번 통합에서 additive로 추가)
src/spec/tmjQuestions.ts
tests/tmj.spec.mjs
tests/tmj-malformed.spec.mjs
```

`git diff --stat 5bed29c..HEAD -- src/spec/tmjLogic.ts src/spec/tmjQuestions.ts` → 빈 출력(zero-diff). `toTmjState()` 함수 자체와 `TMJ01/TMJ02/TMJ03/TMJ04/TMJ05` allowlist Set도 무수정.

---

## 4. 이번 통합에서 신규/수정한 파일

신규:

```text
src/doctor/TmjSafetyPanel.tsx
docs/TMJ_V1_Integration_Report_v1.0.md (이 문서)
```

수정:

```text
src/spec/coreSpec.ts       (HFJ_00/TMJ_01-05 splice, STAFF_CHECK_TRIGGERS 3개,
                             primary_module_detail TMJ 분기, safety_flags.tmj,
                             modules.tmj)
src/spec/tmjAdapter.ts     (additive: toTmjStateFromDoctorPayload만 추가)
src/doctor/DoctorView.tsx  (import + render 호출 + primaryModuleFields
                             TMJ raw-field 블록만 -- 최소 변경)
src/doctor/fixtures.ts     (신규 fixture 14개)
tests/integration.spec.mjs (I1 키 목록 수정 + 신규 Q. TMJ_V1 섹션,
                             누락된 console.log(SUMMARY) 위치 수정)
tests/doctor.spec.mjs      (신규 2i. TMJ_V1 섹션)
package.json               (test:tmj 스크립트 + test:all 연결)
.gitignore                 (tmj bundle 파일 2개)
```

---

## 5. Routing 구현

새 top-level router는 만들지 않았다. `tmjQuestions.ts`가 이미 정의한 `IS_PRIMARY_HFJ_POPULATION`/`IS_PRIMARY_TMJ_SAFETY`/`TMJ_ROUTING_QUESTIONS`(`HFJ_00`)/`TMJ_QUESTIONS`(`TMJ_01`–`05`)를 그대로 재사용해 `CORE_QUESTIONS`에 splice했다.

```text
PAIN_01 == 'head_face_jaw'
  ↓
HFJ_00 (head_face_jaw_discriminator)

values: JAW_TMJ_MASTICATORY / HEADACHE_CRANIAL / FACIAL_NEURALGIC /
        DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN
```

TMJ protected safety(`TMJ_01`–`05`) 노출: `JAW_TMJ_MASTICATORY / FACIAL_NEURALGIC / DENTAL_OR_ORAL / DIFFUSE_OR_MULTIPLE / UNKNOWN`. **`HEADACHE_CRANIAL`만 제외** — Core global safety(`SAFETY_01`)는 모든 route에서 그대로 유지된다. `HFJ_00` 값 자체는 `TmjState`에 들어가지 않으며(F1류 invariant) `tmj_safety_status`를 직접 만들지 않는다.

`primary_module_detail`은 기존 KNEE/ARM_HAND/ANKLE_FOOT과 나란한 새 top-level 분기(`IS_PRIMARY_TMJ_SAFETY(r) ? 'TMJ' : ...`)로 추가했다 — 다른 population과 겹치지 않으므로 우선순위 충돌이 없다. `HEADACHE_CRANIAL` 환자는 `primary_module_detail === null`(HEADACHE_V1이 아직 없으므로 정확한 동작).

---

## 6. Payload 필드

```text
safety_flags.tmj:
  tmj_safety_status: CLEAR | REVIEW_REQUIRED | URGENT_REVIEW
  trauma_or_dislocation_assessment_required
  dental_or_oral_assessment_required
  infection_assessment_required
  gca_assessment_required
  neuro_assessment_required
  expedited_referral_consider
```

`IS_PRIMARY_TMJ_SAFETY(r)`로 게이트 — `HEADACHE_CRANIAL` 환자는 `safety_flags.tmj === null`(질문 자체를 본 적 없으므로 fail-closed REVIEW noise 대신 null이 정확). 기존 payload contract는 깨지 않았다 — 순수 additive 필드.

---

## 7. StaffCheck 연결

`TMJ_01`/`TMJ_02`/`TMJ_03` — URGENT_REVIEW가 확정될 수 있는 세 지점만 등록했다(`TMJ_04`/`TMJ_05`는 REVIEW/flag 계층). 각 트리거는 개별 조건을 손으로 재구현하지 않고 `computeTmjFlags(toTmjState(...))` 전체를 재계산해 `tmj_safety_status === 'URGENT_REVIEW'`인지만 확인한다 — 엔진과의 drift가 구조적으로 불가능하다(NECK_02/SH02/KNEE_02/ELBOW_02/WH_02/AF_02와 동일 원칙).

CLOSED urgent source 보존 확인(전부 `tests/tmj.spec.mjs`/`tests/integration.spec.mjs` Q-D1/Q-D2/Q-D3로 검증):

```text
jaw stuck open / abnormal unreduced position       -> URGENT (standalone)
severe deforming facial/jaw trauma                  -> URGENT (standalone)
uncontrolled heavy oral bleeding                     -> URGENT (standalone)
breathing/swallowing compromise                      -> URGENT (standalone)
large/spreading swelling or severe systemic illness  -> URGENT (standalone)
eye/airway/swallow compromise                        -> URGENT (standalone)
GCA-compatible pattern + visual disturbance, age>=50 -> URGENT
```

---

## 8. age modifier (T5)

`ageFromResponses(r)`(LBP_V1이 이미 쓰는 기존 authoritative 나이 계산 convention, `src/lib/age.ts`)를 그대로 재사용했다. 새 나이 계산 규칙을 만들지 않았다. DoctorView 쪽은 동일한 이유로 `ageFromDoctorPayload`(`src/spec/lbpAdapter.ts`, LBP_V1 panel이 이미 쓰는 함수)를 그대로 import해 재사용했다.

검증(`tests/integration.spec.mjs` Q-E10/Q-E11, `tests/doctor.spec.mjs` GCA fixture들):

```text
age>=50 + GCA-compatible pattern                     -> REVIEW + gca_assessment_required + expedited
age>=50 + GCA-compatible pattern + visual disturbance -> URGENT_REVIEW
age unknown + GCA-compatible pattern                  -> REVIEW + gca_assessment_required (URGENT 아님, CLOSED tmjLogic.ts 자체의 tested 동작)
```

세 번째 줄(age unknown + visual)이 URGENT로 안 가는 것은 `tmjLogic.ts`(port commit, 무수정)의 `tests/tmj.spec.mjs` 자체 테스트("GCA compatible age unknown fails closed review not urgent")가 이미 CLOSED로 검증한 동작이며, 이번 통합에서 임의로 만든 것이 아니다.

---

## 9. HEADACHE_CRANIAL exclusion 확인 (T2)

- `visibleQuestions`: `HFJ_00=HEADACHE_CRANIAL` → `TMJ_01`–`05` 전부 미노출(Q-C5 CRITICAL).
- payload: `safety_flags.tmj === null`, `primary_module_detail === null`(Q-E4/Q-E5 CRITICAL).
- DoctorView: `TmjSafetyPanel`이 렌더되지 않음("안전 확인 — 턱관절/얼굴" 문자열 자체가 HTML에 없음, doctor.spec.mjs T2 CRITICAL).
- Core global safety(`SAFETY_01`)는 `HEADACHE_CRANIAL`에서도 그대로 유지 — 별도 확인 불필요(모든 route 공통).
- 새 HEADACHE_V1 threshold를 어디에도 만들지 않았다(`HEADACHE_CRANIAL` 관련 로직은 "제외"뿐이며 별도 판정 없음).

---

## 10. DoctorView integration

`src/doctor/TmjSafetyPanel.tsx`(신규, ANKLE_FOOT_V1의 `AnkleFootSafetyPanel.tsx` 최신 관례를 그대로 따름)이 상태/6개 flag를 chip으로 표시한다. GCA/치과감염/외상 flag가 true일 때만 각각 별도 안내문("확진이 아니라 clinician-side 평가/의뢰 판단이 필요한 신호")을 추가로 렌더한다. 환자 응답만으로 객관적 ROM/교합/뇌신경/구강진찰/영상/확진을 만들지 않는다 — 이 패널은 순수 프레젠테이션이며 CLOSED flags를 그대로 다시 그릴 뿐이다.

`DoctorView.tsx` 변경은 정확히 3곳: import 1줄, render 호출 1줄, `primaryModuleFields`의 `'Pain'` case에 TMJ raw-field 블록(ELBOW/WRIST_HAND 패턴과 동일하게 `m.pain.primary_location === 'head_face_jaw'` 게이트).

---

## 11. Test matrix

### 11.1 신규/수정 test 파일별 실제 결과 (로컬 재실행 확인)

```text
npm run test:tmj                       15 passed, 0 failed  (tests/tmj.spec.mjs, 무수정 CLOSED suite)
                                         8 passed, 0 failed  (tests/tmj-malformed.spec.mjs, 무수정 CLOSED suite)
npm run test:integration              680 passed, 0 failed  (신규 Q. TMJ_V1 섹션 포함, I1 키 목록 수정)
npm run test:doctor                   474 passed, 0 failed  (신규 2i. TMJ_V1 섹션 포함, 14 fixture)
```

### 11.2 malformed regression (기존 CLOSED suite, 무수정으로 유지)

```text
empty TMJ01                -> not CLEAR
out-of-allowlist TMJ01      -> not CLEAR
mixed NONE TMJ01            -> not CLEAR
invalid TMJ02                -> not CLEAR
empty TMJ03                  -> not CLEAR
mixed UNKNOWN TMJ03          -> not CLEAR
invalid TMJ04                -> not CLEAR
invalid TMJ05                -> not CLEAR
8 malformed cases passed, 0 failed
```

추가로 `src/doctor/fixtures.ts`의 malformed fixture(`TMJ_01: ['NONE', 'BOGUS_VALUE']`)가 `tmjAdapter.ts`의 `asProtectedMulti()`를 거쳐 `undefined`로 정규화되고 `computeTmjFlags`가 최소 `REVIEW_REQUIRED`로 fail-close함을 실제 payload/DoctorView 렌더 경로로 end-to-end 확인했다(doctor.spec.mjs T8 CRITICAL).

### 11.3 전체 검증 명령/결과

```text
npx tsc -b --force                     clean, no output
npm run build                          tsc -b && vite build, 128 modules transformed, PASS
npm run test:all                       exit code 0
python -m pytest "tablet core/tests" -q   80 passed
```

`npm run test:all`이 실행하는 19개 npm script(총 22개 spec 파일) 실제 합계:

```text
test:integration            680
test:layout                   7
test:saju                    93
test:doctor                  474
test:server                  174
test:recorderResults          19
test:patient                  46
test:emrSummary               14
test:doctorToken               5
test:lbp                      46
test:neck                     81
test:shoulder                 38
test:knee                     60
test:elbow                    67
test:wrist-hand                79
test:wrist-hand-malformed       8
test:ankle-foot                22
test:ankle-foot-malformed      10
test:ankle-foot-doctor-panel    8
test:ankle-foot-doctor-integration  5
test:tmj                       15
test:tmj-malformed              8
------------------------------------
TOTAL                        1959 assertions passed, 0 failed
```

---

## 12. Frozen zero-diff verification

```text
$ git diff --stat 77e3bdd..HEAD -- \
    src/spec/lbpLogic.ts src/spec/lbpAdapter.ts \
    src/spec/neckLogic.ts src/spec/neckAdapter.ts \
    src/spec/shoulderLogic.ts src/spec/shoulderAdapter.ts \
    src/spec/kneeLogic.ts src/spec/kneeAdapter.ts \
    src/spec/elbowLogic.ts src/spec/elbowAdapter.ts \
    src/spec/wristHandLogic.ts src/spec/wristHandAdapter.ts \
    src/spec/ankleFootLogic.ts src/spec/ankleFootAdapter.ts \
    src/doctor/judgment.ts src/doctor/JudgmentPanel.tsx \
    src/doctor/AnkleFootSafetyPanel.tsx src/doctor/ankleFootFixtures.ts
(빈 출력, exit 0)

$ git diff --stat 5bed29c..HEAD -- src/spec/tmjLogic.ts src/spec/tmjQuestions.ts
(빈 출력, exit 0)
```

18개 기존 FROZEN 파일 + TMJ 엔진 파일 2개(`tmjLogic.ts`/`tmjQuestions.ts`) 전부 zero-diff. `tmjAdapter.ts`는 `toTmjState()`와 5개 allowlist `Set`을 한 글자도 바꾸지 않고 `toTmjStateFromDoctorPayload()` 함수 하나만 순수 추가했다(`git diff 5bed29c -- src/spec/tmjAdapter.ts`로 직접 확인, +23/-0).

LBP_V1/NECK_V1/SHOULDER_V1/KNEE_V1/ELBOW_V1/WRIST_HAND_V1/ANKLE_FOOT_V1의 CLOSED clinical threshold는 재개방하지 않았다.

---

## 13. GitHub CI

로컬에서 `.github/workflows/ci.yml`(`npm ci` → `npm run build` → `npm run test:all` → `pip install pytest pyyaml` → `python -m pytest "tablet core/tests" -q`, Node 22)과 정확히 동일한 단계를 그대로 재현해 전부 통과를 확인했다. 이 커밋들을 push한 뒤 GitHub Actions에서 동일 워크플로우가 실제로 성공하는지 최신 head 기준으로 재확인한다(§15 참고).

---

## 14. Known limitations

- `TMJ_V1_Tablet_Question_Set_v0.1.md` §3의 "Optional mechanical phenotype"(chewing pain, stiffness, painful click/pop, painless click, intermittent resolving lock, clenching/grinding, duration)은 이번 통합에서 실제 문항으로 구현하지 않았다 — CLOSED 문서 자체가 "may collect"(필수 아님)로 명시했고, T7 carve-out(안전 protected negative + 표현형만으로 escalation 없음)은 protected 문항만으로 이미 검증 가능하기 때문이다. 향후 phenotype 질문이 필요하면 별도 임상 검수 없이 optional 문항만 추가하는 낮은 리스크 작업이 될 것이다.
- `TmjSafetyPanel.tsx`는 clinician-entered objective field가 없다(이번 iteration 범위 아님, ELBOW/WRIST_HAND와 동일).
- exercise/치료 자동 추천 엔진은 구현하지 않았다(범위 밖, 명시적 lock만 가능하나 아직 소비자 없음).
- CI에서 이전 세션이 남긴 비차단성 유지보수 관찰(예: `openai@7.4.0` Node 버전 요구, `npm audit` 경고)은 이번 워크플로우가 이미 Node 22를 쓰고 있어 재확인 대상에서 제외했다 — TMJ_V1 자체의 blocker가 아니다.

---

## 15. Final status

```text
TMJ_V1: PASS / FROZEN
```
