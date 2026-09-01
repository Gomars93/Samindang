/**
 * P0-2 (Core Reduction Phase 6 gate / Phase 3 Opus review §3-6, 단순화
 * 금지선 5-1 "안전 입력이 비기본 탭에"): the LBP/SHOULDER objective exam
 * findings (`lbp_objective_motor_deficit` / `shoulder_objective_cuff_weakness`)
 * used to be editable ONLY inside JudgmentPanel, which lives in the '자료
 * 보기' tab -- while their safety effect (URGENT_REVIEW /
 * expedited_referral_consider, computed in src/spec/lbpLogic.ts /
 * shoulderLogic.ts, frozen) shows up in the 진료 tab's LbpSafetyPanel /
 * ShoulderSafetyPanel. This card renders in the clinical tab, immediately
 * next to those panels, so the clinician records what they just observed
 * on exam right where they see its effect.
 *
 * Save path is UNCHANGED: this still writes the exact same
 * `ClinicianJudgment.lbp_objective_motor_deficit`/
 * `shoulder_objective_cuff_weakness` fields, through the same PUT
 * /api/submissions/:id/judgment (serverClient.ts's saveJudgment) --
 * DoctorView.tsx's onSave prop here does the merge-with-the-rest-of-
 * judgment. `judgment` is a single server-side object, so a stale-write
 * CAS mismatch is possible if JudgmentPanel's own "기록" click (or another
 * tab/device saving this same field) landed in between.
 *
 * 독립 검수 HIGH-2: 이전 버전은 409 발생 시 서버의 current judgment 위에
 * 로컬 value를 자동으로 다시 merge해 재저장했다 -- 안전 판정에 영향을 줄
 * 수 있는 이 두 필드에 대해, 다른 화면/기기가 방금 저장한 값을 사람 확인
 * 없이 덮어쓸 수 있었다. 이제는 자동 retry/merge를 하지 않는다 -- conflict
 * 발생 시 클리닉언의 로컬 선택은 그대로 화면에 남고(조용히 폐기하지
 * 않음), PR #24가 이미 정착시킨 ConflictBanner 패턴 그대로 "다른 화면에서
 * 먼저 저장됨" 배너를 보여주며, 원장이 명시적으로 "최신 내용 불러오기"를
 * 누른 뒤에만 서버의 현재 값으로 갱신된다(그 뒤 다시 선택하면 새로 저장).
 *
 * No new data contract, no new persistence: this is UI relocation +
 * immediate-save wiring, not a new capability.
 */
import { useState } from 'react'
import { LBP_MOTOR_DEFICIT_OPTIONS, SHOULDER_CUFF_WEAKNESS_OPTIONS } from './JudgmentPanel'
import type { ClinicianJudgment, ObjectiveExamSaveOutcome } from './judgment'
import { DoctorTokenSetup } from './DoctorTokenSetup'
import { ConflictBanner } from './ConflictBanner'

export type ObjectiveExamField = 'lbp_objective_motor_deficit' | 'shoulder_objective_cuff_weakness'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/** The server's current value for this exact field at the moment a 409 was detected, plus what the clinician had just tried to save. */
type FieldConflict = {
  current: ClinicianJudgment | null
  currentUpdatedAt: string
  attemptedValue: string
}

