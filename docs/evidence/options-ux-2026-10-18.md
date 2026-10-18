# Options UX verification — 2026-10-18

Source baseline: `b62f72d8e` plus the working-tree changes for [ISS-20261018-002](../issues/records/2026-10-18-options-ux.md). Linux, Node `20.19.6`, pinned pnpm `9.15.4`, Chrome for Testing from the installed Playwright Chromium 1217 directory. No version bump, commit, release or deployment.

## Source and artifact checks

- TypeScript (`pnpm typecheck`, and direct local compiler after extraction): PASS.
- Full `pnpm lint` (ESLint and Prettier), module boundaries: PASS.
- Settings, S25/provider state, preference-handler and approval-policy unit suites: 7 files / 41 tests PASS.
- Fixture and E2E suites: 2 files / 2 tests PASS.
- Version-preserving build (`tsc -p tsconfig.build.json`, `node scripts/build-extension.mjs`) and package validation: PASS, version `0.1.113`.
- Repository-wide source-size check still fails on pre-existing unrelated oversized files. All changed/new Settings source and new Options smoke files are below 200 lines; the old 952-line entry and 736-line HTML were split into focused sources.

## Chrome verification

`CHROME_FOR_TESTING_BIN=… pnpm test:chrome-options`: final PASS, 8 check groups on the final built artifact:

1. Navigation, unknown-hash fallback, current-page semantics, custom approvals and dirty/save feedback.
2. Save keeps the selected Provider; connection test/model discovery use its identity and preserve the active primary role.
3. Selected Provider export/import round trip, with secrets excluded and imported drafts unsaved.
4. Role refresh and cancelled selection preserve editor drafts.
5. Learned-profile setting persistence, separate management window, resolver invalid-JSON rejection and corrected public-setting storage.
6. Workflow failure feedback, rejected-toggle rollback, control recovery, cancelled deletion and list retry.
7. Cancelled Provider deletion preserves storage/status; confirmed deletion selects and loads a remaining Provider.
8. All four pages render without horizontal overflow at 1440px and 390px.


`CHROME_FOR_TESTING_BIN=… pnpm test:chrome-s25`: PASS, 8 check groups. Retains controlled Ask/Act routing/fallback and the related Provider Options regression checks. No real model API is called.

The first S25 attempt timed out loading Settings while the artifact directory was being rebuilt; rerunning after build completion passed. A new storage check initially queried the learned-profile management API from the Side Panel and received no `enabled` value: the management sender guard correctly requires Settings. The test was corrected to query from the actual Options context; product authority was not broadened.

Screenshots are controlled fixture UI, with no real keys or page data:

| Page | Desktop | Narrow viewport |
| --- | --- | --- |
| Models | [1440px](images/options-models-1440-2026-10-18.png) | [390px](images/options-models-390-2026-10-18.png) |
| Work and permissions | [1440px](images/options-agent-1440-2026-10-18.png) | [390px](images/options-agent-390-2026-10-18.png) |
| Profiles and workflows | [1440px](images/options-automation-1440-2026-10-18.png) | [390px](images/options-automation-390-2026-10-18.png) |
| Enterprise connection | [1440px](images/options-enterprise-1440-2026-10-18.png) | [390px](images/options-enterprise-390-2026-10-18.png) |

Live model/enterprise connection qualification, installed-user migration, OS-specific permission dialogs, manual assistive-technology checks and release/deployment were not performed.

## Follow-up — redundant selector removed

The user requested removal of `편집할 Provider`. The selector and its dedicated state/listener are removed. Primary and decision selectors load their respective forms without applying runtime roles; the form-local delete buttons use the displayed Provider ID.

The follow-up working tree passed 24 focused unit tests, TypeScript, Settings ESLint, Prettier, module boundaries, version-preserving build and package validation. Options Chrome and S25 Chrome each passed 8 groups again. Regression checks explicitly require `provider-active-select` to be absent, confirm deletion buttons belong to their respective forms, and exercise the remaining selectors. Desktop/narrow screenshots above now show the UI after removal. No live model call or deployment was performed.
