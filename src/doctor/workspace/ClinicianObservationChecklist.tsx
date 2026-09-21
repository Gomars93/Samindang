/**
 * "오늘 확인할 것" 체크리스트 — 설진·맥진·복진 + 추가 문진·기타 소견.
 *
 * ## Round 15 (PR-B1, 2026-09-21): 설맥복을 체크식으로
 *
 * PO 지시: "설진 맥진 복진을 통상적인 범주에서 체크식으로 할 수 있게 변경하자
 * / 없음 있음을 체크 미체크 둘로만 하자. 없음을 언제 다 누르고 있어."
 *
 * 그래서 **정상값(담홍설·중맥·복력중등도)은 목록에서 아예 뺐다.** 남은 칩은
 * 전부 이상 소견이고, "봤는데 정상"은 블록당 `특이없음` 한 번으로 기록한다.
 * 정상 환자는 블록당 클릭 1회로 끝난다.
 *
 * 그 대가로 **미체크의 의미가 "정상"이 아니라 "아직 안 봄"**이 된다. 이
 * 구분이 6개월 뒤 재평가에서 "저번에 흉협고만 있었나?"에 답할 수 있게 하는
 * 유일한 근거이므로, `특이없음` 탭 한 번은 반드시 필요하다 -- 이 파일이
 * 그것을 강제하지는 않지만(강제하면 진료를 막는다), `미확인` 배지로 계속
 * 눈에 띄게 남겨 둔다.
 *
 * ## 3층 구조
 *  - 1층(23칸): 항상 보인다. **자리가 영구히 고정된다** -- 입력 속도를
 *    결정하는 것은 항목 개수가 아니라 위치의 예측 가능성이기 때문이다.
 *  - 2층(`＋ 전체`): 접혀 있다. 3회 쓰면 승격을 **묻고**, 수락하면 1층 맨
 *    뒤에 붙는다. 자동 재배치는 하지 않는다(observationPromotion.ts 헤더).
 *  - 기타: 블록당 자유입력 한 줄. 칩으로 표현 못 하는 것을 버리지 않기 위해.
 *
 * ## 데이터 모델을 바꾸지 않았다
 * `ClinicianObservationItem`은 그대로고, 칩 선택을 `value` 문자열로
 * 직렬화한다. persistence·EMR 조립기(`observationLines`)·기존 저장 레코드가
 * 전부 무변경이며, 예전에 자유입력으로 적어둔 소견은 파서가 `기타` 칸으로
 * 되돌려주므로 계속 보이고 고칠 수 있다. 근거는 observationOptions.ts 헤더.
 *
 * ## 이전 라운드에서 지켜온 경계 (그대로 유지)
 *  - `특이없음` 버튼은 **라벨에 적힌 문자열을 그대로** 기록한다. 추론·점수화·
 *    재작성 없음. 원장의 명시적 탭 없이는 어떤 값도 기록되지 않는다.
 *  - 아무것도 기록되지 않은 레코드에서는 목록 전체가 한 줄로 접힌다(Round 14).
 *    무언가 기록된 순간 조건 없이 펼쳐진다 -- 접힌 기본값이 원장이 입력한
 *    것을 숨기는 일은 없다. 펼침은 한 렌더 안에서 단방향이라, 마지막 값을
 *    지워도 타이핑 중에 행이 닫히지 않는다.
 */
import { useState } from 'react'
import {
  CLINICIAN_OBSERVATION_CATEGORY_LABEL,
  countStillNeedsCheck,
  type ClinicianObservationItem,
} from './clinicianObservation'
import {
  NO_FINDING_VALUE,
  OBSERVATION_OPTIONS_BY_CATEGORY,
  formatObservationValue,
  parseObservationValue,
  toggleObservationChip,
  type ObservationOption,
} from './observationOptions'
import {
  acceptPromotion,
  declinePromotion,
  loadPromotionState,
  promotionCandidate,
  recordTier2Use,
  savePromotionState,
  type PromotionState,
} from './observationPromotion'
import { ObservationTooltip } from './ObservationTooltip'
import { priorObservationFor, type PriorVisitSummary } from './longitudinal'

