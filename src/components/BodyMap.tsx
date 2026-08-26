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
 * 해부학적 상세 그림 대신 단순 무채색 도형(원/둥근사각형)만 사용한다.
 * 각 zone은 실제 <button>이며 aria-label이 있고, 선택 상태는 색상만이
 * 아니라 체크마크 배지로도 표시한다(SingleChoice와 동일한 원칙).
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
  /** 컨테이너 기준 % 위치 (좌상단 기준) */
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
      <div className="bodyMap__figure" aria-hidden="true">
        <div className="bodyMap__silhouetteHead" />
        <div className="bodyMap__silhouetteTorso" />
        <div className="bodyMap__silhouetteArm bodyMap__silhouetteArm--left" />
        <div className="bodyMap__silhouetteArm bodyMap__silhouetteArm--right" />
        <div className="bodyMap__silhouetteLeg bodyMap__silhouetteLeg--left" />
        <div className="bodyMap__silhouetteLeg bodyMap__silhouetteLeg--right" />
      </div>
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
      <p className="bodyMap__instruction">가장 불편한 한 곳을 눌러주세요</p>
      <div className="bodyMap__figures">
        <Figure view="front" zones={frontZones} value={value} onSelect={onSelect} />
        <Figure view="back" zones={backZones} value={value} onSelect={onSelect} />
      </div>
      <button type="button" className="bodyMap__toggleBtn" onClick={() => setShowList(true)}>
        그림에서 선택하기 어려워요 → 목록으로 보기
      </button>
    </div>
  )
}

/** 테스트/문서에서 "PAIN_01 실제 값과 정확히 일치"를 검증할 때 재사용. */
export const BODY_MAP_ZONE_VALUES = [...new Set(ZONES.map((z) => z.value))]
