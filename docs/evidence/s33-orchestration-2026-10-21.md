# S33 orchestration foundation — 2026-10-21

Status: **In Progress**. Parent revision: `3035a5e4fbfadf03d1c26d2bc450ddfe3242f660`;
results include the uncommitted S33 changes in this workspace. This record does
not qualify product routing, Chrome, actual JEV, or release behavior.

## Implemented scope

- [Phase engine](../../packages/task-engine/src/orchestration/index.ts): reference
  phases, explicit role checks, immutable revision transitions, interruptions,
  bounded turns/no-progress, first failure and action/goal separation.
- Admission requires enabled, configured and qualified controller readiness for
  both modes. Readiness is an injected trusted port, not a live-gate discovery
  implementation. No GPT or legacy fallback is introduced.
- Plan selection uses the S27 controller, revalidates its selected frame and
  current context, binds original argument sources, checks available tools and
  emits a new scoped plan revision. Plans are proposals with no execution or
  approval authority. Ask mutation rejection uses the existing S27 validator.
- [SQLite journal adapter](../../apps/agent-server/src/tasks/orchestration-store.ts)
  stores state and events atomically with CAS and S31 owner/lease/Stop fencing.
  This is an isolated adapter; the server admission/router does not use it yet.
- Verified steps cannot repeat; ambiguous receipts prevent automatic dispatch
  and completion. Interrupted dispatch cannot blindly resume. Completion checks
  current goal predicates and required analysis at the trusted runtime boundary.
  Actual independent goal observation and analyst integration remain pending.
- History projection deduplicates replay, rejects terminal reopening and retains
  verified-action versus incomplete/unknown-goal presentation. Product prompts,
  progress components and history do not consume this adapter yet.

## Executed checks

Environment: Linux, Node 20.19.6 for TypeScript/Vitest/build; Node 22.23.2 for
real SQLite; pinned pnpm 9.15.4; TypeScript 5.7.3; Vitest 3.2.4; esbuild 0.28.2.
No provider requests, approvals, business dispatches, or browser actions were
made by these checks. Build outputs are isolated under `dist/s33`; version
`0.1.117` is preserved.

| Check                                                           | Result                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm test:unit`                                                | PASS, 241 files / 1,178 tests                                                    |
| `pnpm test:s33` equivalent Vitest selection                     | PASS, 5 files / 21 tests                                                         |
| `pnpm build:s33` equivalent Node script                         | PASS, isolated Node engine/store bundles                                         |
| Node 22 `--test scripts/s33/sqlite.test.mjs`                    | PASS, real two-connection SQLite CAS/rollback/Stop and forged-state rejection    |
| Fixture and source E2E Vitest selection                         | PASS, 2 files / 2 tests                                                          |
| TypeScript application/packages checks                          | PASS                                                                             |
| ESLint full source/test/apps/packages and changed-file Prettier | PASS                                                                             |
| `pnpm check:s33`                                                | PASS, 1,480 mapped files; 15 bounded modules; production/design hashes preserved |
| Module boundaries / `git diff --check`                          | PASS                                                                             |

The initial full unit attempt hit three S28 Unix socket/native `EPERM` failures
inside the sandbox. The final authorized execution outside that restriction
passed the complete suite. Inventory's `spawnSync git EPERM` was likewise
rerun successfully with authorized subprocess access. These environment failures
were not treated as product regressions. SQLite commit independently recomputes
the transition from persisted state before accepting the supplied journal state.

## First failures and corrections

- Initial no-progress test advanced beyond its expected rejection; corrected
  the assertion to require `NO_PROGRESS` and retain the original failure.
- Initial Ask test rebuilt a strict frame with an extra digest; replaced this
  invalid test setup with a direct mutation-label regression of the validator.
- Test splitting initially omitted an admission import; corrected before final
  typecheck and regression.
- Initial isolated engine build used a browser target but S27 hashing depends
  on `node:crypto`. Corrected the build to Node, consistent with backend engine
  ownership. SQLite could not run until this build artifact existed; rerun passed.

## Acceptance and remaining work

| Card / scenario | Current scope                                      | Remaining acceptance                                                                                                         |
| --------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1 / R01        | Phase reducer, journal port and SQLite CAS         | End-to-end backend advance routing; complete persisted decision/budget records                                               |
| C2 / R02        | Readiness admission API and existing Ask validator | Actual mode controls/server admission and qualification-source wiring                                                        |
| C3 / R03        | S27 selected, source-bound, scoped plan proposals  | Shared-runtime plan cursor/step execution, workflow imports, live tab/origin ownership and approval invalidation integration |
| C4 / R04        | Replay/uncertainty/terminal/bounded-loop checks    | Product observation/reconciliation and independent requested-goal predicates                                                 |
| C5 / R05        | Replay-safe history projection                     | Existing Stop/approval/value/selection UI, full controlled Chrome task loop and window ownership regressions                 |
| C5 / R06        | Not executed                                       | Real JEV held-out semantic selection, continuation and final UI qualification                                                |

S27's recorded live semantic gate failed and S28–S32 prerequisite/product gates
remain open. No autonomous target admission or production cutover is enabled.
S33 cannot be marked complete, and S34 is still Planned. Original architecture
and Sprint specifications are preserved. No credentials or page payloads are
stored in this evidence. No product build/version bump, deployment, commit or push is
part of this change.
