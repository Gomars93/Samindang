/**
 * Round 3(revisit linkage): patient-facing Micro Follow-up screen, reached
 * only via the one-time `#follow-up=<token>` hash link a clinician issues
 * from DoctorView (see DoctorView.tsx's handleStartRevisit). Self-contained
 * by design -- imports only pure presentational components (SingleChoice,
 * TextInputField) and lib/followUpClient.ts, which is itself a SEPARATE
 * file from serverClient.ts/doctorToken.ts with zero imports from either
 * (see followUpClient.ts's own doc comment) -- a doctor token can
 * structurally never reach this screen or any request it makes.
 *
 * No new clinical routing rule lives here: this is the fixed, always-the-same
 * short protocol (per-target CURRENT raw value + overall directional change
 * + new symptom + adverse effect) described in microFollowUp.ts. Per-target
 * answers capture the patient's own raw current value (free text, e.g. "4"
 * or "40분") rather than a computed/directional label -- overall change is
 * the only field that's a directional 좋아짐/비슷함/나빠짐 choice, so a
 * clinician can compare like-for-like against the target's own prior
 * baseline/postTreatmentValue text (round 4 review fix: no per-target
 * label-only answer loses the actual number a clinician needs for real
 * longitudinal tracking). A reported new symptom or adverse effect never
 * branches this screen's own flow -- it only becomes an "추가 확인 필요"
 * flag the clinician sees later (server/store.js's listRevisitQueue).
 */
import { useEffect, useRef, useState } from 'react'
import { SingleChoice } from '../components/SingleChoice'
import { TextInputField } from '../components/TextInputField'
import {
  getFollowUpSession,
  submitFollowUpSession,
  type FollowUpSessionAnswers,
} from '../lib/followUpClient'
import type { Option } from '../types'

const CHANGE_OPTIONS: Option[] = [
  { value: '좋아짐', label: '좋아짐' },
  { value: '비슷함', label: '비슷함' },
  { value: '나빠짐', label: '나빠짐' },
]

const YES_NO_OPTIONS: Option[] = [
  { value: 'no', label: '아니오' },
  { value: 'yes', label: '예' },
]

const UNAVAILABLE_MESSAGE: Record<string, string> = {
  EXPIRED: '링크가 만료되었습니다. 직원에게 문의해 주세요.',
  CONSUMED: '이미 제출이 완료된 링크입니다. 직원에게 문의해 주세요.',
  INVALIDATED: '더 이상 사용할 수 없는 링크입니다. 직원에게 문의해 주세요.',
  INVALID: '유효하지 않은 링크입니다. 직원에게 문의해 주세요.',
}

type Screen = 'loading' | 'form' | 'submitting' | 'done' | 'unavailable' | 'load_error'

