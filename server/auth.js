// 원장 엔드포인트 접근 판단. 이 서버는 원장 PC "위에서" 돌아가는 것을 전제로 한다 —
// 그래서 loopback(127.0.0.1/::1)이 진짜 경계다. 토큰은 원장이 다른 기기(예: 같은
// 진료실의 다른 PC)에서 볼 때만 필요한 보조 수단이며, 실제 인증이 아니다.
// (파일럿 등급 — 클리닉 LAN 내부에서만 쓴다. 인터넷에 노출하지 말 것.)
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

export function isLoopback(remoteAddress) {
  return LOOPBACK.has(remoteAddress)
}

/**
 * @param {string} remoteAddress
 * @param {string | undefined} tokenHeader
 * @param {string | undefined} configuredToken - process.env.SAMINDANG_DOCTOR_TOKEN
 */
export function isDoctorRequestAllowed(remoteAddress, tokenHeader, configuredToken) {
  if (isLoopback(remoteAddress)) return true
  if (configuredToken && tokenHeader === configuredToken) return true
  return false
}

// loopback만으로는 브라우저 기반 공격을 막지 못한다: 원장 PC 브라우저가 악성
// 페이지를 열면, 그 페이지의 fetch()도 loopback에서 나가므로 위 가드를
// 통과한다. CORS는 브라우저 쪽 방어이므로, 원장 라우트에서는 실제로 브라우저
// origin인 경우에만 허용 목록을 적용한다.
//
// origin 헤더가 없는 요청(curl, 서버 간 호출, 이 테스트 스위트)은 브라우저가
// 아니다 — 브라우저는 cross-origin 요청에 항상 Origin을 보내므로, 부재를
// "브라우저 공격 아님"으로 취급해도 안전하다.
const LOCALHOST_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i

export function isOriginAllowedForDoctor(origin, allowedOrigins = []) {
  if (!origin) return true
  if (LOCALHOST_ORIGIN_RE.test(origin)) return true
  return allowedOrigins.some((allowed) => allowed.toLowerCase() === origin.toLowerCase())
}
