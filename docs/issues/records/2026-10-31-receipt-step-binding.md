# ISS-20261031-005: Durable receipt settlement omitted step binding

Status: **검증 중**. Discovered 2026-10-31 while reviewing S31 recovery, source base `b40eb14c7`. A valid receipt with the correct task, dispatch ID and prepared digest but a different step ID could be stored against a durable dispatch intent. The case was reproduced with a controlled SQLite fixture; no live dispatch or user data was involved.

Settlement now also compares the receipt step ID with the recorded intent before storing it. Rejection leaves the intent unsettled, so the normal bound receipt can still be accepted later. The change does not infer completion or permit redispatch.

`scripts/s31/sqlite.test.mjs` checks rejection, unchanged null receipt, successful later settlement, idempotent repetition and conflicting receipt rejection. Actual browser receipt transport and installed runtime qualification remain open. Related: [ISS-20261031-004](2026-10-31-uncertain-receipt-retention.md).

On 2026-10-31 Linux, the Node 22.23.2 real SQLite suite passed 10/10, including composed ToolRuntime/IDB receipt synchronization; `pnpm test:s31` passed 5/5, and S28/S31 boundary checks, typecheck and ESLint passed. These are controlled tests and do not establish installed Chrome or live-site behavior.
