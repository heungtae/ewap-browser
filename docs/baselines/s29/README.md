# S29 construction verification

`disposition.json` extends S28's exact per-file RF ownership without rewriting its
historical entries. `verification.json` records current source hashes and measured
checks. Original designs and existing production extension hashes are protected
by the inherited S27 entry baseline.

Run `pnpm build:s29`, `pnpm check:s29`, `pnpm test:s29` and
`CHROME_FOR_TESTING_BIN=... pnpm test:chrome-s29`.

The [dated evidence](../../evidence/s29-construction-2026-10-19.md) separates
structural checks from the incomplete S28 prerequisite and target-runtime gates.
