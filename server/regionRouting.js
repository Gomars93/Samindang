// 구동 부위(driving region) 결정 — `src/doctor/workspace/regionRouting.ts`의
// 문자 그대로 포팅. 서버는 TS를 import할 수 없으므로 같은 규칙을 여기 두고,
// `tests/region-pack.spec.mjs`가 한 fixture 표로 둘을 함께 돌려 어긋나면
// 실패한다. 규칙의 이유는 TS 쪽 헤더 참고(PO 결정 2026-09-06 Q5).
export const REGION_KEYS = Object.freeze(['lbp', 'neck', 'shoulder', 'knee', 'hip', 'ankle_foot', 'elbow', 'wrist_hand', 'tmj'])

function isRecord(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function drivingRegion(responses) {
  if (!isRecord(responses)) return null
  const flags = isRecord(responses.safety_flags) ? responses.safety_flags : {}
  const modules = isRecord(responses.modules) ? responses.modules : {}
  const present = REGION_KEYS.filter((k) => flags[k] != null)
  if (present.length === 0) return null

  const has = (k) => present.includes(k)

  if (has('neck') && has('shoulder')) {
    const shoulder = isRecord(modules.shoulder) ? modules.shoulder : {}
    return shoulder.primary_focus === 'SHOULDER_DOMINANT' ? 'shoulder' : 'neck'
  }
  if (has('lbp') && has('hip')) {
    const hip = isRecord(modules.hip) ? modules.hip : {}
    return hip.region_discriminator === 'HIP_GROIN_DOMINANT' ? 'hip' : 'lbp'
  }
  return present[0]
}

/** 구동 후보 순서 — TS `drivingRegionCandidates`의 포팅(이유는 그쪽 주석). */
export function drivingRegionCandidates(responses) {
  const first = drivingRegion(responses)
  if (first === null || !isRecord(responses)) return []
  const flags = isRecord(responses.safety_flags) ? responses.safety_flags : {}
  const rest = REGION_KEYS.filter((k) => k !== first && flags[k] != null)
  return [first, ...rest]
}
