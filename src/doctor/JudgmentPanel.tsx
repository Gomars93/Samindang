/**
 * 원장 판단 기록 패널 (섹션 b/c/d). 명리 계산도, 문진 응답도 여기서 새로
 * 만들지 않는다 — 오직 원장이 화면에서 직접 타이핑한 값만 다룬다.
 * 백엔드/저장소가 없으므로 상태는 React state에만 존재하고, 새로고침하면
 * 사라진다. 이 컴포넌트는 그 사실을 화면에 명시적으로 알린다.
 */
import { useEffect, useRef, useState } from 'react'
import {
  DEBRIEF_QUESTIONS,
  MAX_INNATE_FEATURES,
  MAX_SYMPTOM_LINKS,
  createEmptyJudgment,
  finalizeJudgment,
  validateJudgment,
  type ClinicianJudgment,
  type DebriefAnswers,
  type JudgmentSaveOutcome,
  type JudgmentSourcePayload,
} from './judgment'
import { ConflictBanner } from './ConflictBanner'
import { DoctorTokenSetup } from './DoctorTokenSetup'

function TextList({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="judgment__field">
      <span className="judgment__label">{label}</span>
      {values.map((v, i) => (
        <input
          key={i}
          type="text"
          className="judgment__input"
          value={v}
          placeholder={`${i + 1}`}
          onChange={(e) => {
            const next = [...values]
            next[i] = e.target.value
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}

function LabeledTextarea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <label className="judgment__field">
      <span className="judgment__label">{label}</span>
      <textarea
        className="judgment__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
    </label>
  )
}

const emptyDebrief: DebriefAnswers = { q1: '', q2: '', q3: '', q4: '' }

// P0-2 (Core Reduction Phase 6 gate): exported -- the editable radio
// controls that used to live here moved to
// ./ObjectiveExamFindingsCard.tsx (rendered in the clinical tab, next to
// the regional SafetyPanels), which reuses these SAME option/label
// definitions rather than forking a second copy. This file keeps a
// read-only echo of the current value instead (see LBP_MOTOR_DEFICIT_LABEL/
// SHOULDER_CUFF_WEAKNESS_LABEL below, used in the JSX further down).
export const LBP_MOTOR_DEFICIT_OPTIONS: { value: 'NONE' | 'SEVERE_OR_PROGRESSIVE' | 'UNKNOWN'; label: string }[] = [
  { value: 'NONE', label: '없음' },
  { value: 'SEVERE_OR_PROGRESSIVE', label: '심하거나 빠르게 진행함' },
  { value: 'UNKNOWN', label: '아직 확인 못함' },
]

export const SHOULDER_CUFF_WEAKNESS_OPTIONS: { value: 'NONE' | 'NEW_WEAKNESS_AFTER_TRAUMA' | 'UNKNOWN'; label: string }[] = [
  { value: 'NONE', label: '없음' },
  { value: 'NEW_WEAKNESS_AFTER_TRAUMA', label: '외상 후 새로 생긴 근력저하 확인됨' },
  { value: 'UNKNOWN', label: '아직 확인 못함' },
]

const LBP_MOTOR_DEFICIT_LABEL: Record<string, string> = Object.fromEntries(
  LBP_MOTOR_DEFICIT_OPTIONS.map((o) => [o.value, o.label]),
)
const SHOULDER_CUFF_WEAKNESS_LABEL: Record<string, string> = Object.fromEntries(
  SHOULDER_CUFF_WEAKNESS_OPTIONS.map((o) => [o.value, o.label]),
)

export function JudgmentPanel({
  source,
  initialJudgment,
  initialUpdatedAt,
  onSave,
  showLbpExam = false,
  showShoulderExam = false,
}: {
  source: JudgmentSourcePayload
  /** 서버에 이미 저장된 판단이 있으면 재오픈 시 여기로 넘겨서 되살린다. */
  initialJudgment?: ClinicianJudgment | null
  /**
   * Round 18: the submission record's server-authoritative `updated_at` at
   * the moment this judgment was loaded -- sent as the CAS precondition on
   * the first "기록" click. This component fully remounts on record switch
   * (DoctorView's `key={payload.session_id}`), so unlike DoctorWorkspace
   * there is no mid-life reseed to guard against here.
   */
  initialUpdatedAt?: string | null
  /** 서버 제출을 보고 있을 때만 넘어온다 — 기록 성공 시 PUT :id/judgment로 저장한다. */
  onSave?: (judgment: ClinicianJudgment, expectedUpdatedAt: string | null) => Promise<JudgmentSaveOutcome>
  /**
   * LBP_V1: 이번 방문의 주호소가 허리(LBP)일 때만 true — 객관적 하지
   * 근력저하 소견 입력 컨트롤을 보여준다. 결정 §1-2: 이 값이
   * SEVERE_OR_PROGRESSIVE면 환자 자가보고 CES 문항과 무관하게
   * URGENT_REVIEW를 발생시킨다(src/spec/lbpLogic.ts). 기존 judgment 저장
   * 경로(onSave)를 그대로 재사용한다 — 별도 저장 메커니즘을 새로 만들지
   * 않는다.
   */
  showLbpExam?: boolean
  /**
   * SHOULDER_V1: `PAIN_01 === 'neck_shoulder'`인 환자 전체에서 true —
   * `primary_module_detail === 'SHOULDER'`가 아니다(F1: NS01은 이 컨트롤
   * 노출도 게이트하지 않는다 — NECK_DOMINANT로 태깅된 환자도 어깨 외상
   * 후 진찰 소견을 입력할 수 있어야 한다). 이 값이
   * NEW_WEAKNESS_AFTER_TRAUMA면 SH03 자가보고와 무관하게
   * expedited_referral_consider를 올린다(src/spec/shoulderLogic.ts).
   */
  showShoulderExam?: boolean
}) {
  const [judgment, setJudgment] = useState<ClinicianJudgment>(
    () => initialJudgment ?? createEmptyJudgment(source),
  )
  const [debrief, setDebrief] = useState<DebriefAnswers>(initialJudgment?.debrief ?? emptyDebrief)
  const [outlineQuestion, setOutlineQuestion] = useState('')
  const [recorded, setRecorded] = useState<ClinicianJudgment | null>(initialJudgment ?? null)
  const [errors, setErrors] = useState<string[]>([])
  const lastKnownUpdatedAtRef = useRef<string | null>(initialUpdatedAt ?? null)
  // Round 18: the last `judgment`/`debrief` state this panel considers
  // NOT locally edited -- i.e. the pristine baseline `isDraftPristine()`
  // diffs live state against, updated on mount, on a successful save (to
  // the live pre-finalize state, not the finalized/persisted one -- see
  // handleRecord), on reload, and by the sync effect below. This is no
  // longer literally "what matches the server" after a save (the server
  // holds `finalized`, which stamps recorded_at); it only needs to answer
  // "has the clinician typed anything since we last knew where we stood,"
  // which is what safely gates adopting a newer external version (see that
  // effect's comment for why this matters).
  const lastKnownJudgmentRef = useRef<{ judgment: ClinicianJudgment; debrief: DebriefAnswers }>({
    judgment: initialJudgment ?? createEmptyJudgment(source),
    debrief: initialJudgment?.debrief ?? emptyDebrief,
  })
  // Round 18: non-null exactly when the server rejected the last "기록"
  // click as stale. Nothing auto-retries here (this save is already
  // explicit-click-only, not debounced) -- the clinician must review the
  // banner and either reload or re-click "기록" after reloading.
  const [conflict, setConflict] = useState<{ current: ClinicianJudgment | null; currentUpdatedAt: string } | null>(
    null,
  )
  // P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9): the
  // failure `kind` from the most recent unsuccessful "기록" click.
  // 'auth' shows the inline token-reentry recovery instead of adding to
  // the generic `errors` list -- the clinician's typed judgment is
  // untouched either way, they just need a valid token before "기록" can
  // succeed again.
  const [saveErrorKind, setSaveErrorKind] = useState<'auth' | 'network' | 'other' | null>(null)

  function isDraftPristine() {
    return (
      JSON.stringify(judgment) === JSON.stringify(lastKnownJudgmentRef.current.judgment) &&
      JSON.stringify(debrief) === JSON.stringify(lastKnownJudgmentRef.current.debrief)
    )
  }

  // Round 18 fix (caught by real two-browser-context QA): `initialUpdatedAt`
  // legitimately advances for the SAME submission without any judgment
  // save -- most reliably the automatic "mark as viewed" status write that
  // fires the instant a submission is opened, or an independent
  // DoctorWorkspace autosave on the same submission.
  //
  // Closing-review finding (HIGH, shared with DoctorWorkspace.tsx's
  // identical fix): adopting the newer TOKEN alone, without also adopting
  // the CONTENT it came with, lets a later "기록" click pass CAS while
  // still submitting whatever STALE `judgment` this panel had -- silently
  // overwriting a real concurrent write to the SAME submission's `judgment`
  // field (another tab, or this tab's own round-trip through DoctorView).
  // Fixed the same way: adopt the token and the fresh `initialJudgment`
  // TOGETHER, and only when this panel's own draft is pristine (matches
  // `lastKnownJudgmentRef`, i.e. nothing typed since the last known-good
  // state) -- never overwrite the clinician's in-progress typing, and never
  // adopt a token while quietly keeping content that might now be stale
  // relative to a different writer.
  //
  // Empirical fix (caught by re-running the real-browser QA against the
  // closing review's exact repro, not by reasoning alone): this effect
  // must depend ONLY on `initialUpdatedAt`, never on `judgment`/`debrief`
  // themselves. `handleReloadFromConflict` also calls `setJudgment`/
  // `setDebrief` -- if this effect also re-ran on every judgment/debrief
  // change, that very reload would immediately re-trigger it, and since
  // `initialUpdatedAt` (DoctorView's OWN prop, untouched by this panel's
  // purely-local reload) is still the OLD stale value while
  // `lastKnownUpdatedAtRef.current` now correctly holds the fresh
  // `conflict.currentUpdatedAt`, the effect's inequality check (`!==`, not
  // "is initialUpdatedAt actually NEWER") would pass and silently regress
  // the just-reloaded token back down to the stale prop -- undoing the
  // reload and reproducing the exact 409-loop this mechanism exists to
  // prevent. `isDraftPristine()` still reads the current `judgment`/
  // `debrief` via closure every time the effect actually runs; they do not
  // need to be dependencies for that.
  useEffect(() => {
    if (initialUpdatedAt == null || initialUpdatedAt === lastKnownUpdatedAtRef.current) return
    if (!isDraftPristine()) return
    const freshJudgment = initialJudgment ?? createEmptyJudgment(source)
    const freshDebrief = initialJudgment?.debrief ?? emptyDebrief
    lastKnownUpdatedAtRef.current = initialUpdatedAt
    lastKnownJudgmentRef.current = { judgment: freshJudgment, debrief: freshDebrief }
    setJudgment(freshJudgment)
    setDebrief(freshDebrief)
    setRecorded(initialJudgment ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUpdatedAt])

  const hasDebrief = Object.values(debrief).some((v) => v.trim() !== '')

  async function handleRecord() {
    // Round 18 (closing review, MEDIUM): fail closed on a pending conflict
    // exactly like DoctorWorkspace/RevisitWorkspace's autosave effects --
    // the clinician must explicitly reload before any further save attempt
    // instead of "기록" silently retrying with a stale precondition.
    if (conflict) return
    const withDebrief: ClinicianJudgment = { ...judgment, debrief: hasDebrief ? debrief : null }
    const result = validateJudgment(withDebrief)
    if (!result.ok) {
      setErrors(result.errors)
      setRecorded(null)
      return
    }
    setErrors([])
    const finalized = finalizeJudgment(withDebrief)
    if (!onSave) {
      setRecorded(finalized)
      return
    }
    const outcome = await onSave(finalized, lastKnownUpdatedAtRef.current)
    if (outcome.ok) {
      setRecorded(finalized)
      setConflict(null)
      setSaveErrorKind(null)
      lastKnownUpdatedAtRef.current = outcome.updatedAt
      // Round 18 closing-review fix (MEDIUM): snapshot the LIVE pre-finalize
      // `judgment`/`debrief` here, never `finalized`. `finalizeJudgment`
      // stamps a fresh `recorded_at` and prunes empty array entries, but
      // this success path never calls `setJudgment(finalized)` -- the
      // visible form state stays exactly what the clinician typed. Snapshotting
      // `finalized` instead made `isDraftPristine()`'s comparison permanently
      // false after the FIRST successful save (the live judgment's
      // `recorded_at` can never again match the ref's stamped one), which
      // silently disabled the version-sync effect below for the rest of this
      // panel's life -- reintroducing the exact false-conflict bug this
      // mechanism exists to prevent on every subsequent save. Snapshotting
      // the live values keeps pristine-comparison meaningful indefinitely.
      lastKnownJudgmentRef.current = { judgment, debrief }
    } else if (outcome.conflict) {
      // Round 18: fail closed -- `recorded` deliberately stays whatever it
      // was before this click (never shows `finalized` as "기록됨" when it
      // was actually rejected). `judgment`/`debrief` state is untouched, so
      // the clinician's typed values are still right there on screen.
      setSaveErrorKind(null)
      setConflict(outcome.conflict)
    } else if (outcome.kind === 'auth') {
      // P0-8: distinct from the generic errors list below -- the inline
      // DoctorTokenSetup recovery renders instead of (not in addition to)
      // the "저장 실패" text.
      setSaveErrorKind('auth')
    } else {
      setSaveErrorKind(outcome.kind ?? 'other')
      setErrors(['저장 실패 — 다시 시도해주세요'])
    }
  }

  // Round 18: the only recovery action -- loads the server's current
  // judgment verbatim (or a blank form if nobody had saved one yet) and
  // clears the conflict. The clinician's own draft stays visible in
  // ConflictBanner until this fires.
  function handleReloadFromConflict() {
    if (!conflict) return
    const next = conflict.current ?? createEmptyJudgment(source)
    const nextDebrief = next.debrief ?? emptyDebrief
    setJudgment(next)
    setDebrief(nextDebrief)
    setRecorded(conflict.current)
    lastKnownUpdatedAtRef.current = conflict.currentUpdatedAt
    lastKnownJudgmentRef.current = { judgment: next, debrief: nextDebrief }
    setConflict(null)
    setErrors([])
  }

  return (
    <section className="doctor__section doctor__section--judgment">
      <h2>원장 판단 기록</h2>
      <p className="doctor__derivedNote">
        아래 내용은 전부 원장이 직접 입력한 판단입니다. 소프트웨어가 자동으로
        채우거나 추천한 내용이 아닙니다.{' '}
        {onSave
          ? '"기록" 버튼을 누르면 이 제출건에 저장됩니다.'
          : '예시 데이터 미리보기이므로 저장되지 않으며, 화면을 새로고침하면 사라집니다.'}
      </p>

      {conflict && (
        <ConflictBanner
          onReload={handleReloadFromConflict}
          draftJson={JSON.stringify({ ...judgment, debrief: hasDebrief ? debrief : null }, null, 2)}
        />
      )}

      <div className="judgment__grid">
        <TextList
          label={`핵심 선천 특징 (원장 입력, 최대 ${MAX_INNATE_FEATURES}개)`}
          values={judgment.innate_features.length ? judgment.innate_features : Array(MAX_INNATE_FEATURES).fill('')}
          onChange={(next) => setJudgment((j) => ({ ...j, innate_features: next }))}
        />
        <TextList
          label={`현재 증상과 연결되는 핵심 (원장 입력, 최대 ${MAX_SYMPTOM_LINKS}개)`}
          values={judgment.symptom_links.length ? judgment.symptom_links : Array(MAX_SYMPTOM_LINKS).fill('')}
          onChange={(next) => setJudgment((j) => ({ ...j, symptom_links: next }))}
        />
      </div>

      {/*
        P0-2 (Core Reduction Phase 6 gate / Phase 3 Opus review §3-6,
        단순화 금지선 5-1 "안전 입력이 비기본 탭에"): these two objective
        exam findings used to be EDITABLE only here, in the 자료 보기 tab
        -- while their safety effect (URGENT_REVIEW / expedited_referral)
        shows up in the 진료 tab's safety panels. The editable controls
        moved to ObjectiveExamFindingsCard (rendered in the clinical tab,
        immediately next to LbpSafetyPanel/ShoulderSafetyPanel) so the
        clinician sets the finding right where they see its effect, with
        its own immediate save -- this stays a READ-ONLY echo (still
        showLbpExam/showShoulderExam-gated, same applicability signal) so
        nothing disappears from this record's full picture. Save path is
        unchanged: still `ClinicianJudgment.lbp_objective_motor_deficit`/
        `shoulder_objective_cuff_weakness`, still synced into `judgment`
        below whenever a fresh server record is adopted (the pre-existing
        version-sync effect), so "기록" in this tab still reflects and
        persists whatever value was set in the clinical tab.
      */}
      {showLbpExam && (
        <p className="judgment__field doctor__derivedNote">
          객관적 하지 근력저하 소견 (원장 진찰, LBP):{' '}
          {LBP_MOTOR_DEFICIT_LABEL[judgment.lbp_objective_motor_deficit ?? ''] ?? '아직 진찰 전'}
          {' — 입력은 진료 탭의 안전 패널 옆에서.'}
        </p>
      )}

      {showShoulderExam && (
        <p className="judgment__field doctor__derivedNote">
          객관적 회전근개 근력저하 소견 (원장 진찰, SHOULDER):{' '}
          {SHOULDER_CUFF_WEAKNESS_LABEL[judgment.shoulder_objective_cuff_weakness ?? ''] ?? '아직 진찰 전'}
          {' — 입력은 진료 탭의 안전 패널 옆에서.'}
        </p>
      )}

      <details className="judgment__secondaryFields">
        <summary>사주 예상 → 수정 판단 → 치료축·처방 방향 (펼쳐서 입력)</summary>
        <div className="judgment__grid">
          <LabeledTextarea
            label="사주만 보고 예상한 임상 문제 (원장 입력)"
            value={judgment.saju_only_prediction}
            onChange={(v) => setJudgment((j) => ({ ...j, saju_only_prediction: v }))}
          />
          <LabeledTextarea
            label="문진·맥·설·복진 후 수정된 판단 (원장 입력)"
            value={judgment.revised_after_exam}
            onChange={(v) => setJudgment((j) => ({ ...j, revised_after_exam: v }))}
          />
          <LabeledTextarea
            label="최종 치료축 (원장 입력)"
            value={judgment.final_treatment_axis}
            onChange={(v) => setJudgment((j) => ({ ...j, final_treatment_axis: v }))}
          />
          <LabeledTextarea
            label="처방 방향 (원장 입력, 방향만 — 자동 처방 아님)"
            value={judgment.prescription_direction}
            onChange={(v) => setJudgment((j) => ({ ...j, prescription_direction: v }))}
          />
        </div>
      </details>

      <label className="judgment__toggle">
        <input
          type="checkbox"
          checked={judgment.learning_case}
          onChange={(e) => setJudgment((j) => ({ ...j, learning_case: e.target.checked }))}
        />
        <span>★ 학습 케이스로 표시 (원장 입력)</span>
      </label>

      {/*
        P0-8 (Core Reduction Phase 6 gate / Phase 5 Synthesis §2.9): a
        401/403 (expired/missing doctor token) is fixable right here --
        re-entering the token clears this recovery card; the clinician's
        typed judgment is untouched, they just click "기록" again.
      */}
      {saveErrorKind === 'auth' && (
        <DoctorTokenSetup authFailed onSet={() => setSaveErrorKind(null)} />
      )}

      {errors.length > 0 && (
        <div className="doctor__warning">
          {errors.map((e) => (
            <p key={e} style={{ margin: 0 }}>
              {e}
            </p>
          ))}
        </div>
      )}

      <div className="judgment__actions">
        <button type="button" className="judgment__recordBtn" onClick={handleRecord}>
          기록
        </button>
      </div>

      {recorded && (
        <details className="doctor__raw" open>
          {/*
            P0-7 (Core Reduction Phase 6 gate / Phase 3 Opus review "REMOVE"
            list): this used to say "아직 저장되지 않음" (not yet saved)
            unconditionally, even in server mode where handleRecord's onSave
            just succeeded and this record IS durably saved -- a flatly
            false label sitting right next to the accurate save-state note
            above (line ~286). Only the fixtures/preview path (no onSave)
            is genuinely ephemeral; the label now matches which path this
            actually is instead of asserting the fixtures-only fact always.
          */}
          <summary>기록된 판단 (JSON{onSave ? ' — 서버에 저장됨' : ' — 아직 저장되지 않음(미리보기, 새로고침하면 사라짐)'})</summary>
          <pre>{JSON.stringify(recorded, null, 2)}</pre>
        </details>
      )}

      <details className="judgment__debrief">
        <summary>1분 디브리핑 (선택)</summary>
        <p className="doctor__derivedNote">
          녹취 연동은 이후 단계이며 지금은 데이터 계약만 준비되어 있습니다.
          음성 녹음 기능은 없습니다.
        </p>
        {DEBRIEF_QUESTIONS.map((q, i) => {
          const key = `q${i + 1}` as keyof DebriefAnswers
          return (
            <LabeledTextarea
              key={key}
              label={q}
              value={debrief[key]}
              onChange={(v) => setDebrief((d) => ({ ...d, [key]: v }))}
            />
          )
        })}
      </details>

      <details className="judgment__outline">
        <summary>설명 개요 (원장 전용, 참고용)</summary>
        <p className="doctor__derivedNote">
          원장이 입력한 내용을 그대로 재구성해서 보여줄 뿐이며, 새로운 내용을
          추가하거나 만들어내지 않습니다.
        </p>
        <ol className="judgment__outlineList">
          <li>
            <strong>선천 특징</strong>
            <ul>
              {(judgment.innate_features.filter((s) => s.trim() !== '').length
                ? judgment.innate_features.filter((s) => s.trim() !== '')
                : ['(미입력)']
              ).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </li>
          <li>
            <strong>현재 증상 연결</strong>
            <ul>
              {(judgment.symptom_links.filter((s) => s.trim() !== '').length
                ? judgment.symptom_links.filter((s) => s.trim() !== '')
                : ['(미입력)']
              ).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </li>
          <li>
            <strong>치료 우선순위·한약 방향</strong>
            <p>{judgment.final_treatment_axis.trim() || judgment.prescription_direction.trim() ? (
              <>
                {judgment.final_treatment_axis.trim() || '(미입력)'}
                {' / '}
                {judgment.prescription_direction.trim() || '(미입력)'}
              </>
            ) : (
              '(미입력)'
            )}</p>
          </li>
          <li>
            <strong>질문</strong>
            <textarea
              className="judgment__textarea"
              value={outlineQuestion}
              onChange={(e) => setOutlineQuestion(e.target.value)}
              placeholder="(미입력)"
              rows={2}
            />
          </li>
        </ol>
      </details>
    </section>
  )
}
