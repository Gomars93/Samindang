/**
 * 구동 부위(driving region) 결정 — 부위 팩 일반화 §3.4
 * (`docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`, PO 결정 2026-09-06 Q5).
 *
 * 한 환자에 부위 안전 플래그가 2개 non-null인 경우가 둘 있다(문진 모집단 공유):
 *   - 목·어깨: `IS_PRIMARY_NECK` 하나로 둘 다 계산되고 `NS01`이 초점을 태그한다.
 *   - 요통·고관절: `low_back_pelvis` 모집단을 공유하고 `HIP_00`이 판별한다.
 * 안전 패널은 지금처럼 둘 다 렌더한다. **L1~L8 팩(검사 제안·목표 기능·가설·
 * 운동·세부문진)은 하나만 구동한다** — 두 팩이 동시에 돌면 운동 후보가 섞인다.
 *
 * 규칙(원장 추천안 채택, DECISIONS 2026-09-06):
 *   - 목·어깨 둘 다 → `NS01 === 'SHOULDER_DOMINANT'`이면 어깨, 그 밖(NECK_DOMINANT/
 *     SIMILAR/UNKNOWN/미응답)은 목.
 *   - 요통·고관절 둘 다 → `HIP_00 === 'HIP_GROIN_DOMINANT'`이면 고관절, 그 밖
 *     (LOW_BACK/BUTTOCK_PELVIS/SIMILAR_OR_MULTIPLE/UNKNOWN/미응답)은 요통. 엉덩이·
 *     골반 우세를 요통으로 두는 이유: 요통 팩의 가설 패턴에 이미 고관절 기여·
 *     천장관절 기여가 있고 고관절 선별 검사도 수동 추가 항목에 있어, 그 환자를
 *     요통 관리 체계 안에서 보는 것이 기존 설계와 맞는다.
 *   - 그 밖에는 `REGION_KEYS` 선언 순서에서 첫 non-null 부위.
 *
 * `server/regionRouting.js`는 이 파일의 문자 그대로 포팅이며 `tests/region-pack.spec.mjs`
 * 가 한 fixture 표로 둘을 함께 돌려 어긋나면 실패한다.
 */
import { REGION_KEYS, type RegionKey } from './regionPack'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function drivingRegion(responses: unknown): RegionKey | null {
  if (!isRecord(responses)) return null
  const flags = isRecord(responses.safety_flags) ? responses.safety_flags : {}
  const modules = isRecord(responses.modules) ? responses.modules : {}
  const present = REGION_KEYS.filter((k) => flags[k] != null)
  if (present.length === 0) return null

  const has = (k: RegionKey) => present.includes(k)

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

/**
 * 구동 후보 순서 — 판별 결과가 첫째, 나머지 non-null 부위가 `REGION_KEYS` 순서로
 * 뒤따른다. 호출부(`activeDrivingPack`)는 이 순서에서 **첫 승인 팩**을 쓴다.
 *
 * 왜 후보 목록인가: 판별 결과 부위의 팩이 아직 승인 전이면(예: HIP_00=고관절
 * 우세인데 고관절 팩은 DRAFT) 같은 모집단의 승인된 팩(요통)으로 되돌아가야
 * 한다. 그렇지 않으면 그 환자는 R2 이전까지 받던 요통 가설·단계·운동 카드를
 * 잃는다(회귀). 고관절 팩이 승인되는 순간 자연히 고관절이 앞선다.
 */
export function drivingRegionCandidates(responses: unknown): RegionKey[] {
  const first = drivingRegion(responses)
  if (first === null || !isRecord(responses)) return []
  const flags = isRecord(responses.safety_flags) ? responses.safety_flags : {}
  const rest = REGION_KEYS.filter((k) => k !== first && flags[k] != null)
  return [first, ...rest]
}
