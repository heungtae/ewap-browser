# S10-R request cancellation evidence — 2026-10-01

Browser-local S10-R C1–C5 completed in Linux, Node v20.19.6,
Chrome for Testing `/tmp/chrome-linux64/chrome`, Xvfb and xfwm4.
Extension/package version remains 0.1.87. No commit or deployment performed.

## Implementation

The Page API uses the Act session's original RequestContext, captured before
reading the active snapshot, and keeps that context across probe, observation,
marker persistence, MAIN invocation and result verification. Context validity
checks include request ID, generation, owner, store object identity, abort and
terminal state. Document and page scope checks remain in place.

The dispatch hook checks the bound context before writing and after storage
completion. Session cleanup finishes only the original request ID/generation;
late work cannot finish a new request on the same tab. Legacy START_ACT runs
without a Chat request retain their DOM/CDP behavior. Chat-bound dispatch with
no valid request fails closed.

A marker already being saved when Stop occurs retains conservative UNKNOWN,
but the runner never invokes MAIN afterward. This deliberately preserves the
existing persistence/Worker-recovery contract. Probe/observation Stop retains
CANCELLED. Once the actual invocation starts, late completion stays UNKNOWN
and the approval is consumed without retry.

## Regression evidence

- Unit suite: 102 files / 431 tests passed, including 27 Page API runner tests
  using the production ChatRequestLifecycle.
- R-01/R-02/R-03: deferred probe, pending/satisfied observation and marker
  persistence; Stop then release yields zero mutation injections.
- R-04: each deferred stage starts a replacement Ask before release; the old
  terminal and new request snapshot remain unchanged.
- R-05: absent/terminal/foreign-tab ownership, generation changes and replaced
  store objects are denied without markers. Existing runner tests cover scope,
  document/frame and navigation binding failures.
- R-06: Stop after invocation yields UNKNOWN and one invocation, preserving
  the replacement request. Existing request-recovery unit tests and real Chrome
  worker-restart fixture check marker recovery and no replay.
- R-07: normal/already-satisfied, duplicate approvals, throw/timeout and scope
  regression tests pass with the real lifecycle attached.

The Chrome S10 fixture temporarily wraps scripting.executeScript in the isolated
worker to delay the actual production MAIN probe response. The real Side Panel
Stop cancels the old request; releasing the response yields zero additional page
calls and CANCELLED remains terminal. A second case starts a new Act on the same
tab before release: its WAITING_USER snapshot remains exactly unchanged and the
old request remains CANCELLED. Test hooks exist only in the external harness;
no product runtime message or model tool is added.

Chrome S10 also passes approval/permission, already-satisfied, absent API,
throw/timeout, post-dispatch Stop (UNKNOWN, one call), scope change and Worker
restart (UNKNOWN, no replay), plus the read-only adapter checks.

## Commands and results

All passed:

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:fixture
npm run test:e2e
npx tsc -p tsconfig.build.json
node scripts/build-extension.mjs
npm run validate:package
npm run check:module-boundaries
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/s10-r-xfwm4.log 2>&1 & npm run test:chrome-s10'
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/s10-r-discovery-xfwm4.log 2>&1 & npm run test:chrome-page-api-discovery'
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome node --experimental-websocket scripts/chrome-preview-e2e.mjs
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome npm run test:chrome-s7
```

The initial preview run caught a missing-request regression in legacy START_ACT;
the runtime adapter was corrected and preview passed on the rebuilt artifact.
The initial S10 run passed cancellation and replacement-state assertions but
failed fixture cleanup because WAITING_USER has no active Stop button; cleanup
now cancels through the existing panel request route, and the full run passed.

Actual sites, live providers and Platform integrations remain outside this
controlled fixture evidence. Existing S10 evidence retains its original scope.
