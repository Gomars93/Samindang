/**
 * Doctor View 재설계 v0.2 §11.4 — "오늘 확인" 목록.
 *
 * 권장 검사(안전 모듈 행의 `examCodes`를 모듈 구분 없이 통합) + 미확인 항목
 * (수술·입원력 종류/시기, 추가 전달사항, 기타 확인 — 자동 집계)을 한 목록으로
 * 보여준다. 최대 5행 + "n건 더" 펼치기, 항목이 0개면 블록 자체를 렌더하지
 * 않는다.
 *
 * invariant 5 (§13): 체크 상태는 안전 pill/상태 행/잠금 문구에 어떤 영향도
 * 주지 않는다 — 이 컴포넌트는 `SafetyModuleRow[]`를 읽기만 하고 안전 계산
 * 경로(`computeSafetyModuleRows`/`deriveSafetyOverview`)에 절대 값을 쓰지
 * 않는다. 체크 상태 자체도 임상 기록이 아니라 "진행 메모"일 뿐이므로 저장
 * 계약(judgment/submission) 밖 — sessionStorage에만, 방문 스코프로 둔다.
 */
import { useEffect, useState } from 'react'
import { otherDetailChecklistFlags } from './SafetySection'
import type { SafetyModuleRow } from './safetyModules'
import type { DoctorPayload } from './types'

type ChecklistItem = { id: string; text: string }

function buildChecklistItems(payload: DoctorPayload, rows: SafetyModuleRow[]): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const seenExamLabels = new Set<string>()
  for (const row of rows) {
    for (const exam of row.examCodes) {
      // 두 모듈이 같은 검사를 겹쳐 추천하는 드문 경우, 목록에 같은 문구를
      // 두 번 보여주지 않는다(§11.4는 "권장 검사 통합"을 요구한다).
      if (seenExamLabels.has(exam.label)) continue
      seenExamLabels.add(exam.label)
      items.push({ id: `exam:${row.key}:${exam.code}`, text: exam.label })
    }
  }

  const r = payload.responses
  if (r.surgery_history.surgery_yn === 'yes') {
    items.push({ id: 'unconfirmed:surgery', text: '수술·입원력 종류/시기 확인' })
  }
  if (r.free_text.free_text_yn === 'yes') {
    items.push({ id: 'unconfirmed:free_text', text: '추가 전달사항 확인' })
  }
  const otherFlags = otherDetailChecklistFlags(r)
  if (otherFlags.length > 0) {
    items.push({ id: 'unconfirmed:other', text: `기타 확인 — ${otherFlags.join(', ')}` })
  }

  return items
}

function readChecklistState(storageKey: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    // 프라이빗 모드 등 sessionStorage 접근 불가 — 비-임상 진행 메모이므로
    // 조용히 빈 상태로 되돌아간다(throw 금지).
    return {}
  }
}

function writeChecklistState(storageKey: string, state: Record<string, boolean>): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(state))
  } catch {
    // 저장 실패해도 화면 동작에는 영향이 없어야 한다 — 조용히 무시.
  }
}

const MAX_VISIBLE = 5

export function TodayChecklist({
  payload,
  rows,
  interactive,
  scopeKey,
}: {
  payload: DoctorPayload
  /** computeSafetyModuleRows가 이미 계산해 둔 결과를 그대로 받는다 — 새 계산 경로를 만들지 않는다. */
  rows: SafetyModuleRow[]
  /** 서버 모드에서만 true — 체크박스 활성화 + sessionStorage 지속. fixtures는 항상 false(읽기 전용). */
  interactive: boolean
  /** sessionStorage 키 스코프(visit_id 우선, 없으면 submission id로 대체). interactive일 때만 쓰인다. */
  scopeKey?: string
}) {
  const items = buildChecklistItems(payload, rows)
  const storageKey = interactive && scopeKey ? `doctor_checklist_${scopeKey}` : null

  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    storageKey ? readChecklistState(storageKey) : {},
  )
  const [expanded, setExpanded] = useState(false)

  // 방문/제출건이 바뀌면(storageKey 변경) 그 방문의 저장된 상태로 새로
  // 읽어온다 — 이전 방문의 체크 상태가 새 방문에 새어 들어가지 않게 한다.
  useEffect(() => {
    setChecked(storageKey ? readChecklistState(storageKey) : {})
    setExpanded(false)
  }, [storageKey])

  if (items.length === 0) return null

  function toggle(id: string) {
    if (!storageKey) return
    setChecked((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      writeChecklistState(storageKey, next)
      return next
    })
  }

  const visible = expanded ? items : items.slice(0, MAX_VISIBLE)
  const hiddenCount = items.length - visible.length
  const checkedCount = items.filter((it) => checked[it.id]).length

  return (
    <section className="doctor__section doctor__todayChecklist">
      <h2>오늘 확인</h2>
      <ul className="doctor__checklist">
        {visible.map((it) => (
          <li key={it.id} className="doctor__checklist__item">
            <label>
              <input
                type="checkbox"
                disabled={!interactive}
                checked={interactive ? Boolean(checked[it.id]) : false}
                onChange={() => toggle(it.id)}
              />
              <span>{it.text}</span>
            </label>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 && (
        <button type="button" className="doctor__checklist__more" onClick={() => setExpanded(true)}>
          {hiddenCount}건 더
        </button>
      )}
      {interactive && (
        <p className="doctor__checklist__counter">
          진행 메모 {checkedCount}/{items.length} (비-임상 기록)
        </p>
      )}
    </section>
  )
}
