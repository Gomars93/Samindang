/**
 * 설진·맥진·복진 체크 항목 카탈로그 (PR-B1, PO 승인 2026-09-21).
 *
 * ## 이 파일이 하지 않는 것 (경계를 먼저 적는다)
 *
 * 여기에는 **변증 규칙이 하나도 없다.** 각 항목의 `tooltip`은 그 소견이
 * 원장의 손·눈에 **어떻게 느껴지고 보이는가**(감각·관찰 묘사)까지만 적는다.
 * "현맥 = 간울" 같은 **변증 귀속은 의도적으로 넣지 않는다** — 넣는 순간
 * 화면이 원장의 판단을 앞질러 유도하게 되고, 그것은 CLAUDE.md가 금지하는
 * "임상 규칙 창작"이다. 어떤 소견이 어떤 변증을 시사하는지는 전적으로
 * 원장이 판단하며, 이 파일은 그 판단에 개입하지 않는다.
 *
 * 마찬가지로 이 파일은 어떤 항목도 점수화하지 않고, 조합을 해석하지 않으며,
 * 환자 답변을 읽어 항목을 추천하지 않는다. 고정된 목록일 뿐이다.
 *
 * ## 왜 데이터 모델을 바꾸지 않았는가
 *
 * `ClinicianObservationItem`(clinicianObservation.ts)은 `value: string`
 * 하나로 소견을 담고, EMR 조립기(emrPreview.ts `observationLines`)는 그것을
 * `제목: value` 한 줄로 만든다. 체크 항목을 도입하면서 그 타입을 구조화된
 * 배열로 바꾸는 쪽이 "더 깔끔해" 보이지만, 그러면 persistence 스키마
 * 마이그레이션과 EMR 조립 경로 수정을 동시에 떠안게 된다 — 이 저장소에서
 * 사고가 난 두 영역이 정확히 그 둘이다(Batch 4 D-1/D-2).
 *
 * 그래서 **타입은 한 글자도 바꾸지 않고**, 선택한 칩들을 `value` 문자열로
 * 직렬화한다(`"치흔·반대 · 황태"`). persistence·EMR·기존 저장 레코드가 모두
 * 무변경이고, 예전에 자유입력으로 적어둔 기록도 아래 파서가 `freeText`로
 * 되돌려주므로 화면에서 그대로 읽히고 고칠 수 있다.
 *
 * ## 직렬화 규약
 *
 * 구분자는 ` · `(공백-가운뎃점-공백) 하나뿐이고, 별도의 접두사나 태그를 쓰지
 * 않는다. 되읽을 때는 **소속으로 판정한다** — 토큰이 이 카탈로그의 라벨과
 * 정확히 일치하면 칩, 아니면 자유입력. 이 방식이라면 자유입력에 ` · `가
 * 들어 있어도 다시 ` · `로 이어붙여 원문이 그대로 복원된다. 별도 구분자를
 * 도입해 "자유입력에 그 구분자가 들어가면 깨지는" 경로를 만들지 않는다.
 */

/** 한 항목이 속한 층. 1 = 항상 보임, 2 = `＋ 전체`를 열어야 보임. */
export type ObservationTier = 1 | 2

export type ObservationOption = {
  /** 저장·표시에 쓰이는 라벨. **이 문자열이 곧 저장값이다** — 바꾸면 기존 기록의 칩이 자유입력으로 떨어진다. */
  label: string
  tier: ObservationTier
  /** 감각·관찰 묘사만. 변증 귀속 금지 (파일 헤더 참고). */
  tooltip: string
  /**
   * 동시에 켜질 수 없는 짝. 하나를 켜면 상대가 꺼진다.
   * 맥의 부/침(위치)과 삭/지(속도)처럼 한 축의 양 끝이라 둘 다 참일 수 없는 경우에만 쓴다.
   */
  exclusiveWith?: string
}

/**
 * 설진 — 정상값(담홍설 등)은 **목록에 없다.** PO 지시("없음을 언제 다 누르고
 * 있어")에 따라 이상 소견만 칩으로 두고, "봤는데 정상"은 블록 공통의
 * `특이없음` 한 번으로 기록한다. 그 결과 미체크는 "정상"이 아니라
 * **"아직 안 봤음"**을 뜻한다 — 이 구분이 재평가 비교의 전제다.
 */
