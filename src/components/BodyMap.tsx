import { useState } from 'react'
import { SingleChoice } from './SingleChoice'
import type { Option } from '../types'

type Props = {
  options: Option[]
  value: string | null
  onSelect: (value: string) => void
}

/**
 * 주 통증부위(PAIN_01) 선택용 visual body map.
 *
 * 정밀 통증지도가 아니다 -- 기존 PAIN_01 enum 값을 고르는 visual input
 * renderer일 뿐이다. 새 clinical region enum을 만들지 않는다: 여기서
 * onSelect로 넘기는 값은 항상 PAIN_01.options에 실제로 존재하는 value
 * 그대로다(아래 ZONES 테이블 참고, 추측으로 만든 값 없음).
 *
 * 해부학적 상세 없이 단순 무채색 human silhouette(inline SVG)만 사용한다.
 * 각 zone은 실제 <button>이며 aria-label이 있고, 선택 상태는 색상만이
 * 아니라 체크마크 배지로도 표시한다(SingleChoice와 동일한 원칙).
 *
 * DOM 구조(Tablet UX v2.1 §7, device QA에서 발견된 렌더링 버그 수정):
 * zone 버튼은 반드시 .bodyMap__figure(position:relative, aspect-ratio로
 * 크기가 고정된 coordinate container)의 직계 child여야 한다. 이전 버전은
 * silhouette와 zone 버튼 목록이 .bodyMap__figureWrap 아래 형제(sibling)로
 * 나뉘어 있었는데, .bodyMap__figureWrap 자체는 position이 지정되지 않아
 * (static) zone의 position:absolute가 브라우저에서 더 위쪽의 다른 positioned
 * ancestor(또는 initial containing block)를 기준으로 계산되어 버렸다 --
 * 실기기에서 머리 zone이 화면 상단 거대 타원으로, 팔/다리 zone이 화면
 * 좌우의 거대한 사각형으로 튀는 버그의 root cause였다. 이제 silhouette(svg)와
 * zone 버튼이 같은 .bodyMap__figure 아래 형제로 렌더링되므로 % 좌표가
 * 항상 그 작은 고정 크기 박스를 기준으로 계산된다.
 *
 * 환자 기준 좌/우 표기: 화면에 보이는 실루엣은 "환자가 거울을 보는 방향"이
 * 아니라 "환자 자신의 몸"을 기준으로 한다 -- 앞면 실루엣의 왼쪽이 환자의
 * 오른팔이 되는 미러링 문제를 피하기 위해, 좌우 구분이 필요한 개별 부위
 * enum이 없는(팔/다리 좌우를 PAIN_01 자체는 구분하지 않는다) 현재 스펙에서는
 * zone 자체에 좌우 라벨을 넣지 않고 "팔·손"/"다리·발"처럼 좌우 통합
 * 라벨만 쓴다 -- 실제 좌/우 구분은 각 pain module의 protected 질문(예:
 * LBP_03 leg_side, NECK_08 arm_symptom_side 등)이 이후 화면에서 이미
 * 담당한다. 새 좌우 enum을 여기서 만들지 않는다.
 */

type Zone = {
  value: string
  view: 'front' | 'back'
  /** .bodyMap__figure 기준 % 위치 (좌상단 기준) */
  top: number
  left: number
  width: number
  height: number
  shape: 'circle' | 'rect'
}

// PAIN_01.options의 실제 value만 사용한다 (조사해서 매핑, 추측 없음).
// 'other'는 실루엣에 자연스러운 위치가 없으므로 fallback 목록에서만 선택한다.
const ZONES: Zone[] = [
  { value: 'head_face_jaw', view: 'front', top: 0, left: 32, width: 36, height: 14, shape: 'circle' },
  { value: 'neck_shoulder', view: 'front', top: 15, left: 20, width: 60, height: 10, shape: 'rect' },
  { value: 'neck_shoulder', view: 'back', top: 15, left: 20, width: 60, height: 10, shape: 'rect' },
  { value: 'arm_hand', view: 'front', top: 26, left: 2, width: 16, height: 38, shape: 'rect' },
  { value: 'arm_hand', view: 'front', top: 26, left: 82, width: 16, height: 38, shape: 'rect' },
  { value: 'arm_hand', view: 'back', top: 26, left: 2, width: 16, height: 38, shape: 'rect' },
  { value: 'arm_hand', view: 'back', top: 26, left: 82, width: 16, height: 38, shape: 'rect' },
  { value: 'chest_rib', view: 'front', top: 26, left: 20, width: 60, height: 18, shape: 'rect' },
  { value: 'abdomen', view: 'front', top: 45, left: 24, width: 52, height: 14, shape: 'rect' },
  { value: 'low_back_pelvis', view: 'back', top: 40, left: 22, width: 56, height: 20, shape: 'rect' },
  { value: 'knee', view: 'front', top: 68, left: 24, width: 22, height: 12, shape: 'rect' },
  { value: 'knee', view: 'front', top: 68, left: 54, width: 22, height: 12, shape: 'rect' },
  { value: 'knee', view: 'back', top: 68, left: 24, width: 22, height: 12, shape: 'rect' },
  { value: 'knee', view: 'back', top: 68, left: 54, width: 22, height: 12, shape: 'rect' },
  { value: 'leg_foot', view: 'front', top: 81, left: 22, width: 26, height: 19, shape: 'rect' },
  { value: 'leg_foot', view: 'front', top: 81, left: 52, width: 26, height: 19, shape: 'rect' },
  { value: 'leg_foot', view: 'back', top: 81, left: 22, width: 26, height: 19, shape: 'rect' },
  { value: 'leg_foot', view: 'back', top: 81, left: 52, width: 26, height: 19, shape: 'rect' },
]

