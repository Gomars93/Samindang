/**
 * 방문목적(VISIT_00_INTENT) 카드용 pictogram registry (Tablet UX v2.1, §2).
 *
 * 텍스트 라벨이 항상 1차 정보이고, 이 아이콘들은 시각적 스캔을 돕는 보조
 * 수단일 뿐이다 -- icon만으로 의미를 추론해야 하는 구조는 금지(요청 §2).
 * 순수 장식이므로 각 아이콘은 aria-hidden이며, emoji/remote asset/외부
 * icon 라이브러리 없이 이 파일 안의 local inline SVG만 사용한다.
 *
 * 스타일: monochrome(currentColor), 동일 stroke width, 단순 선형 pictogram.
 */

type IconProps = {
  size?: number
}

const STROKE = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

/** 아픈 곳 치료 -- 사람 몸 + 통증 부위를 가리키는 작은 강조 표시 */
function PainCareIcon() {
  return (
    <>
      <circle cx="10" cy="5.5" r="2.6" {...STROKE} />
      <path d="M10 8.2 V15 M10 10.5 L6 13 M10 10.5 L14 12.5 M10 15 L7 21 M10 15 L13.5 21" {...STROKE} />
      <path d="M17 8 L18.4 9.4 M19.6 6.8 L15.8 10.6 M17 6 V10.6" {...STROKE} strokeWidth={1.3} />
    </>
  )
}

/** 몸의 증상 상담 -- pulse(맥박) 파형 */
function SymptomConsultIcon() {
  return <path d="M2 13 H7.5 L9.5 6 L13 20 L15.5 13 H22" {...STROKE} />
}

/** 한약·보약 상담 -- 잎/약재 */
function HerbalIcon() {
  return (
    <>
      <path d="M12 3 C6 4 3.5 10 4.5 16.5 C11 15.5 13.5 9.5 12 3 Z" {...STROKE} />
      <path d="M4.7 16.2 C7.5 12 9.5 8 12 3.3" {...STROKE} strokeWidth={1.2} />
    </>
  )
}

/** 여성 건강 -- 단순 꽃 */
function WomenIcon() {
  return (
    <>
      <circle cx="12" cy="12" r="2.1" {...STROKE} />
      <circle cx="12" cy="6.3" r="2.8" {...STROKE} />
      <circle cx="12" cy="17.7" r="2.8" {...STROKE} />
      <circle cx="6.3" cy="12" r="2.8" {...STROKE} />
      <circle cx="17.7" cy="12" r="2.8" {...STROKE} />
    </>
  )
}

/** 체중 관리 -- 체중계 */
function WeightIcon() {
  return (
    <>
      <rect x="3" y="10" width="18" height="10.5" rx="3" {...STROKE} />
      <path d="M12 12.3 V15.3 M12 15.3 L9.6 17.1" {...STROKE} strokeWidth={1.3} />
      <path d="M8.5 10 C8.5 7 10 5 12 5 C14 5 15.5 7 15.5 10" {...STROKE} strokeWidth={1.3} />
    </>
  )
}

/** 상담 후 결정 -- 말풍선 + 물음표 */
function UndecidedIcon() {
  return (
    <>
      <path
        d="M4 5.5 H20 C20.55 5.5 21 5.95 21 6.5 V15.5 C21 16.05 20.55 16.5 20 16.5 H10 L6 20 V16.5 H4 C3.45 16.5 3 16.05 3 15.5 V6.5 C3 5.95 3.45 5.5 4 5.5 Z"
        {...STROKE}
      />
      <path d="M9.8 9.6 C9.8 8.3 10.8 7.6 12 7.6 C13.2 7.6 14.1 8.3 14.1 9.3 C14.1 10.9 12 10.7 12 12.7" {...STROKE} strokeWidth={1.3} />
      <circle cx="12" cy="14.6" r="0.35" fill="currentColor" stroke="none" />
    </>
  )
}

const ICONS: Record<string, () => JSX.Element> = {
  pain_care: PainCareIcon,
  symptom_consult: SymptomConsultIcon,
  herbal: HerbalIcon,
  women: WomenIcon,
  weight: WeightIcon,
  undecided: UndecidedIcon,
}

/** registry에 없는 key는 조용히 아무것도 렌더링하지 않는다(fail-safe, crash 없음). */
export function Icon({ name, size = 36 }: { name: string } & IconProps) {
  const Glyph = ICONS[name]
  if (!Glyph) return null
  return (
    <svg
      className="optionIcon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <Glyph />
    </svg>
  )
}

export const ICON_KEYS = Object.keys(ICONS)
