/**
 * Common Safety area — extracted unchanged from DoctorView.tsx's inline
 * urgent-redflag banner + "안전정보 한눈에" (SafetyGlance) block (PR #24
 * Phase 2). Same computed inputs (DoctorPayload) and same rendered output
 * as before the extraction; this file only moves the code so the new
 * Doctor Workspace shell can render it once, above every profile/tab,
 * instead of it living inline in one giant component.
 *
 * This is presentation-only. It reads already-computed flags/responses; it
 * does not compute anything new and does not decide any clinical meaning.
 */
import { answerLabel, optionLabels } from './labels'
import type { AnswerValue } from '../types'
import type { DoctorPayload } from './types'

type Responses = DoctorPayload['responses']

/**
 * 레거시/손상된 제출은 배열이어야 할 필드가 문자열/객체 등 다른 타입으로
 * 저장돼 있을 수 있다 -- nullish 병합만으로는 안 막힌다(값 자체가 존재하고
 * truthy면 그대로 통과한다), 그리고 문자열이면 `.includes()`가 던지지 않고
 * 부분 문자열 매치로 사실을 지어낼 수도 있다. 배열이 아니면 무조건 빈
 * 배열로 취급한다.
 */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/**
 * MED_USE/ALLERGY_01/SURGERY_01/FREE_01(coreSpec.ts)은 전부 `required: true`,
 * `showIf` 없이 모든 환자에게 항상 나오는 단일선택 문항이고 값 집합이
 * 고정돼 있다 -- 그래서 실제 제출은 이 필드들이 절대 null이거나 이
 * 목록 밖의 값일 수 없다. null/다른 값이면 "환자가 없다고 답함"이 아니라
 * 레거시/손상 데이터다.
 *
 * 7차 독립 리뷰 HIGH-2: 이전 구현은 `value != null &&`로 시작해서 null/
 * undefined를 "읽을 수 있음"으로 잘못 취급했다 -- 바로 위 주석이 스스로
 * "null이면 손상"이라고 선언한 것과 모순된다. 이 필드들은 위에서 설명한
 * 이유로 실제 제출에서 null일 수 없으므로, null도 다른 wrong-typed 값과
 * 동일하게 "읽을 수 없음"으로 판정해야 한다.
 */
function isUnreadableYesNoUnknown(value: unknown, allowed: readonly string[]): boolean {
  return !(typeof value === 'string' && allowed.includes(value))
}

const YES_UNKNOWN_NONE = ['yes', 'unknown', 'none'] as const
const YES_NONE = ['yes', 'none'] as const

/**
 * medical_history_flags(HISTORY_01)도 위와 같은 이유로 항상 배열이어야
 * 한다. 7차 독립 리뷰 LOW-1: 컨테이너가 배열인지만 확인하면(이전 구현)
 * 원소 중 하나가 문자열이 아닐 때(`[null, {}, 'not_a_real_option']`류)
 * 그대로 통과해 SafetyGlance 칩에 "[object Object]" 같은 값이 그대로
 * 노출된다 -- DoctorView.tsx의 isNullOrStringArray와 같은 기준(원소까지
 * 문자열인지)으로 통일한다.
 */
function isUnreadableStringArray(value: unknown): boolean {
  return !(Array.isArray(value) && value.every((v) => typeof v === 'string'))
}

/**
 * 8차 독립 리뷰 HIGH-2: 이전 주석("reproductive_status.derived는 남성 등
 * 정상적으로 null일 수 있다")은 사실이 아니다 -- coreSpec.ts
 * deriveReproductiveStatus는 어떤 경로에서도 절대 null을 반환하지 않고
 * 항상 `{source, raw, pregnant, pregnancy_possible, postpartum_1y,
 * breastfeeding}` 6개 키를 가진 객체를 반환한다(남성/미응답이면
 * source=null과 나머지 필드가 모두 null인 객체). `derived === null`은
 * 이 필드가 아예 추가되기 전의 레거시 레코드이거나 손상된 데이터일
 * 뿐이다 -- 그런데 이걸 정상 케이스로 착각해 판정에서 빼면, 실제
 * WOMEN_SAFETY_01에 임신 사실이 보고됐어도(reproductive_status.
 * reproductive_status가 배열) derived가 null이라는 이유만으로
 * "특이 안전정보 없음"이 그대로 나온다(정책 1/2 위반, 가장 위험한
 * 종류의 fail-open). 세 가지를 함께 검사한다: (1) derived 자체가
 * plain object가 아니면 손상, (2) WOMEN_SAFETY_01 원본 응답이 배열인데
 * derived.source가 null이면 모순(재계산 안 됨), (3) pregnant/
 * pregnancy_possible/postpartum_1y/breastfeeding 각 필드가
 * boolean이나 null이 아닌 다른 타입이면 손상(예: 잘못된 truthy 값이
 * 임신/수유 사실을 지어낼 수 있다).
 */
/**
 * 9차 독립 리뷰 HIGH-3: 위 HIGH-2 검사는 타입/구조만 볼 뿐, derived의
 * boolean 값들이 실제 WOMEN_SAFETY_01 원본 응답과 일치하는지는 보지
 * 않았다 -- 구조적으로 완벽한 derived가 실제로는 재계산되지 않은 채
 * 남아있으면(예: raw가 예전 응답 그대로) 여전히 통과한다. coreSpec.ts
 * deriveReproductiveStatus의 WOMEN_SAFETY_01 분기(source==='WOMEN_SAFETY_01'
 * 일 때만 해당 -- pregnancy_module/postpartum_module 출처는 PREGNANCY_01/
 * POSTPARTUM_01/03이라는 다른 질문에서 오므로 이 필드로는 재계산할 수
 * 없어 검사 대상에서 제외한다)은 `raw: answer` 그대로 저장하고
 * `pregnant`/`postpartum_1y`/`breastfeeding`은 각각 `answer.includes(...)`
 * 그대로다 -- 이 세 필드는 예외 없는 등식이므로 안전하게 대조할 수 있다.
 * `pregnancy_possible`만 `PREGNANCY_01==='possible'` 모듈 오버라이드로
 * `raw`에 없어도 true일 수 있어(coreSpec.ts:3860-3861,3877), 그 방향만
 * 예외로 둔다(raw가 있는데 derived가 없다고 하면만 모순).
 */
