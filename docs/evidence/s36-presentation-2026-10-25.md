# S36 presentation recovery and remaining-gate audit — 2026-10-25

**In Progress — recovery implemented; full presentation/live qualification blocked.** Real isolated Chrome now recovers visible backend status automatically after restart and page lifecycle changes. M00 comparison and the frozen JEV preflight are recorded without promoting incomplete gates. S36/S37 completion is not established. [Remaining acceptance](../s36-remaining.md) consolidates the current backlog.

Parent `4a08f3f3e4b568bca923069405edc10302562427` plus uncommitted presentation changes; Linux x64, pnpm 9.15.4, Node 20.19.6 for type/lint/Vitest/build, Node 22.23.2 for native/Chrome tools, Chrome 147.0.7727.15. Product version remains 0.1.117. Zero live-provider calls, business actions, approvals, production routing changes or deliveries.

## Implemented and observed

[Connection loop](../../apps/chrome-extension/src/presentation/connection-loop.ts) reads existing TaskClient/SettingsClient ports with one request pair in flight and a one-second delay after settlement. It validates the complete event batch before rendering, keeps a same-document observation cursor, suppresses duplicate messages, and latches snapshot-required on gaps/resync/invalid cursor. It never creates or resumes executable tasks. A disconnect does not erase the observed cursor or imply completed history. Transport deadlines remain owned by the existing native bridge.

[Controller](../../apps/chrome-extension/src/presentation/controller.ts) disposes timers, ignores late results after disposal and retains the existing form-submission block. [Entry lifecycle](../../apps/chrome-extension/src/presentation/entry.ts) disposes on pagehide and remounts on pageshow with the same document cursor; a real reload starts a new document. [View](../../apps/chrome-extension/src/presentation/view.ts) projects backend health into the existing activity output as well as the existing accessible status. The accessible status was screen-reader-only; a DOM-only success was insufficient for visible recovery. Repeated unchanged strings do not rewrite text; one existing live region announces updates. HTML/CSS structure and the legacy product entrypoint remain unchanged.

The browser artifact is still an S28 bridge with task admission unavailable; healthy transport is labelled `Backend connected — controller setup required`, never task readiness. Full task/history/settings/profile/workflow presentation remains dependent on missing runtime composition.

## Chrome and M00 evidence

[Runtime/continuity report](s36-presentation-chrome-2026-10-25/report.json), [presentation gate](s36-presentation-chrome-2026-10-25/gate.json), [visible connected panel](s36-presentation-chrome-2026-10-25/panel-connected.png), [panel comparison](s36-presentation-chrome-2026-10-25/panel-idle.json), [Settings comparison](s36-presentation-chrome-2026-10-25/options-agent.json), [manager comparison](s36-presentation-chrome-2026-10-25/profile-manager.json).

The runner does not issue explicit capabilities queries to drive recovery: the actual mounted UI polls through the authenticated bridge. It observes connected → disconnected → connected after a real daemon stop/restart; verifies visible activity output, retained input focus and unchanged message count; exercises pagehide/pageshow and an actual reload; then unregisters the host and observes disconnection. Pairing bytes remain unchanged. Page lifecycle events are controlled test signals; the reload/daemon/native messaging are actual. No tab/window/OS success is generalized from these signals.

Viewport/font checks match all three sampled M00 states. The visual/visible-state audit is **PARTIAL**, with differences: the newly visible connection activity and default panel diagnostics state; four Settings elements not visible in the target defaults and seven changed geometries/states; six manager control differences. These are unaccepted differences, not automatic regression waivers. The runner samples only 3 of 26 frozen M00 states. Workflow/approval/consent/dialog interactions, manager operations, full keyboard/window recovery and installed history/settings continuity remain unverified.

`qualify:s36:presentation` returns **BLOCKED**, exit 2, for missing M00 coverage, structural/state differences and incomplete interaction evidence. Recovery PASS in the same report is deliberately narrower. The gate has negative checks against missing/duplicate states and a falsely asserted PASS with changed controls/unverified consent.

[Artifact report](s36-presentation-artifacts-2026-10-25/report.json) and [full manifest](s36-presentation-artifacts-2026-10-25/release-set.json) pin the final rebuilt UI, release ID `8b05cafccddbfc2785da992f86493eb67389a9b381ad76893a95f3048e89ae7a`: 34 files, 1,967,214 bytes, extension 0.1.117, backend/browser packages 0.0.0, protocol 1.0, session-only credentials. Draft artifacts were retained locally while same-document cursor forwarding and visible status projection were corrected; the retained report/Chrome run use the final set. Dirty source provenance is explicit and is not a reproducible release claim.

## JEV and remaining runtime scope

[Fresh frozen JEV preflight](s36-prerequisites-2026-10-25/jev.json) returned **UNVERIFIED**, exit 1: `CONTROLLER_CREDENTIAL_UNAVAILABLE`, zero cases and zero HTTP/controller calls. Earlier failed live attempts remain unchanged; no fallback controller or retuned corpus was introduced. The frozen S26 corpus still contains 100 Ask + 100 Action cases, with zero full-target executions in this slice. Missing native JEV credentials and incomplete target composition prevent claiming live/end-to-end qualification.

Installed authenticated MG transport, actual writer freeze/restart ownership, complete target-runtime packaging and S28–S35 acceptance remain open. Native OS secrets, actual released-version/schema compatibility, normal-profile deployment/service management, Windows/macOS, full presentation and holdouts remain unqualified. Original external Platform backlog dated 2026-09-06 remains unresolved. Production routing, architecture/individual Sprint designs and version are preserved; S36 stays In Progress and S37 Planned.

## Executed checks

| Check | Result / scope |
| --- | --- |
| `pnpm build:s28`; release capture under Node 22.23.2 | PASS, actual final isolated UI artifact set; existing upstream Zod warnings |
| `pnpm test:unit` | PASS, 1,355/1,355 across 275 files; seven new presentation lifecycle/cursor checks |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| Node 22.23.2 `--test scripts/s36/{install,release,integration,presentation}/*.test.mjs` (expanded directories) | PASS, 31/31, including three new qualification-gate negatives |
| Node 22.23.2 `scripts/s36/presentation/chrome.mjs` with pinned release/Chrome/evidence env values | PASS for bounded automatic visible UI recovery; PARTIAL/DIFFERENT M00 samples |
| `node scripts/s36/presentation/qualify.mjs` | BLOCKED, exit 2; 3 compared / 26 required states; retained as gate.json |
| `S27_REPORT=docs/evidence/s36-prerequisites-2026-10-25/jev.json node scripts/s27/live-qualification.mjs` | UNVERIFIED, exit 1; no credential/calls |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS; 423 legacy extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS; development artifact, version unchanged |
| `pnpm check:s36:presentation`, `git diff --check` | PASS, cumulative inventory, bounded modules, import boundaries and preserved original production/design hashes |
