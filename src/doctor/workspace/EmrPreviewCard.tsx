/**
 * EMR preview card — shows the composed workspace EMR text, VIEW-ONLY (PR
 * #24 Phase 9; copy button removed by LBP v1 Batch 4 §14.3/CD-2.7-2).
 *
 * This card used to carry its own "EMR용 복사" button, duplicating the copy
 * surface DoctorView.tsx's 종결 section already has — two copy buttons that
 * could show different text if either drifted. CD-2.7-2 (`DECISIONS.md`
 * 2026-09-04) settles this: 참고 자료's preview stays read-only reference,
 * and 종결 is the one remaining place a clinician copies EMR text from.
 * Opus delta review defect #1 fix: this is now true for EVERY profile, not
 * only pain — 종결 sources a herbal/mixed record's text from the exact same
 * `buildHerbalWorkspaceEmrPreview`/`buildPainWorkspaceEmrPreview` calls this
 * card renders (see emrPreview.ts's file header and DoctorView.tsx's own
 * 종결 section).
 *
 * Opus CLOSING review C-5: the "복사는 「다음」 레인의 「종결」 섹션에서
 * 합니다." hint used to be hard-coded here, but 종결 only renders under
 * `mode === 'server' && selectedRecord?.patient_id`
 * (`DoctorView.tsx`'s `nextLaneFooterNode`) — in fixtures/preview mode and
 * for legacy records with no `patient_id`, the hint named a section that
 * does not exist on screen. `copyHint` is now an optional prop the CALLER
 * decides — DoctorWorkspace.tsx threads it through PainWorkspaceNext /
 * HerbalWorkspaceNext only when `nextLaneFooter` (the exact same signal
 * DoctorView.tsx already gates 종결's own render on) is present; when it is
 * omitted here, no hint paragraph renders at all rather than pointing at a
 * nonexistent section. The box never goes empty and no "복사됨" false
 * signal is possible either way — a read-only textarea can still be
 * hand-selected and copied without the button.
 */
export function EmrPreviewCard({ text, copyHint }: { text: string; copyHint?: string }) {
  return (
    <section className="workspace__emrPreview" aria-label="EMR 미리보기">
      <div className="workspace__emrPreview__head">
        <h4>EMR 미리보기</h4>
        <span className="workspace__emrPreview__badge">제안이 자동으로 확정 소견이 되지 않음</span>
      </div>
      <textarea className="workspace__emrPreview__text" readOnly rows={7} value={text} />
      {copyHint && <p className="workspace__emrPreview__hint">{copyHint}</p>}
    </section>
  )
}