/**
 * 이 문자열은 Round 13부터 쓰던 값 그대로다 -- 바꾸면 그 버튼으로 이미
 * 기록된 레코드가 전부 "자유입력"으로 떨어진다. observationOptions.ts가
 * 단일 출처로 들고 있고, 여기서는 재노출만 한다(옛 import 경로 호환).
 */
export { NO_FINDING_VALUE }

/** 체크 항목이 없는 카테고리(추가 문진·기타 소견)는 예전 그대로 자유입력 한 줄. */
function FreeTextRow({
  item,
  onChangeItem,
}: {
  item: ClinicianObservationItem
  onChangeItem: (next: ClinicianObservationItem) => void
}) {
  const trimmed = item.value.trim()
  const isNoFinding = trimmed === NO_FINDING_VALUE
  const hasFreeText = trimmed !== '' && !isNoFinding
  const [noteOpen, setNoteOpen] = useState(hasFreeText)
  const showNote = noteOpen || hasFreeText

  const record = (value: string) =>
    onChangeItem({
      ...item,
      value,
      checked: value.trim() !== '',
      recordedAt: value.trim() !== '' ? new Date().toISOString() : null,
    })

  return (
    <div className="workspace__observationRow__actions">
      <button
        type="button"
        aria-pressed={isNoFinding}
        className={`workspace__statusBtn${isNoFinding ? ' workspace__statusBtn--active' : ''}`}
        onClick={() => record(isNoFinding ? '' : NO_FINDING_VALUE)}
      >
        {NO_FINDING_VALUE}
      </button>
      {!showNote && (
        <button type="button" className="workspace__detailToggle" onClick={() => setNoteOpen(true)}>
          메모
        </button>
      )}
      {showNote && (
        <input
          type="text"
          className="workspace__noteInput"
          value={item.value}
          placeholder="소견 입력"
          aria-label={`${item.title} 소견`}
          onChange={(e) => record(e.target.value)}
        />
      )}
    </div>
  )
}

function Chip({
  option,
  pressed,
  disabled,
  onToggle,
  wasPrior,
}: {
  option: ObservationOption
  pressed: boolean
  disabled: boolean
  onToggle: () => void
  /** PR-B3: 지난 방문에 이 칩이 체크돼 있었는가. **자리는 절대 바꾸지 않고** 표시만 더한다. */
  wasPrior?: boolean
}) {
  return (
    <ObservationTooltip text={option.tooltip}>
      <button
        type="button"
        aria-pressed={pressed}
        disabled={disabled}
        className={`workspace__obsChip${pressed ? ' workspace__obsChip--on' : ''}${wasPrior ? ' workspace__obsChip--prior' : ''}`}
        onClick={onToggle}
      >
        {option.label}
        {wasPrior && (
          <span className="workspace__obsChip__priorDot" aria-label="지난번에도 체크됨">
            ✓
          </span>
        )}
      </button>
    </ObservationTooltip>
  )
}