// coreSpec.ts deriveReproductiveStatus의 POSTPARTUM_WITHIN_1Y와 동일 (FROZEN
// 파일이 아니므로 값이 바뀔 수 있지만, 바뀌면 이 재계산도 함께 갱신해야 한다).
const POSTPARTUM_WITHIN_1Y = ['within_6_weeks', '6w_to_3m', '3_to_6m', '6_to_12m']

/** 14차 독립 리뷰 HIGH-2: DoctorView.tsx의 동명 상수와 동일. */
const WOMEN_SAFETY_01_VALUES = new Set([
  'pregnant',
  'pregnancy_possible',
  'postpartum_1y',
  'breastfeeding',
  'menopause',
  'none',
  'unknown',
])

/** 15차 독립 리뷰 HIGH-2: DoctorView.tsx의 동명 상수와 동일. */
const POSTPARTUM_01_VALUES = new Set(['within_6_weeks', '6w_to_3m', '3_to_6m', '6_to_12m', 'over_1y'])
const POSTPARTUM_03_VALUES = new Set(['yes', 'no', 'mixed'])
/** 16차 독립 리뷰 HIGH-1: DoctorView.tsx의 동명 상수와 동일. */
const PREGNANCY_01_VALUES = new Set(['pregnant', 'possible', 'trying', 'fertility', 'unknown'])

