# Core Reduction Phase 7 — UI Skill High-Fidelity Specification v0.1

> 수행: Sonnet (Phase 7 담당). read-only — 코드 변경 없음, 스펙 문서만 산출.
> 입력: `CORE_REDUCTION_PHASE5_SYNTHESIS_v1.0.md` (v1.2, `5c1247a`) ·
> `CORE_REDUCTION_PHASE4_UI_CONCEPT_v0.1.md` (V3 + §8 addendum) ·
> `CORE_REDUCTION_PHASE6_GATE_DELTA_v0.2.md` · `CORE_REDUCTION_PHASE3_OPUS_REVIEW_v0.1.md`
> §5 금지선 · impeccable UI Skill 공식 instruction(`8d29203` 커밋의 SKILL.md·
> reference/operate.md·typeset.md·layout.md·adapt.md·distill.md) · 현재 시각
> 어휘(`src/doctor/doctor.css`, `src/doctor/workspace/workspace.css`).
> 기능·개념 추가 없음 — Phase 5 v1.2가 확정한 구조를 구현 가능한 값으로 옮겨
> 적는다.
>
> **오케스트레이터 주석(Fable)**: §2.1 전역 nav의 "참고"는 전역 화면이 아니라
> **record-scoped**다 — 진료 화면에서 열람 중인 기록의 원본·이력·명리를 담는
> surface이며, 기록 미선택 상태의 전역 "참고"는 존재하지 않는다 (Phase 5 §2
> Surface C 정의가 우선). "설정"만 전역이다.

---

## 0. 이 스펙이 지키는 것

- Screen mode = **Operate** (impeccable SKILL.md §Modes): "방문자가 과업을
  완료한다"가 성공 기준. Scanability·일관성·plain 어휘 > 표현. Product
  UI의 실패 양식은 "밋밋함"이 아니라 "목적 없는 낯섦"이다 — 이 문서의
  모든 시각 결정은 기존 `.doctor`/`.workspace` 어휘의 확장이지 교체가
  아니다 (operate.md "The tool should disappear into the task").
- 색상 팔레트: **`:root` 변경 금지.** 신규 토큰은 기존 `.doctor { --warning:
  …; --warning-soft: …; }` 패턴처럼 `.doctor` 또는 `.workspace` 선택자
  스코프에 지역 변수로 추가한다. 기존 토큰(`--text`, `--text-muted`,
  `--border`, `--surface`, `--surface-muted`, `--bg`, `--bg-subtle`,
  `--primary`, `--primary-soft`, `--danger`, `--warning`, `--warning-soft`)
  을 우선 재사용하고, 부족한 것만 같은 명명 규칙으로 보탠다.
- 우선순위(distill.md/layout.md 원칙 적용순): **grouping → typography →
  spacing → alignment → disclosure → borders → color.** 새 상태를 표현할 때
  색을 먼저 꺼내지 않는다 — 아래 5장의 모든 상태가 "색-단독 아님"인 이유가
  이 순서다.

---

## 1. 첫 산출물 — 테스트 이름 단위 검증표 (게이트 지시, 필수)

기존 테스트 러너 관례(`describe/it` 또는 `test`, Vitest 추정 — 저장소
`npm run test:*` 스크립트와 동일 스타일)를 따른다. 파일 배치는 각 표 안의
"근거 파일"에 인접한 `*.test.tsx`로 가정한다(신설 파일명은 구현 시 결정,
이 표는 테스트 *이름과 검증 내용*의 계약이다).

### 1.1 §2.2 레인1 요약 상태 union 조건식

전제: `lane1Summary = commonBannerCondition ∪ (⋃ perRegionPanel.calcUnavailable)`.
어느 한쪽만 구현되면 안 된다(fail-open 재발 지점, 감시 리스크 1과 직결).

| # | 테스트 이름 | 검증 대상 | fixture 조건 |
|---|---|---|---|
| 1 | `test('lane1 summary shows URGENT when common danger banner fires, independent of per-region panel status')` | 공통 배너 조건이 URGENT를 단독으로 끌어올릴 수 있음 | common banner=danger, 모든 region panel=CLEAR |
| 2 | `test('lane1 summary is not CLEAR when any single region panel reports calc-unavailable, even if common banner and all other regions are CLEAR')` | per-region 계산불가 1건만으로 CLEAR 표기 금지 (§2.2 핵심 규칙) | common banner=none, region[LBP]=calc_unavailable, 나머지 region=clear |
| 3 | `test('lane1 summary appends 계산불가 — [부위명] suffix to the status chip when exactly one region is unreadable')` | 병기 표기 형식 검증 | region[NECK]=unavailable, 표기 텍스트에 "계산불가 — 목" 포함 |
| 4 | `test('lane1 summary union is not intersection: one URGENT region plus otherwise-CLEAR regions still yields URGENT, not a downgraded average')` | union(합집합) 의미론 — 교집합으로 오인 구현 방지 | region[SHOULDER]=urgent_review, 나머지=clear |
| 5 | `test('lane1 summary is computed from the same union input on a herbal-derived profile as on a pain-derived profile (fail-open regression guard)')` | **감시 리스크 1 정면 대응** — `PainWorkspace.tsx:290-304`의 안전 패널 마운트가 profile 게이트 뒤에 숨어 herbal 파생 레코드에서 통째로 사라지지 않는지 | profile=herbal, 임의 region에 urgent 조건 주입 → lane1 요약이 CLEAR/해당없음으로 새지 않고 URGENT 반영 |
| 6 | `test('lane1 summary shows 해당없음 only when zero safety-relevant region panels apply to this record')` | "해당없음"과 "계산불가"의 구분 — 안전 문진 자체가 없는 경우와 계산이 실패한 경우를 혼동하지 않음 | record에 안전 관련 부위 없음(예: 순수 CRM 재진) |
| 7 | `test('lane1 summary union recomputes on every render-time reset boundary (submission/visit change), never carrying a stale union result forward')` | union 계산이 §2.8 통합 리셋 키 경계에서 재계산됨 — cross-patient 누수와 교차 감시 | 통합 키 A→B 전환, A의 URGENT 결과가 B 마운트 직후 화면에 잔존하지 않음 |

