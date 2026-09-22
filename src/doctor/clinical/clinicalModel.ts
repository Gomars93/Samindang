/**
 * 통증 닥터뷰 — **원장이 쓰는** 4블록(소견 / 검사 / 판단 / 처치).
 *
 * 읽기 4블록(`briefingModel.ts`)과 같은 행 문법을 쓴다. 뼈대는 하나다:
 *
 *   읽기   앉아 있기   ────────────────  10분
 *   입력   설진        ────  담백설 [홍설] 암홍설  ＋ 전체
 *
 * **값 자리만 바뀐다.** 이 파일에 두 번째 행 모양을 만들지 않는다.
 *
 * 칩 항목을 지어내지 않는다
 * -------------------------
 * 모든 선택지는 **이미 승인된 카탈로그**에서 온다:
 *   - 소견 → `observationOptions.ts` (설 24 / 맥 22 / 복 15, 툴팁 포함)
 *   - 검사 → 호출부가 넘긴 `PhysicalExamSuggestion[]` (임상 엔진 산출물)
 *   - 판단 → `workingHypothesis.ts`의 `HYPOTHESIS_SUPPORT_*` 고정 enum
 *   - 처치 → 호출부가 넘긴 `RehabSuggestion[]` + `REHAB_SUGGESTION_STATUS_LABEL`
 *
 * 이 파일이 새 임상 항목이나 새 판정값을 만들면 `tests/pain-clinical.spec.mjs`
 * §D가 실패한다 -- 모든 칩 라벨이 카탈로그에 실재하는지 대조한다.
 *
 * 3층 구조를 흡수한다
 * -------------------
 * `observationOptions`의 `tier`(1층 = 자주 쓰는 것, 2층 = 나머지)를 그대로
 * 쓴다. **1층만 행에 펼치고 2층은 `＋ 전체` 뒤로 민다** -- 설진 24개를 한 행에
 * 늘어놓으면 행 문법이 무너지기 때문이다. 한 행의 칩 상한은 `MAX_INLINE_CHIPS`.
 *
 * 순수 함수다
 * -----------
 * 상태를 갖지 않고 payload/카탈로그/현재 값만 보고 행 배열을 만든다. 실제
 * 토글은 렌더 컴포넌트가 `onToggle`로 위임받아 호출부(워크스페이스 상태)에서
 * 일어난다 -- 화면이 임상 값을 몰래 계산하지 않는다.
 */
import {
  OBSERVATION_OPTIONS_BY_CATEGORY,
  NO_FINDING_VALUE,
  parseObservationValue,
  type ObservationOption,
} from '../workspace/observationOptions'
import { HYPOTHESIS_SUPPORT_LABEL_KO, HYPOTHESIS_SUPPORT_OPTIONS, type HypothesisSupport } from '../workspace/workingHypothesis'
import { EXAM_PRIORITY_LABEL, type PhysicalExamSuggestion } from '../workspace/examSuggestion'
import { REHAB_SUGGESTION_STATUS_LABEL, type RehabSuggestion, type RehabSuggestionStatus } from '../workspace/rehabSuggestion'
import type { HypothesisPattern } from '../workspace/regionPack'
import type { WorkingHypothesis } from '../workspace/workingHypothesis'

/** 한 행에 인라인으로 펼치는 칩 수 상한. 넘으면 나머지는 `＋ 전체` 뒤로 간다. */
export const MAX_INLINE_CHIPS = 6

/** 입력 블록 수 상한. 넘으면 테스트가 실패한다 -- 화면이 다시 길어지는 유일한 경로를 막는다. */
export const MAX_CLINICAL_BLOCKS = 4

export type Chip = {
  /** 칩에 보이는 글자. **저장값과 같다**(카탈로그 라벨 그대로). */
  label: string
  selected: boolean
  /** 호버 시 감각·관찰 묘사. 카탈로그가 주는 것만 쓴다(변증 귀속 없음). */
  tooltip?: string
  /**
   * 이 칩이 켜지면 꺼져야 하는 짝(맥의 부/침처럼 한 축의 양 끝).
   * 토글 처리는 카탈로그의 `toggleObservationChip`이 담당한다.
   */
  exclusiveWith?: string
  /** 상태형 칩(검사·처치)에서 이 칩이 나타내는 값. 토글 시 호출부로 그대로 넘어간다. */
  value?: string
}

export type ClinicalRow = {
  /** 행 라벨. 읽기 행과 같은 자리, 같은 규칙(줄바꿈하지 않는다). */
  label: string
  /** 인라인으로 펼치는 칩. */
  chips: Chip[]
  /** `＋ 전체` 뒤로 민 칩. 비어 있으면 그 버튼이 나오지 않는다. */
  overflowChips: Chip[]
  /**
   * 이 행이 무엇을 토글하는지 호출부가 알아볼 키.
   * 소견은 카테고리(`TONGUE`), 검사·처치는 항목 id, 판단은 패턴 id다.
   */
  key: string
  /** 아직 아무것도 기록되지 않았는가. 흐리게 표시한다. */
  untouched: boolean
  /** 자유입력이 함께 붙는 행이면 현재 값. */
  freeText?: string
  /** 추적용 -- 이 행의 선택지가 어느 카탈로그에서 왔는지. 테스트가 이걸로 대조한다. */
  source: string
}

export type ClinicalBlockKey = 'observation' | 'exam' | 'assessment' | 'plan'

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
 * 소견 -- 설진 / 맥진 / 복진
 * ------------------------------------------------------------------ */

const OBSERVATION_ROW_LABEL: Record<string, string> = {
  TONGUE: '설진',
  PULSE: '맥진',
  ABDOMEN: '복진',
}