function isReproductiveDerivedInconsistentWithRawAnswer(d: Record<string, unknown>, r: Responses): boolean {
  const rawAnswer = r.reproductive_status.reproductive_status
  // 12차 독립 리뷰 HIGH-1/HIGH-2: 컨텍스트(visit_goal/modules.pregnancy·
  // postpartum)로부터 "실제로 있어야 하는 source"를 먼저 결정한 뒤,
  // 관찰된 d.source가 그 값과 정확히 일치하는지 먼저 확인한다 -- 이전
  // 구현은 source별 분기(if)만 검사해서 (a) 세 값 중 어느 것과도
  // 일치하지 않는 wrong-typed/엉뚱한 source가 마지막 `return false`까지
  // 통과해 "정상"으로 판정되고(HIGH-1), (b) 컨텍스트가 실제로 임신/
  // 산후인데 source가 WOMEN_SAFETY_01이거나 null인 "반대 방향" 불일치는
  // 전혀 검사하지 않는(HIGH-2) 두 공백을 모두 남겼다. DoctorView.tsx의
  // 동명 함수와 동일한 계산식.
  const isPregnancyContext =
    r.visit_goal?.visit_goal === 'women' &&
    r.visit_goal?.women_goal === 'pregnancy' &&
    r.modules?.pregnancy?.status === 'pregnant'
  const isPostpartumContext = r.visit_goal?.visit_goal === 'women' && r.visit_goal?.women_goal === 'postpartum'
  const expectedSource: 'pregnancy_module' | 'postpartum_module' | 'other' = isPostpartumContext
    ? 'postpartum_module'
    : isPregnancyContext
      ? 'pregnancy_module'
      : 'other'
  if (expectedSource === 'pregnancy_module' && d.source !== 'pregnancy_module') return true
  if (expectedSource === 'postpartum_module' && d.source !== 'postpartum_module') return true
  if (expectedSource === 'other' && d.source !== 'WOMEN_SAFETY_01' && d.source !== null) return true

  // 13차 독립 리뷰 LOW-3: raw 응답이 존재하는데(null/undefined 아님) 배열이
  // 아니면 deriveReproductiveStatus는 절대 처리하지 못한다 -- 이 경우
  // source: null은 "미해당"이 아니라 "환자가 답했지만 계산되지 못함"이다.
  // DoctorView.tsx의 동명 함수와 동일한 이유/수정: 이전엔 이 조합이 아래
  // source별 분기 어디에도 걸리지 않고 마지막 `return false`까지 통과해
  // "정상"으로 판정됐다 -- safetyGlanceItems의 임신/수유 항목이 조용히
  // 생략되고 "읽을 수 없음" 경고도 뜨지 않아, 실제로 보고된(그러나
  // 처리되지 못한) 응답이 있다는 사실 자체가 사라졌다.
  if (rawAnswer !== null && rawAnswer !== undefined && !Array.isArray(rawAnswer) && d.source == null) {
    return true
  }

  if (d.source === 'WOMEN_SAFETY_01') {
    // 13차 독립 리뷰 HIGH-1: coreSpec.ts deriveReproductiveStatus는
    // `if (Array.isArray(answer))`일 때만 source:'WOMEN_SAFETY_01'을
    // 만든다 -- 이 source이면서 raw 응답이 배열이 아닌 상태는 정의상
    // 손상된 조합이다. 이전 구현은 `return false`("정상")로 조용히
    // 통과시켰다 -- DoctorView.tsx의 동명 함수와 동일한 이유/수정.
    if (!Array.isArray(rawAnswer)) return true
    // 14차 독립 리뷰 HIGH-2: DoctorView.tsx의 동명 검사와 동일한 이유/수정
    // -- WOMEN_SAFETY_01은 `required: true`인 multi_choice라서 앱을 거친
    // 실제 제출은 이 배열이 절대 비어있을 수 없다(QuestionScreen.tsx의
    // isAnswered가 length > 0을 요구). 이전 구현은 멤버십만 검사해서
    // `[]`/`["zzz"]`/`[{}]` 같은 손상된 raw가 모든 `rawSet.has(...)`
    // 검사를 그냥 false로 통과시켜 "정상"으로 판정됐다.
    if (
      rawAnswer.length === 0 ||
      (rawAnswer as unknown[]).some((v) => typeof v !== 'string' || !WOMEN_SAFETY_01_VALUES.has(v))
    ) {
      return true
    }
    if (!Array.isArray(d.raw)) return true
    const rawSet = new Set(rawAnswer)
    // 16차 독립 리뷰 HIGH-1: DoctorView.tsx의 동명 검사와 동일한 이유/수정
    // -- coreSpec.ts deriveReproductiveStatus는 key==='pregnancy' &&
    // PREGNANCY_01==='possible'일 때 WOMEN_SAFETY_01 응답에
    // 'pregnancy_possible'이 없어도 pregnancy_possible을 true로
    // override한다. 이전 구현은 이 override 방향을 전혀 검사하지 않아
    // (rawSet.has(...)만 확인), 손상된 derived.pregnancy_possible=false가
    // 실제 override로 만들어진 true와 화면상 구별되지 않고 "정상"
    // 판정을 받았다.
    const pregnancyStatus = r.modules?.pregnancy?.status
    if (typeof pregnancyStatus === 'string' && !PREGNANCY_01_VALUES.has(pregnancyStatus)) return true
    const pregnancyPossibleFromModule =
      r.visit_goal?.visit_goal === 'women' && r.visit_goal?.women_goal === 'pregnancy' && pregnancyStatus === 'possible'
    if (rawSet.size === 1 && rawSet.has('unknown')) {
      if (d.pregnant !== null || d.postpartum_1y !== null || d.breastfeeding !== null) return true
      return d.pregnancy_possible !== (pregnancyPossibleFromModule ? true : null)
    }
    if (rawSet.has('pregnant') && d.pregnant !== true) return true
    if (rawSet.has('postpartum_1y') && d.postpartum_1y !== true) return true
    if (rawSet.has('breastfeeding') && d.breastfeeding !== true) return true
    // 16차 HIGH-1 수정: pregnancy_possible의 기대값을 raw 멤버십 또는
    // module override 둘 중 하나로 정확히 정의할 수 있으므로, 한쪽 방향만
    // 확인하던 이전 검사를 양방향 정확한 동등 비교로 교체한다.
    const expectedPregnancyPossible = rawSet.has('pregnancy_possible') || pregnancyPossibleFromModule
    if (d.pregnancy_possible !== expectedPregnancyPossible) return true
    // 10차 독립 리뷰 LOW-1: 반대 방향도 확인한다 -- pregnant/postpartum_1y/
    // breastfeeding은 pregnancy_possible과 달리 다른 모듈의 정당한 override
    // 경로가 없으므로, derived가 true인데 raw가 그 값을 포함하지 않으면
    // 무조건 모순이다(실제 보고되지 않은 임신/수유 사실을 지어낸 것 --
    // DoctorView.tsx의 동명 검사와 동일하게 반대 방향도 막는다).
    if (d.pregnant === true && !rawSet.has('pregnant')) return true
    if (d.postpartum_1y === true && !rawSet.has('postpartum_1y')) return true
    if (d.breastfeeding === true && !rawSet.has('breastfeeding')) return true
    return false
  }
  if (d.source === 'pregnancy_module') {
    // 11차 독립 리뷰 MEDIUM-1: 이 source는 visit_goal==='women' &&
    // women_goal==='pregnancy' && r.modules.pregnancy.status==='pregnant'
    // 일 때만 coreSpec.ts가 만들고, 그 결과는 항상 고정된 하나의 형태다 --
    // 9/10차는 이 source 전체를 검사 대상에서 제외했지만 실제로는
    // r.modules.pregnancy.status로 재계산 가능하다.
    const isPregnancyContext =
      r.visit_goal?.visit_goal === 'women' &&
      r.visit_goal?.women_goal === 'pregnancy' &&
      r.modules?.pregnancy?.status === 'pregnant'
    if (!isPregnancyContext) return true
    return (
      !Array.isArray(d.raw) ||
      d.raw.length !== 1 ||
      d.raw[0] !== 'pregnant' ||
      d.pregnant !== true ||
      d.pregnancy_possible !== false ||
      d.postpartum_1y !== null ||
      d.breastfeeding !== null
    )
  }
  if (d.source === 'postpartum_module') {
    const isPostpartumContext = r.visit_goal?.visit_goal === 'women' && r.visit_goal?.women_goal === 'postpartum'
    if (!isPostpartumContext) return true
    const since = r.modules?.postpartum?.time_since_delivery
    const feeding = r.modules?.postpartum?.breastfeeding_status
    // 15차 독립 리뷰 HIGH-2: DoctorView.tsx의 동명 검사와 동일한 이유/수정
    // -- POSTPARTUM_01/03은 옵션 목록 밖 값을 낼 수 없으므로, 옵션 밖
    // 문자열이 `.includes(...)`/`===` 비교에서 조용히 false가 되어
    // 손상된 raw 답변으로도 "출산 후 1년 이내: 아니요/모유수유 중:
    // 아니요"를 그대로 계산해 보여주지 않도록 먼저 걸러낸다.
    if (
      (typeof since === 'string' && !POSTPARTUM_01_VALUES.has(since)) ||
      (typeof feeding === 'string' && !POSTPARTUM_03_VALUES.has(feeding))
    ) {
      return true
    }
    const rawParts: string[] = []
    if (typeof since === 'string') rawParts.push(since)
    if (typeof feeding === 'string') rawParts.push(feeding)
    const expectedRaw = rawParts.length > 0 ? rawParts : null
    const expectedPostpartum1y = typeof since === 'string' ? POSTPARTUM_WITHIN_1Y.includes(since) : null
    const expectedBreastfeeding = typeof feeding === 'string' ? feeding === 'yes' || feeding === 'mixed' : null
    const rawMatches =
      expectedRaw === null
        ? d.raw === null
        : Array.isArray(d.raw) &&
          d.raw.length === expectedRaw.length &&
          expectedRaw.every((v, i) => (d.raw as unknown[])[i] === v)
    return (
      d.pregnant !== null ||
      d.pregnancy_possible !== null ||
      d.postpartum_1y !== expectedPostpartum1y ||
      d.breastfeeding !== expectedBreastfeeding ||
      !rawMatches
    )
  }
  return false
}