export const TONGUE_OPTIONS: ObservationOption[] = [
  { label: '담백설', tier: 1, tooltip: '혀의 바탕색이 정상(옅은 분홍)보다 연하고 핏기가 적어 희읍스름하게 보이는 상태.' },
  { label: '홍·강설', tier: 1, tooltip: '바탕색이 정상보다 붉은 것이 홍설, 그보다 더 짙고 어두운 진홍으로 보이는 것이 강설.' },
  { label: '자암·어반', tier: 1, tooltip: '혀 전체가 어두운 자줏빛을 띠거나, 표면에 검푸른 반점·점이 국소적으로 보이는 상태.' },
  { label: '치흔·반대', tier: 1, tooltip: '혀가 두툼하게 커져 입 안을 채우고(반대), 가장자리에 치아가 눌린 자국이 물결처럼 남은 상태(치흔).' },
  { label: '수박·열문', tier: 1, tooltip: '혀가 얇고 작아 보이거나(수박), 표면에 갈라진 금이 뚜렷하게 나 있는 상태(열문).' },
  { label: '황태', tier: 1, tooltip: '혀를 덮은 이끼(태)의 색이 누런 상태. 짙을수록 진한 갈황색으로 보인다.' },
  { label: '후니태', tier: 1, tooltip: '태가 두꺼워 아래 혀 바탕이 비치지 않고(후), 기름을 바른 듯 미끈하고 촘촘해 긁어도 잘 벗겨지지 않는 상태(니).' },
  { label: '무태·박락', tier: 1, tooltip: '태가 거의 없어 혀 바탕이 그대로 드러나거나, 부분적으로 벗겨져 경계가 생긴 상태.' },

  { label: '점자', tier: 2, tooltip: '혀 표면의 유두가 붉게 도드라져 가시처럼 오톨도톨 보이거나 만져지는 상태.' },
  { label: '설신 고조', tier: 2, tooltip: '혀에 윤기와 생기가 없이 마르고 거칠어 보이는 상태. 반대는 영윤(榮潤).' },
  { label: '노설', tier: 2, tooltip: '혀 조직이 단단하고 거칠며 주름이 뚜렷해 뻣뻣한 인상을 주는 상태.' },
  { label: '눈설', tier: 2, tooltip: '혀 조직이 여리고 말랑하며 표면이 곱고 부어 보이는 상태. 노설의 반대.' },
  { label: '청자설', tier: 2, tooltip: '혀 전체가 푸르스름한 자줏빛을 띠는 상태.' },
  { label: '지도설', tier: 2, tooltip: '태가 군데군데 벗겨져 경계가 뚜렷한 지도 모양으로 남은 상태(화박태).' },
  { label: '부태', tier: 2, tooltip: '태가 두부 부스러기처럼 거칠고 성기게 얹혀 있어 긁으면 쉽게 벗겨지는 상태. 니태와 반대되는 질감.' },
  { label: '조태', tier: 2, tooltip: '태가 말라 물기가 없고 까슬까슬해 보이는 상태.' },
  { label: '활윤태', tier: 2, tooltip: '태에 물기가 많아 번들거리고, 심하면 침이 고여 미끄러워 보이는 상태.' },
  { label: '회흑태', tier: 2, tooltip: '태의 색이 잿빛에서 검은색에 가까운 상태.' },
  { label: '설첨홍', tier: 2, tooltip: '혀끝만 유독 붉게 보이는 상태.' },
  { label: '설변홍', tier: 2, tooltip: '혀의 양 가장자리만 붉게 보이는 상태.' },
  { label: '편태', tier: 2, tooltip: '태가 혀의 한쪽에 치우쳐 분포한 상태.' },
  { label: '설하정맥 노장', tier: 2, tooltip: '혀를 들어올렸을 때 아래쪽 정맥이 굵고 검푸르게 두드러져 보이는 상태.' },
  {
    label: '염태 의심',
    tier: 2,
    tooltip:
      '소견이 아니라 판독 보류 표시 — 커피·사탕·철분제 등 음식·약물 색소가 태에 묻어 실제와 다른 색으로 보일 가능성이 있을 때 체크한다.',
  },
]

