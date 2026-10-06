/**
 * 이 번들이 어느 커밋에서 언제 빌드됐는가 (2026-10-06). `vite.config.ts`의 `define`이 주입한다.
 * 주입이 없으면(테스트 번들·옛 빌드) 'unknown' -- 던지지 않는다.
 */
export type BuildInfo = { commit: string; dirty: boolean; builtAt: string | null }

declare const __SAMINDANG_BUILD__: { commit?: unknown; dirty?: unknown; builtAt?: unknown } | undefined

export function readBuildInfo(): BuildInfo {
  const raw = typeof __SAMINDANG_BUILD__ === 'undefined' ? undefined : __SAMINDANG_BUILD__
  const commit = typeof raw?.commit === 'string' && /^[0-9a-f]{4,40}$|^unknown$/.test(raw.commit) ? raw.commit : 'unknown'
  const builtAt = typeof raw?.builtAt === 'string' && !Number.isNaN(Date.parse(raw.builtAt)) ? raw.builtAt : null
  return { commit, dirty: raw?.dirty === true, builtAt }
}

/** 설정 화면 한 줄. 시각은 이 PC의 로컬 시간(원장님이 본인 시계와 비교하기 쉽도록). */
export function formatBuildInfo(info: BuildInfo): string {
  const when = info.builtAt ? new Date(info.builtAt).toLocaleString('ko-KR', { hour12: false }) : '빌드 시각 알 수 없음'
  return `커밋 ${info.commit}${info.dirty ? ' (커밋 안 된 변경 포함)' : ''} · ${when}`
}