function isUnreadableReproductiveDerived(r: Responses): boolean {
  // 레거시 레코드는 reproductive_status 최상위 키 자체가 없을 수 있다
  // (9차 독립 리뷰 자체 회귀분석에서 발견된 크래시 -- DoctorView.tsx의
  // 동명 함수와 동일한 이유/수정).
  if (typeof r.reproductive_status !== 'object' || r.reproductive_status === null) return true
  const derived = r.reproductive_status.derived
  if (typeof derived !== 'object' || derived === null || Array.isArray(derived)) return true
  const d = derived as Record<string, unknown>
  if (Array.isArray(r.reproductive_status.reproductive_status) && d.source == null) return true
  const boolOrNullFields = ['pregnant', 'pregnancy_possible', 'postpartum_1y', 'breastfeeding'] as const
  if (boolOrNullFields.some((key) => d[key] !== null && typeof d[key] !== 'boolean')) return true
  return isReproductiveDerivedInconsistentWithRawAnswer(d, r)
}

/**
 * 6차 독립 리뷰 MEDIUM-2: `safetyGlanceItems`가 빈 배열을 반환하는 이유가
 * "정말로 안전 이슈가 없음"과 "안전 관련 필드 자체를 읽을 수 없음"(레거시/
 * 손상 데이터) 둘 다일 수 있는데, 호출부는 이를 구분하지 않고 항상
 * "특이 안전정보 없음"(긍정적 확인 문구)을 그렸다 -- 이미 검증된
 * asArray/optional-chaining 방어는 크래시만 막을 뿐, 각 항목 체크가
 * `=== 'yes'`류 비교라서 null/wrong-typed 값은 그냥 "아니요"와 동일하게
 * 조용히 넘어간다(이 배치가 막으려는 fail-open 그 자체).
 *
 * 8차 독립 리뷰 MEDIUM-1: medication_types(MED_TYPES)/allergy_detail
 * (ALLERGY_02)도 medical_history_flags와 같은 이유로 원소/타입이
 * 검증되지 않으면 optionLabel의 String() fallback을 거쳐
 * "[object Object]" 같은 값이 칩에 그대로 노출된다 -- MED_TYPES는
 * `required:false`/`showIf MED_USE in {yes,unknown}`라 실제 제출에서
 * null이거나 문자열 배열이어야 하고(DoctorView.tsx의
 * isNullOrStringArray와 동일 기준), ALLERGY_02는
 * `required:true`/`showIf ALLERGY_01==='yes'`라 allergy_yn==='yes'일 때
 * 항상 문자열 배열이어야 한다.
 */
function isUnreadableMedicationTypes(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.every((v) => typeof v === 'string'))
}

/**
 * MS_05(sleep_disorder_screen)도 같은 이유로 검사한다 -- flags.
 * sleep_disorder_review/sleep_disorder_priority_review가 true라는 것은
 * computeFlags(coreSpec.ts)가 MS_05 응답 중 특정 값을 실제로 읽었다는
 * 뜻이므로, 그 경우 r.modules.sleep?.menopause?.sleep_disorder_screen이
 * 문자열 배열이 아니면 safetyGlanceItems가 그 값을 그대로
 * answerLabel에 넘겨 "[object Object]"류를 노출할 수 있다.
 */
/**
 * MAJOR-2 (Phase 10 closing review): exported so lane1Summary.ts can fold
 * this in as its own union axis instead of only checking flagsUsable/
 * requires_staff_check -- without it, a record whose SafetyGlance renders
 * "안전정보 일부를 읽을 수 없습니다" (e.g. malformed medication_use) could
 * still read as 🟢 CLEAR on the left-hand lane1 chip while the full record
 * view warns beside it (fail-open, demonstrated live with a medication_use
 * payload). "읽을 수 없음" is a calc-unavailable signal, not a danger
 * verdict -- it must block CLEAR but must NOT by itself raise URGENT.
 */
export function hasUnreadableSafetyField(r: Responses, flags: DoctorPayload['flags']): boolean {
  return (
    isUnreadableYesNoUnknown(r.medication.medication_use, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.allergy.allergy_yn, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.surgery_history.surgery_yn, YES_UNKNOWN_NONE) ||
    isUnreadableYesNoUnknown(r.free_text.free_text_yn, YES_NONE) ||
    isUnreadableStringArray(r.medical_history.medical_history_flags) ||
    isUnreadableReproductiveDerived(r) ||
    isUnreadableMedicationTypes(r.medication.medication_types) ||
    (r.allergy.allergy_yn === 'yes' && isUnreadableStringArray(r.allergy.allergy_detail)) ||
    // 9차 독립 리뷰 자체 회귀분석: flags는 재검증 없이 저장되므로 modules
    // 최상위 키가 아예 없는 레거시 레코드에서도 sleep_disorder_review가
    // true로 남아있을 수 있다 -- r.modules?.sleep으로 방어한다.
    ((flags.sleep_disorder_review || flags.sleep_disorder_priority_review) &&
      isUnreadableStringArray(r.modules?.sleep?.menopause?.sleep_disorder_screen))
  )
}

