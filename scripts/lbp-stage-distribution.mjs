#!/usr/bin/env node
/**
 * 요통 운동 단계 — 회고 파일럿 (분포 확인).
 *
 * E-5(2026-09-07, 요통 동등성 설계 §6): 본체는 부위 무관 스크립트
 * `region-stage-distribution.mjs`로 옮겼고 이 파일은 그것을 'lbp'로 부르는
 * 얇은 껍데기다 — 출력 형식·경고 임계값·개인정보 규칙은 그대로이며
 * `tests/lbp-stage-pilot.spec.mjs`가 두 파일을 함께 고정한다.
 *
 * 실행:
 *   npm run pilot:lbp-stage
 *   SAMINDANG_DATA_DIR=/경로/submissions npm run pilot:lbp-stage
 */
import { runStageDistribution } from './region-stage-distribution.mjs'

runStageDistribution('lbp').catch((e) => {
  console.error(e)
  process.exitCode = 1
})
