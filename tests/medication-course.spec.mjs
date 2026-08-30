// Medication/Herbal-course batch: dedicated regression + failure-injection
// suite for server/crmStore.js's MedicationCourse persistence
// (createMedicationCourseStored / createMedicationCourseCheckTaskStored /
// shiftMedicationCourseStartStored). Plain node, no test framework: assert()
// prints "OK: <name>" and throws on failure -- same convention as
// tests/crm-store.spec.mjs, whose restart/crash-injection patterns this
// file reuses directly at the store boundary rather than duplicating the
// general CRM Episode/Task suite already covered there.
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCrmStore, CrmConflictError, CrmNotFoundError } from '../server/crmStore.js'

let passCount = 0
function assert(name, cond) {
  if (!cond) throw new Error(`FAIL: ${name}`)
  passCount++
  console.log(`OK: ${name}`)
}

async function readRaw(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function readdirJson(dirPath) {
  try {
    return (await readdir(dirPath)).filter((f) => f.endsWith('.json') && !f.endsWith('.tmp'))
  } catch (err) {
    if (err.code === 'ENOENT') return []
    throw err
  }
}

const T0 = '2026-01-01T00:00:00.000Z'

async function main() {
  /* =====================================================================
     Part 1: duplicate source event -- calling createMedicationCourseStored
     twice with the SAME (episode_id, source, source_id) but a DIFFERENT
     attempted medication_start_at must dedupe to the ORIGINAL record
     (never silently overwrite it with the retry's own values, and never
     create a second course file).
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-dedup-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const first = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'pharmacy_export',
        source_id: 'src-dup-1',
        source_timestamp: T0,
        medication_start_at: '2026-01-01',
        now: T0,
      })
      assert('dup-source: first call reports deduped:false', first.deduped === false)

      const second = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'pharmacy_export',
        source_id: 'src-dup-1',
        source_timestamp: T0,
        medication_start_at: '1999-01-01', // a different attempted value -- must be ignored
        now: T0,
      })
      assert('dup-source: second call with the same (episode_id, source, source_id) reports deduped:true', second.deduped === true)
      assert('dup-source: second call returns the SAME course_id as the first', second.course.course_id === first.course.course_id)
      assert(
        'dup-source: the retry attempted value never overwrites the original medication_start_at',
        second.course.medication_start_at === '2026-01-01',
      )

      const courseFiles = await readdirJson(path.join(root, 'medication-courses'))
      assert('dup-source: exactly one course file exists on disk', courseFiles.length === 1)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 2: start-date shift -- shifting medication_start_at supersedes the
     course's still-open ROUTINE check task and creates the caller-supplied
     replacement, while the course's own version increments. The replacement
     due_at is never computed here -- it is exactly what the caller passed.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-shift-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { course } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-shift-1',
        source_timestamp: T0,
        medication_start_at: '2026-01-01',
        now: T0,
      })

      const { task: originalTask } = await store.createMedicationCourseCheckTaskStored(
        course.course_id,
        course.version,
        'MEDICATION_START_CHECK',
        '2026-01-08',
        randomUUID(),
        T0,
      )
      assert('shift: original check task starts OPEN', originalTask.status === 'OPEN')

      const replacementTaskId = randomUUID()
      const result = await store.shiftMedicationCourseStartStored(
        course.course_id,
        course.version,
        '2026-01-03',
        [{ task_id: replacementTaskId, reason_code: 'MEDICATION_START_CHECK', due_at: '2026-01-10' }],
        T0,
      )
      assert('shift: course medication_start_at updated', result.course.medication_start_at === '2026-01-03')
      assert('shift: course version incremented exactly once', result.course.version === course.version + 1)
      assert('shift: exactly one task superseded', result.superseded.length === 1 && result.superseded[0].task_id === originalTask.task_id)
      assert('shift: the superseded task is actually SUPERSEDED on disk', result.superseded[0].status === 'SUPERSEDED')
      assert('shift: exactly one replacement task created', result.createdTasks.length === 1)
      assert('shift: the replacement task uses the CALLER-supplied due_at verbatim, never a derived one', result.createdTasks[0].due_at === '2026-01-10')
      assert('shift: the replacement task is a fresh id, not the superseded one', result.createdTasks[0].task_id === replacementTaskId)

      const onDiskOriginal = await readRaw(path.join(root, 'tasks', `${originalTask.task_id}.json`))
      assert('shift: the original task file on disk reflects SUPERSEDED', onDiskOriginal.status === 'SUPERSEDED')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 3: crash after intent write, then restart -- interrupt
     createMedicationCourseStored at the exact point after the dedup intent
     record is durably committed but before the course file itself lands.
     A fresh createCrmStore() instance (a real restart, no shared state)
     retrying the same source event must recover the ORIGINAL course_id --
     never mint a second course, never lose the record.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-crash-'))
    try {
      const storeA = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await storeA.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const originalCourseId = randomUUID()
      // Block the course file's own tmp write path -- the SECOND write in
      // createMedicationCourseStored's order, so the dedup intent record
      // (the FIRST write) is allowed to land normally.
      const courseTmpPath = path.join(root, 'medication-courses', `${originalCourseId}.json.tmp`)
      await mkdir(courseTmpPath, { recursive: true })

      let firstAttemptThrew = false
      try {
        await storeA.createMedicationCourseStored({
          course_id: originalCourseId,
          episode_id: episodeId,
          source: 'manual',
          source_id: 'src-crash-1',
          source_timestamp: T0,
          medication_start_at: '2026-01-01',
          now: T0,
        })
      } catch {
        firstAttemptThrew = true
      }
      assert('crash: first attempt genuinely throws when the course write is blocked (intent already committed)', firstAttemptThrew)

      const dedupFiles = await readdirJson(path.join(root, 'medication-course-dedup'))
      assert('crash: exactly one dedup intent record exists after the interrupted attempt', dedupFiles.length === 1)
      const intentAfterCrash = await readRaw(path.join(root, 'medication-course-dedup', dedupFiles[0]))
      assert(
        'crash: the intent record durably names the original course_id with the full snapshot',
        intentAfterCrash?.course?.course_id === originalCourseId && intentAfterCrash.course.medication_start_at === '2026-01-01',
      )
      const courseFileAfterCrash = await readRaw(path.join(root, 'medication-courses', `${originalCourseId}.json`))
      assert('crash: the course file itself does not exist yet -- only the intent survived', courseFileAfterCrash === null)

      // Unblock, then simulate an actual process restart: a completely
      // fresh createCrmStore() instance, no shared in-memory state.
      await rm(courseTmpPath, { recursive: true, force: true })
      const storeB = createCrmStore(root, { claimLeaseMinutes: 60 })

      const recovered = await storeB.createMedicationCourseStored({
        course_id: randomUUID(), // the caller's own fresh id on retry -- must be ignored in favor of the durable intent
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-crash-1',
        source_timestamp: T0,
        medication_start_at: '2026-01-01',
        now: T0,
      })
      assert('crash: restart-retry recovers the ORIGINAL course_id from the intent record', recovered.course.course_id === originalCourseId)

      const allCourseFiles = await readdirJson(path.join(root, 'medication-courses'))
      assert('crash: exactly one course file exists on disk after recovery -- no duplicate', allCourseFiles.length === 1)

      const thirdCall = await storeB.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-crash-1',
        source_timestamp: T0,
        medication_start_at: '2026-01-01',
        now: T0,
      })
      assert('crash: a subsequent ordinary retry dedupes to the recovered course, not a new one', thirdCall.deduped === true && thirdCall.course.course_id === originalCourseId)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 4: stale version conflicts rather than silently applying -- both
     for check-task creation and for the start-date shift.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-conflict-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { course } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-conflict-1',
        source_timestamp: T0,
        now: T0,
      })

      let checkTaskConflict = null
      try {
        await store.createMedicationCourseCheckTaskStored(course.course_id, course.version + 1, 'MEDICATION_START_CHECK', '2026-01-08', randomUUID(), T0)
      } catch (err) {
        checkTaskConflict = err
      }
      assert('conflict: stale-version check-task creation throws CrmConflictError', checkTaskConflict instanceof CrmConflictError)
      const tasksAfterFailedCheck = await readdirJson(path.join(root, 'tasks'))
      assert('conflict: the failed check-task creation left no task file on disk', tasksAfterFailedCheck.length === 0)

      let shiftConflict = null
      try {
        await store.shiftMedicationCourseStartStored(course.course_id, course.version + 1, '2026-02-01', [], T0)
      } catch (err) {
        shiftConflict = err
      }
      assert('conflict: stale-version shift-start throws CrmConflictError', shiftConflict instanceof CrmConflictError)
      const onDiskCourse = await readRaw(path.join(root, 'medication-courses', `${course.course_id}.json`))
      assert('conflict: the failed shift-start left the course version unchanged on disk', onDiskCourse.version === course.version)
      assert('conflict: the failed shift-start left medication_start_at unchanged on disk', onDiskCourse.medication_start_at === null)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 5: episode/patient identity -- patient_uuid on the created course
     is always DERIVED from the referenced Episode, and a nonexistent
     episode_id is refused rather than silently accepted.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-identity-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const realPatientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: realPatientUuid, owner_clinician: null, now: T0 })

      const { course } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-identity-1',
        source_timestamp: T0,
        now: T0,
        // A malicious/stale caller-supplied patient_uuid, if the field were
        // read at all, would land here -- it must have zero effect.
        patient_uuid: randomUUID(),
      })
      assert('identity: course.patient_uuid is derived from the Episode, never trusted from caller input', course.patient_uuid === realPatientUuid)

      let notFoundErr = null
      try {
        await store.createMedicationCourseStored({
          course_id: randomUUID(),
          episode_id: randomUUID(), // never created
          source: 'manual',
          source_id: 'src-identity-2',
          source_timestamp: T0,
          now: T0,
        })
      } catch (err) {
        notFoundErr = err
      }
      assert('identity: creating a course against a nonexistent episode_id throws CrmNotFoundError', notFoundErr instanceof CrmNotFoundError)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 6: completed (DONE) task immutability across a start-date shift --
     a resolved check task must never be superseded/rewritten, even though
     it is still linked to the course being shifted; only still-open
     ROUTINE tasks are affected.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-immutable-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })

      const { course } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-immutable-1',
        source_timestamp: T0,
        now: T0,
      })

      const { task: doneTask } = await store.createMedicationCourseCheckTaskStored(
        course.course_id,
        course.version,
        'MEDICATION_START_CHECK',
        '2026-01-08',
        randomUUID(),
        T0,
      )
      const resolvedTask = await store.resolveTaskStored(doneTask.task_id, doneTask.version, 'CLINICIAN', T0)
      assert('immutable: the check task is resolved to DONE before the shift', resolvedTask.status === 'DONE')

      const { task: openTask } = await store.createMedicationCourseCheckTaskStored(
        course.course_id,
        course.version,
        'MEDICATION_MID_CHECK',
        '2026-01-15',
        randomUUID(),
        T0,
      )
      assert('immutable: a second, still-open check task exists on the same course', openTask.status === 'OPEN')

      const result = await store.shiftMedicationCourseStartStored(course.course_id, course.version, '2026-01-05', [], T0)
      assert('immutable: only the still-open task is superseded', result.superseded.length === 1 && result.superseded[0].task_id === openTask.task_id)

      const onDiskDoneTask = await readRaw(path.join(root, 'tasks', `${doneTask.task_id}.json`))
      assert('immutable: the DONE task status is unchanged on disk after the shift', onDiskDoneTask.status === 'DONE')
      assert('immutable: the DONE task version is unchanged on disk after the shift', onDiskDoneTask.version === resolvedTask.version)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 7: cross-patient/cross-episode leakage -- listing courses by one
     episode must never surface another episode's (or another patient's)
     course, even when both were created in the same store/process.
     ===================================================================== */
  {
    const root = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-leakage-'))
    try {
      const store = createCrmStore(root, { claimLeaseMinutes: 60 })
      const episodeA = randomUUID()
      const patientA = randomUUID()
      const episodeB = randomUUID()
      const patientB = randomUUID()
      await store.createEpisode({ episode_id: episodeA, patient_uuid: patientA, owner_clinician: null, now: T0 })
      await store.createEpisode({ episode_id: episodeB, patient_uuid: patientB, owner_clinician: null, now: T0 })

      const { course: courseA } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeA,
        source: 'manual',
        source_id: 'src-leak-a',
        source_timestamp: T0,
        now: T0,
      })
      const { course: courseB } = await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeB,
        source: 'manual',
        source_id: 'src-leak-b',
        source_timestamp: T0,
        now: T0,
      })

      const coursesForA = await store.listMedicationCoursesByEpisode(episodeA)
      assert('leakage: episode A sees exactly its own course', coursesForA.length === 1 && coursesForA[0].course_id === courseA.course_id)
      assert('leakage: episode A never sees episode B\'s course', !coursesForA.some((c) => c.course_id === courseB.course_id))

      const coursesForB = await store.listMedicationCoursesByEpisode(episodeB)
      assert('leakage: episode B sees exactly its own course', coursesForB.length === 1 && coursesForB[0].course_id === courseB.course_id)
      assert('leakage: courseA and courseB carry distinct patient_uuid values', courseA.patient_uuid !== courseB.patient_uuid)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }

  /* =====================================================================
     Part 8: purge coverage -- scripts/purge-data.mjs deletes crm/ wholesale
     (confirmed by reading the script), so the two new subdirectories this
     batch introduces (medication-courses/, medication-course-dedup/) must
     disappear along with it without any script changes.
     ===================================================================== */
  {
    const dataRoot = await mkdtemp(path.join(tmpdir(), 'samindang-medcourse-purge-'))
    const submissionsDir = path.join(dataRoot, 'submissions')
    try {
      await mkdir(submissionsDir, { recursive: true })
      const crmBaseDir = path.join(dataRoot, 'crm')
      const store = createCrmStore(crmBaseDir, { claimLeaseMinutes: 60 })
      const episodeId = randomUUID()
      const patientUuid = randomUUID()
      await store.createEpisode({ episode_id: episodeId, patient_uuid: patientUuid, owner_clinician: null, now: T0 })
      await store.createMedicationCourseStored({
        course_id: randomUUID(),
        episode_id: episodeId,
        source: 'manual',
        source_id: 'src-purge-1',
        source_timestamp: T0,
        now: T0,
      })

      const seededCourses = await readdirJson(path.join(crmBaseDir, 'medication-courses'))
      assert('purge: sanity -- a course file was actually seeded before purge', seededCourses.length === 1)

      execFileSync(process.execPath, [path.join(process.cwd(), 'scripts', 'purge-data.mjs'), '--yes'], {
        env: { ...process.env, SAMINDANG_DATA_DIR: submissionsDir },
      })

      const crmDirExists = await access(crmBaseDir).then(() => true).catch(() => false)
      assert('purge: crm/ (including medication-courses/ and medication-course-dedup/) is gone entirely', !crmDirExists)
    } finally {
      await rm(dataRoot, { recursive: true, force: true })
    }
  }

  console.log(`\n${passCount} MedicationCourse persistence assertions passed.`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