const ZONE_LABEL: Record<string, string> = {
  head_face_jaw: '머리·얼굴·턱',
  neck_shoulder: '목·어깨',
  arm_hand: '팔·손',
  chest_rib: '가슴·갈비뼈 주변',
  abdomen: '배 주변',
  low_back_pelvis: '허리·골반',
  knee: '무릎',
  leg_foot: '다리·발',
}

/**
 * 단순 human silhouette (local inline SVG, Tablet UX v2.1 §8). 해부학적
 * 상세/성별 구분 없음, remote asset 없음. viewBox는 .bodyMap__figure의
 * aspect-ratio(3:5, styles.css)와 동일 비율(60:100)이라 zone 버튼의 %
 * 좌표계와 그대로 맞아떨어진다.
 *
 * Tablet UX v2.2.1 §5: v2.2에서 넣은 첫 cue(stroke-width 0.6, 눈 두 점 +
 * 얇은 중심선)는 실기기(11" 태블릿)에서 거의 보이지 않는다는 QA 피드백을
 * 받았다. "글자를 안 읽어도 즉시 구분"이 목표이므로 훨씬 굵고 명확한
 * cue로 교체한다 -- 여전히 성별화하지 않고, 과도한 해부학 디테일도 넣지
 * 않는다(monochrome/단순 도형 원칙 유지, stroke는 --text 색상으로
 * --text-muted보다 대비를 높인다):
 *   - front: 눈(채워진 원, 확대) + 입(곡선) = 명확한 얼굴 cue, 그리고
 *     가슴/복부 경계를 암시하는 전면 contour 곡선 1개
 *   - back: 얼굴 cue 없음, 굵은 척추 중심선, 좌우 견갑골 곡선(더 굵고
 *     또렷하게), 그리고 하부 등/둔부 경계를 암시하는 후면 contour 곡선
 * 이 cue들은 순수 장식(fill/stroke만, 클릭 불가, pointer-events 없음)이며
 * zone 버튼의 %좌표계나 PAIN_01 enum과는 전혀 무관하다.
 */
function Silhouette({ view }: { view: 'front' | 'back' }) {
  return (
    <svg
      className="bodyMap__silhouette"
      viewBox="0 0 60 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="30" cy="8" r="7" />
      <rect x="14.4" y="15" width="31.2" height="44" rx="12" />
      <rect x="2.4" y="20" width="8.4" height="36" rx="4" />
      <rect x="49.2" y="20" width="8.4" height="36" rx="4" />
      <rect x="15.6" y="60" width="13.2" height="38" rx="6" />
      <rect x="31.2" y="60" width="13.2" height="38" rx="6" />
      {view === 'front' ? (
        <g className="bodyMap__frontCue">
          <circle cx="26" cy="6.5" r="1.7" />
          <circle cx="34" cy="6.5" r="1.7" />
          <path d="M26 11.5 Q30 13.5 34 11.5" />
          <path d="M18 30 Q30 35 42 30" />
        </g>
      ) : (
        <g className="bodyMap__backCue">
          <line x1="30" y1="17" x2="30" y2="58" />
          <path d="M19 21 Q27 29 21 41" />
          <path d="M41 21 Q33 29 39 41" />
          <path d="M17 55 Q30 62 43 55" />
        </g>
      )}
    </svg>
  )
}