/**
 * 7차 독립 리뷰 HIGH-1: flags(coreSpec.ts computeFlags)는 태블릿이 제출
 * 시점에 계산해 보내고 서버는 그대로 저장할 뿐 재검증하지 않는다
 * (server/index.js: `flags: body.flags ?? null`) -- 지금까지 이 배치의
 * 모든 라운드가 responses만 강화했고 flags는 isPlainObject인지만
 * 확인했다. computeFlags는 항상 이 7개 boolean 키를 전부 만드므로,
 * 하나라도 없거나 boolean이 아니면 레거시/버전 skew/손상이다 --
 * flags.requires_staff_check/general_red 등을 무조건 신뢰하면, 환자가
 * 실제로 SAFETY_01에 응급 신호를 보고했어도 안전 배너/안전정보
 * 한눈에가 전부 "없음"으로 보일 수 있다(DoctorView.tsx의 동명 헬퍼와
 * 동일한 이유로 여기도 로컬 사본을 둔다).
 */
const REQUIRED_FLAG_KEYS = [
  'general_red',
  'gi_needs_review',
  'bowel_needs_review',
  'sleep_disorder_review',
  'sleep_disorder_priority_review',
  'response_consistency_review',
  'requires_staff_check',
] as const

/**
 * 8차 독립 리뷰 HIGH-3: 7개 키가 전부 boolean이어도(구조적으로 정상)
 * 실제 responses와 모순되면(수기 편집/버전 skew로 flags를 재계산하지
 * 않은 레코드) general_red 등을 그대로 신뢰할 수 없다 --
 * DoctorView.tsx의 동명 헬퍼와 동일한 계산식(coreSpec.ts computeFlags).
 */
function isFlagsConsistentWithResponses(flags: Record<string, unknown>, r: Responses): boolean {
  // 레거시 레코드는 safety_flags/modules/reproductive_status 최상위 키
  // 자체가 없을 수 있다 -- DoctorView.tsx의 동명 헬퍼와 동일한 이유/수정.
  const generalRedExpected = asArray<string>(r.safety_flags?.red_flag_general).some((v) => v !== 'none')
  if (flags.general_red !== generalRedExpected) return false
  const giExpected = r.modules?.gi?.unable_to_eat_or_drink === 'yes'
  if (flags.gi_needs_review !== giExpected) return false
  const bowelExpected = r.modules?.bowel?.blood_or_black_stool === 'yes'
  if (flags.bowel_needs_review !== bowelExpected) return false
  // 9차 독립 리뷰 HIGH-1: DoctorView.tsx의 동명 헬퍼와 동일한 이유로
  // 나머지 4개 키도 재계산해 대조한다.
  const requiresStaffCheckExpected = generalRedExpected || giExpected || bowelExpected
  if (flags.requires_staff_check !== requiresStaffCheckExpected) return false

  const sleepScreen = r.modules?.sleep?.menopause?.sleep_disorder_screen
  const sleepScreenArr = Array.isArray(sleepScreen) ? sleepScreen : []
  const sleepDisorderReviewExpected =
    sleepScreenArr.includes('loud_snoring') || sleepScreenArr.includes('restless_legs_pattern')
  if (flags.sleep_disorder_review !== sleepDisorderReviewExpected) return false
  const sleepDisorderPriorityReviewExpected =
    sleepScreenArr.includes('witnessed_apnea') || sleepScreenArr.includes('choking_gasping')
  if (flags.sleep_disorder_priority_review !== sleepDisorderPriorityReviewExpected) return false

  const ms01 = r.modules?.sleep?.menopause?.stage
  const womenSafety = r.reproductive_status?.reproductive_status
  const womenSafetyHas = (v: string) => Array.isArray(womenSafety) && womenSafety.includes(v)
  const responseConsistencyReviewExpected =
    (ms01 === 'amenorrhea_12m_plus' && (womenSafetyHas('pregnant') || womenSafetyHas('pregnancy_possible'))) ||
    (ms01 === 'still_regular' && womenSafetyHas('menopause'))
  if (flags.response_consistency_review !== responseConsistencyReviewExpected) return false

  return true
}

function isFlagsUsable(flags: unknown, r: Responses): boolean {
  if (typeof flags !== 'object' || flags === null || Array.isArray(flags)) return false
  const f = flags as Record<string, unknown>
  if (!REQUIRED_FLAG_KEYS.every((key) => typeof f[key] === 'boolean')) return false
  return isFlagsConsistentWithResponses(f, r)
}