/** 저장 문자열 하나를 카탈로그와 대조해 칩 목록으로 만든다. */
function observationRow(category: string, stored: string): ClinicalRow {
  const options: ObservationOption[] = OBSERVATION_OPTIONS_BY_CATEGORY[category] ?? []
  const parsed = parseObservationValue(stored ?? '', options)
  const chosen = new Set(parsed.selected)

  const toChip = (o: ObservationOption): Chip => ({
    label: o.label,
    selected: chosen.has(o.label),
    tooltip: o.tooltip,
    exclusiveWith: o.exclusiveWith,
    value: o.label,
  })

  /*
   * 인라인 자리를 채우는 순서. **선택된 칩이 절대 접히지 않는다**가 첫 규칙이다 --
   * 기록된 소견이 `＋ 전체` 뒤에 숨으면 원장이 자기가 뭘 체크했는지 못 본다.
   *
   * 처음 구현은 `[...tier1, ...selectedTier2].slice(0, MAX)`였는데, 설진은
   * 1층이 이미 6개(= 상한)라 **선택된 2층 칩이 통째로 잘려 나갔다.** 주석에
   * 그러지 않겠다고 적어놓고 코드는 반대로 한 것이고, `pain-clinical.spec.mjs`
   * §B가 그걸 잡았다. 상한은 **안 고른 칩에만** 적용한다.
   */
  const selected = options.filter((o) => chosen.has(o.label))
  const unselectedTier1 = options.filter((o) => o.tier === 1 && !chosen.has(o.label))
  const room = Math.max(0, MAX_INLINE_CHIPS - selected.length)
  const inline = [...selected, ...unselectedTier1.slice(0, room)]
  const inlineLabels = new Set(inline.map((o) => o.label))
  // 원래 카탈로그 순서를 유지한다 -- 매번 순서가 바뀌면 근육 기억이 안 붙는다.
  const inlineOrdered = options.filter((o) => inlineLabels.has(o.label))
  const overflow = options.filter((o) => !inlineLabels.has(o.label))

  return {
    label: OBSERVATION_ROW_LABEL[category] ?? category,
    chips: inlineOrdered.map(toChip),
    overflowChips: overflow.map(toChip),
    key: category,
    untouched: parsed.selected.length === 0 && !parsed.noFinding && parsed.freeText.trim() === '',
    freeText: parsed.freeText,
    source: `observationOptions.${category}`,
  }
}

export type ObservationValues = Record<string, string>

function observationBlock(values: ObservationValues): ClinicalBlock {
  return {
    key: 'observation',
    eyebrow: 'OBSERVATION',
    question: '진찰에서 무엇이 보이는가?',
    rows: ['TONGUE', 'PULSE', 'ABDOMEN'].map((c) => observationRow(c, values[c] ?? '')),
  }
}

/* ------------------------------------------------------------------ *
 * 검사 -- 권장 검사 제안
 * ------------------------------------------------------------------ */

/**
 * 검사 결과는 자유 텍스트가 아니라 **세 상태**로 받는다. 기존
 * `PhysicalExamSuggestionResult`가 이미 그 모양이고, 칩 세 개가 자유입력보다
 * 빠르다 -- 진료 중에 타이핑하지 않는 것이 이번 재설계의 목적이다.
 */
export const EXAM_RESULT_CHIPS = ['양성', '음성', '시행 안 함'] as const
export type ExamResultChip = (typeof EXAM_RESULT_CHIPS)[number]

function examBlock(items: readonly PhysicalExamSuggestion[], results: Record<string, string>): ClinicalBlock {
  return {
    key: 'exam',
    eyebrow: 'EXAM',
    question: '무엇을 확인했는가?',
    rows: items.map((item) => {
      const current = results[item.id] ?? ''
      return {
        // 우선순위를 라벨에 붙이지 않는다 -- 라벨이 길어지면 행 문법이 무너진다.
        // 대신 `MUST_CHECK`는 아래 렌더에서 라벨 색으로만 구분한다.
        label: item.title,
        chips: EXAM_RESULT_CHIPS.map((c) => ({ label: c, selected: current === c, value: c })),
        overflowChips: [],
        key: item.id,
        untouched: current === '',
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
        overflowChips: [],
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
      overflowChips: [],
      key: item.id,
      untouched: item.status === 'SUGGESTED',
      source: 'rehabSuggestion.REHAB_SUGGESTION_STATUS_LABEL',
    })),
  }
}

/* ------------------------------------------------------------------ *
 * 본체
 * ------------------------------------------------------------------ */

export type ClinicalInput = {
  observation: ObservationValues
  exams: readonly PhysicalExamSuggestion[]
  examResults: Record<string, string>
  patterns: readonly HypothesisPattern[]
  hypothesis: WorkingHypothesis
  finalAssessment: string
  rehab: readonly RehabSuggestion[]
}

export function buildClinicalBlocks(input: ClinicalInput): ClinicalBlock[] {
  const blocks: ClinicalBlock[] = [
    observationBlock(input.observation),
    examBlock(input.exams, input.examResults),
    assessmentBlock(input.patterns, input.hypothesis, input.finalAssessment),
    planBlock(input.rehab),
  ]
  // 제안이 하나도 없는 블록은 자리를 차지하지 않는다 -- 빈 카드가 화면을
  // 늘리면 "덜 보여주기"라는 이번 재설계의 전제가 깨진다. 소견·판단은 항상
  // 남는다(원장이 직접 쓰는 곳이라 비어 있어도 입력 자리가 필요하다).
  return blocks.filter((b) => b.rows.length > 0 || b.key === 'observation' || b.key === 'assessment')
}

/** 블록 공통의 "봤는데 특이소견 없음" 값. 카탈로그 상수를 그대로 재노출한다. */
export { NO_FINDING_VALUE }
