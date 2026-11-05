# Architecture review fixes

Scope: this subrepo only. No parent-site edits, submodule-pointer commit, deployment or push.
Each numbered fix is a separate commit; its tests and progress entry are included in that commit.

| Review finding | Status | Validation / decision |
| --- | --- | --- |
| 1. Analysis races | Done | Snapshot metadata and reject superseded image callbacks, including edits during debounce; 3 controller regression tests. |
| 2. Pending text render | Pending | |
| 3. Mode and source | Pending | |
| 4. Stale downloads | Pending | |
| 5. PDF scale | Pending | |
| 6. Validation and resource limits | Pending | |
| 7. Duplicate PDF work | Pending | |
| 8. PDF metadata | Pending | |
| 9. Physical model and fold plan | Pending | Preserve existing thickness / allocation policy unless explicitly exposed as a choice. |
| 10. Font loading | Pending | |
| 11. Duplicate code and dependencies | Pending | |
| 12. Regression suite / CI | In progress | Native Node test runner; no runtime dependencies added. |
| Lower-priority observations | Pending | |

## Checks

Run `npm test` from this subrepo. Controller tests simulate event timing and image completion; they do not replace a real browser check. Initial browser launch in the review sandbox was blocked by socket restrictions.