function Figure({
  view,
  zones,
  value,
  onSelect,
}: {
  view: 'front' | 'back'
  zones: Zone[]
  value: string | null
  onSelect: (v: string) => void
}) {
  return (
    <div className="bodyMap__figureWrap">
      <span className="bodyMap__viewLabel">{view === 'front' ? '앞면' : '뒷면'}</span>
      <div className="bodyMap__figure">
        <Silhouette view={view} />
        {zones.map((z, i) => {
          const isSelected = value === z.value
          return (
            <button
              key={`${view}-${z.value}-${i}`}
              type="button"
              className={`bodyMap__zone bodyMap__zone--${z.shape}${isSelected ? ' bodyMap__zone--selected' : ''}`}
              style={{
                top: `${z.top}%`,
                left: `${z.left}%`,
                width: `${z.width}%`,
                height: `${z.height}%`,
              }}
              aria-label={`${ZONE_LABEL[z.value]} (${view === 'front' ? '앞면' : '뒷면'})`}
              aria-pressed={isSelected}
              onClick={() => onSelect(z.value)}
            >
              {isSelected && (
                <span className="bodyMap__zoneMark" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function BodyMap({ options, value, onSelect }: Props) {
  const [showList, setShowList] = useState(false)
  const frontZones = ZONES.filter((z) => z.view === 'front')
  const backZones = ZONES.filter((z) => z.view === 'back')

  if (showList) {
    return (
      <div className="bodyMap__listFallback">
        <SingleChoice options={options} value={value} onSelect={onSelect} />
        <button type="button" className="bodyMap__toggleBtn" onClick={() => setShowList(false)}>
          ← 그림으로 선택하기
        </button>
      </div>
    )
  }

  return (
    <div className="bodyMap">
      {/* 바깥 질문 제목(PAIN_01.question)이 이미 "가장 불편한 한 곳을
          눌러주세요"이므로 여기서 같은 문장을 다시 보여주지 않는다
          (Tablet UX v2.1 §9, 중복 instruction 제거). */}
      {/*
        Tablet UX v2.2 §3: 부위를 탭한 직후 "내가 어디를 골랐는지" 글자로
        즉시 확인할 수 있는 단일 label. zone 위에 텍스트를 겹쳐 지도를
        지저분하게 만들지 않고, "현재 선택" 하나만 그림 위에 보여준다
        (기존 zone 자체의 ✓/highlight는 그대로 유지). 선택을 바꾸면 value가
        바뀌며 이 label도 즉시 갱신된다.
      */}
      <p className="bodyMap__selectedLabel" aria-live="polite">
        {value ? (
          <>
            선택한 부위: <strong>{ZONE_LABEL[value] ?? value}</strong>
          </>
        ) : (
          '부위를 선택해주세요'
        )}
      </p>
      <div className="bodyMap__figures">
        <Figure view="front" zones={frontZones} value={value} onSelect={onSelect} />
        <Figure view="back" zones={backZones} value={value} onSelect={onSelect} />
      </div>
      {/*
        Tablet UX v2.2.1 §6: 위 label은 그림 위에 있어 스크롤하면 질문
        제목과 함께 화면 밖으로 사라질 수 있다 -- landscape처럼 세로 공간이
        좁아 이 화면이 스크롤을 필요로 하는 경우, 환자가 zone을 누른 직후
        "내가 뭘 선택했는지" 계속 확인 가능해야 한다. 선택된 뒤에만
        나타나는 sticky compact chip을 추가한다. `.shell__scrollHint`와
        똑같은 sticky 메커니즘을 재사용하되, bottom:84px로 그 pill 영역
        바로 위에 고정해 절대 겹치지 않는다(scroll hint 높이가 정확히
        84px, styles.css 주석 참고) -- 짧은 화면(스크롤이 필요 없는 대부분의
        viewport)에서는 sticky가 발동하지 않아 그냥 자연스러운 위치(그림
        바로 아래)에 머문다.
      */}
      {value && (
        <p className="bodyMap__selectedChip" aria-hidden="true">
          <span className="bodyMap__selectedChipMark" aria-hidden="true">✓</span>
          선택한 부위: <strong>{ZONE_LABEL[value] ?? value}</strong>
        </p>
      )}
      <button type="button" className="bodyMap__toggleBtn" onClick={() => setShowList(true)}>
        그림에서 선택하기 어려워요 → 목록으로 보기
      </button>
    </div>
  )
}

/** 테스트/문서에서 "PAIN_01 실제 값과 정확히 일치"를 검증할 때 재사용. */
export const BODY_MAP_ZONE_VALUES = [...new Set(ZONES.map((z) => z.value))]