function ChipRow({
  item,
  options,
  onChangeItem,
  promotion,
  onPromotionChange,
  priorVisit,
}: {
  item: ClinicianObservationItem
  options: ObservationOption[]
  onChangeItem: (next: ClinicianObservationItem) => void
  promotion: PromotionState
  onPromotionChange: (next: PromotionState) => void
  priorVisit?: PriorVisitSummary | null
}) {
  const parsed = parseObservationValue(item.value, options)
  const { selected, freeText, noFinding } = parsed

  /*
   * 기타 칸의 열림은 한 렌더 안에서 단방향이다 -- 타이핑 도중 마지막 글자를
   * 지웠다고 칸이 손 밑에서 사라지면 안 된다(Batch 2.6 N-2와 같은 클래스의
   * 사고). 이미 내용이 있으면 마운트 시점부터 열려 있다.
   */
  /*
   * PR-B3: 지난 방문 기록. `null`이면 그 방문에 이 항목 자체가 없었다는 뜻
   * (제출 없는 재진 등) -- **아무것도 표시하지 않는다.** 모르는 것을 아는
   * 척하지 않는 것이 이 화면의 기본 규칙이다. `recorded: false`는 항목은
   * 있는데 값이 비어 있는 경우 = 그때 안 봤다(미시행)이며, 이 둘을 구분하는
   * 것이 재평가 비교의 전부다.
   */
  const prior = priorObservationFor(priorVisit, item.category)
  const priorParsed = prior?.recorded ? parseObservationValue(prior.value, options) : null
  const priorSelected = new Set(priorParsed?.selected ?? [])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [freeOpen, setFreeOpen] = useState(freeText.trim() !== '')
  const showFree = freeOpen || freeText.trim() !== ''

  const write = (next: { selected: string[]; freeText: string; noFinding: boolean }) => {
    const value = formatObservationValue(next)
    onChangeItem({
      ...item,
      value,
      checked: value.trim() !== '',
      recordedAt: value.trim() !== '' ? new Date().toISOString() : null,
    })
  }

  /*
   * `특이없음`은 소견과 공존할 수 없다 -- 소견이 하나라도 있으면 "특이소견
   * 없음"은 거짓이다. 켜면 칩과 기타를 비우고, 끄면 빈 상태로 돌아간다.
   * (formatObservationValue에도 같은 방어가 있지만, 화면 쪽에서 먼저 비워야
   * 원장이 "내가 찍은 게 어디 갔지"를 겪지 않는다.)
   */
  const toggleNoFinding = () => {
    if (noFinding) write({ selected, freeText, noFinding: false })
    else write({ selected: [], freeText: '', noFinding: true })
  }

  const toggleChip = (label: string, tier: 1 | 2) => {
    const turningOn = !selected.includes(label)
    // 2층 항목을 **켤 때만** 센다. 켰다 껐다로 임계를 채울 수 없게 한다.
    if (turningOn && tier === 2 && !promotion.promoted.includes(label)) {
      onPromotionChange(recordTier2Use(promotion, label))
    }
    write({ selected: toggleObservationChip(selected, label, options), freeText, noFinding: false })
  }

  // 1층 = 고정 23칸 + 원장이 수락해 올린 것(맨 뒤에 붙는다 -- 기존 자리는 불변).
  const promotedSet = new Set(promotion.promoted)
  const tier1 = options.filter((o) => o.tier === 1)
  const promotedOptions = options.filter((o) => o.tier === 2 && promotedSet.has(o.label))
  const drawerOptions = options.filter((o) => o.tier === 2 && !promotedSet.has(o.label))

  return (
    <div className="workspace__observationRow__actions workspace__obsChipBlock">
      {/*
        특이없음 · 1층 칩 · ＋ 전체 손잡이 · 메모를 **한 wrap 줄**에 둔다.
        처음에는 각각을 제 줄에 뒀는데, 헤드리스 실측에서 펼친 진료 화면이
        1525px(천장 1300px)로 넘어갔다 -- 블록마다 줄 세 개가 쌓인 탓이었다.
        하나로 합치면 빈 줄이 사라지고, 어차피 flex-wrap이라 좁아지면
        자연스럽게 여러 줄이 된다.

        2층 서랍을 <details> 대신 버튼+상태로 만든 이유도 같다: <details>는
        summary가 반드시 제 줄을 차지해 같은 wrap 줄에 섞을 수 없다.
      */}
      {prior && (
        <p className="workspace__obsPrior">
          <span className="workspace__obsPrior__label">지난번</span>{' '}
          {prior.recorded ? prior.value : '미시행'}
        </p>
      )}

      <div className="workspace__obsChips" role="group" aria-label={`${item.title} 체크 항목`}>
        <button
          type="button"
          aria-pressed={noFinding}
          className={`workspace__statusBtn${noFinding ? ' workspace__statusBtn--active' : ''}`}
          onClick={toggleNoFinding}
        >
          {NO_FINDING_VALUE}
        </button>

        {[...tier1, ...promotedOptions].map((o) => (
          <Chip
            key={o.label}
            option={o}
            pressed={selected.includes(o.label)}
            disabled={noFinding}
            wasPrior={priorSelected.has(o.label)}
            onToggle={() => toggleChip(o.label, o.tier)}
          />
        ))}

        {drawerOptions.length > 0 && (
          <button
            type="button"
            aria-expanded={drawerOpen}
            className="workspace__detailToggle workspace__obsDrawerToggle"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {`＋ 전체 (${drawerOptions.length})`}
          </button>
        )}

        {/*
          기타 칸은 토글 뒤에 둔다. Round 13이 자유입력 네 칸을 기본 화면에서
          걷어낸 이유("빈 입력칸이 타이핑을 요구하며 진료 화면을 차지한다")가
          칩을 도입했다고 사라지지 않는다 -- 오히려 칩이 대부분을 흡수하므로
          기타가 늘 열려 있을 이유는 더 줄었다. 이미 내용이 있으면 그 자체로
          열린 채 렌더되므로, 접힌 기본값이 원장이 적어둔 것을 숨기지 않는다
          (tests/tablet-viewport.spec.mjs의 기본 열림 자유입력 예산도 이 규칙에
          기대어 3칸으로 유지된다).
        */}
        {!showFree && !noFinding && (
          <button type="button" className="workspace__detailToggle" onClick={() => setFreeOpen(true)}>
            메모
          </button>
        )}
      </div>

      {drawerOpen && drawerOptions.length > 0 && (
        <div className="workspace__obsChips" role="group" aria-label={`${item.title} 추가 체크 항목`}>
          {drawerOptions.map((o) => (
            <Chip
              key={o.label}
              option={o}
              pressed={selected.includes(o.label)}
              disabled={noFinding}
              wasPrior={priorSelected.has(o.label)}
              onToggle={() => toggleChip(o.label, o.tier)}
            />
          ))}
        </div>
      )}

      {showFree && (
        <input
          type="text"
          className="workspace__noteInput"
          value={freeText}
          placeholder="기타 (칩으로 안 되는 소견)"
          aria-label={`${item.title} 기타`}
          disabled={noFinding}
          onChange={(e) => write({ selected, freeText: e.target.value, noFinding: false })}
        />
      )}
    </div>
  )
}

