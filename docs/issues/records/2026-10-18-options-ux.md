# ISS-20261018-002: Options navigation and configuration feedback

- Reported and updated: 2026-10-18 KST.
- Status: Resolved for controlled Chrome and source-check scope.
- Source baseline: `b62f72d8e`; implementation is in the working tree. No fix commit or deployment yet.
- Related: [ISS-20261018-001](2026-10-18-provider-options-management.md), whose requested management actions, decision key toggle, connection test and export remain covered by S25 checks.

## Occurrence and cause

The user requested a review and correction of the entire Options experience. Seven cards formed one long page. Model editing, active roles, optional enterprise configuration, approvals, Chrome permissions and display preferences had no task-based navigation. Several labels mixed implementation terms and languages. Save-required controls and immediate permissions appeared together without clear boundaries.

Source inspection also found that primary connection tests and model discovery used the literal Provider ID `local`; save refresh could restore a different editor or discard drafts; primary export returned all providers although import accepts one; workflow update rejections had no visible recovery and a failed list could look empty. Advanced headers had no accessible input names, and primary key visibility was not reset when loading a different Provider.

## Fix and preservation boundaries

- Four navigable groups: LLM Provider, work and permissions, profiles and workflows, enterprise connection. Hash links support direct navigation and browser history; keyboard focus and narrow layouts are supported.
- Put role selection and provider editing together, clarify save versus apply, and fold optional decision routing and advanced connection controls.
- Group agent controls by approval, page reading/screen transfer, tools/display and immediate Chrome permissions. Show individual approval categories only in custom mode. Keep approval values, request binding and runtime consent enforcement unchanged.
- Add dirty-form feedback and leaving-page protection. Preserve drafts during role refresh; require confirmation before replacing a dirty editor. Imported forms remain unsaved.
- Bind connection test/model discovery/export to the edited Provider ID; keep newly saved Provider selected. Export one secret-free Provider so it can be imported again. Preserve the first-Provider auto-selection behavior and existing write-only secret semantics.
- Give workflow updates visible progress/failure, restore a rejected toggle, support list retry and confirm deletion. Preserve separate learned-profile management.
- Split the oversized Settings entry, HTML and inline CSS into focused modules and build-time fragments; ship one normal Options document.

## Acceptance and verification

Controlled Chrome must cover navigation, save/dirty state, selected-Provider test/model discovery, export/import, role-refresh draft preservation, workflow failure/retry, learned-profile controls, resolver form validation/storage and all four pages at desktop/mobile widths. S25 must retain decision test/export, role labels, secret handling and the previously requested action removal. Source checks and related Settings/policy tests must pass.

Final source verification: 41 unit tests and 2 fixture/E2E checks passed; typecheck, focused ESLint, module boundaries and version-preserving build/package validation passed. S25 controlled Chrome: 8 checks passed. Final Options Chrome verification passed 8 check groups: navigation, Provider identity and actions, export/import, draft preservation, learned-profile management, resolver storage, workflow recovery, Provider deletion and desktop/mobile layout. Full lint also passed. Detailed final results and screenshots: [Options UX evidence](../../evidence/options-ux-2026-10-18.md).

Live Provider qualification, real enterprise service configuration, installed-user migration and deployment are outside this UI fix's acceptance scope. Extension version remains `0.1.113`.

History: 2026-10-18 source audit, implementation, controlled Chrome corrections and final acceptance completed. Both Options and S25 passed 8 check groups on the final version-preserving build. No deployment claim.

## Follow-up — remove the redundant editor selector

At the user's explicit request on 2026-10-18, removed the `편집할 Provider` select, its help text, option rendering, selection state and listener. The existing primary/decision selectors now load their matching form; selecting still requires explicit Apply to change the runtime role. Dirty-form cancellation restores the previous selection. Saved and imported Provider settings remain editable.

Moved deletion into each Provider form, bound to that form's Provider ID. Deletion is disabled for unsaved IDs, confirms the stored ID, retains backend revision/role guards, and reloads a remaining Provider of the same kind or resets to an empty setup when none remains. No new management selector replaces the removed control.

Validation after removal: focused unit suites 5 files / 24 tests PASS; TypeScript, Settings ESLint, Prettier, module boundaries, version-preserving build and package validation PASS. Options and S25 controlled Chrome each passed 8 check groups, including absence of the removed control, form-local deletion placement, selection without runtime activation, cancelled dirty selection and primary/decision form loading. Screenshots in the evidence record were refreshed. Version remains `0.1.113`; no deployment or live Provider test.