function safetyGlanceItems(
  r: Responses,
  flags: DoctorPayload['flags'],
): { key: string; label: string; text: string }[] {
  const items: { key: string; label: string; text: string }[] = []

  const medUse = r.medication.medication_use
  if (medUse === 'yes' || medUse === 'unknown') {
    // 8차 독립 리뷰 MEDIUM-1: medication_types가 wrong-typed면(예:
    // 문자열 하나 또는 [null, {}] 같은 배열) answerLabel의 String()
    // fallback을 거쳐 "[object Object]"류를 그대로 노출한다 -- 원소까지
    // 검증해 실패하면 종류 detail을 아예 붙이지 않는다(hasUnreadableSafetyField
    // 쪽 "읽을 수 없음" 경고에 맡긴다).
    const types = isUnreadableMedicationTypes(r.medication.medication_types)
      ? ''
      : answerLabel('MED_TYPES', r.medication.medication_types)
    items.push({
      key: 'medication',
      label: '복용약',
      text: `${answerLabel('MED_USE', medUse)}${types ? ` — ${types}` : ''}`,
    })
  }

  /**
   * 7차 독립 리뷰 LOW-1 후속: medical_history_flags가 배열이지만 원소가
   * 문자열이 아닌 경우(`[null, {}, 'not_a_real_option']`류), 이전 구현은
   * asArray()가 컨테이너만 확인하고 그대로 optionLabels에 넘겨
   * String({})="[object Object]" 같은 값을 "주요 병력" 칩에 그대로
   * 노출시켰다 -- isUnreadableStringArray로 원소까지 검증해 실패하면 이
   * 항목 자체를 만들지 않고 hasUnreadableSafetyField 쪽 "읽을 수 없음"
   * 경고에 맡긴다(아래 SafetyGlance에서 items 유무와 무관하게 표시).
   */
  if (!isUnreadableStringArray(r.medical_history.medical_history_flags)) {
    const historyFlags = asArray<string>(r.medical_history.medical_history_flags).filter(
      (v) => v !== 'none',
    )
    if (historyFlags.length > 0) {
      items.push({ key: 'history', label: '주요 병력', text: optionLabels('HISTORY_01', historyFlags).join(', ') })
    }
  }

  // 8차 독립 리뷰 HIGH-2: derived가 손상됐으면(위 isUnreadableReproductiveDerived)
  // pregnant/pregnancy_possible 등을 truthy로 읽어 임신/수유 사실을
  // 지어낼 수 있으므로, 손상 여부를 먼저 확인하고 정상일 때만 표시한다.
  // 9차 독립 리뷰 자체 회귀분석: isUnreadableReproductiveDerived(r) 가드보다
  // derived 접근이 먼저 평가되면 reproductive_status 최상위 키 자체가 없는
  // 레거시 레코드에서 가드가 실행되기도 전에 여기서 throw된다 -- 가드를
  // 먼저 평가해 short-circuit되게 한다.
  const derived = r.reproductive_status?.derived
  if (
    !isUnreadableReproductiveDerived(r) &&
    derived &&
    (derived.pregnant || derived.pregnancy_possible || derived.postpartum_1y || derived.breastfeeding)
  ) {
    const parts = [
      derived.pregnant && '임신 중',
      derived.pregnancy_possible && '임신 가능성',
      derived.postpartum_1y && '출산 후 1년 이내',
      derived.breastfeeding && '모유수유 중',
    ].filter((v): v is string => Boolean(v))
    items.push({ key: 'reproductive', label: '임신/수유', text: parts.join(', ') })
  }

  if (r.allergy.allergy_yn === 'yes') {
    // 8차 독립 리뷰 MEDIUM-1: allergy_detail이 wrong-typed면 종류를
    // 지어내지 않고 "있음"만 표시한다(hasUnreadableSafetyField가 별도로
    // "읽을 수 없음" 경고를 담당).
    const detail = isUnreadableStringArray(r.allergy.allergy_detail)
      ? ''
      : answerLabel('ALLERGY_02', r.allergy.allergy_detail)
    items.push({
      key: 'allergy',
      label: '알레르기',
      text: detail || '있음',
    })
  }

  // 위험신호는 배너에서 이미 전체 내용을 보여준다 — 여기서는 같은 문장을
  // 반복하지 않고, 위에 배너가 있다는 것만 짧게 가리킨다.
  if (flags.requires_staff_check) {
    items.push({ key: 'redflag', label: '위험신호', text: '있음 — 위 안전 확인 배너 참고' })
  }

  // MENOPAUSE_SLEEP MS_05: 진단명 노출 없이 원장 확인용으로만 표시한다(delta 3장).
  // 8차 독립 리뷰 MEDIUM-1: sleep_disorder_screen이 wrong-typed면 상세를
  // 지어내지 않는다(hasUnreadableSafetyField가 "읽을 수 없음" 경고를 담당).
  const sleepScreenUnreadable = isUnreadableStringArray(r.modules.sleep?.menopause?.sleep_disorder_screen)
  if (flags.sleep_disorder_priority_review) {
    items.push({
      key: 'sleep_disorder_priority',
      label: '수면장애 선별',
      text: sleepScreenUnreadable
        ? '우선 확인 필요'
        : `우선 확인 필요 — ${answerLabel('MS_05', r.modules.sleep?.menopause?.sleep_disorder_screen)}`,
    })
  } else if (flags.sleep_disorder_review) {
    items.push({
      key: 'sleep_disorder',
      label: '수면장애 선별',
      text: sleepScreenUnreadable
        ? '확인 필요'
        : `확인 필요 — ${answerLabel('MS_05', r.modules.sleep?.menopause?.sleep_disorder_screen)}`,
    })
  }

  if (flags.response_consistency_review) {
    items.push({
      key: 'response_consistency',
      label: '응답 확인 필요',
      text: '생리 상태(MS_01)와 임신/폐경 관련 응답이 서로 다릅니다 — 자동 수정하지 않음',
    })
  }

  /**
   * Routing/UX v2 §20-21: 자유입력을 줄인 대신 clinician confirmation cue를
   * 강화한다. 환자 선택만으로 진단/객관적 소견을 만들지 않고 "확인
   * 필요"/"진료 중 확인" 수준으로만 표시한다. 기존 urgent safety
   * panel/redflag보다 강하게 보이면 안 되므로 이 함수의 기존 항목들
   * 뒤에(가장 낮은 우선순위로) 추가한다 -- §21 우선순위(1.safety/urgent
   * 2.medication/allergy 3.surgery/history 4.추가 전달사항 5.기타 상세)
   * 중 1~2는 위에 이미 있고, 여기서는 3~5만 이 순서로 덧붙인다.
   */
  if (r.surgery_history.surgery_yn === 'yes') {
    items.push({ key: 'surgery', label: '수술·입원력', text: '있음 — 종류/시기 확인' })
  }

  if (r.free_text.free_text_yn === 'yes') {
    items.push({ key: 'free_text', label: '추가 전달사항', text: '있음 — 진료 중 확인' })
  }

  // "기타" 선택 확인 필요 항목들을 하나의 배지로 묶는다 -- 필드마다 따로
  // 배지를 만들면 노란 배지가 난립한다(§21).
  const otherDetailFlags: string[] = []
  if (r.visit_goal.primary_symptom === 'other') otherDetailFlags.push('기타 주호소')
  if (asArray<string>(r.secondary_concerns.secondary_concerns).includes('other')) {
    otherDetailFlags.push('기타 동반증상')
  }
  if (asArray<string>(r.modules.sleep?.awakening_reasons).includes('other')) {
    otherDetailFlags.push('기타 수면 원인')
  }
  if (r.modules.pain?.primary_location === 'other') otherDetailFlags.push('기타 통증 부위')
  if (r.modules.pain?.radiation === 'other') otherDetailFlags.push('기타 방사통 부위')
  if (asArray<string>(r.modules.women?.problems).includes('other')) {
    otherDetailFlags.push('기타 여성 건강 상담')
  }
  if (asArray<string>(r.modules.pregnancy?.concerns).includes('other')) {
    otherDetailFlags.push('기타 임신 상담')
  }
  if (asArray<string>(r.modules.postpartum?.problems).includes('other')) {
    otherDetailFlags.push('기타 산후 상담')
  }
  if (otherDetailFlags.length > 0) {
    items.push({ key: 'other_detail', label: '기타 확인', text: `${otherDetailFlags.join(', ')} — 진료 중 확인` })
  }

  return items
}

