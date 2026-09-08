# Opus closing review — LBP v1 Batch 3 fix delta (2cdbd06..bd58cb0)

- Repo: `/home/user/Samindang`, branch `claude/clinical-os-lbp-architecture-xym6po`, HEAD = `bd58cb0`
- 검토 범위: 수정 delta만 (`git diff 2cdbd06..bd58cb0`) + 현재 `computeDetailCheckDue`와 그 doc comment,
  신규 테스트, h4 heading 변경
- 저장소 파일 무변경 (`git status --porcelain` 빈 출력 확인). 뮤테이션은 scratch 복사본에서만 수행.

## Closing disposition: **FAIL**

**남은 결함 1건 (must-fix, 문서 1줄).** 코드·테스트·타입체크·FROZEN 불변식은 전부 clean이고
결함 2·3은 완전히 해결되었다. 다만 **결함 1을 고치기 위해 다시 쓴 바로 그 doc comment가,
결함 2 수정으로 새로 생긴 분기(`:294`)에 대해 코드와 정반대로 서술**한다 — 즉 "주석이 코드와
모순된다"는 결함 1의 결함 유형이 같은 주석 안에서 다른 문장으로 재발했다. 원 리뷰가 결함 1을
must-fix로 판정한 근거(신뢰 경계 방어 코드에서 주석이 사양 역할을 하고, 다음 세션이 주석을 믿고
"고치면" 테스트가 깨진다)가 그대로 적용되므로 동일 기준으로 FAIL 처리한다.

수정은 **주석 한 절(clause) 이동**이면 끝난다. 런타임 동작 변경 없음, 재테스트 부담 없음.

---

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npx tsc -b` | **exit 0** |
| `npm run test:revisit-quick-check` | **107 assertions passed** (2cdbd06 시점 106 → +2 신규/−1 대체) |
| `npm run test:workspace-round3` | **153 assertions passed** |
| `npm run test:doctor-workspace` | **227 assertions passed** |
| `git diff --stat origin/main -- src/spec index.html src/App.tsx server "tablet core"` | **빈 출력 (FROZEN zero-diff 유지)** |
| `git status --porcelain` | **빈 출력 (작업 트리 clean, 리뷰 중 저장소 무변경)** |

## 변경 파일 범위 확인 — OK

`git show --stat bd58cb0` (수정 커밋 자체):

```
 src/doctor/workspace/RevisitQuickCheckCard.tsx |  2 +-
 src/doctor/workspace/revisitQuickCheck.ts      | 25 ++++++++++++-----------
 src/doctor/workspace/workspace.css             |  2 +-
 tests/revisit-quick-check.spec.mjs             | 23 ++++++++++++++++---
 4 files changed, 36 insertions(+), 16 deletions(-)
```

`git diff --stat 2cdbd06..bd58cb0`의 5번째 파일은 중간 커밋 `ef71455`가 추가한
`docs/LBP_V1_BATCH3_OPUS_DELTA_REVIEW_v0.1.md`(+282, docs-only) 하나뿐이며 사전 고지된 예상 파일이다.
**h4 단언용 테스트 파일 변경은 없다**(아래 관찰 O-C3). 범위 밖 파일 변경 없음, 범위 밖 리팩터 없음.

---

## 결함별 판정

### 결함 1 (must-fix, doc comment ↔ 코드 불일치) — **RESOLVED WITH ISSUE**

**해결된 부분:** 원 지적 대상이던 "unreadable이면 건너뛰고 계속 찾는다"는 서술이 제거되고,
`:279-285`가 실제 동작(비문자열 `status` → 즉시 `null`, 더 오래된 plan으로 fallback 하지 않음,
이유는 "이미 대체된 plan이라 stale date를 띄울 수 있음")을 정확히 기술한다. `:300`
`if (typeof planRaw.status !== 'string') return null`과 일치한다. 이 부분은 원 지적 그대로 반영됨.

**새로 생긴 문제:** `src/doctor/workspace/revisitQuickCheck.ts:273-275`

```
 * Walk from the most recent prior visit backward. A visit whose plan is
 * absent -- `null`/`undefined`, or not an object at all -- or whose plan is
 * explicitly `UNSET` carries no information -- skip it and keep looking