/**
 * 맥진 — 28맥을 전부 칩으로 두면 고르는 데 진료시간이 더 든다. 축(위치·속도·
 * 힘)과 임상에서 실제로 분기를 가르는 특징맥만 1층에 두고 나머지는 2층으로.
 */
export const PULSE_OPTIONS: ObservationOption[] = [
  { label: '부', tier: 1, exclusiveWith: '침', tooltip: '손가락을 가볍게 얹기만 해도 뚜렷이 잡히고, 세게 누르면 오히려 약해지는 맥.' },
  { label: '침', tier: 1, exclusiveWith: '부', tooltip: '가볍게 얹으면 잡히지 않고, 힘주어 눌러야 비로소 잡히는 맥.' },
  { label: '삭', tier: 1, exclusiveWith: '지', tooltip: '빠른 맥. 한 호흡에 6회 이상(대략 분당 90회 이상).' },
  { label: '지', tier: 1, exclusiveWith: '삭', tooltip: '느린 맥. 한 호흡에 3회 이하(대략 분당 60회 미만).' },
  { label: '무력', tier: 1, tooltip: '눌렀을 때 손가락을 밀어내는 힘이 약하고 공허하게 느껴지는 맥.' },
  {
    label: '현',
    tier: 1,
    tooltip: '팽팽하게 당겨진 활시위나 거문고 줄을 누르는 듯, 곧고 길며 탄력 있게 긴장된 맥.',
  },
  { label: '활', tier: 1, tooltip: '구슬이 쟁반 위를 구르듯 둥글고 매끄럽게 손끝을 스쳐 지나가는 맥.' },
  { label: '세', tier: 1, tooltip: '실처럼 가늘지만 또렷하게 짚이는 맥.' },
  {
    label: '결대·부정',
    tier: 1,
    tooltip:
      '박동 간격이 고르지 않거나 중간에 한 박이 빠지는 맥. 부정맥에서 관찰될 수 있어, 새로 확인되면 필요 시 심전도 등 추가 확인을 고려한다.',
  },

  { label: '긴', tier: 2, tooltip: '팽팽히 꼰 새끼줄을 누르는 듯 좌우로 팅팅한 긴장감이 느껴지는 맥. 현맥보다 굵고 튕기는 느낌.' },
  { label: '삽', tier: 2, tooltip: '대나무를 가볍게 긁듯 껄끄럽고 매끄럽지 않게, 더듬거리며 지나가는 맥. 활맥의 반대.' },
  { label: '완', tier: 2, tooltip: '느리지도 빠르지도 않게 여유 있고 느슨하게 뛰는 맥.' },
  { label: '대', tier: 2, tooltip: '맥의 폭이 굵고 크게 잡히는 맥.' },
  { label: '촉', tier: 2, tooltip: '빠르면서 중간중간 한 박이 불규칙하게 빠지는 맥.' },
  { label: '규', tier: 2, tooltip: '파 줄기를 누르는 듯 겉은 잡히나 가운데가 비어 있는 느낌의 맥.' },
  { label: '홍', tier: 2, tooltip: '큰 물결이 밀려왔다 물러가듯, 올 때 세차고 갈 때 약해지는 크고 힘찬 맥.' },
  { label: '유', tier: 2, tooltip: '물에 뜬 솜처럼 가볍게 짚으면 잡히나 부드럽고 힘이 없으며, 누르면 사라지는 맥.' },
  { label: '약', tier: 2, tooltip: '깊이 눌러야 잡히면서 가늘고 힘이 없는 맥.' },
  { label: '미', tier: 2, tooltip: '있는 듯 없는 듯 극히 미약해 끊어질 듯 이어지는 맥.' },
  { label: '복', tier: 2, tooltip: '침맥보다 더 깊어, 뼈에 닿을 만큼 눌러야 겨우 잡히는 맥.' },
  { label: '질', tier: 2, tooltip: '삭맥보다 더 빨라 한 호흡에 7~8회(대략 분당 120회 이상)에 이르는 맥.' },
  {
    label: '촌관척 차이',
    tier: 2,
    tooltip: '촌·관·척 세 부위의 맥상이 서로 뚜렷이 다른 경우. 어느 부위가 어떻게 다른지는 기타 칸에 적는다.',
  },
]