function ObservationRow({
  item,
  onChangeItem,
  onAddToReassessment,
  promotion,
  onPromotionChange,
  priorVisit,
}: {
  item: ClinicianObservationItem
  onChangeItem: (next: ClinicianObservationItem) => void
  onAddToReassessment?: (item: ClinicianObservationItem) => void
  promotion: PromotionState
  onPromotionChange: (next: PromotionState) => void
  priorVisit?: PriorVisitSummary | null
}) {
  const options = OBSERVATION_OPTIONS_BY_CATEGORY[item.category]

  return (
    <div className="workspace__observationRow">
      <span className="workspace__observationCategory">
        {CLINICIAN_OBSERVATION_CATEGORY_LABEL[item.category]}
      </span>
      <span className="workspace__observationTitle">{item.title}</span>

      {options ? (
        <ChipRow
          item={item}
          options={options}
          onChangeItem={onChangeItem}
          promotion={promotion}
          onPromotionChange={onPromotionChange}
          priorVisit={priorVisit}
        />
      ) : (
        <FreeTextRow item={item} onChangeItem={onChangeItem} />
      )}

      <span
        className={`workspace__checkBadge${item.checked ? ' workspace__checkBadge--done' : ''}`}
        aria-hidden="true"
      >
        {item.checked ? '확인됨' : '미확인'}
      </span>
      {onAddToReassessment && item.checked && (
        <button
          type="button"
          className="workspace__adoptBtn workspace__observationRow__adopt"
          onClick={() => onAddToReassessment(item)}
        >
          재검 항목으로 추가 →
        </button>
      )}
    </div>
  )
}