```

주석은 **"객체가 아닌 plan(= not an object at all)"을 'absent'로 분류해 skip 한다**고 적었다.
그러나 결함 2 수정으로 추가된 코드는 정반대다:

```
:293   if (planRaw === null || planRaw === undefined) continue
:294   if (!isSanitizeRecord(planRaw)) return null
```

`'not-an-object'`, `42`, `[]`(배열)은 전부 `:294`에서 **즉시 `null` 반환·스캔 중단**이며,
`tests/revisit-quick-check.spec.mjs:260`이 그 동작을 단언으로 고정하고 있다
(`... a non-object (but non-null) nextReassessmentPlan halts the scan (returns null) rather than
guessing at an older plan`). 실측(P1/P8/P9)도 전부 `null`. 즉 **틀린 것은 다시 주석 쪽**이고,
하필 이번 수정이 만든 분기를 잘못 설명한다.

- 실질 위험: 런타임 0(주석). 위험은 결함 1과 동일하게 "다음 세션이 주석을 사양으로 믿는 것" —
  주석대로 `:294`를 `continue`로 되돌리면 `:260` 단언이 깨지고, 반대로 그 테스트를 주석에 맞춰
  완화하면 fail-safe(대체된 plan으로 stale due 표시 방지)가 사라진다.
- 최소 수정 (한 절 이동, 코드 무변경):
  - `:274`에서 `, or not an object at all`을 삭제 (필요하면 서버 기본값 설명으로 대체:
    ``absent -- `null`/`undefined`, the server's own default for "no plan set on this visit" --``)
  - `:279-280`의 halt 문장을 컨테이너까지 포함하도록 확장. 예:
    ``If that plan is present but unreadable -- not an object at all, or an object whose `status`
    is not a string -- or its DATE/VISIT_COUNT fields are malformed, ...``
- 기계적 재확인:
  1. `grep -n "not an object at all" src/doctor/workspace/revisitQuickCheck.ts` 의 결과 줄이
     `skip it and keep looking` 문장이 아니라 `halts immediately` / `the result is null` 문장 안에 있을 것.
  2. `npm run test:revisit-quick-check` → 107 assertions PASS 유지, `npx tsc -b` exit 0.

### 결함 2 (nice-to-have, null vs 비객체 plan 분기 분리 + 테스트) — **RESOLVED**

- 코드: `revisitQuickCheck.ts:293-294` — 원 리뷰가 제안한 분리와 동일한 형태.
- 테스트: `tests/revisit-quick-check.spec.mjs:242-260` — null-skip 케이스와 비객체-halt 케이스를
  **동일한 2-visit fixture**(앞 방문이 손상, 뒤 방문에 오늘 due인 DATE plan)로 대비시켜 추가.
  주석으로 의도(서버 기본값 `null` = 정보 없음 vs "있었는데 못 읽음" = 대체 가능성)를 명시.

지정된 재실행 (scratch 번들로 직접 호출, 저장소 무변경):

| probe | 기대 | 실측 |
|---|---|---|
| `[visit('a','not-an-object'), visit('b', DATE due today)]` | `null` | **`null`** ✔ |
| `[visit('a', null), visit('b', DATE due today)]` | due (skip 유지) | **`{reason:'DATE', planLabel:'날짜 지정 2026-09-03', sourceVisitCreatedAt:'2026-07-01…'}`** ✔ |
| `[visit('a', UNSET), visit('b', DATE due today)]` (UNSET-skip 회귀) | due | **동일 due 객체** ✔ |
| `[visit('a', undefined), …]` / plan 키 자체가 없음 | due (skip) | **due** ✔ |
| `[visit('a', {}) , …]` (plan 객체지만 status 키 없음) | due (skip) | **due** ✔ |
| `[visit('a', {status:42}), …]` | `null` | **`null`** ✔ |
| `[visit('a', 42), …]` / `[visit('a', []), …]` | `null` | **`null`** ✔ (배열도 `isSanitizeRecord` 불통과) |
| `[UNSET, UNSET, DATE due]` | due (연속 skip) | **due** ✔ |
| `[CLINICIAN_DECIDES, DATE due]` | `null` | **`null`** ✔ |
| DATE 당일/전날, VISIT_COUNT k=0·n=1 / n=2 | due/null/due/null | **전부 일치** ✔ |
| 루트 malformed 9종 (`undefined,null,'x',42,[null],[undefined],[42],['x'],{}`) | throw 없이 `null` | **전부 `null`, throw 없음** ✔ |

**신규 단언 2건 비-vacuous 검증** (scratch 복사본 뮤테이션, 저장소 무변경):

| 뮤테이션 | null-plan 단언 | 비객체-plan 단언 |
|---|---|---|
| `:294`를 `continue`로 되돌림 (수정 이전 동작) | 통과(정상) | **깨짐** ✔ |
| `:293`을 `return null`로 (null도 halt) | **깨짐** ✔ | 통과(정상) |

각 단언이 자기 분기에만 정확히 반응한다. vacuous 아님.

### 결함 3 (nice-to-have, a11y 제목 레벨 건너뛰기) — **RESOLVED**

- `src/doctor/workspace/RevisitQuickCheckCard.tsx:48` `<h5>` → `<h4>`
- `src/doctor/workspace/workspace.css:1805` `.workspace__revisit__quickCheckGroup h5` → `... h4`
  (규칙 본문 무변경 → 시각 스타일 동일)
- 검증: `grep -rn "<h5" src/doctor/` → **0건**. 카드를 `react-dom/server`로 실제 렌더한 결과
  `<h3>` 1개 + `<h4>` 5개 + `<h5>` 0개, CSS 선택자와 실제 태그가 일치. 레벨 건너뛰기 해소.

---

## 요구된 확인 항목 요약

- **doc comment가 코드의 세 동작을 정확히 서술하는가** → **아니오(부분).**
  (1) absent/UNSET → skip: 서술 O, 단 `:274`가 "비객체"까지 absent에 잘못 포함시킴 ✗
  (2) present-but-unreadable → null: `status` 비문자열에 대해서는 정확히 서술 O, **plan 컨테이너
      자체가 비객체인 경우는 정반대로 서술** ✗
  (3) 더 오래된(대체된) plan으로 fallback 하지 않음 + 그 이유: **정확히 서술 O** ✔
- **다른 파일 변경 없음** → OK (수정 커밋 4파일 + 예상된 docs 1파일)
- **FROZEN zero-diff** → OK (빈 출력)
- **4개 명령 실행** → 전부 통과 (tsc exit 0 / 107 / 153 / 227)

## `CLINICAL DECISION REQUIRED`

**없음.** 이번 수정 delta는 주석·분기 일관성·heading 레벨만 건드렸다. 임상 문장(`deriveRevisitQuickCheckGuidance`),
chip 의미, plan 라벨, 숫자·threshold, 자동 동작은 한 글자도 바뀌지 않았다
(`git diff 2cdbd06..bd58cb0`에 `:197-247`, `:331-350` 관련 변경 없음). 결함 2 수정이 바꾼 유일한
관측 가능 동작은 "plan이 비객체로 손상된 방문이 있을 때 due를 표시하지 않는다"이며, 이는 원
리뷰가 판정한 fail-safe 방향(대체된 계획을 due로 오표시하지 않음)과 같은 방향이다.

## 관찰 (조치 불요)

- **O-C1.** 주석은 "plan 객체는 있으나 `status` 키가 없는" 경우(`{}` → skip, `:295`)를 명시하지
  않는다. `"whose plan has a real (non-UNSET) status"`로 함축되긴 하나, 결함 1 수정 시 한 마디
  덧붙이면 세 갈래(skip/halt/due)가 완전히 문서화된다. 선택.
- **O-C2.** **방문 레코드 자체**가 비객체인 경우(`42`, `null`, `[]`)는 여전히 `:291`에서 `continue`라
  더 오래된 plan으로 fallback 한다(실측 확인). 결함 2가 지적한 비대칭이 한 단계 위에서는 남아
  있는 셈이다. 다만 방문 레코드 전체가 깨질 정도의 손상은 projection(`server/store.js`)이
  애초에 만들지 않는 형태이고, 원 리뷰도 이 층은 문제 삼지 않았다. 이번 batch 조치 불요.
- **O-C3.** heading 레벨을 고정하는 테스트가 **저장소 전체에 없다**(`grep -rln "<h4\|<h5" tests/` 0건).
  결함 3은 grep 1회로 확인되지만 회귀 가드는 없다. 향후 batch에서 카드 렌더 문자열에
  `<h4>` 5개/`<h5>` 0개 단언을 한 줄 추가하면 저렴하게 고정된다. 선택.
- **O-C4.** 원 리뷰의 관찰 O-1~O-7(악화 문장 귀속 모호성, 정체+운동 미처방, 메모 recap 미포함,
  `sourceVisitCreatedAt` 미표시, VISIT_COUNT의 `k` 정의, 안내 문장 전체 `role="status"`,
  `ChipGroup`의 `as T` 캐스트)은 이번 delta에서 손대지 않았고 판단도 그대로 유효하다.
  전부 조치 불요/향후 후보.

## 재-close 절차 (권고)

결함 1의 주석 한 절만 옮긴 뒤 아래 3개가 통과하면 **추가 리뷰 없이 gate 종료 가능**하다고 본다.
코드·테스트 변경이 없으므로 임상 재검토 대상도 없다.

1. `grep -n "not an object at all" src/doctor/workspace/revisitQuickCheck.ts` → halt 문장 쪽에만 존재
2. `npm run test:revisit-quick-check` → 107 assertions passed
3. `npx tsc -b` → exit 0

---

## Fable 후기 (gate 종료 근거, 2026-09-03)

위 closing의 유일한 잔여 결함(결함 1의 주석 한 절)은 Fable이 직접 수정했다
(런타임 변경 없음, `revisitQuickCheck.ts` doc comment만). Opus가 명시한
재-close 절차 3개를 실행해 전부 통과함:

1. `grep -n "not an object at all" src/doctor/workspace/revisitQuickCheck.ts`
   → halt 문장(281행) 한 곳에만 존재
2. `npm run test:revisit-quick-check` → 107 assertions passed
3. `npx tsc -b` → exit 0

Opus 판정대로 코드·테스트 변경이 없으므로 추가 임상 재검토 없이
**Batch 3 gate CLOSED**로 기록한다.
