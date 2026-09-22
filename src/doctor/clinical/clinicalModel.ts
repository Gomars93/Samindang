/**
 * 통증 닥터뷰 — **원장이 쓰는** 3블록(검사 / 판단 / 처치).
 *
 * 읽기 4블록(`briefingModel.ts`)과 같은 행 문법을 쓴다. 뼈대는 하나다:
 *
 *   읽기   앉아 있기   ────────────────  10분
 *   입력   SLR         ────  [양성] 음성 시행 안 함
 *
 * **값 자리만 바뀐다.** 이 파일에 두 번째 행 모양을 만들지 않는다.
 *
 * 왜 3블록인가 — 소견(OBSERVATION)이 여기 없는 이유
 * -------------------------------------------------
 * 처음엔 SOAP 네 칸을 맞추려고 OBSERVATION 블록에 **설진·맥진·복진**을 넣었다.
 * 잘못이었다. 설·맥·복은 이 저장소에서 이미 **한약 진료의 것으로 분리되어**
 * 있다 — `ClinicianObservationChecklist`를 렌더하는 곳은 `HerbalWorkspace`
 * 하나뿐이고, 상태 필드 이름부터 `herbalClinicianObservations`다
 * (`persistence.ts`). 그걸 통증 화면으로 끌어오면 원장이 허리 환자 앞에서
 * 설태를 체크하는 칸을 보게 된다. PO 확인(2026-09-22): **통증 진료에서
 * 맥진을 하지 않는다.**
 *
 * 그래서 대체 카탈로그를 **만들지 않았다.** 통증용 시진·촉진·ROM 항목은 아직
 * 승인된 카탈로그가 없고, 없는 것을 이 파일이 지어내면 아래 "칩 항목을
 * 지어내지 않는다" 규칙을 스스로 어기는 것이다. 통증 쪽 "무엇이 보이는가"는
 * EXAM 블록(부위팩이 계산한 권장 검사)이 답한다.
 *
 * 교훈은 블록 하나가 아니다: **블록 수를 먼저 정하는 설계는 도메인 오염을
 * 만든다.** 한약 뷰를 만들 때 "통증이 3블록이니 한약도 3블록"으로 가면 같은
 * 사고가 반대 방향으로 난다.
 *
 * 칩 항목을 지어내지 않는다
 * -------------------------
 * 모든 선택지는 **이미 승인된 카탈로그**에서 온다:
 *   - 검사 → 호출부가 넘긴 `PhysicalExamSuggestion[]` (임상 엔진 산출물)
 *   - 판단 → `workingHypothesis.ts`의 `HYPOTHESIS_SUPPORT_*` 고정 enum
 *   - 처치 → 호출부가 넘긴 `RehabSuggestion[]` + `REHAB_SUGGESTION_STATUS_LABEL`
 *
 * 이 파일이 새 임상 항목이나 새 판정값을 만들면 `tests/pain-clinical.spec.mjs`
 * §D가 실패한다 -- 모든 칩 라벨이 카탈로그에 실재하는지 대조한다. §B는 그와
 * 별개로 **한약 카탈로그(설·맥·복)가 이 파일에 다시 들어오지 못하게** 막는다.
 *
 * 순수 함수다
 * -----------
 * 상태를 갖지 않고 카탈로그/현재 값만 보고 행 배열을 만든다. 실제 토글은 렌더
 * 컴포넌트가 `onToggle`로 위임받아 호출부(워크스페이스 상태)에서 일어난다 --
 * 화면이 임상 값을 몰래 계산하지 않는다.
 */
import { HYPOTHESIS_SUPPORT_LABEL_KO, HYPOTHESIS_SUPPORT_OPTIONS, type HypothesisSupport } from '../workspace/workingHypothesis'
import { EXAM_PRIORITY_LABEL, type PhysicalExamSuggestion } from '../workspace/examSuggestion'
import { EXAM_CHECK_STATUS_LABEL, type ExamCheckStatus } from '../workspace/provenance'
import { REHAB_SUGGESTION_STATUS_LABEL, type RehabSuggestion, type RehabSuggestionStatus } from '../workspace/rehabSuggestion'
import type { HypothesisPattern } from '../workspace/regionPack'
import type { WorkingHypothesis } from '../workspace/workingHypothesis'

/**
 * 한 행에 늘어놓는 칩 수 상한. 넘으면 행 문법(라벨 ──── 값)이 무너져 줄이
 * 접히기 시작한다. 지금 세 블록의 칩은 모두 3개씩이라 여유가 있지만, 상한은
 * 그대로 둔다 -- `pain-clinical.spec.mjs` §A가 이걸로 회귀를 잡는다.
 */
export const MAX_INLINE_CHIPS = 6

/** 입력 블록 수 상한. 넘으면 테스트가 실패한다 -- 화면이 다시 길어지는 유일한 경로를 막는다. */
export const MAX_CLINICAL_BLOCKS = 3