### 1.2 §2.8 통합 리셋 키

전제: 통합 셸 리셋 키 = **`submission:<id> | visit:<visit_id>`**(fixtures:
`fixture:<session_id>`). render-time reset 경로만 사용, key-remount 금지
(DOM 이중 마운트 전례).

| # | 테스트 이름 | 검증 대상 | fixture 조건 |
|---|---|---|---|
| 1 | `test('DoctorWorkspace render-time reset clears profileOverride/mixed-tab/추가입력열림 state when unified reset key changes from one submission to another')` | 통합 키 변경 시 초기화 목록 전체 적용 | `submission:A` → `submission:B` |
| 2 | `test('DoctorWorkspace render-time reset does NOT fire when the unified reset key is unchanged across an unrelated re-render (e.g. autosave tick)')` | 불필요한 리셋(false positive) 방지 — 매 렌더 초기화되면 입력 유실 | 동일 `submission:A` 유지, workspace 필드 값 변경만 발생 |
| 3 | `test('switching between fixture scenarios changes the fixture:<session_id> key and clears all per-scenario workspace state (profileOverride, 추가입력열림, mixed-tab)')` | fixtures 모드 전환 3종 실측 중 하나 | `fixture:s1` → `fixture:s2` |
| 4 | `test('RevisitWorkspace performs its full reset exactly once, driven solely by the unified key transitioning from submission:<id> to visit:<visit_id>')` | submission↔visit 전환 = 키 변경 = 전량 리셋, 통합 경로 하나로 수렴 | `submission:A` → `visit:V1` |
| 5 | `test('DoctorWorkspace reset is implemented via render-time comparison, not via a React key prop remount, on every unified-key transition (no double-mount observed in the DOM)')` | key-remount 금지 규칙 — DOM 이중 마운트 전례 재발 방지 | 통합 키 변경 전/후 mount 콜백 호출 횟수 = 1 (2 아님) |
| 6 | `test('ErrorBoundary key (DoctorRecordErrorBoundary, keyed on selectedRecord.id / fixtures composite) does not retain a caught error across a visit change even though its own key differs from the unified reset key')` | ErrorBoundary key가 통합 키로 교체된 뒤에도(§2.8 표) cross-visit 에러 누수가 없는지 | region panel에서 에러 throw → `visit:V1`→`visit:V2` 전환 → 에러 배너가 V2에 남지 않음 |
| 7 | `test('MedicationCourseSection key remains {patient_id} unchanged across a visit switch for the same patient, and does not remount when the unified reset key changes but patient_id does not')` | §2.8 표의 "그대로" 행 — 통합 키 도입이 무관한 장치를 건드리지 않는지 | 동일 `patient_id`, `visit:V1`→`visit:V2` |
| 8 | `test('switching to a different patient entirely changes both the unified reset key and MedicationCourse key={patient_id}, and no medication course data from the previous patient is visible')` | 환자 전환 3종 실측 중 하나 — cross-patient 누수 직접 검증 | patient P1 → patient P2 |
| 9 | `test('JudgmentPanel no longer owns an independent key={session_id}; its reset now follows the unified reset key transition (no dual-key drift)')` | JudgmentPanel key 해체 후 통합 키 단독 책임 (§2.8 표 2번째 행) | `submission:A`→`submission:B`에서 JudgmentPanel 내부 상태도 함께 초기화 |

### 1.3 §2.10 자동 펼침 절대 규칙

전제: 모든 HIDE/disclosure 항목은 `open={내용 있음}` 조건 — 또는 "기록 있음
n" 같은 동등 이상의 상시 가시 표식 — 과 반드시 짝을 이룬다(delta C-4).

