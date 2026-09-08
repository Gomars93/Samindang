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
 *   - 팔꿈치·손목/손 둘 다(문진이 FOREARM/DIFFUSE_OR_MULTIPLE/UNKNOWN에서 두 플래그를
 *     같이 세운다) → 팔꿈치. `ELBOW_00 === 'WRIST_HAND'`면 손목/손(실제로는 팔꿈치
 *     플래그가 없어 단독 부위로 온다). 손목/손 팩으로의 후퇴는 없다.
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
  // 팔꿈치·손목/손 둘 다 — 문진 자체가 `ELBOW_00`이 FOREARM/DIFFUSE_OR_MULTIPLE/
  // UNKNOWN일 때 두 안전 플래그를 **동시에** 세운다(coreSpec `IS_PRIMARY_*_SAFETY`
  // 의 의도적 겹침, 원위 요골 골절 fail-open 방지). `ELBOW_00 === 'WRIST_HAND'`는
  // 팔꿈치 플래그를 세우지 않으므로 여기 오지 않는다. 그 세 값은 문진의 주부위
  // 라벨도 'ELBOW'이므로 팔꿈치가 구동한다 — 손목/손 팩(승인)을 덧씌우지 않는다
  // (어깨 → 목 거부와 같은 원칙; 팔꿈치 팩 승인이 진짜 해법, 2026-09-08 Fable F-1).
  if (has('elbow') && has('wrist_hand')) {
    const elbow = isRecord(modules.elbow) ? modules.elbow : {}
    return elbow.region_discriminator === 'WRIST_HAND' ? 'wrist_hand' : 'elbow'
  }
  return present[0]
}

/**
 * 판별 부위의 팩이 승인 전일 때 대신 구동해도 되는 부위 — **명시된 쌍만**.
 * 고관절 → 요통: 같은 `low_back_pelvis` 모집단이고 요통 팩의 가설에 고관절 기여·
 * 천장관절 기여가 이미 있어 그 환자를 요통 관리 체계에서 보는 것이 R2 이전과
 * 같다(회귀 방지가 목적). **어깨 → 목은 허용하지 않는다**(2026-09-07 목 활성화
 * 시점 결정): 어깨 우세 환자에게 목 가설 칩·목 운동 후보를 새로 보여주는 것은
 * 회귀 방지가 아니라 다른 부위의 판단을 덧씌우는 일이다. 어깨 팩이 승인되기
 * 전까지 그 환자는 R2 이전처럼 안전 패널만 본다.
 */
const FALLBACK_REGIONS: Partial<Record<RegionKey, readonly RegionKey[]>> = {
  hip: ['lbp'],
}

/**
 * 구동 후보 순서 — 판별 결과가 첫째, 그 뒤에 `FALLBACK_REGIONS`에 적힌 부위 중
 * 이 환자에게 non-null인 것만 뒤따른다. 호출부(`activeDrivingPack`, 서버
 * `detailCheckQuestionIdsForCandidates`)는 이 순서에서 **첫 승인 팩**을 쓴다.
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
  const rest = (FALLBACK_REGIONS[first] ?? []).filter((k) => k !== first && flags[k] != null)
  return [first, ...rest]
}
