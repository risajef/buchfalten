# Architecture review fixes

Scope: this subrepo only. No parent-site edits, submodule-pointer commit, deployment or push.
Each numbered fix is a separate commit; its tests and progress entry are included in that commit.

| Review finding | Status | Validation / decision |
| --- | --- | --- |
| 1. Analysis races | Done | Snapshot metadata and reject superseded image callbacks, including edits during debounce; 3 controller regression tests. |
| 2. Pending text render | Done | Clearing, editing, uploading and switching mode invalidate pending text jobs; superseded blobs are revoked. |
| 3. Mode and source | Done | Explicit mode and separate retained image/text sources; metadata and preview follow the selected source. Source-owned blobs survive mode switches. |
| 4. Stale downloads | Done | Input changes immediately revoke export and clear results; explicit empty/processing/ready/error state; failures cannot retain old output. |
| 5. PDF scale | Done | Explicit schematic/true-size labels, a 50 mm print calibration line, authoritative start/end/height measurement tables; no artificial minimum band height. |
| 6. Validation and resource limits | Done | Boundary validation, 10 MB file / 40 MP source limits, bounded 2048-edge / 2 MP rasterization; fractional/out-of-range inputs rejected; height unified at 80–400 mm. |
| 7. Duplicate PDF work | Done | One export path per accepted result; removed redundant auto-preview and download regeneration paths. |
| 8. PDF metadata | Done | Source metadata reaches export; wrapped header lines reserve their own space and participate in orientation / scale selection. |
| 9. Physical model and fold plan | Done | Documented leaves and calibrated width; explicit lossy-alternation / reject choice; immutable selected/detected bands; contain aspect ratio; preview and PDF preserve blank columns and indices. |
| 10. Font loading | Done | Validated names and encoded parameters; whole-operation timeout; failed links removed for retry; requested glyphs loaded with no silent font fallback. |
| 11. Duplicate code and dependencies | Done | Removed inactive main.js; imported deeply frozen config/shared utilities; analysis canvas and PDF factory injected; root-scoped mount API disposes listeners, timers and blobs. Existing embed entry path preserved. |
| 12. Regression suite / CI | Done | Native Node regressions plus real jsPDF/checksum tests; real Chromium smoke passed; subrepo-only CI runs both. |
| Dependency availability / integrity | Done | jsPDF 4.2.1 vendored with license and checksum; runtime CDN removed from standalone bootstrap. Lockfile pins test tooling; npm audit reports zero advisories after replacement. |
| Standalone stylesheet portability | Done | Removed the stylesheet outside the subrepo; browser smoke rejects missing stylesheets. |
| Other lower-priority observations | Pending | |

## Checks

Run `npm ci`, `npm test` and `npm run test:browser` from this subrepo.
The browser smoke check passed locally using Chromium 131 with socket permissions;
it verifies real font loading (local fixture), canvas analysis, mode retention,
validation, stale output and real PDF blobs. Node tests separately control race
completion order, resource ownership and physical geometry. Printed output still
requires the user's 50 mm calibration check; physical folding was not performed.