| # | 항목 | 테스트 이름 | fixture 조건 |
|---|---|---|---|
| 1 | 발급 "다른 방법"/재발급/무효화 | `test('발급 다른 방법 details auto-opens when activeSession is true')` | `activeSession=true` |
| 2 | 〃 | `test('발급 다른 방법 details auto-opens when an unconsumedToken exists even with no activeSession')` | `activeSession=false, unconsumedToken=true` |
| 3 | 〃 | `test('발급 다른 방법 details stays collapsed by default when neither activeSession nor unconsumedToken is present')` | 둘 다 false — 기본 경로 클릭 증가 0 검증 |
| 4 | 판단·처치 반대편 필드 세트(§2.4) | `test('반대편 유형 입력 세트(+다른 유형 입력 추가) auto-opens when the opposite field set already holds a saved value on a pain-derived record')` | profile=pain, herbal 필드에 저장값 존재 |
| 5 | 〃 | `test('반대편 유형 입력 세트 stays collapsed when the opposite field set has no saved value, even after the toggle has been clicked once and closed')` | 저장값 없음, 접근 불가 0을 클릭 1회로 검증 |
| 6 | 관리 계획·다음 재평가 disclosure | `test('관리 계획 disclosure opens when isCarePlanEmpty is false OR plan.status !== UNSET (현행 계승)')` | `isCarePlanEmpty=false` 단독, 그리고 별도 케이스로 `plan.status='ACTIVE', isCarePlanEmpty=true` |
| 7 | 오늘 재검 목록 | `test('오늘 재검 목록 renders open when items.length > 0 and collapsed/absent when items.length === 0 (현행 계승)')` | `items=[]` vs `items=[x]` |
| 8 | MicroFollowUp 상세 | `test('MicroFollowUp 상세 opens exactly when needsAttention is true, matching the existing microFollowUpNeedsAttention() gate')` | `MicroFollowUpCard.tsx:33`의 `open={needsAttention}` 회귀 고정 |
| 9 | 투약 코스 | `test('투약 코스 details open when courses.length > 0 (현행 계승)')` | `courses=[]` vs `courses=[c1]` |
| 10 | 재활 제안/병기 후보 disclosure | `test('재활 제안·병기 후보 disclosure opens when candidate items exist, stays collapsed when the candidate list is empty')` | `candidates=[]` vs 비어있지 않음 |
| 11 | 참고 내 각 아코디언 | `test('참고 아코디언 shows a "기록 있음 n" badge (n = saved-value count) as the always-visible disclosure signal, per group, instead of a bare collapsed label')` | 그룹당 저장값 0개/1개/3개 3가지 |
| 12 | 메시징 attempt/error 상세 | `test('메시징 상세 auto-opens when the last send attempt is in a failed state, and stays collapsed after a successful send')` | `attempt.status='failed'` vs `'sent'` |
| 13 | ConflictBanner | `test('ConflictBanner itself renders with no collapse control (always unfolded) whenever a stale-write conflict is detected')` | conflict=true |
| 14 | 〃 | `test('ConflictBanner draft content stays behind an explicit 복사 button rather than an auto-expanding accordion')` | conflict=true, draft 텍스트 존재 |
| 15 | 학습 케이스 disclosure(row 81) | `test('학습 케이스 disclosure opens exactly when judgment.learning_case === true, and remains collapsed for all other judgment records')` | `learning_case=true` vs `false`/`undefined` |
| 16 | 신규 disclosure 전수 커버리지 | `test('every disclosure element introduced by Phase 5 v1.2 (§2.4 opposite-type toggle, §2.7 다른 방법, §2.10 학습 케이스 row) has a corresponding open-condition test in this suite (no orphaned <details> without an open={} assertion)')` | 정적 목록 대조 — 신규 disclosure 5개 전수 |
| 17 | 좌측 요약 절단선 아래 안전정보 누락 감시(delta C-2, 감시 리스크 3과 결합) | `test('the left-column truncation rule (최대 2개 부위 + 외 N, 계산불가 칩 접미) never causes a URGENT-severity region to be omitted from the truncated 2-slot list — an urgent region always occupies one of the visible slots even when 3+ regions are affected')` | region 3개(URGENT 1 + CLEAR 2), 절단 후 보이는 2슬롯 중 URGENT가 반드시 포함 |

### 1.4 감시 리스크 3종 × 최소 3개 커버리지 확인

| 감시 리스크 (Phase 6 delta) | 커버하는 테스트 (최소 3개, 위 표에서 재인용) |
|---|---|
| **① fail-open 재발** | §2.2-#2 (per-region 계산불가 단독으로 CLEAR 차단) · §2.2-#5 (herbal 파생에서도 동일 union 입력, `PainWorkspace.tsx:290-304` 재발 지점 직결) · §2.2-#4 (union≠intersection) · §2.2-#7 (리셋 경계에서도 재계산) |
| **② 통합 리셋 키 cross-patient 누수** | §2.8-#5 (render-time reset만 사용, key-remount 금지 — DOM 이중 마운트 감시) · §2.8-#4 (submission↔visit 전환 실측) · §2.8-#3 (fixtures 전환 실측) · §2.8-#8 (환자 전환 실측) · §2.8-#6 (ErrorBoundary key 교체 후에도 누수 없음) |
| **③ 자동 펼침 조건식 누락** | §2.10-#16 (신규 disclosure 5개 전수 커버리지 정적 대조) · §2.10-#3/#5 (기본 경로에서 의도치 않게 열리지 않음 — 반대 방향 누락도 감시) · §2.10-#17 (C-2 절단 규칙과 결합해 절단선 아래로 안전정보가 내려가지 않는지) |

---

## 2. Screen hierarchy — DOM 구획과 순서

원장이 배우는 화면 개념은 4개(오늘 / 진료 / 참고 / 설정) — Phase 5 §1의
7개 mental-model 개념(오늘/환자/확인/판단·처치/다음/참고/설정) 중
환자·확인·판단·처치·다음은 "진료" 한 화면 안의 4개 우측 레인으로 접힌다.

### 2.1 전역 크롬 (4 화면 공통)

```html
<header class="doctor__globalNav" role="banner">
  <nav aria-label="주 화면 전환">오늘 · 참고 · 설정</nav>
  <!-- 검색(오늘 화면 한정 노출)은 오늘 진입 시 이 nav 오른쪽에 인라인 배치 -->
</header>
<!-- 화면별 <main> 아래 이어짐 -->
```

### 2.2 오늘(Queue) — DOM 순서

