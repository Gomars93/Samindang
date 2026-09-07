# Source Completeness Manifest — Recovered non-LBP Rehabilitation Architecture

Date: 2026-09-07  
Branch: `docs/recover-rehab-architecture-20260907`  
Status: **REFERENCE RECOVERY COMPLETE FOR ALL LOCATED NON-LBP REHAB ARCHITECTURE SOURCES**

## 1. Recovery scope

The ChatGPT Library was searched broadly and repeatedly for historical non-LBP rehabilitation / exercise architecture using:

- `Exercise / Rehabilitation Architecture`
- `Exercise Library 연결 원칙`
- `Clinical OS 후보 2–3개`
- region-specific terms for NECK / SHOULDER / KNEE / ELBOW / WRIST_HAND / HIP / ANKLE_FOOT / TMJ

The recoverable region-specific rehabilitation architecture source artifacts located were:

1. NECK
2. SHOULDER
3. KNEE

No separate historical Exercise/Rehabilitation Architecture source artifact was located for ELBOW, WRIST_HAND, HIP, ANKLE_FOOT, or TMJ in the searched ChatGPT Library. This statement means **not located in the available Library search**, not proof that no such document ever existed elsewhere.

## 2. Governance

These recovered files are historical reference artifacts.

They are:
- **not** automatically Clinical Decisions CLOSED;
- **not** production exercise libraries;
- **not** permission to create diagnosis → exercise hard-coding;
- **not** permission to expand the tablet questionnaire;
- **not** a replacement for current GitHub PASS/FROZEN safety/module semantics.

LBP remains the only region with the deeper canonical exercise warehouse / Core-20 / eligibility-selector research stack.

## 3. Exact source inventory

### NECK

#### A. Historical v0.1 original
Path:
`source/originals/NECK_V1_Evidence_Matrix_v0.1.md`

Original Library metadata:
- file: `NECK_V1_Evidence_Matrix_v0.1.md`
- original size: 13,817 bytes
- SHA-256: `b5b8240d37bca7eb154934d30eeb0d9963998075b3180f0276ccbee8dbf5db30`
- Git blob SHA: `fb45c3363caef121b6bac3e7e7b58cd78206a4ab`

#### B. Historical v0.2 HANDOFF original
Path:
`source/NECK_V1_Evidence_Matrix_v0.2_HANDOFF.md`

This is the full recovered v0.2 historical source already preserved on this branch.

### SHOULDER

Original Library file:
`SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.md`

Original metadata:
- lines: 652
- size: 23,891 bytes
- SHA-256: `bf406ed7631800664b47a59e80559809e5c51992bf398c42287213b21d3b1a65`

The exact UTF-8 source is preserved in sequential parts because the connector recovery write was intentionally bounded:

1. `source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part00.md` — original lines 1–160 — blob `ed87c2ff7228d6b021b1592dd9dde6b0327e5f1f`
2. `source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part01.md` — lines 161–320 — blob `a8a366a9e65c665bee007cf009099724f9bc76a8`
3. `source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part02.md` — lines 321–480 — blob `4ede7db3f48d1df2d51a9e3b53d444b945b11bd5`
4. `source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part03.md` — lines 481–640 — blob `35cde3ffbbc77a5beb8963a67890fd7bc952dd28`
5. `source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part04.md` — lines 641–652 — blob `11449094ca7dcf57f1a4667c86173578bd8bf137`

Reconstruction:

```bash
cat docs/recovered_rehab_architecture/source/originals/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.part*.md > /tmp/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.md
sha256sum /tmp/SHOULDER_V1_Evidence_Matrix_v0.1_HANDOFF.md
# expected: bf406ed7631800664b47a59e80559809e5c51992bf398c42287213b21d3b1a65
```

### KNEE

Original Library file:
`KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md`

Original metadata:
- lines: 737
- size: 25,880 bytes
- SHA-256: `a507cc32238c721dcd4cc92bfa0a2b7b67bdd1e8b96517f897704fd03ab64a31`

The exact UTF-8 source is preserved in sequential parts:

1. `source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part00.md` — original lines 1–160 — blob `f1e00d47a2180535c7b25c46f98a776035e2d9fe`
2. `source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part01.md` — lines 161–320 — blob `14f3aa35af41da02e1cbd8a14bedf586f08c20b5`
3. `source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part02.md` — lines 321–480 — blob `b45c373e43a413f5f8ada4a5348fbee439af6f5d`
4. `source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part03.md` — lines 481–640 — blob `df2125d09d8bf2c4153cac9b8e29330fdef1e2ed`
5. `source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part04.md` — lines 641–737 — blob `cc7c329271d27196cabef2e42deac46c5dc50323`

Reconstruction:

```bash
cat docs/recovered_rehab_architecture/source/originals/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.part*.md > /tmp/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md
sha256sum /tmp/KNEE_V1_Evidence_Matrix_v0.1_HANDOFF.md
# expected: a507cc32238c721dcd4cc92bfa0a2b7b67bdd1e8b96517f897704fd03ab64a31
```

## 4. Convenience / distilled references

These are shorter governance-safe summaries and should not be mistaken for the exact originals:

- `NECK_V1_REHAB_ARCHITECTURE_RECOVERED.md`
- `SHOULDER_V1_REHAB_ARCHITECTURE_RECOVERED.md`
- `KNEE_V1_REHAB_ARCHITECTURE_RECOVERED.md`

Existing rehab-focused verbatim extracts are retained for quick inspection:

- `source/SHOULDER_V1_Evidence_Matrix_REHAB_EXTRACT.md`
- `source/KNEE_V1_Evidence_Matrix_REHAB_EXTRACT.md`

## 5. Recovery conclusion

For the available ChatGPT Library sources, the missing non-LBP rehabilitation architecture material identified in this recovery pass is now preserved on this branch with exact-source provenance and integrity metadata.

This branch remains documentation/reference only. **Do not merge to `main` without explicit Product Owner approval.**