export type Chip = {
  /** 칩에 보이는 글자. **저장값과 같다**(카탈로그 라벨 그대로). */
  label: string
  selected: boolean
  /** 호버 시 설명. 카탈로그가 주는 것만 쓴다 -- 이 파일이 문구를 지어내지 않는다. */
  tooltip?: string
  /** 상태형 칩(검사·처치)에서 이 칩이 나타내는 값. 토글 시 호출부로 그대로 넘어간다. */
  value?: string
}

export type ClinicalRow = {
  /** 행 라벨. 읽기 행과 같은 자리, 같은 규칙(줄바꿈하지 않는다). */
  label: string
  /** 이 행에 늘어놓는 칩. 접히는 것은 없다(2층은 한약 쪽에만 있다). */
  chips: Chip[]
  /**
   * 이 행이 무엇을 토글하는지 호출부가 알아볼 키.
   * 검사·처치는 항목 id, 판단은 패턴 id다.
   */
  key: string
  /** 아직 아무것도 기록되지 않았는가. 흐리게 표시한다. */
  untouched: boolean
  /** 추적용 -- 이 행의 선택지가 어느 카탈로그에서 왔는지. 테스트가 이걸로 대조한다. */
  source: string
}

export type ClinicalBlockKey = 'exam' | 'assessment' | 'plan'

export type ClinicalBlock = {
  key: ClinicalBlockKey
  eyebrow: string
  /** eyebrow 아래 한 줄 -- 이 블록이 답하는 **질문**. 읽기 블록과 같은 규칙. */
  question: string
  rows: ClinicalRow[]
  /**
   * 블록 하나에 딸린 자유입력. **블록당 최대 1개**로 제한한다 -- 기존 화면의
   * textarea 10개가 화면을 늘린 주범이었고, 나머지는 칩으로 옮겼다.
   */
  note?: { label: string; value: string; placeholder: string }
}

/* ------------------------------------------------------------------ *
 * 검사 -- 권장 검사 제안
 * ------------------------------------------------------------------ */

/**
 * 검사 결과 칩 -- **`provenance.ts`의 승인된 enum 그대로** 쓴다.
 *
 * 처음엔 여기서 `['양성', '음성', '시행 안 함']` 세 개를 직접 정의했다.
 * 잘못이었다. `ExamCheckStatus`는 이미 여섯 값이고 라벨도 PO 검토를 거쳤다:
 *
 *   POSITIVE 양성/이상 소견 · NEGATIVE 음성/정상 · UNCLEAR 불명확
 *   LIMITED 제한적 시행(판단 유보) · NOT_PERFORMED 시행 못 함
 *   NOT_YET_CHECKED 아직 확인 안 됨
 *
 * 세 개짜리 어휘를 따로 만들면 (a) `UNCLEAR`·`LIMITED`가 도달 불가능해지고,
 * (b) `시행 안 함`이 `시행 못 함`·`미시행`에 이은 **세 번째 철자**가 된다 --
 * `provenance.ts`가 주석으로 명시하며 피했던 바로 그 충돌이다. 같은 것이 두
 * 군데 있고 한 쪽만 고쳐지는 사고를 이 저장소는 이미 여러 번 겪었다.
 *
 * `NOT_YET_CHECKED`만 칩에서 뺀다 -- 그건 "아직 안 봤다"는 **기본 상태**이지
 * 고를 수 있는 값이 아니다(판단의 `UNJUDGED`, 처치의 `SUGGESTED`와 같은 규칙).
 * 아무 칩도 안 켜진 행이 곧 미확인이다.
 */
export const EXAM_RESULT_STATUSES: readonly ExamCheckStatus[] = [
  'POSITIVE',
  'NEGATIVE',
  'UNCLEAR',
  'LIMITED',
  'NOT_PERFORMED',
]
export const EXAM_RESULT_CHIPS: readonly string[] = EXAM_RESULT_STATUSES.map((s) => EXAM_CHECK_STATUS_LABEL[s])

function examBlock(items: readonly PhysicalExamSuggestion[], results: ExamResults): ClinicalBlock {
  return {
    key: 'exam',
    eyebrow: 'EXAM',
    question: '무엇을 확인했는가?',
    rows: items.map((item) => {
      /*
       * 호출부는 `PhysicalExamSuggestionResult.status`를 그대로 넘긴다.
       * `NOT_YET_CHECKED`는 칩이 아니므로 어떤 칩도 켜지지 않고, 행은
       * untouched로 남는다 -- 별도 분기가 필요 없다.
       */
      const current = results[item.id] ?? 'NOT_YET_CHECKED'
      return {
        // 우선순위를 라벨에 붙이지 않는다 -- 라벨이 길어지면 행 문법이 무너진다.
        // 대신 `MUST_CHECK`는 아래 렌더에서 라벨 색으로만 구분한다.
        label: item.title,
        chips: EXAM_RESULT_STATUSES.map((st) => ({
          label: EXAM_CHECK_STATUS_LABEL[st],
          selected: current === st,
          // 토글은 라벨이 아니라 **enum 값**을 올려보낸다 -- 호출부가
          // `result.status`에 그대로 넣을 수 있어야 한다.
          value: st,
        })),
        key: item.id,
        untouched: current === 'NOT_YET_CHECKED',
        source: `examSuggestion.${EXAM_PRIORITY_LABEL[item.priority] ?? item.priority}`,
      }
    }),
  }
}

