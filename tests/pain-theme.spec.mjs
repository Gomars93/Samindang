/*
 * `painTheme.css` — 옛 카드에 새 토큰을 입히는 레이어의 **안전 불변식**.
 *
 * 이 레이어의 전제는 단 하나다: **레이아웃과 읽기 순서를 바꾸지 않는다.**
 * 그 전제가 지켜지는 동안만 "기능 손실 0"이 성립한다.
 *
 * 왜 소스에서 막는가
 * ------------------
 * 첫 시도는 실제로 레이아웃을 바꿨다. 검사 카드를 `제목(좌) ──── 칩(우)`로
 * 묶는 flex 규칙을 썼고, 화면이 **14px 더 길어졌다**(1440x900 LBP
 * 4182 → 4196px). 원인은 DOM 순서다 -- `__head`(정체) → `__reason`(근거) →
 * `__statusRow`(답) 사이에 근거가 끼어 있어 flex로는 칩을 올릴 수 없고,
 * `order`/grid로 옮기면 스크린리더가 "정체 → 답 → 근거"로 읽는다. 근거를
 * 보고 답하는 것이 순서이므로 임상적으로 거꾸로다.
 *
 * 높이는 `tablet-viewport.spec.mjs`가 실측으로 계속 잰다(브라우저 필요).
 * 여기서는 **원인이 된 속성이 다시 들어오지 못하게** 소스에서 막는다 --
 * 실측은 Chrome이 없는 환경에서 건너뛰지만 이 단언은 항상 돈다.
 *
 * 실행: `npm run test:pain-theme` (`npm run test:all`에 포함)
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
let passed = 0
const failures = []
const ok = (label, cond, extra = '') => {
  if (cond) passed += 1
  else failures.push(`${label} ${extra}`.trim())
}

const SRC = readFileSync(join(here, '..', 'src', 'doctor', 'workspace', 'painTheme.css'), 'utf8')
/*
 * 주석을 떼고 본다 -- 이 파일의 헤더가 "flex로 묶었다가 되돌렸다"는 실패
 * 기록을 길게 설명하고 있어서, 주석째 스캔하면 그 설명 자체에 걸린다.
 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '')

ok('주석 제거 후에도 규칙이 남아 있다 (아래 단언이 공허하지 않도록)', CODE.includes('.workspace'), `(${CODE.trim().length}자)`)
ok('선언이 하나 이상 있다', (CODE.match(/\{/g) ?? []).length >= 3)

/* ---------------- §A 레이아웃을 바꾸지 않는다 ---------------- */

/*
 * 레이아웃 알고리즘이나 **시각 순서**를 바꾸는 속성들. 하나라도 들어오면
 * "기능 손실 0"이라는 이 레이어의 전제가 깨진다.
 */
const FORBIDDEN = [
  'display',
  'position',
  'float',
  'order',
  'flex-direction',
  'flex-wrap',
  'flex-flow',
  'grid-template',
  'grid-column',
  'grid-row',
  'grid-area',
  'direction',
  'writing-mode',
]

for (const prop of FORBIDDEN) {
  // `border-radius`가 `radius`를 포함하는 식의 오탐을 피하려고 **선언 시작**
  // 위치(`{` 또는 `;` 또는 줄머리 뒤)에서만 본다.
  const re = new RegExp(`(^|[;{])\\s*${prop.replace('-', '-')}\\s*:`, 'm')
  ok(`§A \`${prop}\`를 선언하지 않는다`, !re.test(CODE))
}

// 매처가 죽지 않았는지 -- 심어 넣은 선언을 실제로 잡는가.
{
  const probe = (css, prop) => new RegExp(`(^|[;{])\\s*${prop}\\s*:`, 'm').test(css)
  ok(
    '§A 금지 속성 매처가 살아 있다',
    probe('.x { display: flex; }', 'display') &&
      probe('.x { color: red; order: 2; }', 'order') &&
      // 그리고 비슷한 이름의 허용 속성에는 걸리지 않는다.
      !probe('.x { border-radius: 14px; }', 'grid-row'),
  )
}

/* ---------------- §B 리터럴이 아니라 토큰을 쓴다 ---------------- */

