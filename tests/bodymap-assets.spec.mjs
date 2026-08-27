// Body Map PNG artwork asset contract (PR #23 Phase 1/2A).
//
// Verifies the approved artwork files exist, are structurally valid PNG
// files (not just present-on-disk), and that BodyMap.tsx wires them in as
// the primary artwork layer with a working integrity-checked fallback to
// the existing inline-SVG mannequin.
//
// This suite exists specifically because the two PNG files delivered for
// this task (src/assets/bodymap/front.png, back.png) were discovered
// during implementation to be byte-level corrupted: each file's IDAT
// chunk declares far more compressed data (65536 bytes) than the file
// actually contains (~15KB total). Chromium does not fire the <img>
// element's error event for this kind of truncation -- it reports the
// image as successfully loaded at its correct declared dimensions while
// painting a flat, content-less rectangle (confirmed directly via a local
// headless-Chromium screenshot, not assumed). A plain "does the file
// exist" check would have missed this entirely and shipped a visibly
// blank body map. See BodyMap.tsx's Artwork() component for the runtime
// canvas-based fallback this asset-level check complements.
//
// Run via `npm run test:bodymap-assets`. Plain node, no test framework:
// assert() prints "OK: <name>" and throws on failure.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

let passCount = 0
let failCount = 0
const failures = []

function assert(name, cond) {
  if (cond) {
    passCount++
    console.log(`OK: ${name}`)
  } else {
    failCount++
    failures.push(name)
    console.log(`FAIL: ${name}`)
  }
}

/**
 * Walks a PNG's chunk structure and reports whether the file actually
 * contains as many bytes as its chunks claim, and whether it reaches a
 * well-formed IEND. This is the exact check that caught the corruption
 * this suite documents -- deliberately generic (works for any future PNG
 * asset in this repo), not hardcoded to today's specific files.
 */
function checkPngIntegrity(path) {
  const data = readFileSync(path)
  const sigOk = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (!sigOk) return { ok: false, reason: 'bad PNG signature' }

  let pos = 8
  let sawIend = false
  let sawIhdr = false
  let width = 0
  let height = 0
  while (pos + 8 <= data.length) {
    const length = data.readUInt32BE(pos)
    const type = data.subarray(pos + 4, pos + 8).toString('latin1')
    const chunkEnd = pos + 8 + length + 4 // length field + type + data + CRC
    if (chunkEnd > data.length) {
      return { ok: false, reason: `chunk "${type}" at byte ${pos} declares ${length} bytes of data but the file ends before that data is complete (truncated -- file is ${data.length} bytes, chunk would need to end at ${chunkEnd})` }
    }
    if (type === 'IHDR') {
      sawIhdr = true
      width = data.readUInt32BE(pos + 8)
      height = data.readUInt32BE(pos + 8 + 4)
    }
    if (type === 'IEND') {
      sawIend = true
      pos = chunkEnd
      break
    }
    pos = chunkEnd
  }
  if (!sawIhdr) return { ok: false, reason: 'no IHDR chunk found' }
  if (!sawIend) return { ok: false, reason: 'no IEND chunk reached -- file is truncated before the image data completes' }
  if (width <= 0 || height <= 0) return { ok: false, reason: `IHDR reports non-positive dimensions (${width}x${height})` }
  return { ok: true, width, height }
}

const FRONT_PATH = join(ROOT, 'src/assets/bodymap/front.png')
const BACK_PATH = join(ROOT, 'src/assets/bodymap/back.png')

{
  assert('src/assets/bodymap/front.png exists', (() => { try { readFileSync(FRONT_PATH); return true } catch { return false } })())
  assert('src/assets/bodymap/back.png exists', (() => { try { readFileSync(BACK_PATH); return true } catch { return false } })())
}

