import React from 'react'
import { renderToString } from 'react-dom/server'
import { AnkleFootSafetyPanel } from './.ankle-foot-doctor-panel-bundle.cjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

function payload(moduleValues, safetyStatus = 'REVIEW_REQUIRED', generalRed = false) {
  return {
    flags: { general_red: generalRed },
    responses: {
      safety_flags: { ankle_foot: { ankle_foot_safety_status: safetyStatus } },
      modules: { ankle_foot: moduleValues },
    },
  }
}

const clearModule = {
  region_discriminator: 'ANKLE',
  recent_trauma: 'NO',
  limb_threatening_screen: ['NONE'],
  post_trauma_walking: null,
  midfoot_supportive_screen: null,
  achilles_rupture_screen: null,
  infection_screen: 'NO_CONCERN',
  dvt_pattern: null,
  progressive_neuro_screen: 'NO',
}

{
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: payload(clearModule, 'CLEAR') }))
  assert('clear: panel renders ANKLE/FOOT title', html.includes('ANKLE/FOOT'))
  assert('clear: safety label is safe', html.includes('안전'))
  assert('clear: no Ottawa auto-result wording', !/Ottawa positive|Ottawa negative/.test(html))
}

{
  const review = {
    ...clearModule,
    region_discriminator: 'HEEL_POSTERIOR_ANKLE',
    recent_trauma: 'YES',
    post_trauma_walking: 'CAN_WALK_NORMALLY',
    achilles_rupture_screen: ['SUDDEN_POP_OR_SNAP_BEHIND_ANKLE_OR_CALF'],
  }
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: payload(review) }))
  assert('Achilles review: panel shows Achilles assessment required', html.includes('아킬레스건 평가 필요') && html.includes('예'))
  assert('Achilles review: clinician Thompson boundary shown', html.includes('Thompson test'))
}

{
  const dvt = {
    ...clearModule,
    region_discriminator: 'LOWER_LEG_CALF',
    dvt_pattern: 'NEW_UNILATERAL_CALF_OR_LOWER_LEG_SWELLING_PAIN',
  }
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: payload(dvt) }))
  assert('DVT review: panel shows DVT assessment', html.includes('DVT 평가 필요'))
  assert('DVT review: Wells remains clinician-side', html.includes('clinician-side 평가/Wells 확인'))
}

{
  const hiddenPayload = payload(clearModule, 'CLEAR')
  hiddenPayload.responses.safety_flags.ankle_foot = null
  const html = renderToString(React.createElement(AnkleFootSafetyPanel, { payload: hiddenPayload }))
  assert('not applicable: panel renders nothing', html === '')
}

console.log(`\n${passCount} ankle-foot doctor-panel assertions passed.`)
