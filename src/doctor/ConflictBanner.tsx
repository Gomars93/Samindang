/**
 * Shared stale-write conflict banner (Round 18: DoctorWorkspace /
 * RevisitWorkspace / JudgmentPanel save-conflict wiring). Presentational
 * only -- no network code, no clinical logic. Reuses doctor.css's existing
 * `.doctor__banner` visual language with a `--warning` modifier,
 * deliberately less alarming than `--danger`: a save conflict is an
 * operational hazard, not a clinical safety signal, and must never visually
 * compete with CommonSafetyBanner (which stays the only `--danger` banner).
 *
 * Fail-closed by construction: this component never merges anything and
 * offers exactly ONE explicit recovery action (load the server's current
 * version). Whatever the caller was about to save is handed in as
 * `draftJson` so a clinician can manually copy/re-enter values before
 * clicking reload -- inventing field-level merge semantics was explicitly
 * out of scope for this batch (see the round-17 owner directive in
 * HANDOFF.md). Reload always discards the in-memory draft from the screen;
 * this is the only thing standing between that and data loss, so it must
 * stay visible until the clinician has had a chance to read it.
 */
export function ConflictBanner({
  onReload,
  draftJson,
}: {
  onReload: () => void
  /** JSON snapshot of the unsaved local state at the moment the conflict was detected, or null if there is nothing worth showing (e.g. no edits yet). */
  draftJson: string | null
}) {
  return (
    <div className="doctor__banner doctor__banner--warning" role="alert">
      <strong>다른 화면에서 먼저 저장됨</strong>
      <p>
        이 화면을 보는 동안 다른 화면이나 기기에서 같은 기록이 먼저 저장되었습니다. 지금 화면의 입력 내용은
        아직 서버에 반영되지 않았고, 자동 저장은 잠시 멈췄습니다.
      </p>
      <button type="button" className="doctor__banner__reloadBtn" onClick={onReload}>
        최신 내용 불러오기
      </button>
      {draftJson && (
        <details className="doctor__banner__draft">
          <summary>
            불러오기 전 내 입력 내용 보기 (자동 저장되지 않습니다 — 필요한 부분을 복사해 다시 입력하세요)
          </summary>
          <textarea readOnly value={draftJson} className="doctor__banner__draftText" />
        </details>
      )}
    </div>
  )
}
