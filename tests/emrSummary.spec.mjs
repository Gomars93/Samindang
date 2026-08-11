// EMR 요약 포맷 빌더 suite. Plain node, no test framework: assert() prints
// "OK: <name>" and throws on failure. Run via `npm run test:emrSummary`
// (bundles src/doctor/emrSummary.ts with esbuild first).
import { buildEmrSummary } from './.emr-summary-bundle.mjs'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

const CRLF = '\r\n'

const EMPTY_JUDGMENT = {
  schema_version: '1.0.0',
  recorded_at: null,
  source: {
    session_id: 's',
    questionnaire_version: '1.0',
    myungri_algorithm_version: 'x',
    myungri_library_version: 'y',
    myungri_status: 'resolved',
    myungri_pending_approval: [],
  },
  innate_features: [],
  symptom_links: [],
  saju_only_prediction: '',
  revised_after_exam: '',
  final_treatment_axis: '',
  prescription_direction: '',
  learning_case: false,
  debrief: null,
  transcript_import: null,
}

/* ---------------- all empty -> every line is just "label:" ---------------- */
{
  const text = buildEmrSummary({ primaryConcern: null, structuredNote: null, judgment: null })
  const expected = ['주호소:', '경과:', '주요 문진:', '진찰 소견:', 'Assessment:', '치료/처방:', '계획:'].join(CRLF)
  assert('all-empty input -> every line is bare "label:"', text === expected)
}

/* ---------------- primaryConcern wins over structured_note.chief_complaint ---------------- */
{
  const text = buildEmrSummary({
    primaryConcern: '두통',
    structuredNote: {
      chief_complaint: '다른 주호소',
      history: '3일 전부터',
      key_findings: '수면 부족',
      assessment: '긴장성 두통 의심 소견',
      treatment: null,
      plan: null,
    },
    judgment: null,
  })
  assert('primaryConcern wins over structuredNote.chief_complaint', text.includes('주호소: 두통'))
  assert('history filled from structuredNote.history', text.includes('경과: 3일 전부터'))
  assert('key_findings filled from structuredNote.key_findings', text.includes('주요 문진: 수면 부족'))
  assert(
    '진찰 소견 filled from structuredNote.assessment (descriptive, not a confirmed judgment)',
    text.includes('진찰 소견: 긴장성 두통 의심 소견'),
  )
  assert('Assessment line stays empty without judgment', text.includes(`Assessment:${CRLF}`))
}

/* ---------------- structured_note.treatment/plan must never leak into 치료/처방 or 계획 ---------------- */
{
  const text = buildEmrSummary({
    primaryConcern: null,
    structuredNote: {
      chief_complaint: null,
      history: null,
      key_findings: null,
      assessment: null,
      treatment: '침 치료 매일',
      plan: '2주 후 재진',
    },
    judgment: null,
  })
  assert('structured_note.treatment never auto-fills 치료/처방', !text.includes('침 치료 매일'))
  assert('structured_note.plan never auto-fills 계획', !text.includes('2주 후 재진'))
  assert('치료/처방 line stays empty', text.includes(`치료/처방:${CRLF}`))
  assert('계획 line stays the last, empty line', text.endsWith('계획:'))
}

/* ---------------- judgment fields fill Assessment/치료처방/계획 ---------------- */
{
  const judgment = {
    ...EMPTY_JUDGMENT,
    revised_after_exam: '두통 재확인',
    final_treatment_axis: '진정 위주',
    prescription_direction: '경과 관찰 후 재진',
  }
  const text = buildEmrSummary({ primaryConcern: null, structuredNote: null, judgment })
  assert('Assessment filled from judgment.revised_after_exam', text.includes('Assessment: 두통 재확인'))
  assert('치료/처방 filled from judgment.final_treatment_axis', text.includes('치료/처방: 진정 위주'))
  assert('계획 filled from judgment.prescription_direction', text.includes('계획: 경과 관찰 후 재진'))
}

/* ---------------- whitespace-only values are treated as empty ---------------- */
{
  const text = buildEmrSummary({ primaryConcern: '   ', structuredNote: null, judgment: null })
  assert('whitespace-only primaryConcern renders as empty, not a blank line with trailing space', text.startsWith('주호소:' + CRLF))
}

console.log(`\nSUMMARY: ${passCount} assertions passed, 0 failed (total ${passCount})`)