/**
 * 복진 — 좌/우 구분은 두지 않는다. 칸이 두 배가 되는 데 비해 분기를 바꾸는
 * 경우가 드물어 PO와 합의해 버렸고, 필요하면 기타 칸에 적는다.
 */
export const ABDOMEN_OPTIONS: ObservationOption[] = [
  { label: '복력 연약', tier: 1, tooltip: '복벽 전체를 눌렀을 때 저항이 약하고 물렁하게 들어가는 상태.' },
  { label: '심하비경', tier: 1, tooltip: '명치 아래를 누르면 판자처럼 단단한 저항과 함께 답답함·불편감이 느껴지는 상태.' },
  {
    label: '흉협고만',
    tier: 1,
    tooltip: '늑골 아래 가장자리를 따라 손가락을 밀어 넣을 때 저항이 걸리고 환자가 답답함·통증을 호소하는 상태.',
  },
  { label: '복직근 연급', tier: 1, tooltip: '배 가운데를 세로로 지나는 복직근이 막대처럼 팽팽히 긴장되어 만져지는 상태.' },
  { label: '소복 압통', tier: 1, tooltip: '아랫배를 눌렀을 때 국소적으로 아픈 지점이 있는 상태.' },
  { label: '위내정수', tier: 1, tooltip: '명치 부위를 손끝으로 가볍게 두드리거나 흔들 때 출렁이는 물소리(진수음)가 들리는 상태.' },

  { label: '제상계·동계', tier: 2, tooltip: '배꼽 주위 또는 그 위에서 대동맥 박동이 손에 뚜렷이 느껴지는 상태.' },
  { label: '소복불인', tier: 2, tooltip: '아랫배의 긴장이 유난히 없고 감각이 둔해 물렁하게 꺼진 느낌의 상태.' },
  { label: '복부 냉감', tier: 2, tooltip: '손바닥을 얹었을 때 배 표면이 주변보다 차갑게 느껴지는 상태.' },
  { label: '정중예', tier: 2, tooltip: '명치에서 배꼽 사이 정중선을 따라 연필심처럼 가느다랗고 단단한 줄이 만져지는 상태.' },
  { label: '복피구급', tier: 2, tooltip: '복벽의 피부·표층이 전체적으로 당기듯 긴장된 상태.' },
  { label: '복만·고창', tier: 2, tooltip: '배 전체가 불러 부풀어 있는 상태. 가스감인지 물렁한지는 기타 칸에 적는다.' },
  { label: '제방압통', tier: 2, tooltip: '배꼽 옆(좌우)을 눌렀을 때 아픈 지점이 있는 상태.' },
  { label: '회맹부 압통', tier: 2, tooltip: '오른쪽 아랫배(회맹부)를 눌렀을 때 아픈 지점이 있는 상태.' },
  { label: '심하지결', tier: 2, tooltip: '명치 아래가 무언가 받친 듯 가볍게 저항이 느껴지는 상태. 심하비경보다 약한 정도.' },
]

/** 체크 항목이 있는 카테고리만. 추가 문진·기타 소견은 예전처럼 자유입력으로 남는다. */
export const OBSERVATION_OPTIONS_BY_CATEGORY: Record<string, ObservationOption[]> = {
  TONGUE: TONGUE_OPTIONS,
  PULSE: PULSE_OPTIONS,
  ABDOMEN: ABDOMEN_OPTIONS,
}

/** 저장 문자열의 구분자. 파일 헤더의 "직렬화 규약" 참고. */
export const OBSERVATION_SEPARATOR = ' · '

