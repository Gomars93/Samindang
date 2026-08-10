import { useState } from 'react'
import { isValidWorkstationId, presetWorkstationIds, setStoredWorkstationId } from './workstation'

/**
 * 최초 1회(또는 미설정 시) 진료 워크스테이션을 고르는 화면. 오타 방지를
 * 위해 프리셋 버튼 선택이 기본이고, 자유 입력은 "기타" 케이스로만 보조
 * 제공한다 — 둘 다 같은 형식 검증을 통과해야 저장된다.
 */
export function WorkstationSetup({ onSet }: { onSet: (id: string) => void }) {
  const presets = presetWorkstationIds()
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function choose(id: string) {
    if (!isValidWorkstationId(id)) {
      setError('워크스테이션 ID는 영문/숫자/-(하이픈)/_(밑줄)만 사용, 1~32자여야 합니다.')
      return
    }
    setStoredWorkstationId(id)
    onSet(id)
  }

  return (
    <div className="doctor__banner">
      <strong>워크스테이션 설정 필요</strong>
      <p>이 PC/브라우저에서 사용할 진료 워크스테이션을 선택하세요. 선택 후에는 브라우저 재시작 후에도 그대로 유지됩니다.</p>
      <div className="doctor__pickerRow">
        {presets.map((id) => (
          <button key={id} type="button" className="judgment__recordBtn" onClick={() => choose(id)}>
            {id}
          </button>
        ))}
        <button type="button" className="judgment__recordBtn" onClick={() => setCustomMode(true)}>
          기타(직접 입력)
        </button>
      </div>
      {customMode && (
        <div className="doctor__pickerRow">
          <input value={customValue} onChange={(e) => setCustomValue(e.target.value)} placeholder="예: DOCTOR-C" />
          <button type="button" className="judgment__recordBtn" onClick={() => choose(customValue.trim())}>
            저장
          </button>
        </div>
      )}
      {error && <p className="doctor__empty">{error}</p>}
    </div>
  )
}
