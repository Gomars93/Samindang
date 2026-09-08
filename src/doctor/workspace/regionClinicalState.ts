/**
 * 부위별 원장 기록 3값(방향성 반응 · 임상가설 · 확정 운동 단계)의 저장 어댑터 —
 * 부위 팩 일반화 §3.3 (`docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md`).
 *
 * 저장 구조는 두 모양, 읽는 곳은 한 모양:
 *   - 요통은 옛 필드 3개(`lbpDirectionalResponse`/`lbpWorkingHypothesis`/
 *     `lbpConfirmedStage`)를 그대로 쓴다 — EMR·재진 이어받기·테스트 250단언이
 *     그 필드를 읽고 있고, 요통 파일럿 직전에 저장 형식을 바꾸지 않는다(R4로 분리).
 *   - 다른 부위는 추가형 `regionClinical[region]` 한 필드에 담는다(스키마 버전
 *     미변경 — 옛 기록은 빈 맵으로 읽힌다).
 *   - 엔진·카드·EMR·재진은 `readRegionClinical`/`withRegionClinical` 하나로 읽고 쓴다.
 *
 * `regionClinical.lbp`는 절대 만들지 않는다(정화 시 버림) — 요통 값의 출처가 둘이
 * 되는 순간 CLAUDE.md가 네 번 기록한 "지우지 않은 쪽 화면" 사고가 재현된다.
 */
import { REGION_KEYS, type RegionKey } from './regionPack'
import type { HypothesisPattern } from './regionPack'
import { isValidLbpDirectionalResponse, type DirectionalResponse } from './lbpExamSuggestions'
import type { ExerciseStage } from './lbpExerciseStage'
import { sanitizeWorkingHypothesis, sanitizeWorkingHypothesisLoose, type WorkingHypothesis } from './workingHypothesis'

export type RegionClinicalRecord = {
  directionalResponse: DirectionalResponse
  workingHypothesis: WorkingHypothesis
  confirmedStage: ExerciseStage | null
}

export type NonLbpRegionKey = Exclude<RegionKey, 'lbp'>
export type RegionClinicalMap = Partial<Record<NonLbpRegionKey, RegionClinicalRecord>>

export function emptyRegionClinicalRecord(): RegionClinicalRecord {
  return { directionalResponse: 'NOT_ASSESSED', workingHypothesis: { supports: {}, recordedAt: null }, confirmedStage: null }
}

/** 0~3 정수만 통과. 문자열 '1', 1.5, -1, 4, null 등은 전부 null (persistence.ts의 요통 규칙과 동일). */
export function sanitizeConfirmedStage(raw: unknown): ExerciseStage | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return null
  if (raw < 0 || raw > 3) return null
  return raw as ExerciseStage
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function sanitizeRegionClinicalRecord(raw: unknown): RegionClinicalRecord {
  const empty = emptyRegionClinicalRecord()
  if (!isRecord(raw)) return empty
  return {
    directionalResponse: isValidLbpDirectionalResponse(raw.directionalResponse) ? raw.directionalResponse : empty.directionalResponse,
    workingHypothesis: sanitizeWorkingHypothesisLoose(raw.workingHypothesis),
    confirmedStage: sanitizeConfirmedStage(raw.confirmedStage),
  }
}

/**
 * 저장 계층 정화. 키는 `REGION_KEYS`의 비요통 부위만, 값이 있던 키만 남긴다
 * (없던 키를 빈 기록으로 채우지 않는다 — 저장본 동일성 비교가 흔들리지 않게).
 * 팩을 모르므로 가설의 패턴 id는 여기서 거르지 않고 읽는 쪽에서 팩으로 거른다.
 */
export function sanitizeRegionClinicalMap(raw: unknown): RegionClinicalMap {
  const out: RegionClinicalMap = {}
  if (!isRecord(raw)) return out
  for (const key of REGION_KEYS) {
    if (key === 'lbp') continue
    if (raw[key] === undefined) continue
    out[key] = sanitizeRegionClinicalRecord(raw[key])
  }
  return out
}

/** 요통 옛 필드 3개 + 부위 맵을 가진 상태(초진 `WorkspaceState`). */
export type RegionClinicalHost = {
  lbpDirectionalResponse: DirectionalResponse
  lbpWorkingHypothesis: WorkingHypothesis
  lbpConfirmedStage: ExerciseStage | null
  regionClinical: RegionClinicalMap
}

/** 가설만 가진 상태(재진 `VisitWorkspaceState`). */
export type RegionHypothesisHost = {
  lbpWorkingHypothesis: WorkingHypothesis
  regionClinical: RegionClinicalMap
}

export function readRegionHypothesis<T extends RegionHypothesisHost>(
  state: T,
  region: RegionKey,
  patterns: readonly HypothesisPattern[],
): WorkingHypothesis {
  if (region === 'lbp') return state.lbpWorkingHypothesis
  return sanitizeWorkingHypothesis(patterns, state.regionClinical[region]?.workingHypothesis)
}

export function withRegionHypothesis<T extends RegionHypothesisHost>(state: T, region: RegionKey, next: WorkingHypothesis): T {
  if (region === 'lbp') return { ...state, lbpWorkingHypothesis: next }
  const current = state.regionClinical[region] ?? emptyRegionClinicalRecord()
  return { ...state, regionClinical: { ...state.regionClinical, [region]: { ...current, workingHypothesis: next } } }
}

export function readRegionClinical<T extends RegionClinicalHost>(
  state: T,
  region: RegionKey,
  patterns: readonly HypothesisPattern[],
): RegionClinicalRecord {
  if (region === 'lbp') {
    return {
      directionalResponse: state.lbpDirectionalResponse,
      workingHypothesis: state.lbpWorkingHypothesis,
      confirmedStage: state.lbpConfirmedStage,
    }
  }
  const rec = state.regionClinical[region] ?? emptyRegionClinicalRecord()
  return { ...rec, workingHypothesis: sanitizeWorkingHypothesis(patterns, rec.workingHypothesis) }
}

export function withRegionClinical<T extends RegionClinicalHost>(state: T, region: RegionKey, patch: Partial<RegionClinicalRecord>): T {
  if (region === 'lbp') {
    const next: T = { ...state }
    if (patch.directionalResponse !== undefined) next.lbpDirectionalResponse = patch.directionalResponse
    if (patch.workingHypothesis !== undefined) next.lbpWorkingHypothesis = patch.workingHypothesis
    if (patch.confirmedStage !== undefined) next.lbpConfirmedStage = patch.confirmedStage
    return next
  }
  const current = state.regionClinical[region] ?? emptyRegionClinicalRecord()
  return { ...state, regionClinical: { ...state.regionClinical, [region]: { ...current, ...patch } } }
}