/**
 * 블록 전체가 "봤는데 특이소견 없음"임을 나타내는 값.
 *
 * 이 문자열은 **이번 배치에서 새로 만든 것이 아니라**
 * ClinicianObservationChecklist.tsx가 이미 쓰던 `특이없음` 그대로다. 바꾸면
 * 기존에 그 버튼으로 기록된 레코드가 전부 "자유입력"으로 떨어진다.
 *
 * 이 값이 왜 필요한가: 정상 선택지를 목록에서 없앤 대가로, 아무것도 체크되지
 * 않은 상태는 "정상"과 "아직 안 봄"을 구분하지 못하게 된다. 이 한 번의 탭이
 * 그 구분을 만들고, 6개월 뒤 재평가에서 "저번에 흉협고만 있었나?"에 답할 수
 * 있게 한다.
 */
export const NO_FINDING_VALUE = '특이없음'

export type ParsedObservationValue = {
  /** 카탈로그 라벨과 정확히 일치한 토큰들 (원래 순서 유지). */
  selected: string[]
  /** 그 밖의 토큰을 구분자로 다시 이어붙인 것. 옛 자유입력 기록이 여기로 돌아온다. */
  freeText: string
  /** `특이없음`이 기록되어 있는가. */
  noFinding: boolean
}

/**
 * 저장된 `value` 문자열을 칩 선택 + 자유입력으로 되돌린다.
 *
 * 판정은 **소속**으로 한다(토큰이 이 카테고리의 카탈로그에 있으면 칩). 태그나
 * 접두사를 쓰지 않으므로, 자유입력이 우연히 구분자를 포함해도 남은 토큰을
 * 같은 구분자로 다시 이어붙이면 원문이 그대로 복원된다.
 */
export function parseObservationValue(value: string, options: ObservationOption[]): ParsedObservationValue {
  const known = new Set(options.map((o) => o.label))
  const tokens = value
    .split(OBSERVATION_SEPARATOR)
    .map((t) => t.trim())
    .filter((t) => t !== '')

  const selected: string[] = []
  const rest: string[] = []
  let noFinding = false
  for (const t of tokens) {
    if (t === NO_FINDING_VALUE) noFinding = true
    else if (known.has(t)) selected.push(t)
    else rest.push(t)
  }
  return { selected, freeText: rest.join(OBSERVATION_SEPARATOR), noFinding }
}

/**
 * 칩 선택 + 자유입력을 저장 문자열로 만든다. `parseObservationValue`와
 * 왕복(round-trip)해야 하므로 순서는 `특이없음` → 칩 → 자유입력으로 고정한다.
 *
 * `특이없음`은 칩·자유입력과 **함께 기록되지 않는다** — 소견이 하나라도 있으면
 * "특이소견 없음"은 거짓이 되기 때문이다. 호출부가 실수로 둘 다 넘겨도 여기서
 * 소견 쪽이 이긴다(기록이 스스로 모순되지 않게 하는 마지막 방어선).
 */
export function formatObservationValue(input: {
  selected: string[]
  freeText: string
  noFinding: boolean
}): string {
  const chips = input.selected.filter((s) => s.trim() !== '')
  const free = input.freeText.trim()
  if (chips.length === 0 && free === '') return input.noFinding ? NO_FINDING_VALUE : ''
  return [...chips, ...(free === '' ? [] : [free])].join(OBSERVATION_SEPARATOR)
}

/**
 * 칩 하나를 토글한 뒤의 선택 목록.
 *
 * 켜는 경우 `exclusiveWith` 짝을 함께 끈다 — 맥의 부/침처럼 한 축의 양 끝은
 * 동시에 참일 수 없다. 순서는 카탈로그 순서로 정규화해, 같은 조합이 누른
 * 순서에 따라 다른 문자열로 저장되는 일이 없게 한다(재평가 비교의 전제).
 */
export function toggleObservationChip(
  selected: string[],
  label: string,
  options: ObservationOption[],
): string[] {
  const opt = options.find((o) => o.label === label)
  const has = selected.includes(label)
  const next = new Set(selected)
  if (has) {
    next.delete(label)
  } else {
    next.add(label)
    if (opt?.exclusiveWith) next.delete(opt.exclusiveWith)
  }
  return options.filter((o) => next.has(o.label)).map((o) => o.label)
}