/**
 * 7차 독립 리뷰 HIGH-1 후속: flags가 unusable이어도 safetyGlanceItems는
 * flags 무관 항목(복용약/병력/임신·수유/알레르기 등 responses 기반)이 있으면
 * 빈 배열이 아닐 수 있다 -- 그 경우 items.length===0 분기만 고치면 그
 * 항목들이 그대로 렌더되면서 flags 기반 항목(위험신호/수면장애 선별/응답
 * 확인 필요)만 조용히 빠진 채 "문제 없음"처럼 보인다. items 유무와 관계
 *없이 flags가 unusable이면 항상 명시적 경고를 먼저 보여준다(있는 항목은
 * 그 아래 계속 보여준다 -- 정보 자체를 숨기지 않는다).
 */
/**
 * 7차 독립 리뷰 LOW-1 후속: `hasUnreadableSafetyField(r)`도 flagsUsable과
 * 같은 이유로 items.length===0일 때만 확인하면 안 된다 -- 손상된 필드와
 * 무관한 다른 필드(복용약 등)에서 실제 항목이 하나라도 생기면 items가
 * 비지 않아 "읽을 수 없음" 경고 자체가 통째로 사라진다. 두 unusable
 * 신호(flags, responses) 모두 items 유무와 무관하게 항상 먼저 보여주고,
 * 실제 항목이 있으면 그 아래 계속 보여준다(정보를 숨기지 않는다).
 */
