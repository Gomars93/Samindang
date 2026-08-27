import { useEffect, useRef, useState } from 'react'
import { SingleChoice } from './SingleChoice'
import type { Option } from '../types'
import frontArtwork from '../assets/bodymap/front.png'
import backArtwork from '../assets/bodymap/back.png'

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
 * Body Map artwork/interaction 분리 (PR #23 Phase 1): 화면에 그려지는
 * 그림(artwork)과 실제로 탭 가능한 부위(interaction/hit layer)는 완전히
 * 독립적인 두 레이어다. artwork는 승인된 PNG(src/assets/bodymap/
 * front.png, back.png)를 우선 사용하고, 로드 실패 또는 손상이 감지되면
 * 기존 무채색 inline SVG mannequin(Silhouette)으로 자동 대체한다(Artwork
 * 컴포넌트, 아래). 선택 표시(하이라이트/체크)는 항상 이 artwork 레이어
 * 위에 별도로 그려지는 오버레이이며 PNG 안에 구워 넣지 않는다. 각 zone은
 * 실제 <button>이며 aria-label이 있고, 선택 상태는 색상만이 아니라
 * 체크마크 배지로도 표시한다(SingleChoice와 동일한 원칙).
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

/**
 * PR #23 Phase 3 visual-QA fix: a unique key per ZONES entry, `${view}-
 * ${value}-${indexWithinView}` -- matches the key React already uses for
 * each zone <button> in Figure() below. Needed because "which exact zone
 * was tapped" is a strictly finer question than "which view was tapped":
 * `knee` alone has two zones on the SAME view (left knee, right knee),
 * and a real-device screenshot during this task's visual QA caught both
 * lighting up with a ✓ badge from a single tap on one of them. The
 * previous state only tracked `strongView: 'front' | 'back'`, so any
 * zone matching both the selected value AND the tapped view was
 * "strong" -- correct for disambiguating front vs. back (e.g.
 * neck_shoulder), but not for disambiguating two same-view zones of the
 * same value. Tracking the exact key fixes both cases with one
 * mechanism.
 */
function zoneKey(view: 'front' | 'back', value: string, indexWithinView: number): string {
  return `${view}-${value}-${indexWithinView}`
}

/**
 * 부모 BodyMap이 아직 어떤 zone도 직접 탭한 적 없는 상태(예: 이전 세션
 * 응답을 그대로 이어받아 처음 렌더링하는 경우)일 때, 어떤 zone을 "강조"
 * 상태로 보여줄지 결정론적으로 고른다 -- ZONES 배열에서 해당 value의
 * 첫 번째 항목(항상 front가 먼저 옴)을 기본값으로 삼는다.
 */
function defaultStrongZoneKey(value: string | null): string | null {
  if (!value) return null
  const first = ZONES.find((z) => z.value === value)
  if (!first) return null
  const sameViewZones = ZONES.filter((z) => z.view === first.view)
  const idx = sameViewZones.indexOf(first)
  return zoneKey(first.view, first.value, idx)
}

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
 * Tablet UX v2.3 §11-12: App.tsx가 landscape rail(ScreenShell의
 * railSelection prop)에 표시할 한글 label을 계산할 때 재사용한다 --
 * ZONE_LABEL을 여기서만 정의해 두 곳에서 값이 어긋나는 일을 막는다.
 */
export function getBodyMapZoneLabel(value: string): string {
  return ZONE_LABEL[value] ?? value
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
 *
 * Tablet UX v2.3 §7, redesigned again for the PR #23 real-device QA
 * follow-up (§2): the previous cubic-bezier torso/arm/leg shapes read as
 * smoother than the original rounded-rect capsules, but real-device QA
 * still described the result as a "블록형/장난감형" toy figure -- most
 * visibly, the front-view face cue (two dot eyes + smile) made it look
 * like a cartoon character rather than a clinical pictogram, and the
 * torso's shoulder curve overlapped the arms' shoulder caps so the two
 * silhouette pieces visually fused into one blob with no visible
 * shoulder/armpit line.
 *
 * This redesign targets a flat vector *medical UI pictogram* of a
 * gender-neutral clothed mannequin (approved reference image discussed
 * with the user), reproduced here as local inline SVG paths (not the
 * reference raster itself):
 *   - No face on either view (front cue is now a simple rounded collar
 *     line at the neckline only, implying "clothed" without any facial
 *     expression).
 *   - No anatomical/gender detail on either view -- the back view's
 *     lower-back cue is a single near-horizontal waistband line (not a
 *     downward-curving hip line that could read as a gluteal cleft).
 *   - An explicit neck trapezoid connects the head to the torso (the
 *     previous version had the head circle floating with no neck).
 *   - The torso's shoulder/underarm edge is pulled in and the arms'
 *     inner edge curves away from it, leaving a visible armpit notch
 *     (background shows through) so front/back always read as a torso
 *     with two separate arms, never a fused blob.
 *   - Thin decorative divider lines mark segment boundaries (elbow on
 *     each arm, knee on each leg) per "부위 경계는 가는 선으로 명확히".
 *   - Front/back are distinguishable by shape/cue alone (collar vs.
 *     spine+shoulder-blade+waistband), never by a face.
 * As before, the ZONES %-coordinate table (actual tap targets) is
 * completely independent of this decorative silhouette and is not
 * touched by this redesign -- the silhouette is purely decorative
 * (aria-hidden, pointer-events none via CSS) and the existing PAIN_01
 * enum/zone positions are unchanged.
 *
 * PR #23 Phase 1 update: this is no longer rendered unconditionally.
 * The approved PNG artwork (front.png/back.png) is now the primary
 * artwork; this component is kept as Artwork()'s automatic fallback for
 * when the PNG fails to load or fails its content-integrity check (see
 * Artwork() below for why a plain onError isn't sufficient). It is
 * intentionally NOT updated to imitate the approved PNG's own front-view
 * facial cue -- this fallback only ever activates when that PNG cannot
 * be shown at all, so there is no case where the two are visible side by
 * side, and this design has already been validated against real-device
 * QA feedback on its own terms (no face, no anatomical/gender detail,
 * armpit gap, joint dividers).
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
      <circle cx="30" cy="7" r="6.5" />
      <path
        className="bodyMap__silhouetteNeck"
        d="M26 12 L26 15.5 Q30 18 34 15.5 L34 12 Q30 10.5 26 12 Z"
      />
      <path
        className="bodyMap__silhouetteTorso"
        d="M20 16 C24 14 36 14 40 16 C44 17.5 46 19.5 45.3 23
           C44.5 26.5 42 27.5 41.5 31 C41 38 41.3 45 42 51
           C42.4 55 41.5 58 38 59 L22 59 C18.5 58 17.6 55 18 51
           C18.7 45 19 38 18.5 31 C18 27.5 15.5 26.5 14.7 23
           C14 19.5 16 17.5 20 16 Z"
      />
      <path
        className="bodyMap__silhouetteArm"
        d="M19 17.3 C15 18.5 11 21 10 26 C9 32 9.5 39 11 46
           C11.8 50.5 12.8 54.5 15.5 56.5 C17.3 57.8 18.7 56.8 18.3 54.5
           C17.3 49 16.7 42 17.2 35 C17.5 30.5 17.6 26.8 15.8 23.3
           C15.2 22 15.8 19 19 17.3 Z"
      />
      <path
        className="bodyMap__silhouetteArm"
        d="M41 17.3 C45 18.5 49 21 50 26 C51 32 50.5 39 49 46
           C48.2 50.5 47.2 54.5 44.5 56.5 C42.7 57.8 41.3 56.8 41.7 54.5
           C42.7 49 43.3 42 42.8 35 C42.5 30.5 42.4 26.8 44.2 23.3
           C44.8 22 44.2 19 41 17.3 Z"
      />
      <path
        className="bodyMap__silhouetteLeg"
        d="M23 60 C19 60.5 17.5 63 18 67 C18.6 74 18.6 83 17.8 91
           C17.4 95.5 18 98 21.5 98 L26.5 98 C29 98 29.5 95.5 29.2 91
           C28.8 83 28.8 74 29 67 C29.2 63 28 60.5 25 60 Z"
      />
      <path
        className="bodyMap__silhouetteLeg"
        d="M37 60 C33 60.5 31.8 63 32 67 C32.2 74 32.2 83 31.8 91
           C31.4 95.5 32 98 34.5 98 L39.5 98 C43 98 43.6 95.5 43.2 91
           C42.4 83 42.4 74 42 67 C41.8 63 41 60.5 37 60 Z"
      />
      {view === 'front' ? (
        <g className="bodyMap__frontCue">
          <path d="M25.5 17 Q30 20.5 34.5 17" />
          <line x1="12.5" y1="37" x2="17.5" y2="36.6" />
          <line x1="47.5" y1="37" x2="42.5" y2="36.6" />
          <line x1="19.5" y1="77" x2="27.5" y2="77" />
          <line x1="32.5" y1="77" x2="40.5" y2="77" />
        </g>
      ) : (
        <g className="bodyMap__backCue">
          <line x1="30" y1="19" x2="30" y2="44" />
          <path d="M23 22 Q28 30 24 39" />
          <path d="M37 22 Q32 30 36 39" />
          <path d="M20 44.5 Q30 41 40 44.5" />
          <line x1="12.5" y1="37" x2="17.5" y2="36.6" />
          <line x1="47.5" y1="37" x2="42.5" y2="36.6" />
          <line x1="19.5" y1="77" x2="27.5" y2="77" />
          <line x1="32.5" y1="77" x2="40.5" y2="77" />
        </g>
      )}
    </svg>
  )
}

/**
 * PR #23 Phase 1 (approved PNG base artwork): the artwork layer and the
 * interaction (hit-target) layer are architecturally decoupled -- this
 * component owns ONLY what is drawn, never what is clickable. The zone
 * `<button>` overlay in Figure() below is completely independent and does
 * not change based on which artwork actually renders here.
 *
 * Renders the approved PNG (src/assets/bodymap/front.png|back.png) as the
 * primary artwork, with the inline-SVG mannequin (Silhouette, kept from
 * the previous round) as an automatic fallback if the PNG fails to load
 * OR fails a lightweight content-integrity check.
 *
 * Why a content check and not just onError: a truncated/corrupted PNG
 * (verified byte-level against the two files actually committed for this
 * task -- their IDAT chunk declares far more compressed data than the
 * file actually contains) does NOT fire the <img> element's error event
 * in Chromium/most browsers. The decoder is lenient about a truncated
 * stream and reports the image as "loaded" at its correct declared
 * dimensions while painting a flat, content-less rectangle -- confirmed
 * directly via a local headless-Chromium screenshot before writing this,
 * not assumed. onError alone would never catch that class of failure, so
 * once the image fires onLoad we additionally sample it through an
 * offscreen canvas and check for any real color variance; a canvas that
 * comes back essentially one flat color is treated the same as a load
 * failure and triggers the SVG fallback. This is a defensive, generic
 * check (useful for any future truncated/corrupted asset, not hardcoded
 * to today's specific files) -- it does not inspect or validate the
 * artwork's actual content/likeness in any other way.
 *
 * This function does not modify the PNG files themselves in any way.
 */
function Artwork({ view, src }: { view: 'front' | 'back'; src: string }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [unusable, setUnusable] = useState(false)

  const checkIntegrity = () => {
    const img = imgRef.current
    if (!img) return
    try {
      const canvas = document.createElement('canvas')
      const w = 24
      const h = 24
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, w, h)
      const { data } = ctx.getImageData(0, 0, w, h)
      let minR = 255
      let maxR = 0
      let minG = 255
      let maxG = 0
      let minB = 255
      let maxB = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (r < minR) minR = r
        if (r > maxR) maxR = r
        if (g < minG) minG = g
        if (g > maxG) maxG = g
        if (b < minB) minB = b
        if (b > maxB) maxB = b
      }
      const variance = maxR - minR + (maxG - minG) + (maxB - minB)
      if (variance < 6) setUnusable(true)
    } catch {
      // 캔버스 검사 자체가 실패하면(브라우저 제약 등) PNG를 그대로
      // 신뢰한다 -- fallback을 과도하게 트리거하지 않기 위함.
    }
  }

  return (
    <>
      <img
        ref={imgRef}
        className={`bodyMap__artwork${unusable ? ' bodyMap__artwork--hidden' : ''}`}
        src={src}
        alt=""
        aria-hidden="true"
        onLoad={checkIntegrity}
        onError={() => setUnusable(true)}
      />
      {unusable && <Silhouette view={view} />}
    </>
  )
}