```html
<main aria-labelledby="today-h1">
  <h1 id="today-h1">오늘</h1>
  <section aria-label="대기 목록">
    <!-- 정렬: URGENT → 오늘 예정 → 신규 → 나머지. 완료는 별도 아코디언 -->
    <ul class="doctor__queueList">
      <li class="doctor__queueRow" data-badge="urgent|review_required|clear|no_calc">
        <!-- 배지(4값) · 이름 · chart_no · 방문유형 배지(초진/재진/CRM) -->
        <!-- 조건부 2번째 줄: needs_attention 마커 -->
        <!-- 조건부 2번째 줄(대체 아님, 병기): stale 표식 -->
      </li>
      <!-- 미해소 identity 행: 배지 자리에 "⚪ 신원 확인 필요", 숨기지 않음 -->
    </ul>
  </section>
  <details class="doctor__queueDone"><summary>완료 (N건)</summary>…</details>
</main>
```

### 2.3 진료 — DOM 순서 (V3 셸의 핵심)

```html
<div class="doctor__visitShell">
  <aside class="doctor__visitSummary" aria-label="환자 요약">
    <!-- ①신원 ②주호소·기간 ③지난 대비 ④레인1 안전 결론 요약 ⑤저장 상태 -->
    <!-- 자체 스크롤 금지. DOM 순서 = 시각 순서, 탭 순서의 시작점 -->
  </aside>
  <main class="doctor__visitWork" aria-label="진료 작업">
    <!-- 우측 작업 열: 카드 프레임 없는 연속 섹션 + divider -->
    <section class="doctor__visitLane doctor__visitLane--lane1" aria-labelledby="lane1-h2">
      <h2 id="lane1-h2">안전 확인</h2>
      <!-- 배너 원문·계산불가 메타경고·부위별 칩·잠금 문구·권장검사 목록
           — 접힘 컨트롤 없음, 항상 렌더 -->
    </section>
    <section class="doctor__visitLane doctor__visitLane--lane2" aria-labelledby="lane2-h2">
      <h2 id="lane2-h2">확인</h2>
      <!-- 최상단 고정 1줄: 지난번 추적 -->
      <!-- 진찰소견(4상태) · 오늘 재검(4상태) · 모순 없음 · 권장검사(4상태) -->
    </section>
    <section class="doctor__visitLane doctor__visitLane--judgment" aria-labelledby="judgment-h2">
      <h2 id="judgment-h2">판단·처치</h2>
      <!-- 파생 프로필 필드셋(pain|herbal|양쪽) + "+ 다른 유형 입력 추가" -->
    </section>
    <section class="doctor__visitLane doctor__visitLane--next" aria-labelledby="next-h2">
      <h2 id="next-h2">다음</h2>
      <!-- NextActionCard 3줄 · 재평가대상/다음방문확인메모 나란히 ·
           발급(상시) + 다른 방법(details) · 메시징 · 종결(EMR검토+완료) -->
    </section>
  </main>
</div>
```

DOM 순서는 곧 탭 순서(10장)이자 시각 순서 — `aside`가 `main`보다 마크업상
먼저 온다. 우측 레인 4개의 순서는 **레인1 전문 → 레인2 → 판단·처치 →
다음/종결**로 고정(§2.1 확정).

### 2.4 참고 — DOM 순서

```html
<main aria-labelledby="ref-h1">
  <h1 id="ref-h1">참고</h1>
  <!-- 아코디언 목록: JSON 원문 · 이전 방문 원문 · 명리 · audit · 미리보기 ·
       station · token · fixture — 각각 "기록 있음 n" 배지, 기본 접힘 -->
</main>
```

### 2.5 설정 — DOM 순서

```html
<main aria-labelledby="settings-h1">
  <h1 id="settings-h1">설정</h1>
  <!-- workstation 배정 · token 관리 · fixture 선택 — 기존 컴포넌트 이동만,
       신규 구조 없음 -->
</main>
```

---

## 3. Grid / Spacing

### 3.1 뷰포트별 컬럼 폭 · gutter (진료 화면 `.doctor__visitShell` 한정 — 오늘
/참고/설정은 기존 `.doctor { max-width: 1080px }` 단일 컬럼 유지, 이 표는
`.doctor__visitShell`에서만 그 1080px 캡을 대체한다)

| 뷰포트 | 레이아웃 | 좌측 열(`aside`) 폭 | gutter | 컨테이너 좌우 padding | 우측 열 실질 폭 | 근거 |
|---|---|---|---|---|---|---|
| 1440 (min-width:1440px) | 2열 | 340px | 40px | 48px | `min(우측 flex-basis, 960px)`, 남는 공간은 `.doctor__visitShell` 좌우 auto-margin으로 중앙정렬 | Phase4 §5 단점("1440+ 초광폭 좌측 여백") — 남는 폭은 좌측 열을 늘리지 않고 컨테이너 중앙정렬로 흡수 |
| 1280 (min-width:1280px, max-width:1439px) | 2열 | 300px | 32px | 32px | fluid (남는 폭 전부) | 1024→1440 사이 선형 보간, 이 스펙에서 확정 |
| 1024 (min-width:1024px, max-width:1279px, 또는 orientation:landscape) | 2열 | 260px | 24px | 24px | ≈ 700px (1024 − 24×2 − 260 − 24) | Phase4 §8.1 "우측 열 폭 ≈ 700px 기준" 역산과 일치 |
| 834 portrait (max-width:1023px and orientation:portrait) | 1열 + 상단 스티키 | 해당 없음(좌측 열이 상단 바로 전환) | — | 16px | 100% (스티키 바 아래 전부) | Phase4 §2.1 "834 portrait 상단 스티키 ~96px" |

