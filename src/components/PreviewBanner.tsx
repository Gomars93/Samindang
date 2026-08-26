/**
 * UI 체험용 GitHub Pages preview 빌드에서만 렌더링되는 작은 안내 배너
 * (`VITE_PREVIEW_MODE=true`일 때만 -- .github/workflows/pages-preview.yml의
 * `npm run build:preview`에서만 설정된다). 일반 production 빌드/로컬 dev
 * 서버에서는 이 환경변수가 없으므로 컴포넌트가 아예 아무것도 렌더링하지
 * 않는다(DOM에 존재하지 않음, CSS만 번들에 포함되고 미사용).
 *
 * `.shell__top`은 `padding: 20px var(--gutter) 0`으로 시작해 실제 뒤로가기
 * 버튼/단계 표시는 y=20px부터 그려진다 -- 이 배너를 그 빈 상단 20px 공간에
 * 정확히 맞춰(고정 높이 18px, fixed) 배치하므로 기존 헤더 어떤 요소와도
 * 겹치지 않는다. `pointer-events: none`이라 탭 입력을 절대 가로채지 않는다.
 * clinical wording은 전혀 건드리지 않는다 -- 이 배너 문구 자체도 임상
 * 문진과 무관한 순수 운영 안내문이다.
 */
export function PreviewBanner() {
  if (import.meta.env.VITE_PREVIEW_MODE !== 'true') return null

  return (
    <div className="previewBanner" aria-hidden="true">
      미리보기 환경 · 입력 내용은 전송되지 않습니다
    </div>
  )
}