export function ObjectiveExamFindingsCard({
  showLbp,
  showShoulder,
  initialLbp,
  initialShoulder,
  onSave,
  onReloadConflict,
  resetKey,
}: {
  showLbp: boolean
  showShoulder: boolean
  initialLbp?: ClinicianJudgment['lbp_objective_motor_deficit']
  initialShoulder?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  /**
   * Merges `field: value` into the record's current judgment (preserving
   * every other field) and saves it -- see DoctorView.tsx's
   * handleSaveObjectiveExamField. Absent in fixtures/preview mode (same
   * convention as DoctorWorkspace's onSaveWorkspace/JudgmentPanel's
   * onSave), where this card is purely local/ephemeral.
   */
  onSave?: (field: ObjectiveExamField, value: string) => Promise<ObjectiveExamSaveOutcome>
  /**
   * 독립 검수 HIGH-2: "최신 내용 불러오기" 클릭 시 호출된다 -- 이 카드는
   * CAS 기준을 자체 보관하지 않고 DoctorView.tsx의 selectedRecord를 매
   * 저장마다 그대로 읽으므로, 여기서 그 상위 상태도 함께 최신화해야 다음
   * 저장 시도가 같은 conflict를 반복하지 않는다.
   */
  onReloadConflict?: (current: ClinicianJudgment | null, currentUpdatedAt: string) => void
  /**
   * m4 (Phase 10 closing review): this card's own radio selections/save
   * status/authError are safety-relevant (URGENT_REVIEW/
   * expedited_referral_consider both key off them) but used to be plain
   * `useState(initialLbp ?? undefined)` -- React only reads that initial
   * value on the FIRST mount, so on every later render (including a
   * record switch) it silently ignores a changed `initialLbp`/
   * `initialShoulder` prop and keeps showing the PREVIOUS patient's radio
   * selection. DoctorWorkspace.tsx never keys/remounts this component (see
   * its own "render-time reset, not key-based remount" history comment),
   * so nothing else was clearing this state either -- a real leak between
   * patients on a safety-affecting input. Passing the SAME unified
   * `recordKey`/`resetKey` DoctorWorkspace.tsx already threads through its
   * own render-time-reset lets this card apply the identical pattern
   * locally: compare against the last-seen key during render and, if it
   * changed, re-seed every field from the (now-current) initial* props
   * before this render paints anything.
   */
  resetKey?: string
}) {
  const [lbp, setLbp] = useState(initialLbp ?? undefined)
  const [shoulder, setShoulder] = useState(initialShoulder ?? undefined)
  const [lbpStatus, setLbpStatus] = useState<SaveStatus>('idle')
  const [shoulderStatus, setShoulderStatus] = useState<SaveStatus>('idle')
  const [authError, setAuthError] = useState(false)
  // 독립 검수 HIGH-2: 필드별로 독립된 conflict -- LBP/SHOULDER는 서로 다른
  // 시점에 서로 다른 writer와 경쟁할 수 있으므로 하나로 합치지 않는다.
  const [lbpConflict, setLbpConflict] = useState<FieldConflict | null>(null)
  const [shoulderConflict, setShoulderConflict] = useState<FieldConflict | null>(null)

  const [lastSeenResetKey, setLastSeenResetKey] = useState(resetKey)
  if (resetKey !== lastSeenResetKey) {
    setLastSeenResetKey(resetKey)
    setLbp(initialLbp ?? undefined)
    setShoulder(initialShoulder ?? undefined)
    setLbpStatus('idle')
    setShoulderStatus('idle')
    setAuthError(false)
    // 독립 검수 HIGH-2 + m4와 동일한 이유: 이전 환자/기록의 conflict가
    // 새 레코드로 넘어오면 안 된다.
    setLbpConflict(null)
    setShoulderConflict(null)
  }

  if (!showLbp && !showShoulder) return null

  async function handleChange(
    field: ObjectiveExamField,
    value: string,
    applyLocal: (v: string) => void,
    setStatus: (s: SaveStatus) => void,
    setConflict: (c: FieldConflict | null) => void,
  ) {
    applyLocal(value)
    // 새로 고른 값은 이전 conflict 배너를 대체한다 -- 원장이 직접 다시
    // 선택하는 행위 자체가 "다시 시도" 의사표시이며, 저장이 성공/실패/
    // 재conflict 중 무엇이 되든 이 시도의 결과가 그대로 반영된다.
    setConflict(null)
    if (!onSave) return
    setStatus('saving')
    const result = await onSave(field, value)
    if (result.ok) {
      setStatus('saved')
      setAuthError(false)
    } else if (result.conflict) {
      // 독립 검수 HIGH-2: 자동 retry/merge 없음 -- 로컬 선택(`lbp`/
      // `shoulder` state, 위 applyLocal이 이미 반영함)은 조용히 폐기하지
      // 않고 화면에 그대로 남는다. ConflictBanner가 서버의 현재 값을
      // 보여주고, 원장이 명시적으로 불러오기를 눌러야만 값이 바뀐다.
      setStatus('conflict')
      setConflict({ current: result.conflict.current, currentUpdatedAt: result.conflict.currentUpdatedAt, attemptedValue: value })
    } else if (result.kind === 'auth') {
      setStatus('error')
      setAuthError(true)
    } else {
      setStatus('error')
    }
  }

  // 독립 검수 HIGH-2: 유일한 복구 액션 -- 서버의 현재 값을 있는 그대로
  // 반영하고(필드 자동 병합 없음) conflict를 지운다. 원장이 여전히 다른
  // 값을 원하면 그 다음에 다시 명시적으로 라디오를 선택해 새로 저장한다.
  //
  // 독립 검수 MINOR-1 후속: `conflict.current`는 이 conflict가 발생한
  // 시점의 전체 judgment다 -- conflict를 일으킨 필드만 재시드하면, 화면에
  // 나란히 있는 반대쪽 부위(예: LBP conflict를 불러왔는데 SHOULDER
  // SafetyPanel은 이미 서버 값으로 다시 계산됐는데 이 카드의 shoulder
  // 라디오만 옛 로컬 값에 머무름)의 라디오가 옆의 실제 안전 판정과 어긋나
  // 보일 수 있다(쓰기 위험은 없음 -- 다음 저장은 이미 최신 selectedRecord를
  // 기준으로 함 -- 하지만 안전 관련 표시 화면에서 눈에 보이는 불일치라
  // 같이 고친다). 그래서 두 필드 모두 conflict.current로 재시드한다.
  function handleReloadConflict(conflict: FieldConflict, setStatus: (s: SaveStatus) => void, setConflict: (c: FieldConflict | null) => void) {
    setLbp((conflict.current?.lbp_objective_motor_deficit as typeof lbp) ?? undefined)
    setShoulder((conflict.current?.shoulder_objective_cuff_weakness as typeof shoulder) ?? undefined)
    setConflict(null)
    setStatus('idle')
    onReloadConflict?.(conflict.current, conflict.currentUpdatedAt)
  }

  return (
    <section className="workspace__block workspace__block--objectiveExam">
      <h3>원장 진찰 소견 (객관적)</h3>
      <p className="workspace__block__hint">
        환자 자가보고와 별개로, 원장이 직접 진찰한 결과만 기록합니다 — 아직 진찰 전이면 선택하지 않아도 됩니다.
      </p>

      {showLbp && (
        <div className="judgment__field judgment__lbpExam">
          <span className="judgment__label">객관적 하지 근력저하 소견 (LBP)</span>
          <p className="doctor__derivedNote">
            심하거나 빠르게 진행하는 소견이면 환자 자가보고(CES 문항)와 무관하게 긴급 확인이 표시됩니다.
          </p>
          <div className="judgment__radioRow" role="radiogroup" aria-label="객관적 하지 근력저하 소견">
            {LBP_MOTOR_DEFICIT_OPTIONS.map((opt) => (
              <label key={opt.value} className="judgment__radioOption">
                <input
                  type="radio"
                  name="objective_exam_lbp_motor_deficit"
                  checked={lbp === opt.value}
                  onChange={() =>
                    handleChange(
                      'lbp_objective_motor_deficit',
                      opt.value,
                      (v) => setLbp(v as typeof lbp),
                      setLbpStatus,
                      setLbpConflict,
                    )
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {lbpConflict && (
            <ConflictBanner
              onReload={() => handleReloadConflict(lbpConflict, setLbpStatus, setLbpConflict)}
              draftJson={JSON.stringify({ lbp_objective_motor_deficit: lbpConflict.attemptedValue }, null, 2)}
            />
          )}
          {onSave && lbpStatus !== 'idle' && lbpStatus !== 'conflict' && (
            <p className="workspace__saveStatus" role="status" data-status={lbpStatus}>
              {lbpStatus === 'saving' && '저장 중…'}
              {lbpStatus === 'saved' && '저장됨'}
              {lbpStatus === 'error' && !authError && '저장 실패 — 다시 선택해 다시 시도해주세요'}
            </p>
          )}
        </div>
      )}

      {showShoulder && (
        <div className="judgment__field judgment__lbpExam">
          <span className="judgment__label">객관적 회전근개 근력저하 소견 (SHOULDER)</span>
          <p className="doctor__derivedNote">
            외상 후 새로 생긴 근력저하가 확인되면 환자 자가보고(SH03)와 무관하게 신속 전문의 평가/의뢰 고려가 표시됩니다.
          </p>
          <div className="judgment__radioRow" role="radiogroup" aria-label="객관적 회전근개 근력저하 소견">
            {SHOULDER_CUFF_WEAKNESS_OPTIONS.map((opt) => (
              <label key={opt.value} className="judgment__radioOption">
                <input
                  type="radio"
                  name="objective_exam_shoulder_cuff_weakness"
                  checked={shoulder === opt.value}
                  onChange={() =>
                    handleChange(
                      'shoulder_objective_cuff_weakness',
                      opt.value,
                      (v) => setShoulder(v as typeof shoulder),
                      setShoulderStatus,
                      setShoulderConflict,
                    )
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {shoulderConflict && (
            <ConflictBanner
              onReload={() => handleReloadConflict(shoulderConflict, setShoulderStatus, setShoulderConflict)}
              draftJson={JSON.stringify({ shoulder_objective_cuff_weakness: shoulderConflict.attemptedValue }, null, 2)}
            />
          )}
          {onSave && shoulderStatus !== 'idle' && shoulderStatus !== 'conflict' && (
            <p className="workspace__saveStatus" role="status" data-status={shoulderStatus}>
              {shoulderStatus === 'saving' && '저장 중…'}
              {shoulderStatus === 'saved' && '저장됨'}
              {shoulderStatus === 'error' && !authError && '저장 실패 — 다시 선택해 다시 시도해주세요'}
            </p>
          )}
        </div>
      )}

      {/*
        P0-8: shared between both fields -- an expired/missing doctor
        token blocks both saves identically, one recovery card covers
        both. Re-entering the token does not auto-retry here (unlike
        DoctorWorkspace's debounced autosave) -- the clinician just
        re-picks the radio, which is already a one-click action.
      */}
      {authError && <DoctorTokenSetup authFailed onSet={() => setAuthError(false)} />}
    </section>
  )
}