/*
 * 색과 간격을 여기 리터럴로 적으면 토큰 레이어를 두는 의미가 없다 --
 * `tokens.css`를 고쳐도 이 파일만 옛 값으로 남는다. 이 저장소가 네 번 겪은
 * "같은 게 두 군데, 한 쪽만 고쳐짐"이 다섯 번째가 된다.
 */
const HEX = CODE.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
ok('§B 색 리터럴(hex)을 쓰지 않는다', HEX.length === 0, HEX.length ? `(${HEX.join(', ')})` : '')

const RGB = CODE.match(/\b(rgb|rgba|hsl|hsla)\s*\(/g) ?? []
ok('§B 색 함수 리터럴을 쓰지 않는다', RGB.length === 0, RGB.length ? `(${RGB.join(', ')})` : '')

/*
 * px 리터럴도 막는다. 간격은 `--pain-` 스케일 밖의 값을 쓰지 않는 것이
 * `tokens.css`가 선언한 규율 3항이다.
 */
const PX = CODE.match(/:\s*[^;{}]*?\b\d+px\b/g) ?? []
ok('§B px 리터럴을 쓰지 않는다 (간격 스케일 밖의 값 금지)', PX.length === 0, PX.length ? `(${PX.map((s) => s.trim()).join(' / ')})` : '')

ok('§B 실제로 pain 토큰을 쓴다 (위 단언이 "아무것도 안 한다"를 뜻하지 않도록)', (CODE.match(/var\(--pain-/g) ?? []).length >= 4)

/* ---------------- §C 토큰이 이 화면에서 해석된다 ---------------- */

/*
 * `tokens.css`는 원래 `.painClinical` 하나에만 변수를 선언했다. 워크스페이스
 * 안에서 `var(--pain-*)`가 해석되려면 `.workspace`도 스코프여야 한다 --
 * 안 그러면 이 파일의 모든 규칙이 조용히 무효가 된다(값이 `unset`으로 떨어져
 * 화면은 그냥 예전 그대로 보이므로 **눈으로는 알아채기 어렵다**).
 */
{
  const tokens = readFileSync(join(here, '..', 'src', 'doctor', 'clinical', 'tokens.css'), 'utf8')
  const tokenCode = tokens.replace(/\/\*[\s\S]*?\*\//g, '')
  ok('§C 토큰 파일에 규칙이 남아 있다 (공허하지 않도록)', tokenCode.includes('--pain-border'))
  ok('§C 토큰 스코프에 `.workspace`가 포함된다', /\.workspace\s*\{/.test(tokenCode) || /\.workspace\s*,/.test(tokenCode) || /,\s*\.workspace\b/.test(tokenCode))
  ok('§C 토큰 스코프에 `.painClinical`도 남아 있다 (새 화면이 깨지지 않는다)', /\.painClinical\b/.test(tokenCode))
  // 값이 복사되지 않았는지 -- 두 벌이 되면 한 쪽만 고쳐진다.
  ok('§C `--pain-border` 선언이 저장소에 하나뿐이다', (tokens.match(/--pain-border\s*:/g) ?? []).length === 1)
}

/* ---------------- §D 워크스페이스가 토큰을 실제로 불러온다 ---------------- */

{
  const shell = readFileSync(join(here, '..', 'src', 'doctor', 'workspace', 'DoctorWorkspace.tsx'), 'utf8')
  ok('§D 셸이 토큰을 명시적으로 import한다', /import '\.\.\/clinical\/tokens\.css'/.test(shell))
  ok('§D 셸이 이 레이어를 import한다', /import '\.\/painTheme\.css'/.test(shell))
  // 순서: workspace.css → painTheme.css. 뒤에 와야 같은 specificity에서도 이긴다.
  ok(
    '§D 이 레이어가 workspace.css 뒤에 온다',
    shell.indexOf("import './painTheme.css'") > shell.indexOf("import './workspace.css'"),
  )
}

/* ---------------- 결과 ---------------- */

if (failures.length) {
  console.error(`\n✗ pain-theme: ${failures.length}건 실패 / ${passed}건 통과\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ pain-theme: ${passed}건 단언 통과`)
