/**
 * Structured Outputs JSON schema for the OpenAI supervisor decision.
 * Strict-mode compatible: every object sets additionalProperties:false and
 * lists every property in `required` (optional-ish fields use a nullable
 * type union instead of being omitted).
 */
export const SUPERVISOR_DECISION_SCHEMA_NAME = 'supervisor_decision'

export const SUPERVISOR_DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'summary', 'issues', 'next_task'],
  properties: {
    decision: {
      type: 'string',
      enum: ['PASS', 'REVISE', 'STOP'],
    },
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'file', 'description', 'required_fix'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          file: { type: ['string', 'null'] },
          description: { type: 'string' },
          required_fix: { type: 'string' },
        },
      },
    },
    next_task: {
      type: 'object',
      additionalProperties: false,
      required: ['create', 'title', 'instructions_markdown'],
      properties: {
        create: { type: 'boolean' },
        title: { type: ['string', 'null'] },
        instructions_markdown: { type: ['string', 'null'] },
      },
    },
  },
}

/**
 * Defense in depth beyond the API's own strict-schema guarantee: validate
 * the business rule that isn't expressible in JSON Schema alone
 * ("next_task.create=true only allowed when decision === 'PASS'"), and do a
 * minimal shape sanity check in case a non-strict path ever returns
 * something unexpected. Returns { ok: true, decision } or
 * { ok: false, reason }.
 */
export function validateSupervisorDecision(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, reason: 'not an object' }
  if (!['PASS', 'REVISE', 'STOP'].includes(obj.decision)) {
    return { ok: false, reason: `invalid decision: ${obj.decision}` }
  }
  if (typeof obj.summary !== 'string') return { ok: false, reason: 'summary missing/not a string' }
  if (!Array.isArray(obj.issues)) return { ok: false, reason: 'issues missing/not an array' }
  if (!obj.next_task || typeof obj.next_task !== 'object') {
    return { ok: false, reason: 'next_task missing/not an object' }
  }
  if (obj.next_task.create && obj.decision !== 'PASS') {
    return { ok: false, reason: 'next_task.create=true is only allowed when decision=PASS' }
  }
  return { ok: true, decision: obj }
}
