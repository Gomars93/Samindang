/**
 * 원장 판단 기록 패널 (섹션 b/c/d). 명리 계산도, 문진 응답도 여기서 새로
 * 만들지 않는다 — 오직 원장이 화면에서 직접 타이핑한 값만 다룬다.
 * 백엔드/저장소가 없으므로 상태는 React state에만 존재하고, 새로고침하면
 * 사라진다. 이 컴포넌트는 그 사실을 화면에 명시적으로 알린다.
 */
import { useState } from 'react'
import {
  DEBRIEF_QUESTIONS,
  MAX_INNATE_FEATURES,
  MAX_SYMPTOM_LINKS,
  createEmptyJudgment,
  finalizeJudgment,
  validateJudgment,
  type ClinicianJudgment,
  type DebriefAnswers,
  type JudgmentSourcePayload,
} from './judgment'

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

export function JudgmentPanel({
  source,
  initialJudgment,
  onSave,
}: {
  source: JudgmentSourcePayload
  /** 서버에 이미 저장된 판단이 있으면 재오픈 시 여기로 넘겨서 되살린다. */
  initialJudgment?: ClinicianJudgment | null
  /** 서버 제출을 보고 있을 때만 넘어온다 — 기록 성공 시 PUT :id/judgment로 저장한다. */
  onSave?: (judgment: ClinicianJudgment) => void
}) {
  const [judgment, setJudgment] = useState<ClinicianJudgment>(
    () => initialJudgment ?? createEmptyJudgment(source),
  )
  const [debrief, setDebrief] = useState<DebriefAnswers>(initialJudgment?.debrief ?? emptyDebrief)
  const [outlineQuestion, setOutlineQuestion] = useState('')
  const [recorded, setRecorded] = useState<ClinicianJudgment | null>(initialJudgment ?? null)
  const [errors, setErrors] = useState<string[]>([])

  const hasDebrief = Object.values(debrief).some((v) => v.trim() !== '')

  function handleRecord() {
    const withDebrief: ClinicianJudgment = { ...judgment, debrief: hasDebrief ? debrief : null }
    const result = validateJudgment(withDebrief)
    if (!result.ok) {
      setErrors(result.errors)
      setRecorded(null)
      return
    }
    setErrors([])
    const finalized = finalizeJudgment(withDebrief)
    setRecorded(finalized)
    onSave?.(finalized)
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

      <label className="judgment__toggle">
        <input
          type="checkbox"
          checked={judgment.learning_case}
          onChange={(e) => setJudgment((j) => ({ ...j, learning_case: e.target.checked }))}
        />
        <span>★ 학습 케이스로 표시 (원장 입력)</span>
      </label>

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
          <summary>기록된 판단 (JSON, 아직 저장되지 않음)</summary>
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