/* ------------------------------------------------------------------ *
 * 판단 -- 작업 가설 + 최종 판단 한 칸
 * ------------------------------------------------------------------ */

function assessmentBlock(
  patterns: readonly HypothesisPattern[],
  hypothesis: WorkingHypothesis,
  finalAssessment: string,
): ClinicalBlock {
  // `UNJUDGED`는 칩으로 내보내지 않는다 -- 그건 "아직 안 골랐다"는 상태이지
  // 고를 수 있는 값이 아니다. 아무 칩도 안 켜진 행이 곧 미판단이다.
  const choices = HYPOTHESIS_SUPPORT_OPTIONS.filter((s) => s !== 'UNJUDGED')

  return {
    key: 'assessment',
    eyebrow: 'ASSESSMENT',
    question: '무엇이라고 보는가?',
    rows: patterns.map((p) => {
      const current: HypothesisSupport = hypothesis.supports?.[p.id] ?? 'UNJUDGED'
      return {
        label: p.labelKo,
        chips: choices.map((s) => ({
          label: HYPOTHESIS_SUPPORT_LABEL_KO[s],
          selected: current === s,
          value: s,
        })),
        key: p.id,
        untouched: current === 'UNJUDGED',
        source: 'workingHypothesis.HYPOTHESIS_SUPPORT_OPTIONS',
      }
    }),
    /*
     * 자유입력은 **이 한 칸만** 남긴다.
     *
     * 기존 화면에는 textarea가 10개 있었다(최종 판단 3 + 치료계획 + EMR +
     * 환자 전달 2 + 재평가 + 한약 2). 진료 중 타이핑이 화면을 늘리고 기록을
     * 들쭉날쭉하게 만든 주범이다. 나머지는 칩으로 옮기거나 「마무리」 화면으로
     * 뺀다. 여기 남는 것은 칩으로 대체할 수 없는 **원장의 문장**이다.
     */
    note: {
      label: '최종 판단',
      value: finalAssessment,
      placeholder: '칩으로 담기지 않는 판단만 적습니다.',
    },
  }
}

/* ------------------------------------------------------------------ *
 * 처치 -- 운동·재활 제안
 * ------------------------------------------------------------------ */

const REHAB_CHIP_ORDER: readonly RehabSuggestionStatus[] = ['ACCEPTED', 'HELD', 'REJECTED']

function planBlock(items: readonly RehabSuggestion[]): ClinicalBlock {
  return {
    key: 'plan',
    eyebrow: 'PLAN',
    question: '무엇을 하기로 했는가?',
    rows: items.map((item) => ({
      label: item.title,
      // `SUGGESTED`는 칩이 아니라 **기본 상태**다 -- 엔진이 제안한 그대로이고
      // 원장이 아직 손대지 않았다는 뜻이라, 고를 수 있는 값이 아니다.
      chips: REHAB_CHIP_ORDER.map((s) => ({
        label: REHAB_SUGGESTION_STATUS_LABEL[s],
        selected: item.status === s,
        value: s,
      })),
      key: item.id,
      untouched: item.status === 'SUGGESTED',
      source: 'rehabSuggestion.REHAB_SUGGESTION_STATUS_LABEL',
    })),
  }
}

/* ------------------------------------------------------------------ *
 * 본체
 * ------------------------------------------------------------------ */

/** 검사 항목 id → 원장이 기록한 상태. 없으면 `NOT_YET_CHECKED`로 본다. */
export type ExamResults = Record<string, ExamCheckStatus>

export type ClinicalInput = {
  exams: readonly PhysicalExamSuggestion[]
  examResults: ExamResults
  patterns: readonly HypothesisPattern[]
  hypothesis: WorkingHypothesis
  finalAssessment: string
  rehab: readonly RehabSuggestion[]
}

export function buildClinicalBlocks(input: ClinicalInput): ClinicalBlock[] {
  const blocks: ClinicalBlock[] = [
    examBlock(input.exams, input.examResults),
    assessmentBlock(input.patterns, input.hypothesis, input.finalAssessment),
    planBlock(input.rehab),
  ]
  // 제안이 하나도 없는 블록은 자리를 차지하지 않는다 -- 빈 카드가 화면을
  // 늘리면 "덜 보여주기"라는 이번 재설계의 전제가 깨진다. 판단만 항상 남는다
  // (원장이 직접 쓰는 곳이라 비어 있어도 입력 자리가 필요하다).
  return blocks.filter((b) => b.rows.length > 0 || b.key === 'assessment')
}
