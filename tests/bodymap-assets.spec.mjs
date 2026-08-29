// Body Map PNG artwork asset contract (PR #23 Phase 1/2A).
//
// Verifies the approved artwork files exist, are structurally valid PNG
// files (not just present-on-disk), and that BodyMap.tsx wires them in as
// the primary artwork layer with a working integrity-checked fallback to
// the existing inline-SVG mannequin.
//
// This suite exists specifically because of two real, independently
// discovered defects in the delivered artwork files
// (src/assets/bodymap/front.png, back.png):
//
// 1. An early version of these files was byte-level corrupted: each
//    file's IDAT chunk declared far more compressed data (65536 bytes)
//    than the file actually contained (~15KB total). Chromium does not
//    fire the <img> element's error event for this kind of truncation --
//    it reports the image as successfully loaded at its correct declared
//    dimensions while painting a flat, content-less rectangle (confirmed
//    directly via a local headless-Chromium screenshot, not assumed). A
//    plain "does the file exist" check would have missed this entirely
//    and shipped a visibly blank body map. See BodyMap.tsx's Artwork()
//    component for the runtime canvas-based fallback this asset-level
//    check complements. (Fixed in a later commit -- both files are now
//    structurally valid PNGs.)
// 2. The re-exported, structurally-valid files that replaced the
//    corrupted ones turned out to be pixel-for-pixel IDENTICAL images --
//    confirmed both via Pillow's pixel diff and independently via a
//    from-scratch PNG decoder written for this suite (decodePngPixels()
//    below) reaching the same conclusion by a completely different code
//    path. The approved spec calls for the front view to carry a minimal
//    facial cue and the back view none, specifically so the two views
//    are visually distinguishable at a glance for PAIN_01 values that
//    have zones on both views (knee/arm_hand/leg_foot/neck_shoulder).
//    With identical artwork, only the small "앞면"/"뒷면" text label
//    (pre-existing, unrelated to this PR) tells them apart -- confirmed
//    live in the running app via headless-Chromium screenshots, not just
//    inferred from the file diff.
//
// Run via `npm run test:bodymap-assets`. Plain node, no test framework:
// assert() prints "OK: <name>" and throws on failure.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { inflateSync } from 'node:zlib'

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

/**
 * Minimal, dependency-free PNG pixel decoder (paletted/grayscale/RGB(A),
 * bit depths 1/2/4/8, non-interlaced only) -- decodes to a flat RGBA byte
 * array so two PNGs can be compared by actual pixel content rather than by
 * file bytes. This exists because a PNG's *compressed* bytes can differ
 * between two files (different per-scanline filter choices) even when the
 * two files decode to the exact same image -- a raw byte/hash comparison
 * would miss that, and it did during manual investigation of this asset
 * pair (see the "front/back must not be pixel-identical" assertion below).
 * Returns null (rather than throwing) for anything it doesn't support
 * (interlaced, 16-bit) so this stays a best-effort check, not a hard
 * requirement on every possible PNG encoding.
 */
