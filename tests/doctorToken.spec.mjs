// Doctor LAN token storage suite. Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure. Bundles src/doctor/doctorToken.ts
// with esbuild first (same style as the other suites) and fakes
// `sessionStorage` since node has none.
import {
  getStoredDoctorToken,
  setStoredDoctorToken,
  clearStoredDoctorToken,
} from './.doctor-token-bundle.mjs'

let passCount = 0

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

class FakeSessionStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, value)
  }
  removeItem(key) {
    this.map.delete(key)
  }
}

globalThis.sessionStorage = new FakeSessionStorage()

assert('no token stored -> getStoredDoctorToken returns null', getStoredDoctorToken() === null)

setStoredDoctorToken('secret-abc')
assert('after set -> getStoredDoctorToken returns the value', getStoredDoctorToken() === 'secret-abc')
assert(
  'stored under a namespaced key, not a generic one',
  globalThis.sessionStorage.getItem('samindang.doctor.token') === 'secret-abc',
)

clearStoredDoctorToken()
assert('after clear -> getStoredDoctorToken returns null', getStoredDoctorToken() === null)

// no sessionStorage at all (e.g. SSR / renderToString context) -> must not throw
delete globalThis.sessionStorage
assert('no sessionStorage global -> getStoredDoctorToken returns null (no throw)', getStoredDoctorToken() === null)
setStoredDoctorToken('x') // must not throw
clearStoredDoctorToken() // must not throw

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