function Figure({
  view,
  zones,
  value,
  strongZoneKey,
  onSelect,
}: {
  view: 'front' | 'back'
  zones: Zone[]
  value: string | null
  /**
   * PR #23 Phase 3 visual-QA fix: the exact zone key (zoneKey(), above)
   * that should show the strong highlight + ✓ badge. Replaces the older
   * `strongView: 'front'|'back'` tie-break, which correctly disambiguated
   * front vs. back for values like neck_shoulder but NOT two same-view
   * zones sharing one value (both knees) -- tapping one knee incorrectly
   * badge-checked both. Comparing the exact key fixes both cases: only
   * the one specific button that was actually tapped (or the
   * deterministic default, defaultStrongZoneKey(), before any tap) is
   * ever "strong"; every other zone matching the same value -- same view
   * or the opposite view -- stays at the soft baseline tint only.
   */
  strongZoneKey: string | null
  onSelect: (v: string, key: string) => void
}) {
  return (
    <div className="bodyMap__figureWrap">
      <span className="bodyMap__viewLabel">{view === 'front' ? '앞면' : '뒷면'}</span>
      <div className="bodyMap__figure">
        <Artwork view={view} src={view === 'front' ? frontArtwork : backArtwork} />
        {zones.map((z, i) => {
          const key = zoneKey(view, z.value, i)
          const isSelected = value === z.value
          const isStrong = isSelected && key === strongZoneKey
          return (
            <button
              key={key}
              type="button"
              className={`bodyMap__zone bodyMap__zone--${z.shape}${isSelected ? ' bodyMap__zone--selected' : ''}${isStrong ? ' bodyMap__zone--strong' : ''}`}
              style={{
                top: `${z.top}%`,
                left: `${z.left}%`,
                width: `${z.width}%`,
                height: `${z.height}%`,
              }}
              aria-label={`${ZONE_LABEL[z.value]} (${view === 'front' ? '앞면' : '뒷면'})`}
              aria-pressed={isSelected}
              onClick={() => onSelect(z.value, key)}
            >
              {isStrong && (
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
  // PR #23 Phase 3 visual-QA fix: tracks the exact zone that should show
  // the strong highlight (see zoneKey()/defaultStrongZoneKey() above) --
  // initialized from the incoming value so a resumed session (no click
  // ever happened yet) still deterministically highlights exactly one
  // zone, not every zone sharing that value. Actually tapping a zone
  // (handleSelect) immediately updates this to the exact zone tapped.
  const [strongZoneKey, setStrongZoneKey] = useState<string | null>(() => defaultStrongZoneKey(value))
  const handleSelect = (v: string, key: string) => {
    setStrongZoneKey(key)
    onSelect(v)
  }
  // PR #23 Phase 3 visual-QA fix: value can also change WITHOUT going
  // through handleSelect -- the "목록으로 보기" list fallback (SingleChoice
  // below) calls the parent's onSelect directly, bypassing this
  // component's own key tracking. If the patient picks a new value there
  // and switches back to the map, strongZoneKey would otherwise still
  // point at the previous value's zone (or none), leaving every matching
  // zone at the soft tint with no checkmark anywhere. Re-derive the
  // default whenever the incoming value no longer matches what
  // strongZoneKey was tracking (a tap-driven change already carries the
  // exact matching key from handleSelect, so this is a no-op then).
  useEffect(() => {
    setStrongZoneKey((prev) => {
      if (prev) {
        // key format is `${view}-${value}-${indexWithinView}`; no PAIN_01
        // value contains a literal '-', so the middle segment is exactly
        // the tracked value.
        const [, prevValue] = prev.split('-')
        if (prevValue === value) return prev
      }
      return defaultStrongZoneKey(value)
    })
  }, [value])
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
        <Figure view="front" zones={frontZones} value={value} strongZoneKey={strongZoneKey} onSelect={handleSelect} />
        <Figure view="back" zones={backZones} value={value} strongZoneKey={strongZoneKey} onSelect={handleSelect} />
      </div>
      {/*
        Tablet UX v2.2.1 §6 / v2.3 §11-12: 위 label은 그림 위에 있어
        스크롤하면 질문 제목과 함께 화면 밖으로 사라질 수 있다 -- 세로
        공간이 좁아 이 화면이 스크롤을 필요로 하는 경우, 환자가 zone을
        누른 직후 "내가 뭘 선택했는지" 계속 확인 가능해야 한다. 선택된
        뒤에만 나타나는 sticky compact chip을 portrait 전용으로 유지한다
        (landscape에서는 ScreenShell의 우측 rail이 App.tsx가 넘긴
        railSelection으로 같은 정보를 이미 항상 보여주므로, 이 chip은
        styles.css의 wide-landscape 미디어쿼리에서 숨겨 중복 렌더링을
        막는다). v2.2.1까지는 scroll hint pill과 겹치지 않도록
        bottom:84px로 고정했었는데, v2.3에서 scroll hint 자체가 더 이상
        `.shell__main` 안의 겹침 overlay가 아니게 되어(별도 레인으로
        분리) 이제 bottom:0이면 충분하다(styles.css 참고). "선택 안 함"이
        가능한 화면이 아니라 상태 안내이므로 aria-hidden이 아니라
        aria-live="polite"로 스크린리더에도 변경 사항을 알린다.
      */}
      {value && (
        <p className="bodyMap__selectedChip" aria-live="polite">
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
