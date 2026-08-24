---
name: M-HMS release provenance
description: Canonical repository, Git-only release invariants, frontend preservation, and large-history/LFS constraints
---

# M-HMS release provenance

- **Rule:** The only canonical M-HMS repository is `https://github.com/MicrogennSenthil/Final-M-HMS-Running07082026`, branch `main`.
- **Why:** a reviewed occupancy release was first pushed to a superseded repository, leaving production code and repository provenance inconsistent.
- **How to apply:** start from current canonical `main`, push only reviewed commits there, fetch afterward, and require local `HEAD` to equal `origin/main` before any VPS release step.

- **Rule:** M-HMS releases are Git-only: reviewed commit → backup → staging at the exact commit → verification/approval → production at the same commit. Never update production source by direct file copy.
- **Why:** production must be reproducible and rollback must identify both the prior revision and database backup.
- **How to apply:** record the release SHA, pre-release file/database backup, staged verification, production verification, and rollback target. A legacy archive-upload script is not an approved release path.

- **Rule:** Backend-only releases must preserve the existing live frontend build and frontend worktree.
- **Why:** the canonical frontend lineage has previously diverged from development copies; replacing it during an unrelated backend release can regress live hotel workflows.
- **How to apply:** build/restart only the backend for backend-only changes and verify no frontend files or built assets changed.

- **Rule:** Historical source archives tracked through Git LFS are not required to validate or publish a backend-only source change; do not replace missing LFS objects with ad hoc files.
- **Why:** large historical archive objects can make ordinary checkout stall or fail even though the relevant Git source blobs are valid.
- **How to apply:** use a no-checkout or `GIT_LFS_SKIP_SMUDGE=1` clone for provenance work, then validate the actual source/build files needed by the release. Do not use a blob-filtered partial clone if required ordinary blobs cannot be fetched reliably.

- **Rule:** Production M-HMS releases go to the old live server, not Server 2. Discover active PM2 processes by name on every release instead of trusting historical numeric IDs.
- **Why:** PM2 IDs changed while older deployment notes still named obsolete IDs; restarting those would not update the live backend.
- **How to apply:** inspect the live `mhms` process script paths and status before backup, restart, rollback, and verification.

- **Rule:** Never pull a release into a dirty live M-HMS source directory. Build the reviewed SHA in an isolated clean checkout of the canonical repository and deploy only the verified backend artifact for backend-only releases.
- **Why:** the live server contains dirty historical worktrees and release markers; pulling there risks overwriting newer production fixes or the preserved frontend.
- **How to apply:** prove the target commit descends from the currently deployed revision, build/test in an isolated Git checkout, record its SHA and checksum, and keep the frontend hash unchanged.

- **Rule:** The production database role cannot dump some historical `patch_*` and `zz_*` backup tables.
- **Why:** full `pg_dump` aborts on permission errors before deployment even though operational application tables are readable.
- **How to apply:** for schema-neutral releases, back up all operational tables while excluding only those inaccessible historical backup-table patterns; verify the compressed dump before activation.