```css
.doctor__visitShell {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  padding: 0 24px;
}
@media (min-width: 1280px) {
  .doctor__visitShell { gap: 32px; padding: 0 32px; }
}
@media (min-width: 1440px) {
  .doctor__visitShell { gap: 40px; padding: 0 48px; max-width: 1440px; margin: 0 auto; }
}
.doctor__visitSummary { flex: 0 0 260px; }
@media (min-width: 1280px) { .doctor__visitSummary { flex-basis: 300px; } }
@media (min-width: 1440px) { .doctor__visitSummary { flex-basis: 340px; } }
.doctor__visitWork { flex: 1 1 auto; min-width: 0; }

@media (max-width: 1023px) and (orientation: portrait) {
  .doctor__visitShell { flex-direction: column; gap: 0; padding: 0 16px; }
  .doctor__visitSummary {
    flex-basis: auto;
    position: sticky; top: 0; z-index: 10;
    max-height: 96px; overflow: hidden;
    background: var(--bg);
  }
}
```

`orientation:landscape`와 `min-width:834px`가 겹치는 태블릿 가로모드는
1024 행의 2열 규칙을 그대로 따른다(834는 세로일 때만 전환 대상).

### 3.2 좌측 요약 세로 예산 (Phase4 §8.1/§8.1a — 200px/96px 상한, delta C-2
절단 규칙의 CSS화)

5블록 고정 스택, 블록 사이 여백은 각 블록 높이에 이미 포함(별도 gap 없음
— 아래 수치의 합이 정확히 상한과 같다):

| 블록 | max-height | 내용 | 절단 규칙 |
|---|---|---|---|
| ①신원 | 60px | 이름(줄1) · chart_no·성별/나이(줄2) | 자르지 않음(3줄 고정 포맷) |
| ②주호소·기간 | 40px | 주호소명(줄1) · 기간(줄2, muted) | 자르지 않음 |
| ③지난 대비 | 24px | MicroFollowUp 인용 1줄 | `text-overflow: ellipsis` 1줄 |
| ④레인1 안전 결론 요약 | 56px | 상태 칩(계산불가 접미 포함) · 🔒 여부 · 관련 부위 명단(최대 2+`외 N`) · `근거 보기` 앵커 | 부위 명단 **최대 2개 + `외 N`**(3번째부터), 초과분은 우측 열 전문이 책임 |
| ⑤저장 상태 | 20px | 저장 상태 텍스트, `kind==='auth'`일 때 인라인 액션으로 **대체**(증설 아님) | 1줄 고정 |
| **합계** | **200px** | 834 portrait는 ①+④를 1줄씩 압축해 **96px**(줄1: 이름·chart_no·주호소 인라인 / 줄2: 안전 칩+저장 상태 인라인) | — |

```css
.doctor__visitSummary { display: flex; flex-direction: column; }
.doctor__visitSummary__identity { max-height: 60px; overflow: hidden; }
.doctor__visitSummary__chief { max-height: 40px; overflow: hidden; }
.doctor__visitSummary__delta { max-height: 24px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doctor__visitSummary__lane1 { max-height: 56px; overflow: hidden; }
.doctor__visitSummary__save { max-height: 20px; overflow: hidden; }
```