function SafetyGlance({ r, flags }: { r: Responses; flags: DoctorPayload['flags'] }) {
  const items = safetyGlanceItems(r, flags)
  const flagsUsable = isFlagsUsable(flags, r)
  const responsesUnreadable = hasUnreadableSafetyField(r, flags)

  if (!flagsUsable || responsesUnreadable) {
    return (
      <div className="doctor__safetyGlance">
        {!flagsUsable && (
          <p className="doctor__safetyGlance doctor__safetyGlance--unavailable">
            안전 계산값(flags)을 읽을 수 없습니다(레거시/손상 데이터로 보임) — 위험신호/수면장애
            선별 등 일부 안전정보가 누락됐을 수 있습니다 — 원장 확인 필요
          </p>
        )}
        {responsesUnreadable && (
          <p className="doctor__safetyGlance doctor__safetyGlance--unavailable">
            안전정보 일부를 읽을 수 없습니다(레거시/손상 데이터로 보임) — 원장 확인 필요
          </p>
        )}
        {items.length > 0 && (
          <div className="doctor__safetyGlance__items">
            {items.map((it) => (
              <span key={it.key} className="doctor__safetyChip">
                <strong>{it.label}</strong> {it.text}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (items.length === 0) {
    return <p className="doctor__safetyGlance doctor__safetyGlance--empty">특이 안전정보 없음</p>
  }
  return (
    <div className="doctor__safetyGlance">
      <span className="doctor__safetyGlance__title">안전정보 한눈에</span>
      <div className="doctor__safetyGlance__items">
        {items.map((it) => (
          <span key={it.key} className="doctor__safetyChip">
            <strong>{it.label}</strong> {it.text}
          </span>
        ))}
      </div>
    </div>
  )
}

function answerLabelFor(qid: string, value: AnswerValue | undefined): string {
  return answerLabel(qid, value)
}

/**
 * Core Reduction P2 (Phase 7 §2.2/§1.1): the lane1 union summary
 * (src/doctor/workspace/lane1Summary.ts) needs the exact same "does the
 * common danger banner fire" boolean this component already computes for
 * its own top block, without re-deriving flagsUsable/requires_staff_check
 * a second time (that duplication is itself the class of drift Phase 6
 * warns about). Exported so lane1Summary.ts can import it directly instead
 * of forking a third copy of isFlagsUsable.
 */
export function commonSafetyBannerActive(payload: DoctorPayload): boolean {
  const { flagsUnusable, staffCheckRequired } = commonSafetyBannerReason(payload)
  return flagsUnusable || staffCheckRequired
}

/**
 * 독립 검수 HIGH-1: `commonSafetyBannerActive()`의 단일 boolean은 배너가
 * 떠야 하는 서로 다른 두 원인 -- (a) flags 자체를 구조적으로 못 읽음(계산
 * 자체를 신뢰할 수 없음) vs (b) flags는 정상적으로 읽었고 그 안의 generic
 * staff-review 신호(requires_staff_check)가 true -- 를 하나로 뭉갠다.
 * lane1Summary.ts가 이 둘을 서로 다른 severity(계산불가 vs 확인 필요)로
 * 표시하려면 원인을 분리해서 알아야 한다. 이 함수는 그 두 원인을 그대로
 * 노출할 뿐, 배너를 띄울지 말지의 기존 판단(둘 중 하나라도 참이면 배너는
 * 여전히 뜬다 -- commonSafetyBannerActive 참고)은 전혀 바꾸지 않는다.
 * 새 임상 threshold나 새 red-flag 의미가 아니라, 이미 계산된 두 boolean을
 * 그대로 분리해 반환하는 것뿐이다.
 */
export type CommonSafetyBannerReason = {
  /** flags가 구조적으로 무효/버전skew/응답과 모순 -- 계산 자체를 신뢰할 수 없음. */
  flagsUnusable: boolean
  /** flags는 유효하고, 그 안의 generic staff-review 신호가 true. */
  staffCheckRequired: boolean
}

export function commonSafetyBannerReason(payload: DoctorPayload): CommonSafetyBannerReason {
  const r = payload.responses
  const { flags } = payload
  const flagsUsable = isFlagsUsable(flags, r)
  return {
    flagsUnusable: !flagsUsable,
    staffCheckRequired: flagsUsable && Boolean(flags.requires_staff_check),
  }
}

/**
 * Common Safety — always rendered above any workspace tab, in every
 * view_profile (pain/herbal/mixed). Never gated behind a tab: a safety
 * flag must never be one click away from being missed (governing task
 * Phase 2).
 */
export function CommonSafetyBanner({ payload }: { payload: DoctorPayload }) {
  const r = payload.responses
  const { flags } = payload
  const flagsUsable = isFlagsUsable(flags, r)

  // 9차 독립 리뷰 자체 회귀분석: safety_flags 최상위 키 자체가 없는 레거시
  // 레코드에서 이 배너는 flagsUsable 여부와 무관하게 항상 렌더되므로,
  // 여기서 옵셔널 체이닝 없이 접근하면 배너 진입 즉시 크래시한다.
  const generalFlagLabels = optionLabels(
    'SAFETY_01',
    asArray<string>(r.safety_flags?.red_flag_general).filter((v) => v !== 'none'),
  )

  return (
    <div className="doctor__commonSafety" aria-label="공통 안전 확인">
      {/*
       * 7차 독립 리뷰 HIGH-1: flags(requires_staff_check 등)는 태블릿이
       * 계산해 보낸 값을 서버가 재검증 없이 그대로 저장한 것이라 레거시/
       * 버전 skew로 hollow할 수 있다 -- 그럴 때 flags.requires_staff_check를
       * 무조건 신뢰하면 실제 응급 신호가 있어도 이 배너 자체가 나타나지
       * 않는다. flags를 읽을 수 없을 때는 flags에 의존하지 않고 responses에서
       * 직접 계산 가능한 SAFETY_01 응답만으로 대체 경고를 보여준다.
       */}
      {!flagsUsable && (
        <div className="doctor__banner doctor__banner--danger">
          <strong>안전 계산값을 읽을 수 없습니다</strong>
          <p>
            이 제출은 안전 확인 계산값(flags)이 레거시/손상 데이터로 보여 자동
            판정을 신뢰할 수 없습니다. 아래는 원본 응답에서 직접 확인 가능한
            공통 위험 신호(SAFETY_01)이며, GI_03/BOWEL_03 등 다른 안전 문항은
            원장이 문진 원본을 직접 확인해야 합니다.
          </p>
          <ul>
            <li>
              공통 위험 신호(SAFETY_01):{' '}
              {generalFlagLabels.length > 0 ? generalFlagLabels.join(', ') : '보고된 항목 없음(원본 확인 필요)'}
            </li>
          </ul>
        </div>
      )}

      {flagsUsable && flags.requires_staff_check && (
        <div className="doctor__banner doctor__banner--danger">
          <strong>안전 확인 필요</strong>
          <p>
            환자가 아래 내용을 문진에서 보고했습니다. 이는 진단이 아니며, 진료
            전 직원/원장의 확인이 필요합니다.
          </p>
          <ul>
            {generalFlagLabels.length > 0 && (
              <li>공통 위험 신호(SAFETY_01): {generalFlagLabels.join(', ')}</li>
            )}
            {flags.gi_needs_review && (
              <li>
                소화 문진(GI_03) 응답: &ldquo;
                {answerLabelFor('GI_03', r.modules.gi?.unable_to_eat_or_drink)}&rdquo;
              </li>
            )}
            {flags.bowel_needs_review && (
              <li>
                대변 문진(BOWEL_03) 응답: &ldquo;
                {answerLabelFor('BOWEL_03', r.modules.bowel?.blood_or_black_stool)}&rdquo;
              </li>
            )}
          </ul>
        </div>
      )}

      <SafetyGlance r={r} flags={flags} />
    </div>
  )
}