function decodePngPixels(path) {
  const data = readFileSync(path)
  let pos = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  let palette = null
  let trns = null
  const idatChunks = []
  while (pos + 8 <= data.length) {
    const length = data.readUInt32BE(pos)
    const type = data.subarray(pos + 4, pos + 8).toString('latin1')
    const chunkData = data.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0)
      height = chunkData.readUInt32BE(4)
      bitDepth = chunkData[8]
      colorType = chunkData[9]
      interlace = chunkData[12]
    } else if (type === 'PLTE') {
      palette = chunkData
    } else if (type === 'tRNS') {
      trns = chunkData
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData)
    } else if (type === 'IEND') {
      break
    }
    pos += 8 + length + 4
  }
  if (interlace !== 0) return null // Adam7 interlacing not supported by this helper
  if (![1, 2, 4, 8].includes(bitDepth)) return null // 16-bit not supported by this helper

  const channelsByColorType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
  const channels = channelsByColorType[colorType]
  if (!channels) return null

  let raw
  try {
    raw = inflateSync(Buffer.concat(idatChunks))
  } catch {
    return null // truncated/corrupt IDAT -- checkPngIntegrity() is the right check for that
  }

  const bitsPerPixel = channels * bitDepth
  const bytesPerPixel = Math.max(1, bitsPerPixel / 8)
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8)
  const out = new Uint8ClampedArray(width * height * 4) // always expand to RGBA for easy comparison

  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  let prevRow = new Uint8Array(rowBytes)
  let srcOffset = 0
  for (let y = 0; y < height; y++) {
    const filterType = raw[srcOffset]
    const row = Uint8Array.from(raw.subarray(srcOffset + 1, srcOffset + 1 + rowBytes))
    srcOffset += 1 + rowBytes
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0
      const b = prevRow[i]
      const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0
      let val = row[i]
      if (filterType === 1) val = (val + a) & 0xff
      else if (filterType === 2) val = (val + b) & 0xff
      else if (filterType === 3) val = (val + Math.floor((a + b) / 2)) & 0xff
      else if (filterType === 4) val = (val + paeth(a, b, c)) & 0xff
      row[i] = val
    }

    // Unpack this scanline's pixels into RGBA, honoring sub-byte bit depths.
    for (let x = 0; x < width; x++) {
      let samples
      if (bitDepth === 8) {
        const off = x * channels
        samples = Array.from({ length: channels }, (_, k) => row[off + k])
      } else {
        // 1/2/4-bit: only valid for colorType 0 (grayscale) or 3 (palette), single channel
        const bitOffset = x * bitDepth
        const byteIdx = bitOffset >> 3
        const shift = 8 - bitDepth - (bitOffset & 7)
        const mask = (1 << bitDepth) - 1
        const raw8 = (row[byteIdx] >> shift) & mask
        const maxVal = mask
        samples = [colorType === 3 ? raw8 : Math.round((raw8 / maxVal) * 255)]
      }

      const outIdx = (y * width + x) * 4
      if (colorType === 0) {
        out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = samples[0]
        out[outIdx + 3] = 255
      } else if (colorType === 2) {
        out[outIdx] = samples[0]; out[outIdx + 1] = samples[1]; out[outIdx + 2] = samples[2]; out[outIdx + 3] = 255
      } else if (colorType === 3) {
        const idx = samples[0]
        out[outIdx] = palette ? palette[idx * 3] : 0
        out[outIdx + 1] = palette ? palette[idx * 3 + 1] : 0
        out[outIdx + 2] = palette ? palette[idx * 3 + 2] : 0
        out[outIdx + 3] = trns && idx < trns.length ? trns[idx] : 255
      } else if (colorType === 4) {
        out[outIdx] = out[outIdx + 1] = out[outIdx + 2] = samples[0]
        out[outIdx + 3] = samples[1]
      } else if (colorType === 6) {
        out[outIdx] = samples[0]; out[outIdx + 1] = samples[1]; out[outIdx + 2] = samples[2]; out[outIdx + 3] = samples[3]
      }
    }
    prevRow = row
  }
  return { width, height, pixels: out }
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
  // The user-facing spec for this artwork is explicit: the approved front
  // image carries a minimal facial cue and the back image carries none, so
  // the two views read as visually distinct even before the "앞면"/"뒷면"
  // text label is read -- this matters because several PAIN_01 values
  // (knee/arm_hand/leg_foot/neck_shoulder) have zones on BOTH views, and a
  // patient/doctor needs to be able to tell which view is currently active
  // at a glance. Compares actual decoded pixels (not file bytes -- two PNGs
  // can encode the identical image with different per-scanline filter
  // bytes and therefore different compressed content) via decodePngPixels()
  // above.
  const front = decodePngPixels(FRONT_PATH)
  const back = decodePngPixels(BACK_PATH)
  if (front && back) {
    let identical = front.width === back.width && front.height === back.height
    if (identical) {
      for (let i = 0; i < front.pixels.length; i++) {
        if (front.pixels[i] !== back.pixels[i]) { identical = false; break }
      }
    }
    assert(
      identical
        ? 'front.png and back.png FAIL to be visually distinct -- they decode to pixel-for-pixel IDENTICAL images, so the front/back views are indistinguishable from the artwork alone (only the small "앞면"/"뒷면" text label differs); this is a data/design-asset defect in the delivered files, not something fixable from BodyMap.tsx -- needs re-export with the approved front/back distinction (minimal facial cue on front, none on back) before merge'
        : 'front.png and back.png decode to visually distinct images (not pixel-identical)',
      !identical,
    )
  } else {
    console.log('SKIPPED: front/back pixel-distinctness check -- decodePngPixels() does not support this PNG encoding (e.g. interlaced or 16-bit); structural integrity is still covered by the checks above')
  }
}

{
  const bodyMapSrc = readFileSync(join(ROOT, 'src/components/BodyMap.tsx'), 'utf8')
  assert('BodyMap.tsx imports front.png as the front-view artwork', /import\s+frontArtwork\s+from\s+['"]\.\.\/assets\/bodymap\/front\.png['"]/.test(bodyMapSrc))
  assert('BodyMap.tsx imports back.png as the back-view artwork', /import\s+backArtwork\s+from\s+['"]\.\.\/assets\/bodymap\/back\.png['"]/.test(bodyMapSrc))
  assert('BodyMap.tsx renders an <img> for the PNG artwork (bodyMap__artwork)', /className=\{`bodyMap__artwork/.test(bodyMapSrc))
  assert('BodyMap.tsx PNG <img> is decorative (aria-hidden), never itself the tap target', /aria-hidden="true"[\s\S]{0,40}onLoad=\{checkIntegrity\}|onLoad=\{checkIntegrity\}[\s\S]{0,120}aria-hidden="true"/.test(bodyMapSrc))
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
  console.log(`\nKNOWN FAILURE (not a code regression): one or more of this suite's PNG-content checks are failing because of a real defect in the delivered src/assets/bodymap/front.png / back.png files themselves -- either structural corruption (truncated IDAT, see the "structural integrity" assertions above) or the two files being pixel-identical (see the "front/back must be visually distinct" assertion above). Both require a re-export/re-commit of the artwork; neither is fixable from BodyMap.tsx or any other presentation code. See the specific assertion message above for which defect applies to the current files. All other assertions in this suite (BodyMap.tsx wiring, CSS) are expected to pass regardless of the asset's own validity.`)
  process.exitCode = 1
}