`overflow:hidden`은 규칙 위반 시의 안전망이지 절단 메커니즘 자체가 아니다
— 실제 절단(최대 2개+외N, 계산불가 접미)은 렌더링 로직에서 값 단위로
수행되어야 한다(1.3 §2.10-#17 테스트가 이를 고정한다).

### 3.3 세로 리듬 스케일 (우측 작업 열)

4-unit 베이스(layout.md 권고)의 기하 스케일: **4 · 8 · 12 · 16 · 24 · 32 ·
48px.** 용도:

| 값 | 용도 |
|---|---|
| 4px | 칩 내부 아이콘-텍스트 간격, 배지 내부 여백 |
| 8px | 같은 필드 내부 라벨-값 간격 |
| 12px | 같은 그룹 내 인접 필드 간 간격 |
| 16px | 그룹(예: exam card 내부 status row) 간 간격 |
| 24px | 레인 내부 섹션 제목-본문 간격, divider 위아래 여백 |
| 32px | 레인 사이(§4 divider) 간격 |
| 48px | 레인1(안전 확인) 최상단 여백 — 페이지 진입 시 첫 시선이 닿는 지점의 여유 |

---

## 4. Typography

Operate 모드 규칙(typeset.md) 적용: **단일 패밀리**(기존 `'Pretendard',
'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif` 유지, 신규
패밀리 도입 없음) · **고정 px 스케일**(fluid/clamp 금지, 태블릿 거치대는
일정 DPI 전제) · **좁은 스케일 비율**(1.1~1.2, 기존 코드의 10/12/13/14/15
/16/18/22/24px 계단과 정합).

| 역할 | size | weight | color | letter-spacing | 근거/재사용 |
|---|---|---|---|---|---|
| 신원(이름) | 16px | 700 | `var(--text)` | normal | 기존 `.doctor__title`(24px)보다 한 단계 낮음 — 신원은 화면 제목이 아니라 컨텍스트이므로 |
| 신원 부가(chart_no·성별/나이) | 12px | 500 | `var(--text-muted)` | normal | `.doctorField__label` 재사용 |
| 주호소 | 15px | 700 | `var(--text)` | normal | `.doctor__chiefPrimary__value`(22px)보다 낮춤 — 좌측 열 예산(§3.2) 준수 |
| 주호소 기간(메타) | 12px | 500 | `var(--text-muted)` | normal | |
| "지난 대비"(환자 보고 인용) | 13px | 500, *italic* | `var(--text-muted)`, 배경 `var(--primary-soft)` | normal | PATIENT_FACT 스타일 — 원장 PLAN 입력 필드와 색·형태 분리(Phase4 §2 절대 제약 4) |
| 상태 칩 텍스트(5값/4값/4상태) | 13px | 700 | 상태별(5장) | 0.01em | `.doctor__safetyChip`(13px) 재사용 |
| 섹션 제목(레인 h2) | 15px | 700 | `var(--primary)` | 0.03em, uppercase 금지(한글) | `.doctor__section h2` 그대로 승계(단, 한글은 text-transform 미적용) |
| 섹션 부제(h3, 부위/그룹) | 13px | 700 | `var(--text)` | normal | `.workspace__block h3` 계열 |
| 데이터 라벨 | 12px | 600 | `var(--text-muted)` | normal | `.judgment__label` 재사용 |
| 데이터 값 | 14px | 500 | `var(--text)` | normal | `.doctorField__value` 재사용 |
| 메타(저장 상태·provenance·타임스탬프) | 12px | 700(저장 상태)/500(provenance) | `var(--text-muted)`, 상태별 override | normal | `.workspace__saveStatus`(12px/700) 재사용 |

라인하이트: 좌측 요약 블록은 `line-height: 1.3`(밀도 우선, §3.2 상한 준수),
우측 작업 열 본문은 `line-height: 1.5`(기존 `.doctor` 기본값 유지).

---

## 5. Card / Divider 원칙

### 5.1 규칙

- **우측 작업 열(레인1 전문 → 레인2 → 판단·처치 → 다음)**: 카드 프레임
  없음. 섹션 경계는 `border-top: 1px solid var(--border)` divider +
  `padding-top: 24px`만 사용 — 기존 `.doctor__section` 패턴을 그대로
  재사용(신규 클래스 불필요, `.doctor__visitLane`이 이 규칙을 상속).
- **좌측 요약 열(`aside`)**: 통째로 **하나의** 외곽 카드(테두리 또는
  배경 구분)만 허용 — 5블록은 그 안에서 divider 없이 이어지는 plain
  stack(내부에 카드 중첩 금지, distill.md "never nest cards inside
  cards"). `border: 1px solid var(--border); border-radius: 10px; padding:
  12px 16px; background: var(--surface);`
- **카드 허용 대상(반복되는 동등 항목에 한정)**: 부위별 exam 항목
  (`.workspace__examCard`), 후보 진단 카드(`.workspace__candidateCard`),
  투약 코스 카드(`.medCourse__card`), 명리 3열 비교(`.judgment__reviewCol`),
  사주 기둥(`.doctor__pillar`) — 전부 "여러 개가 나열되며 서로 동등한
  단위"라는 공통점이 있다. 이 목록 밖의 신규 UI에 카드를 새로 만들지
  않는다.
- **배너**(위험신호·계산불가 메타경고·ConflictBanner)는 카드가 아니라
  7장에서 정의하는 별도 시각 등급을 쓴다 — 이미 `.doctor__banner*`가
  이 역할이다.

### 5.2 판단 기준

새 UI 조각을 만들 때: "이 항목이 여러 개 나열되며 서로 바꿔써도 구조가
같은가?" → 그렇다면 카드. "이 항목이 화면에 한 번만 있고 흐름의 한
단계인가?" → divider 섹션.

---

## 6. State hierarchy — 3중 인코딩 (색-단독 금지)

모든 상태는 **색 + 아이콘/글리프 + 형태(테두리 굵기·배경 채움 여부·
기울임 등)** 세 축을 동시에 바꾼다. 같은 위험도 계열(URGENT/확인 필요)도
글리프 모양 자체가 달라야 한다(원 vs 세모).

### 6.1 레인1 요약 상태 5값

| 상태 | 글리프 | 색 | 테두리/배경 | 텍스트 weight |
|---|---|---|---|---|
| URGENT | 🔴(채워진 원) | `var(--danger)` | `2px solid var(--danger)`, 배경 `#f6ece9` | 700 |
| 확인 필요 | 🟡▲(세모, 원과 형태 구분) | `var(--warning)` | `1px solid var(--warning)`, 배경 `var(--warning-soft)` | 700 |
| 계산불가 | ▦(사선 해치, Queue와 동일 글리프 계열) | `var(--text-muted)` | `1px dashed var(--text-muted)`, 배경 없음(투명) | 600, *italic* |
| CLEAR | 🟢(채워진 원, URGENT와 색으로만 겹치지 않도록 채도 낮은 초록) | `#2e7d4f`(신규 로컬 토큰 `--safe`, `.doctor` 스코프에 추가) | `1px solid var(--safe)` | 500 |
| 해당없음 | ○(빈 원, 채움 없음) | `var(--text-muted)` | `1px solid var(--border)` | 400, *italic* |

### 6.2 Queue 배지 4값

| 배지 | 글리프 | 색 | 형태 |
|---|---|---|---|
| 🔴 URGENT | 채워진 원 | `var(--danger)` | 6.1과 동일 |
| 🟡 확인 필요 | 세모 | `var(--warning)` | 6.1과 동일 |
| 🟢 CLEAR | 채워진 원(저채도 초록) | `--safe` | 6.1과 동일 |
| ▦ 안전 계산 없음 | 사선 해치 정사각형 | `var(--text-muted)` | `repeating-linear-gradient(135deg, var(--surface-muted) 0 4px, var(--border) 4px 8px)` 배경으로 실제 "사선" 텍스처 구현 — CLEAR의 단색 배경과 확실히 다른 재질로 구분 |

### 6.3 4상태 입력(POSITIVE/NEGATIVE/UNCLEAR/아직)

`.workspace__statusBtn` 계열 확장. 색만으로 구분하지 않도록 각 상태에
접두 글리프를 텍스트에 포함(버튼 라벨 자체가 "양성"이 아니라 "✓ 양성"):

| 상태 | 글리프 | 색(활성 시) | 활성 배경 |
|---|---|---|---|
| POSITIVE | ✓ | `var(--primary)` | `var(--primary-soft)`(기존 `.workspace__statusBtn--active`) |
| NEGATIVE | – | `var(--text)` | `var(--surface-muted)`(신규, 위험도 아닌 중립) |
| UNCLEAR | ? | `var(--warning)` | `var(--warning-soft)` |
| 아직(UNSET) | · | `var(--text-muted)` | 배경 없음(기본 미선택 상태, 기존 `.workspace__statusBtn` 비활성 그대로) |

### 6.4 needs_attention 마커

`⚠ 추가 확인 필요` — 세모 느낌표 글리프지만 **URGENT/확인필요와 다른
색**(임상 중증도가 아니라 PATIENT_FACT 표시이므로): outline 칩,
`border: 1px solid var(--warning); background: transparent; color:
var(--warning); font-weight: 700;` — 확인 필요(6.1/6.2)의 *채워진* 배경과
달리 항상 outline만 사용해 "임상 판정"과 "환자 보고 사실"을 형태로도
분리한다.

---

## 7. Warning / Button hierarchy

### 7.1 경고 등급 (위험신호 배너 > 계산불가 > 잠금 > stale/conflict > 일반)

| 등급 | 배치 | 시각 |
|---|---|---|
| 1. 위험신호 배너 | 레인1 전문 최상단, 비접힘 | `.doctor__banner--danger` 그대로(2px danger 테두리, `#f6ece9` 배경), 해소 전까지 사라지지 않음 |
| 2. 계산불가 메타경고 | 레인1 전문 내, 배너 바로 아래 | 신규 `.doctor__calcUnavailable`: `border: 1px dashed var(--text-muted); background: var(--surface-muted); font-weight: 700;` — 배너보다는 옅지만 3번(잠금)보다 굵은 테두리로 우위 확보 |
| 3. 잠금(🔒) | 레인1 전문 각 부위 블록 내 인라인 문구 | 별도 박스 없음, `🔒` 글리프 + `font-weight: 600; color: var(--text-muted);` — 자체 배너를 갖지 않아 2번보다 시각적으로 조용함 |
| 4. stale/conflict | 레인 밖, 화면 상단(ConflictBanner) | `.doctor__banner--warning` 그대로(amber, 이미 구현됨) |
| 5. 일반 | 각 필드 인라인 | 배경/테두리 없음, `color: var(--text-muted)` plain text |

### 7.2 버튼 위계

| 종류 | 예시 | 스타일 |
|---|---|---|
| Primary(기록/완료) | 판단 기록, 종결 완료 | 채움: `background: var(--primary); color: #fff; font-weight: 700; border: none;` — 기존 `.judgment__recordBtn` 그대로 |
| Secondary | 취소, 다시 시도, 초안 복사 | outline: `background: transparent; border: 1px solid var(--border); color: var(--text);` — 기존 `.doctor__todayQueue__linkCancel` 계열 |
| 파괴적(무효화·재발급) | 세션 무효화 | **1단계**: outline `border: 1px solid var(--danger); color: var(--danger); background: transparent;` — **채움 금지**(실수 클릭 방지). 확인 단계(2단계, 클릭 후 인라인 확인 문구+최종 버튼)에서만 `background: var(--danger); color: #fff;`로 채운다 |

---

## 8. Tablet responsive

### 8.1 브레이크포인트 (§3.1과 동일 정의, 여기선 전환 규칙만)

- **≥1024px, 임의 orientation** 또는 **≥834px && orientation:landscape**:
  2열 유지, 좌측 열 폭은 §3.1 표.
- **≤1023px && orientation:portrait**: 좌측 열 → 상단 스티키 바(96px,
  `position: sticky; top: 0;`)로 전환. 이 화면(진료)의 스티키 바가
  `.doctor__header`의 기존 전역 스티키(오늘/참고/설정 화면용, z-index:10)를
  **대체**한다 — 두 스티키가 동시에 쌓이지 않도록 진료 화면은
  `.doctor__visitSummary--sticky`만 노출하고 `.doctor__header`는 진료
  화면 진입 시 렌더하지 않는다(중복 sticky 스택 금지).
- 회전(orientation change) 시 즉시 두 레이아웃 사이를 미디어쿼리로
  전환(JS 리렌더 불필요, 순수 CSS).

### 8.2 터치 타겟

`.doctor__visitShell` 내부의 모든 인터랙티브 요소(버튼·칩·상태 버튼·탭):

```css
.doctor__visitShell button,
.doctor__visitShell [role="button"],
.doctor__visitShell .workspace__statusBtn,
.doctor__visitShell .workspace__lateralityBtn,
.doctor__visitShell .workspace__followUpChip {
  min-height: 44px;
}
@media (max-width: 1023px) {
  .doctor__visitShell button,
  .doctor__visitShell [role="button"],
  .doctor__visitShell .workspace__statusBtn,
  .doctor__visitShell .workspace__lateralityBtn,
  .doctor__visitShell .workspace__followUpChip {
    min-height: 48px;
  }
}
```

44px(≥1024, 마우스 겸용 데스크톱)/48px(≤1023, 터치 우선) — adapt.md
"screen size does not tell you input method"를 폭 기준으로 근사하되,
1024가 이미 문서에서 "태블릿 거치대 landscape" 기준점이므로 그 아래
전부를 터치 최우선으로 취급한다. 이 규칙은 `.doctor__visitShell` 신규
범위에만 적용되며 기존 `.workspace__statusBtn`(36px) 등 이미 배포된
다른 화면의 크기는 건드리지 않는다(unrelated code 수정 금지).

---

## 9. Empty / Error / Stale / Conflict states

| 상황 | 표현 |
|---|---|
| Queue 빈 상태 | "오늘 예정된 문진이 없습니다." + 참고/설정으로의 안내 링크(빈 화면이 곧 다음 행동을 가르침, operate.md 빈 상태 원칙) — 아이콘 없이 plain text, `color: var(--text-muted)` |
| Queue 소스 폴링 실패 | 해당 소스 그룹 행을 **유지**하고 `⟳ 갱신 실패 · 마지막 확인 HH:MM` + `다시 시도` 버튼을 행 안에 상시 표기(§2.3 (b)안). 배지 자리는 회색 `⟳`로 대체, 기존 배지 4값과 겹치지 않는 5번째 시각(단, 이것은 상태값이 아니라 "배지를 못 그렸다"는 메타이므로 6.2의 4값에 포함하지 않는다) |
| 진료 화면 로딩 스켈레톤 | `.doctor__visitSummary`/`.doctor__visitWork` 자리에 §3.2/§3.3 치수와 동일한 회색 펄스 블록(`background: var(--surface-muted); animation: pulse 1.5s ease-in-out infinite;`) — 본문 중앙 스피너 금지(operate.md) |
| ConflictBanner | `.doctor__banner--warning`, 비접힘 고정, 초안은 "복사" 버튼으로만 노출(9.1의 §2.10-#13/#14와 동일 규칙) |
| auth 만료 인라인 액션(§2.9) | 좌측 열 ⑤저장 상태 블록을 `인증 만료 — [토큰 다시 입력]`으로 **대체**(줄 추가 아님, §3.2 절단 규칙 준수). 클릭 시 진료 화면 이탈 없이 인라인 토큰 재입력 폼으로 그 자리에서 전환 |

---

## 10. Accessibility

### 10.1 랜드마크 / heading 구조

- 전역: `<header role="banner">`(주 nav) — 4화면 공통.
- 진료 화면: `<aside aria-label="환자 요약">`(좌측 열, complementary
  랜드마크) + `<main aria-label="진료 작업">`(우측 열). 오늘/참고/설정은
  `<main>` 하나.
- Heading: `h1` = 화면 제목(오늘/진료/참고/설정, 화면당 1개) → `h2` =
  진료 화면의 4개 레인 제목(안전 확인/확인/판단·처치/다음), 참고 화면의
  각 아코디언 그룹 제목 → `h3` = 레인 내부 하위 그룹(부위별 안전 패널,
  exam 그룹, 후보 카드 그룹).

### 10.2 탭 순서

DOM 순서(2.3)가 곧 탭 순서 — `aside`가 마크업상 `main`보다 먼저 오므로
포지티브 `tabindex` 없이 자연스럽게 "좌측 열 → 우측 열 위→아래"가
성립한다. 좌측 열의 인터랙티브 요소는 `근거 보기` 앵커와(있다면) auth
재입력 액션뿐 — 둘 다 아래로 스크롤 없이 탭 1~2회 안에 닿는다.

### 10.3 aria-live

| 대상 | 속성 | 근거 |
|---|---|---|
| 저장 상태(`.doctor__visitSummary__save`) | `aria-live="polite"` | 방해 없이 배경 알림 — 기존 `.workspace__saveStatus`의 `data-status` 패턴에 속성만 추가 |
| 레인1 안전 상태 칩(`.doctor__visitSummary__lane1`) | 상태가 URGENT로 전이될 때 `role="alert"`(assertive) 컨테이너로 렌더, 그 외 전이는 `aria-live="polite"` | 안전 배지 변화는 우선순위가 다르다 — URGENT만 인터럽트, 나머지는 polite. 최초 마운트 시에는 두 경우 모두 발화하지 않도록 값이 채워진 뒤에만 live region을 활성화(초기 렌더 소음 방지) |

### 10.4 색 대비

모든 신규 상태색(6장)은 WCAG AA 기준: 텍스트 4.5:1, 아이콘/큰 텍스트
3:1 이상. 6.2의 해치 패턴(사선)은 줄무늬 자체가 대비를 대신하지 않는다
— 텍스트 라벨(`안전 계산 없음`)이 항상 동반되어야 하며, 해치 배경과
그 위 텍스트 색 사이에도 별도로 4.5:1을 만족해야 한다.