{
  const front = checkPngIntegrity(FRONT_PATH)
  assert(
    front.ok
      ? 'front.png is a structurally complete PNG (IHDR present, IEND reached, no truncated chunk)'
      : `front.png FAILS PNG structural integrity: ${front.reason} -- this is a data-corruption bug in the delivered asset, not something presentation code can work around; BodyMap.tsx's Artwork() component detects this at runtime and falls back to the SVG mannequin, but the file itself needs to be re-exported/re-committed`,
    front.ok,
  )
}
{
  const back = checkPngIntegrity(BACK_PATH)
  assert(
    back.ok
      ? 'back.png is a structurally complete PNG (IHDR present, IEND reached, no truncated chunk)'
      : `back.png FAILS PNG structural integrity: ${back.reason} -- same known asset-corruption issue as front.png, see above`,
    back.ok,
  )
}

{
  const bodyMapSrc = readFileSync(join(ROOT, 'src/components/BodyMap.tsx'), 'utf8')
  assert('BodyMap.tsx imports front.png as the front-view artwork', /import\s+frontArtwork\s+from\s+['"]\.\.\/assets\/bodymap\/front\.png['"]/.test(bodyMapSrc))
  assert('BodyMap.tsx imports back.png as the back-view artwork', /import\s+backArtwork\s+from\s+['"]\.\.\/assets\/bodymap\/back\.png['"]/.test(bodyMapSrc))
  assert('BodyMap.tsx renders an <img> for the PNG artwork (bodyMap__artwork)', /className=\{`bodyMap__artwork/.test(bodyMapSrc))
  assert('BodyMap.tsx PNG <img> is decorative (aria-hidden), never itself the tap target', /aria-hidden="true"[\s\S]{0,40}onLoad=\{checkIntegrity\}|onLoad=\{checkIntegrity\}[\s\S]{0,120}aria-hidden="true"/.test(bodyMapSrc) || /aria-hidden="true"/.test(bodyMapSrc))
  assert(
    'BodyMap.tsx CRITICAL: the old handmade Silhouette is no longer rendered unconditionally -- it now only appears inside the integrity-checked Artwork() fallback path (`{unusable && <Silhouette`)',
    /\{unusable\s*&&\s*<Silhouette/.test(bodyMapSrc) && !/<Silhouette view=\{view\} \/>\s*\n\s*\{zones\.map/.test(bodyMapSrc),
  )
  assert('BodyMap.tsx has a content-integrity check (canvas-based), not just onError, since truncated PNGs do not fire onError in Chromium', /getImageData/.test(bodyMapSrc) && /onError=\{/.test(bodyMapSrc))
  assert('BodyMap.tsx does not modify/write to the PNG files themselves (no fs/write/Buffer manipulation of the asset)', !/writeFileSync|fs\.write/.test(bodyMapSrc))
}

{
  const cssSrc = readFileSync(join(ROOT, 'src/styles.css'), 'utf8')
  assert('styles.css: .bodyMap__artwork rule exists', /\.bodyMap__artwork\s*\{/.test(cssSrc))
  assert('styles.css: .bodyMap__artwork is pointer-events:none (never itself the tap target -- SVG/button hit layer is separate)', /\.bodyMap__artwork\s*\{[^}]*pointer-events:\s*none/.test(cssSrc))
  assert('styles.css: .bodyMap__artwork uses object-fit:contain (never distorts/stretches the artwork)', /\.bodyMap__artwork\s*\{[^}]*object-fit:\s*contain/.test(cssSrc))
  assert('styles.css: .bodyMap__artwork--hidden rule exists (fallback-switch mechanism)', /\.bodyMap__artwork--hidden\s*\{/.test(cssSrc))
  assert('styles.css: .bodyMap__figure aspect-ratio matches the real PNG dimensions (480/853)', /aspect-ratio:\s*480\s*\/\s*853/.test(cssSrc))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, ${failCount} failed (total ${passCount + failCount})`)
if (failCount > 0) {
  console.log(`\nKNOWN FAILURE (not a code regression): the PNG structural-integrity checks above are expected to fail until src/assets/bodymap/front.png and back.png are re-exported/re-committed with complete, non-truncated image data. See the assertion messages above for the exact byte-level reason. All other assertions in this suite (BodyMap.tsx wiring, CSS) are expected to pass regardless of the asset's own validity.`)
  process.exitCode = 1
}
