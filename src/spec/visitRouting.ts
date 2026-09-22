import type { Responses } from '../types'

/**
 * 방문 목적 → 주호소 정규화의 **단일 진실 공급원**.
 *
 * 원래 이 함수들은 `coreSpec.ts` 안에만 있었고, `hipQuestions.ts` /
 * `tmjQuestions.ts`는 같은 판단을 raw 필드로 **따로 적어** 썼다
 * (`VISIT_01==='symptom' && VISIT_02_SYMPTOM_MAIN==='pain'`).
 * 새 첫 화면 `VISIT_00_INTENT`가 도입되면서 coreSpec 쪽만 정규화를 타고
 * 두 파일은 raw 경로에 남아, `VISIT_00_INTENT='pain_care'`로 들어온 환자가
 * **HIP_00 / HFJ_00과 그 뒤 안전 문항 전체를 건너뛰고 안전 플래그가
 * 계산되지 않는** 회귀가 생겼다.
 *
 * 그래서 게이트 판단을 이 모듈 하나로 모은다. `coreSpec`이 `hipQuestions`/
 * `tmjQuestions`를 import하므로 그 반대 방향 import는 순환이 된다 — 양쪽이
 * 모두 의존할 수 있는 **하위 모듈**이어야 같은 드리프트가 구조적으로
 * 불가능해진다. 새 MSK 모듈도 여기 있는 `IS_PRIMARY_PAIN`만 쓴다.
 *
 * 임상 규칙은 하나도 바뀌지 않는다 — 여기 있는 함수 본문은 coreSpec에
 * 있던 것을 글자 그대로 옮긴 것이다.
 */

/**
 * VISIT_00_INTENT(신규) + VISIT_00B_HERBAL_PURPOSE(신규, 한약 route 전용)를
 * 기존 VISIT_01/VISIT_02_SYMPTOM_MAIN/VISIT_02_CONST raw 값으로 매핑한다.
 * 새 clinical value가 아니라 순수 routing 표현이며, 이 함수들 밖으로는
 * 절대 새 값이 노출되지 않는다(payload의 visit_goal/primary_symptom/
 * constitution_goal은 모두 이 함수들이 리턴하는 기존 enum 문자열 그대로다).
 */
export function visitGoal(r: Responses): string | null {
  const intent = r['VISIT_00_INTENT']
  if (intent === 'pain_care' || intent === 'symptom_consult' || intent === 'undecided') return 'symptom'
  if (intent === 'herbal') {
    return r['VISIT_00B_HERBAL_PURPOSE'] === 'symptom' ? 'symptom' : 'constitution'
  }
  if (intent === 'women') return 'women'
  if (intent === 'weight') return 'weight'
  // 하위호환: 새 intent 질문을 거치지 않고 raw Responses를 직접 구성한
  // 기존 테스트/fixture 경로 -- 기존 VISIT_01 값을 그대로 사용한다.
  const raw = r['VISIT_01']
  return typeof raw === 'string' ? raw : null
}

export function effectiveSymptomMain(r: Responses): string | null {
  // pain_care는 "불편한 증상이 있어요 → 아픈 곳이 있어요" 두 단계를
  // 반복하지 않고 곧장 Pain module로 연결한다(요청 §4) -- 화면 자체를
  // 숨기는 대신(showIf) 이 값을 가상으로 'pain'으로 귀결시킨다.
  if (r['VISIT_00_INTENT'] === 'pain_care') return 'pain'
  const v = r['VISIT_02_SYMPTOM_MAIN']
  return typeof v === 'string' ? v : null
}

export function effectiveConstGoal(r: Responses): string | null {
  if (r['VISIT_00_INTENT'] === 'herbal') {
    const purpose = r['VISIT_00B_HERBAL_PURPOSE']
    if (purpose === 'tonic') return 'tonic'
    if (purpose === 'overall_check') return 'constitution'
    if (purpose === 'undecided') return 'general'
    return null // 'symptom' 선택 시 constitution route가 아니라 symptom bucket으로 이어진다.
  }
  const raw = r['VISIT_02_CONST']
  return typeof raw === 'string' ? raw : null
}

/**
 * 주호소를 secondary_concerns 카테고리 값으로 정규화한다.
 * pregnancy/postpartum은 동반문제 화면에 별도 항목이 없으므로 women으로 합친다.
 * 체질·보약(visit_goal=constitution)은 동반문제 카테고리가 없으므로 null.
 */
export const primaryConcernKey = (r: Responses): string | null => {
  const goal = visitGoal(r)
  if (goal === 'symptom') {
    const v = effectiveSymptomMain(r)
    return typeof v === 'string' ? v : null
  }
  if (goal === 'women') {
    const v = r['VISIT_02_WOMEN']
    return typeof v === 'string' ? v : null
  }
  if (goal === 'weight') return 'weight'
  return null
}

/** 추가 상세 문진에서 명시 선택한 주호소(primary가 아니어도 module을 연다). */
export const hasDetailedConcern = (r: Responses, key: string): boolean => r['ADDITIONAL_DETAIL_01'] === key

// Tablet UX v2.1 §16: Primary가 pain이 아니어도 Additional detailed로
// pain을 명시 선택하면 기존 PAIN_01 Body Map -> 기존 regional router(LBP/
// NECK/SHOULDER/KNEE/ELBOW/WRIST_HAND/ANKLE_FOOT/TMJ/HIP) -> 기존 MSK
// safety module을 그대로 탄다 -- 이 값들은 모두 IS_PRIMARY_PAIN에서
// 파생되므로 이 한 곳만 확장하면 전부 일관되게 적용된다.
export const IS_PRIMARY_PAIN = (r: Responses) => primaryConcernKey(r) === 'pain' || hasDetailedConcern(r, 'pain')
