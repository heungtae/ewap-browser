# ISS-20261102-001 — MAIN injection must verify document results

Status: **Resolved for the isolated target injection primitive and controlled Chrome scope**. Occurred/updated 2026-11-02 KST. Extension version 0.1.117, source base `536ce19a0` plus this change. Production routing, deployed user profiles and provider execution are not qualified. Fix revision is the commit containing this record and the linked source hashes.

During S28 emitted-helper qualification on Linux/Chrome 147.0.7727.15, a direct `chrome.scripting.executeScript` call targeting a previous document ID resolved after navigation. Its returned document ID matched the new active document and its returned frame ID differed from the requested main frame. Treating a resolved API promise as proof of target identity was insufficient. This observation is recorded without attributing an unverified internal browser cause.

The target [injection primitive](../../../apps/chrome-extension/src/content/main-transport.ts) now checks current caller admission, cancellation, bounded deadline and live document/URL/lifecycle before injection. It checks exact returned document/frame identity and current metadata again before returning a result. The trusted caller retains policy/lease/approval ownership. A mismatch before dispatch returns `MAIN_INJECTION_DENIED` with `dispatched: false`; a failure after the command was sent returns `MAIN_INJECTION_UNCERTAIN` with `dispatched: true`. There is no retry or rollback claim. Late metadata cannot trigger injection after cancellation/timeout. No presentation command exposes these primitives.

Acceptance and regression checks passed:

- Old-document and inactive/revoked/pre-cancelled admissions send no injection.
- Wrong returned document/frame identity and navigation after dispatch produce uncertainty, without retry.
- Stalled metadata cannot dispatch late; cancellation after sending preserves uncertainty.
- Actual Chrome runs unchanged emitted helpers through a statically composed fixture MV3 Worker. The guarded old-document request is rejected before dispatch; a stalled MAIN read is bounded and reported uncertain.
- [ISS-20261012-001](2026-10-12-page-method-main-instrumentation.md) regressions pass: serializable helpers have no imported tracing closure, method discovery/invocation works in Chrome, and instrumentation/coverage checks pass.

Unit regression: [main-transport.test.ts](../../../extension/tests/unit/migration/s28/main-transport.test.ts), five cases. Actual Chrome regression: [chrome-main-cases.mjs](../../../scripts/s28/chrome-main-cases.mjs). [Dated evidence](../../evidence/s28-main-2026-11-02.md) includes source hashes, commands, first failures and runtime limits. S28/S29 remain In Progress; this local resolution does not assert full task-runtime integration.

History: 2026-11-02 first observed with the raw Chrome API; the initial helper loader also exposed unsupported dynamic import in an MV3 Worker. Static fixture composition and the guarded injection port pass the recorded acceptance checks. No prior production fix is overwritten.
