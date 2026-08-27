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
 *
 * PR 전용 preview(.github/workflows/pr-23-preview.yml)에서만 추가로
 * `VITE_PREVIEW_PR`/`VITE_PREVIEW_SHA`를 설정해 "PR #23 · <짧은 SHA>"를
 * 덧붙인다 -- 실기기 QA 담당자가 "이게 정확히 어느 커밋의 빌드인지"를
 * 배너만 보고 바로 확인할 수 있게 한다. 메인 preview(pages-preview.yml)는
 * 이 두 변수를 전혀 설정하지 않으므로 기존 문구가 완전히 그대로 유지된다.
 */
export function PreviewBanner() {
  if (import.meta.env.VITE_PREVIEW_MODE !== 'true') return null

  const pr = import.meta.env.VITE_PREVIEW_PR
  const sha = import.meta.env.VITE_PREVIEW_SHA
  const buildLabel = pr && sha ? ` · PR #${pr} · ${sha}` : ''

  return (
    <div className="previewBanner" aria-hidden="true">
      미리보기 환경 · 입력 내용은 전송되지 않습니다{buildLabel}
    </div>
  )
}
