import { useState } from 'react'
import { clearStoredDoctorToken, setStoredDoctorToken } from './doctorToken'

/**
 * LAN(다른 PC)에서 서버 제출목록에 접근할 때 필요한 x-doctor-token 입력
 * 화면. 값은 sessionStorage에만 저장한다(탭 종료 시 사라짐) — 화면에 평문
 * 재표시하지 않고, 로그에도 남기지 않는다.
 */
export function DoctorTokenSetup({ onSet, authFailed }: { onSet: () => void; authFailed?: boolean }) {
  const [value, setValue] = useState('')

  function save() {
    const trimmed = value.trim()
    if (!trimmed) return
    setStoredDoctorToken(trimmed)
    setValue('')
    onSet()
  }

  return (
    <div className="doctor__banner doctor__banner--danger">
      <strong>{authFailed ? '인증 실패 — token을 확인하세요' : '원장 인증 필요'}</strong>
      <p>다른 PC에서 서버에 접근하려면 x-doctor-token이 필요합니다. 이 탭에서만 유지됩니다(브라우저 재시작 시 사라짐).</p>
      <div className="doctor__pickerRow">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          placeholder="doctor token"
          aria-label="doctor token"
        />
        <button type="button" className="judgment__recordBtn" onClick={save}>
          저장
        </button>
      </div>
    </div>
  )
}

export function DoctorTokenClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      className="judgment__recordBtn"
      onClick={() => {
        clearStoredDoctorToken()
        onClear()
      }}
    >
      token 지우기
    </button>
  )
}
