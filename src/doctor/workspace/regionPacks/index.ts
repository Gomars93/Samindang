/**
 * 부위 팩 레지스트리. 팩이 없는 부위(`undefined`)와 승인 전 팩
 * (`productionApproved: false`)은 둘 다 "화면에 아무것도 내지 않음"으로 같게
 * 다뤄진다 — 호출부는 `activeRegionPack`만 쓰면 된다.
 *
 * `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md` §4: R1은 요통 팩만
 * 등록한다. 다른 부위 팩은 R3에서 원장 승인 문서와 함께 들어온다.
 */
import type { RegionKey, RegionPack } from '../regionPack'
import { isPackActive } from '../regionPack'
import { LBP_REGION_PACK } from './lbp'

export const REGION_PACKS: Readonly<Partial<Record<RegionKey, RegionPack>>> = {
  lbp: LBP_REGION_PACK,
}

export function regionPackFor(region: RegionKey): RegionPack | null {
  return REGION_PACKS[region] ?? null
}

/** 승인된 팩만. 없거나 승인 전이면 null. */
export function activeRegionPack(region: RegionKey | null | undefined): RegionPack | null {
  if (!region) return null
  const pack = REGION_PACKS[region]
  return isPackActive(pack) ? pack : null
}