export function FollowUpScreen({ token }: { token: string }) {
  const [screen, setScreen] = useState<Screen>('loading')
  const [unavailableReason, setUnavailableReason] = useState<string>('')
  const [targets, setTargets] = useState<Array<{ id: string; label: string }>>([])
  const [targetAnswers, setTargetAnswers] = useState<Record<string, string>>({})
  const [overallChange, setOverallChange] = useState<string | null>(null)
  const [newSymptom, setNewSymptom] = useState<string | null>(null)
  const [newSymptomNote, setNewSymptomNote] = useState('')
  const [adverseEffect, setAdverseEffect] = useState<string | null>(null)
  const [adverseEffectNote, setAdverseEffectNote] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getFollowUpSession(token).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setScreen('load_error')
        return
      }
      if (result.data.status !== 'ACTIVE') {
        setUnavailableReason(UNAVAILABLE_MESSAGE[result.data.status] ?? UNAVAILABLE_MESSAGE.INVALID)
        setScreen('unavailable')
        return
      }
      setTargets(result.data.targets ?? [])
      setScreen('form')
    })
    return () => {
      cancelled = true
    }
  }, [token])

  // 공유 태블릿 프라이버시: 완료 화면 도달 후 뒤로가기(브라우저 Back/제스처)가
  // 채워진 답변 화면으로 되돌아가지 못하게 막는다 -- App.tsx의 phase==='done'
  // 가드와 동일한 패턴.
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  // Round 4 review fix (token privacy): once submitted, the one-time token
  // must not keep sitting in the visible URL/browser history -- someone
  // glancing at the address bar, or the tablet's own history/tab-switcher
  // preview, could otherwise see it (moot for reuse since the server has
  // already consumed it, but the token is still meant to be single-use in
  // every sense, not just single-accept). replaceState first scrubs the
  // CURRENT entry (the one the patient actually navigated to, which still
  // has #follow-up=<token>) down to a bare clean URL with no hash, then a
  // pushState duplicates that clean URL on top -- so a Back press can only
  // ever land on an entry that already has the token stripped out.
  useEffect(() => {
    if (screen !== 'done') return
    const cleanUrl = window.location.pathname + window.location.search
    window.history.replaceState({ samindangFollowUpDone: true }, '', cleanUrl)
    window.history.pushState({ samindangFollowUpDone: true }, '', cleanUrl)
  }, [screen])

  useEffect(() => {
    const onPopState = () => {
      if (screenRef.current === 'done') {
        window.history.pushState({ samindangFollowUpDone: true }, '', window.location.href)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const allAnswered =
    targets.every((t) => Boolean(targetAnswers[t.id])) &&
    overallChange !== null &&
    newSymptom !== null &&
    adverseEffect !== null

  async function handleSubmit() {
    if (!allAnswered || screen === 'submitting') return
    setScreen('submitting')
    setSubmitError(null)
    const answers: FollowUpSessionAnswers = {
      targetRatings: targets.map((t) => ({ targetId: t.id, patientReportedValue: targetAnswers[t.id] ?? '' })),
      overallChange: overallChange ?? '',
      newSymptomReported: newSymptom === 'yes',
      newSymptomNote: newSymptom === 'yes' ? newSymptomNote : '',
      adverseEffectReported: adverseEffect === 'yes',
      adverseEffectNote: adverseEffect === 'yes' ? adverseEffectNote : '',
    }
    const result = await submitFollowUpSession(token, answers)
    if (!result.ok) {
      setScreen('form')
      setSubmitError(result.error)
      return
    }
    // 프라이버시: 제출 성공 즉시 답변을 메모리에서 비운다(기존 문진 privacy
    // wipe와 동일 패턴 -- App.tsx의 submitState success/unconfigured 이펙트 참고).
    setTargetAnswers({})
    setOverallChange(null)
    setNewSymptom(null)
    setNewSymptomNote('')
    setAdverseEffect(null)
    setAdverseEffectNote('')
    setSubmitError(null)
    setScreen('done')
  }

  if (screen === 'loading') {
    return (
      <div className="center">
        <div className="center__inner">
          <p className="waitStatus" role="status">
            불러오는 중입니다
          </p>
        </div>
      </div>
    )
  }

  if (screen === 'load_error') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">연결할 수 없습니다</h1>
            <p className="notice" role="alert">
              서버에 연결할 수 없습니다. 직원에게 문의해 주세요.
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (screen === 'unavailable') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">사용할 수 없는 링크입니다</h1>
            <p className="notice" role="alert">
              {unavailableReason}
            </p>
          </div>
        </main>
      </div>
    )
  }

  if (screen === 'done') {
    return (
      <div className="shell">
        <main className="shell__main complete">
          <div className="complete__inner">
            <h1 className="title">응답이 접수되었습니다</h1>
            <p className="helper">감사합니다. 직원에게 태블릿을 돌려주세요.</p>
          </div>
        </main>
      </div>
    )
  }

  // 'form' | 'submitting'
  return (
    <div className="shell">
      <main className="shell__main">
        <div className="followUp">
          <h1 className="question">간단 재확인</h1>
          <p className="helper">지난 방문 이후 상태를 간단히 알려주세요 (30초 정도 소요됩니다).</p>

          {targets.map((t) => (
            <section key={t.id} className="followUp__section">
              <h2 className="followUp__label">{t.label}</h2>
              <p className="followUp__targetHint">지금 상태를 숫자나 짧은 말로 적어주세요 (예: 통증 4, 걷기 40분)</p>
              <TextInputField
                mode="short_text"
                value={targetAnswers[t.id] ?? ''}
                onChange={(v) => setTargetAnswers((m) => ({ ...m, [t.id]: v }))}
                maxLength={200}
                placeholder="현재 상태"
              />
            </section>
          ))}

          <section className="followUp__section">
            <h2 className="followUp__label">전반적인 변화</h2>
            <SingleChoice options={CHANGE_OPTIONS} value={overallChange} onSelect={setOverallChange} layout="compact3" />
          </section>

          <section className="followUp__section">
            <h2 className="followUp__label">새로 생긴 증상이 있나요?</h2>
            <SingleChoice options={YES_NO_OPTIONS} value={newSymptom} onSelect={setNewSymptom} layout="compact3" />
            {newSymptom === 'yes' && (
              <TextInputField
                mode="short_text"
                value={newSymptomNote}
                onChange={setNewSymptomNote}
                maxLength={200}
                placeholder="어떤 증상인가요?"
              />
            )}
          </section>

          <section className="followUp__section">
            <h2 className="followUp__label">치료 후 불편했던 점이 있나요?</h2>
            <SingleChoice options={YES_NO_OPTIONS} value={adverseEffect} onSelect={setAdverseEffect} layout="compact3" />
            {adverseEffect === 'yes' && (
              <TextInputField
                mode="short_text"
                value={adverseEffectNote}
                onChange={setAdverseEffectNote}
                maxLength={200}
                placeholder="어떤 점이 불편했나요?"
              />
            )}
          </section>

          {submitError && (
            <p className="notice" role="alert">
              {submitError}
            </p>
          )}

          <button
            type="button"
            className="primaryBtn"
            disabled={!allAnswered || screen === 'submitting'}
            onClick={handleSubmit}
          >
            {screen === 'submitting' ? '전송 중입니다' : '제출'}
          </button>
        </div>
      </main>
    </div>
  )
}
