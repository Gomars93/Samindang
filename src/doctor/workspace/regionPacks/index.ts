/**
 * 부위 팩 레지스트리. 팩이 없는 부위(`undefined`)와 승인 전 팩
 * (`productionApproved: false`)은 둘 다 "화면에 아무것도 내지 않음"으로 같게
 * 다뤄진다 — 호출부는 `activeRegionPack`만 쓰면 된다.
 *
 * `docs/PAIN_REGION_PACK_GENERALIZATION_PLAN_v0.1.md` §4:
 *   - R1: 요통 팩(유일한 승인 팩).
 *   - R3: 나머지 8부위 DRAFT 팩 등록 — 원장 승인 전이라 전부 비활성.
 *     승인 절차와 부위별 빈 칸은 `docs/PAIN_REGION_PACK_DRAFT_CONTENT_v0.1.md`.
 *     승인 = 해당 팩 파일의 `productionApproved`를 true로 + 서버
 *     `DETAIL_CHECK_REGION_QUESTION_IDS`에 재질문 id 등록 + `packContentGaps` 0개
 *     (`tests/region-pack.spec.mjs`가 셋을 함께 검사한다).
 */
import type { RegionKey, RegionPack } from '../regionPack'
import { isPackActive } from '../regionPack'
import { drivingRegionCandidates } from '../regionRouting'
import { LBP_REGION_PACK } from './lbp'
import { NECK_REGION_PACK } from './neck'
import { SHOULDER_REGION_PACK } from './shoulder'
import { KNEE_REGION_PACK } from './knee'
import { HIP_REGION_PACK } from './hip'
import { ANKLE_FOOT_REGION_PACK } from './ankleFoot'
import { ELBOW_REGION_PACK } from './elbow'
import { WRIST_HAND_REGION_PACK } from './wristHand'
import { TMJ_REGION_PACK } from './tmj'

export const REGION_PACKS: Readonly<Record<RegionKey, RegionPack>> = {
  lbp: LBP_REGION_PACK,
  neck: NECK_REGION_PACK,
  shoulder: SHOULDER_REGION_PACK,
  knee: KNEE_REGION_PACK,
  hip: HIP_REGION_PACK,
  ankle_foot: ANKLE_FOOT_REGION_PACK,
  elbow: ELBOW_REGION_PACK,
  wrist_hand: WRIST_HAND_REGION_PACK,
  tmj: TMJ_REGION_PACK,
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

/**
 * 이 기록을 구동할 승인 팩 — `drivingRegionCandidates` 순서에서 첫 승인 팩.
 * 판별 부위의 팩이 승인 전이면 같은 모집단의 승인된 팩으로 되돌아간다
 * (`regionRouting.ts` 주석). 승인 팩이 하나도 없으면 null.
 */
export function activeDrivingPack(responses: unknown): RegionPack | null {
  for (const k of drivingRegionCandidates(responses)) {
    const pack = activeRegionPack(k)
    if (pack) return pack
  }
  return null
}

export { packContentGaps } from './draftPack'
