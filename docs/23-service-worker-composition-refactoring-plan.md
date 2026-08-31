# 23. Service Worker Composition Refactoring Plan

## Objective

Service Worker의 진입점 크기 문제를 파일명 이동으로 숨기지 않는다.
`entry.ts`는 bootstrap 호출만 수행하고, bootstrap과 모든 새 Service Worker
소스는 199 물리 라인 이하로 유지한다. 기존 1,250라인 `application.ts`는
분해 뒤 제거한다.

이 작업은 기능 변경이 아니다. runtime message kind/payload/response,
exact-key 검증, sender authorization, async listener keep-alive, storage key,
Ask/Act 권한과 문서 경계, Chat recovery 계약을 보존한다.

## Current Baseline

| Item              | Current state                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `entry.ts`        | `startServiceWorker()` 한 번만 호출                                                                 |
| `application.ts`  | 제거됨; platform/state/lifecycle/chat/handler registration 모듈로 분해됨                            |
| Extracted domains | Ask/Act runner, page context, storage, workflow codec, postcondition verification, runtime assembly |
| Passed checks     | TypeScript, ESLint, unit/fixture/source E2E, module-boundary                                        |
| Open gate         | 전역 `check:source-size`는 기존 Content/UI/test 대형 파일 때문에 실패; 변경 Service Worker는 통과   |

Repository 전체 size gate의 기존 대형 Content/UI/test 파일은 이 Service Worker
slice의 완료와 별도로 기록한다. 단, 이 slice는 새로 만들거나 수정하는 Service
Worker 파일을 199라인 이하로 유지해야 한다.

## Target Structure

```text
entry.ts
  -> startServiceWorker()                         # bootstrap call only
       -> createServiceWorkerRuntime()            # state and platform adapters
       -> registerServiceWorkerLifecycle()        # tab and panel lifecycle
       -> createDomainMessageRouter()             # ordered domain handlers
       -> createRuntimeMessageRouter()            # readiness + common envelope

domain handlers
  -> Ask / Act / workflow / settings / profile / fixture
```

No domain module may import `entry.ts`. Factories receive explicit dependencies;
they must not depend on ambient mutable state in another module.

## Sequenced Work

### 1. Preserve the behavioral baseline

- Record current runtime-message route order and each handler's `handled` /
  `keepAlive` result.
- Add or extend characterization tests for Chat send/recover/clear, storage
  readiness rejection, panel sender validation, permission review, and workflow
  selection.
- Do not move code until this baseline passes.

**Checkpoint:** `git diff --check`, typecheck, lint, relevant Vitest tests.

### 2. Extract the shared runtime

- Introduce `createServiceWorkerRuntime()` for registered documents, page scope,
  permissions, coordinator, chat state, workflow selection, fixture binding,
  vision captures, and mutable preferences.
- Expose narrow operations rather than exporting mutable maps directly where a
  domain module does not need ownership.
- Move the bounded CDP marker/store and adapter wiring into a separate factory.

**Checkpoint:** baseline tests plus a runtime-factory test; no import cycle.

### 3. Extract Chrome lifecycle infrastructure

- Move Side Panel port connect/disconnect and active-tab notification logic to
  `panel-port-lifecycle.ts`.
- Move tab update/removal/activation cancellation and page-scope cleanup to
  `tab-lifecycle.ts`.
- Keep only explicit lifecycle registration calls in bootstrap.

**Checkpoint:** typecheck, lint, lifecycle and Chat recovery tests, source-size
check for modified Service Worker files.

### 4. Extract domain assembly and fixture Act

- Group existing handler factories into settings/provider/profile/run control,
  Act review/mutation, and workflow factories.
- Extract the development-only `START_ACT` flow and local session binding from
  the domain router into `fixture-act-runtime.ts`.
- Preserve capability selection, permission request expiry, terminal events,
  and local binding cleanup exactly.

**Checkpoint:** handler authorization tests, mutation/confirmation tests,
workflow tests, typecheck, lint, source-size check.

### 5. Extract ordered domain routing

- Implement `createDomainMessageRouter()` with the current route order.
- Create every handler once during assembly; in particular, do not recreate the
  `START_ACT` handler for every message.
- Retain `runtime-message-router.ts` as the common storage-readiness, object
  shape, Chat routing, and async `true` keep-alive boundary.

**Checkpoint:** route-order/keep-alive characterization tests and module
boundary check.

### 6. Finish the bootstrap and remove `application.ts`

- Add `bootstrap.ts` exporting `startServiceWorker()`.
- Change `entry.ts` to call it.
- Delete `application.ts` only after all imports, listener registration, and
  tests use the new composition path.

**Checkpoint:** modified Service Worker files are each at most 199 lines;
`application.ts` no longer exists; no import cycle.

### 7. Final verification and evidence

Run, in this order:

```text
git diff --check
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint extension/src extension/tests --max-warnings=0
./node_modules/.bin/vitest run extension/tests/unit
./node_modules/.bin/vitest run extension/tests/fixture
./node_modules/.bin/vitest run extension/tests/e2e
node scripts/check-module-boundaries.mjs
node scripts/check-source-size.mjs
node scripts/validate-package.mjs
```

The normal `build` script increments the extension patch version. Do not run it
as a progress probe. Run it only when a version bump is intended, then verify
the generated `dist-extension` artifact and record any browser/manual checks
separately.

## Progress Record

| Step                                     | Status      | Latest evidence                                                                                                                                              |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Behavioral baseline                   | Complete    | `tsc`, ESLint, unit/fixture/source E2E all passed before and after moves (142 tests in final suite).                                                         |
| 2. Shared runtime                        | Complete    | `runtime-platform.ts` (33), `runtime-state.ts` (81), `runtime-chat.ts` (165), and `runtime-storage.ts` (38) own composition state and operations.            |
| 3. Chrome lifecycle                      | Complete    | `runtime-lifecycle.ts` (61) composes panel ports, tab lifecycle, provider runtime, and bounded CDP; existing lifecycle modules remain independently bounded. |
| 4. Domain assembly and fixture Act       | Complete    | `runtime-act-handlers.ts` (67), proposal completion/follow-up/readiness modules (62/103/130), and existing fixture modules preserve Act assembly.            |
| 5. Domain routing                        | Complete    | `runtime-core-handlers.ts` (74), `runtime-workflow-handlers.ts` (157), and `runtime-registration.ts` (67) preserve one-time ordered handler assembly.        |
| 6. Bootstrap and remove `application.ts` | Complete    | `entry.ts` calls `startServiceWorker()` in `bootstrap.ts` (5); `application.ts` is deleted; every Service Worker source is at most 199 lines.                |
| 7. Final verification                    | Complete    | `git diff --check`, TypeScript, ESLint, Prettier, 142 Vitest tests, module-boundary, and package policy validation passed. Global source-size check reports only pre-existing out-of-slice Content/UI/test files; every Service Worker source is at most 191 lines. |

## Continuous Check Rule

After every completed extraction, update this table with the files moved and
the exact commands/results. Do not begin the next step when typecheck, lint,
the relevant tests, or the modified-file 199-line check fail. A repository-wide
size-gate failure caused only by pre-existing, out-of-slice files must be named
explicitly; it is not silently treated as a pass.
