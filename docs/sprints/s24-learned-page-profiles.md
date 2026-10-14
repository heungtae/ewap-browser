# Browser Agent S24 — Learned page profiles and page commands

**2026-10-13: Browser-local implementation delivered; qualification remains In Progress.**

Current behavior is defined by [learned-profile modules](../../extension/src/learned-profile),
[Worker integration](../../extension/src/service-worker/learned-profile-runtime.ts),
[Settings management](../../extension/src/settings/learned-profile-management.ts), and
[executable checks](../../extension/tests/unit/learned-profile).
[Verification evidence](../evidence/s24-learned-page-profiles-2026-10-13.md) records the tested scope.

**2026-10-14 management UI update:** Options now opens a separate profile list/detail
window. [UI and regression evidence](../evidence/s24-profile-manager-2026-10-14.md)
records the popup, editing and window-bound chat recovery checks. Entry points:
[Options launcher](../../extension/src/settings/learned-profile-options.ts),
[manager](../../extension/src/settings/learned-profiles.html).

The original C1–C12/R01–R44 design remains available at
[the pinned design revision](https://github.com/heungtae/ewap-browser/blob/a1f111fcb9b2f402e9ef6790728225120270ae3c/docs/sprints/s24-learned-page-profiles.md).
That historical acceptance matrix does not establish current runtime support.

## Delivered behavior

Successful eligible Ask/Act requests save bounded local recipes and linked commands.
Subsequent requests receive matching advisory metadata and request-local command tools.
Readonly commands use existing page readers; UI and method commands return drafts for
fresh discovery, plans, proposals, consent and approval. Stored commands do not dispatch mutations.
Provider tool results continue with the original tool call ID.

Worker-owned storage validates revisions, serializes updates, deduplicates completion
receipts, limits retention, rejects stale management changes and quarantines failed recipes.
A safe successful alternative can replace the selected recipe and command atomically.
Persistent records contain fixed task/step descriptors and keyed page guards, excluding
page content, input values, script source, function paths, dynamic refs and approval grants.

Options uses the existing card, checkbox and button styles with 14px form spacing.
It provides filtering, pagination, enable/automatic-update controls, names, local notes,
recipe/command details, JSON, history, rediscovery, deletion and clear controls.
Management writes require the trusted Settings sender. Disabling the feature retains records.
The panel reports reuse, save, fallback, repair and storage failure separately from goal completion.

## Remaining qualification and backlog

Preserved from the 2026-10-13 design scope:

- C2/R01: the current context guard hashes visible text and semantic names. Changed data
  intentionally causes a cache miss; reuse across changed data is not qualified.
- C6/C8: S23 method hints remain advisory and require fresh discovery. S24-specific live
  method invocation, account/tenant holdouts and arbitrary production-site coverage remain unverified.
- C8/C9/C12: repair/race/recovery checks are executable unit checks; full Chrome/live
  failure-to-alternative repair and exhaustive R01–R44 qualification remain pending.
- C10/C11: generated command inputs support none/text. Numeric and boolean tasks retain
  recipes without commands. Snapshot readers execute; resource/component readers request
  fresh context. Visual, batch and business reads exclude initial recipe learning.
- C12: cold/warm provider receipts are recorded, but no token or latency reduction is claimed.
  Public distribution, Windows and Platform integration are outside this delivery evidence.

## Reproduce

Use the pinned pnpm version and the commands in the linked evidence. Chrome checks use
`CHROME_FOR_TESTING_BIN`, isolated profiles and controlled HTTPS fixtures.
`pnpm build` changes the extension version; the evidence uses the version-preserving build.
