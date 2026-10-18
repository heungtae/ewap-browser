# ISS-20261018-001: Provider Options actions missing after role separation

- Status: Resolved for controlled Chrome scope; reported and updated 2026-10-18 KST.
- Source: `e8ebd3f17` plus uncommitted Options changes; no fix commit or deployment yet.
- Symptom: Decision LLM Provider lacks connection test and export. LLM Provider management no longer contains primary/decision role controls.
- Cause: the new decision form implemented save only; role controls were moved out of management. The older credential-preserving disable path was also absent.
- Fix: add native Jev connection test (save current form first) and selected saved Provider export; restore primary/decision role controls to management, add full export and credential-preserving disable. Preserve existing import/delete, primary-only fallback, revision validation and write-only secrets. Removed Plugin support remains removed.
- Acceptance: controlled Chrome verifies connection success, secret-free selected/full export, management control placement and disable retaining credentials. Existing S25 role/fallback checks must pass. Deployment and live Options-to-provider verification remain outside this fix acceptance scope.
- Regression: `scripts/chrome-s25-settings.mjs`; related `extension/tests/unit/providers/s25-settings.test.ts` and `extension/tests/unit/settings/provider-settings.test.ts`.
- Validation: `pnpm typecheck`; focused Vitest suites (19 tests); focused ESLint; `pnpm check:module-boundaries`; `pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs`; `pnpm test:chrome-s25` with the installed Chrome for Testing (8 checks). All passed on the working tree above. Build did not increment the version.
- Chrome verified the actual connection-test button via the native fixture, selected Jev-only export, full export with both providers, all management controls in their section, and disable retaining the stored key. No raw credentials or provider payloads are recorded.
- [Screenshot](../../evidence/images/provider-options-restored-2026-10-18.png). This fix did not repeat the earlier live API test and does not claim live Options integration.

History: 2026-10-18 reported, source compared with HEAD and historical lifecycle controls, fix implemented; controlled Chrome acceptance passed. Deployment remains unverified.

## Follow-up UI request — 2026-10-18

At the user's explicit request, removed the new-Jev action, management full-export action, and credential-preserving disable action (including their UI listeners). Primary form export and selected decision export remain available. Renamed role selectors to `기본 LLM Provider` and `판단 LLM Provider`. Added the decision API key show/hide toggle; loading or saving resets visibility to password mode.

Updated controlled Chrome checks passed (8 checks), including key visibility, role labels, requested action removal, native connection test and selected export. Typecheck, version-preserving artifact build/package validation, focused ESLint and Prettier checks passed. Earlier full-export/disable results above describe the prior UI only. No additional live API run was performed. [Updated screenshot](../../evidence/images/provider-options-updated-2026-10-18.png).
