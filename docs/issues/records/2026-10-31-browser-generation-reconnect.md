# ISS-20261031-003: Browser generation reused after disconnect

Status: **검증 중**. Discovered 2026-10-31 in the isolated S28 backend session. Disconnect cleared the only recorded browser generation, allowing an equal or older generation to be reported as connected within the same authenticated session. This was found by source review and reproduced with a controlled session; no live user action was involved.

The session now retains a generation high-water mark while independently clearing browser availability. A subsequent connection must have a larger generation. This check is scoped to one backend session and does not establish persistence across process restart or authorize reuse of browser handles.

`extension/tests/unit/migration/s28/health.test.ts` covers disconnect, rejection of equal and older generations, continued unavailability, and acceptance of a newer generation. Real browser reconnection and process restart semantics remain unverified; do not mark this issue resolved from the controlled test alone.

On 2026-10-31 Linux/Node 20.19.6, `pnpm test:s28` passed 43 tests, the isolated build, `pnpm check:s28`, typecheck and ESLint passed. The initial boundary check rejected an oversized test module; moving the new test to an existing bounded module fixed the check. No provider call, approval or browser action was made.

An additional authenticated Unix-socket fixture verifies disconnect followed by a newer generation and observes browser availability again. This tests the real socket and session implementation with synthetic browser messages, not an actual Worker restart; process-wide generation recovery remains open.

The subsequent `ipc-generation.test.ts` exercises the negative path over a real authenticated Unix socket: after disconnect, reusing the previous generation closes the connection. `pnpm test:s28` passed 44 tests and `pnpm check:s28` passed. These use synthetic browser messages; cross-process and installed browser recovery remain unverified.