export function ClinicianObservationChecklist({
  items,
  onChangeItem,
  onAddToReassessment,
  priorVisit,
}: {
  items: ClinicianObservationItem[]
  onChangeItem: (next: ClinicianObservationItem) => void
  /** Round 3 Phase E: optional per-item "재검 항목으로 추가" promotion into Structured Reassessment. */
  onAddToReassessment?: (item: ClinicianObservationItem) => void
  /** PR-B3: 가장 최근 지난 방문. 없으면(초진) 지난번 표시가 전혀 렌더되지 않는다. */
  priorVisit?: PriorVisitSummary | null
}) {
  const remaining = countStillNeedsCheck(items)
  const nothingRecorded = items.length > 0 && remaining === items.length
  const [expanded, setExpanded] = useState(false)
  const showRows = !nothingRecorded || expanded

  /*
   * 승격 상태는 임상 기록이 아니라 이 PC의 화면 설정이다 -- localStorage에
   * 두고 환자 데이터 경로(.data/·서버)에는 절대 넣지 않는다. 저장소가 막혀
   * 있으면 loadPromotionState가 빈 상태를 돌려주고, 체크리스트 본체는 승격
   * 기능만 없는 채로 완전히 동작한다.
   */
  const [promotion, setPromotion] = useState<PromotionState>(() => loadPromotionState())
  const updatePromotion = (next: PromotionState) => {
    setPromotion(next)
    savePromotionState(next)
  }
  const candidate = promotionCandidate(promotion)

  if (items.length === 0) {
    return <p className="workspace__empty">오늘 확인할 항목이 없습니다.</p>
  }

  if (!showRows) {
    return (
      <div className="workspace__observationChecklist workspace__observationChecklist--collapsed">
        <p className="workspace__observationSummary" role="status">
          {`${items.map((i) => CLINICIAN_OBSERVATION_CATEGORY_LABEL[i.category]).join(' · ')} — ${remaining}건 미확인`}
        </p>
        <button
          type="button"
          className="workspace__detailToggle workspace__observationSummary__open"
          onClick={() => setExpanded(true)}
        >
          빠른 입력
        </button>
      </div>
    )
  }

  return (
    <div className="workspace__observationChecklist">
      <p className="workspace__pendingCounter" role="status">
        확인 필요 {remaining}건 / 전체 {items.length}건
      </p>

      {/*
        승격 제안: 임계에 닿아도 **자리는 움직이지 않고** 여기서 한 번 묻기만
        한다. 자동 재배치를 하지 않는 이유는 observationPromotion.ts 헤더에
        있다 -- 매번 순서가 바뀌면 칸이 적어도 오히려 느려진다.
        한 번에 하나만 띄워 배너가 쌓이지 않게 한다.
      */}
      {candidate && (
        <p className="workspace__obsPromote" role="status">
          <span>{`'${candidate}'을(를) 자주 쓰시네요. 첫 줄에 올릴까요?`}</span>
          <button type="button" className="workspace__detailToggle" onClick={() => updatePromotion(acceptPromotion(promotion, candidate))}>
            올리기
          </button>
          <button type="button" className="workspace__detailToggle" onClick={() => updatePromotion(declinePromotion(promotion, candidate))}>
            괜찮음
          </button>
        </p>
      )}

      {items.map((item) => (
        <ObservationRow
          key={item.id}
          item={item}
          onChangeItem={onChangeItem}
          onAddToReassessment={onAddToReassessment}
          promotion={promotion}
          onPromotionChange={updatePromotion}
          priorVisit={priorVisit}
        />
      ))}
    </div>
  )
}
