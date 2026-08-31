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
 * judgment and CAS/rebase-retry, this component only owns the small
 * controlled UI + its own immediate save trigger. `judgment` is a single
 * server-side object, so a stale-write CAS mismatch is possible if
 * JudgmentPanel's own "기록" click landed in between (two independent
 * writers to the same field) -- DoctorView.tsx's handler rebases onto the
 * server's CURRENT judgment and retries once rather than surfacing that
 * as a visible conflict; JudgmentPanel's own pre-existing version-sync
 * effect (round 18) is what then picks the fresh value back up on its
 * side, exactly the mechanism already built for "another writer touched
 * this record's judgment."
 *
 * No new data contract, no new persistence: this is UI relocation +
 * immediate-save wiring, not a new capability.
 */
import { useState } from 'react'
import { LBP_MOTOR_DEFICIT_OPTIONS, SHOULDER_CUFF_WEAKNESS_OPTIONS } from './JudgmentPanel'
import type { ClinicianJudgment } from './judgment'
import { DoctorTokenSetup } from './DoctorTokenSetup'

export type ObjectiveExamField = 'lbp_objective_motor_deficit' | 'shoulder_objective_cuff_weakness'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function ObjectiveExamFindingsCard({
  showLbp,
  showShoulder,
  initialLbp,
  initialShoulder,
  onSave,
}: {
  showLbp: boolean
  showShoulder: boolean
  initialLbp?: ClinicianJudgment['lbp_objective_motor_deficit']
  initialShoulder?: ClinicianJudgment['shoulder_objective_cuff_weakness']
  /**
   * Merges `field: value` into the record's current judgment (preserving
   * every other field) and saves it -- see DoctorView.tsx's
   * handleSaveObjectiveExamField for the merge/CAS-retry logic. Absent in
   * fixtures/preview mode (same convention as DoctorWorkspace's
   * onSaveWorkspace/JudgmentPanel's onSave), where this card is purely
   * local/ephemeral.
   */
  onSave?: (
    field: ObjectiveExamField,
    value: string,
  ) => Promise<{ ok: true } | { ok: false; kind: 'auth' | 'network' | 'other' }>
}) {
  const [lbp, setLbp] = useState(initialLbp ?? undefined)
  const [shoulder, setShoulder] = useState(initialShoulder ?? undefined)
  const [lbpStatus, setLbpStatus] = useState<SaveStatus>('idle')
  const [shoulderStatus, setShoulderStatus] = useState<SaveStatus>('idle')
  const [authError, setAuthError] = useState(false)

  if (!showLbp && !showShoulder) return null

  async function handleChange(
    field: ObjectiveExamField,
    value: string,
    applyLocal: (v: string) => void,
    setStatus: (s: SaveStatus) => void,
  ) {
    applyLocal(value)
    if (!onSave) return
    setStatus('saving')
    const result = await onSave(field, value)
    if (result.ok) {
      setStatus('saved')
      setAuthError(false)
    } else if (result.kind === 'auth') {
      setStatus('error')
      setAuthError(true)
    } else {
      setStatus('error')
    }
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
                    handleChange('lbp_objective_motor_deficit', opt.value, (v) => setLbp(v as typeof lbp), setLbpStatus)
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {onSave && lbpStatus !== 'idle' && (
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
                    )
                  }
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          {onSave && shoulderStatus !== 'idle' && (
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
