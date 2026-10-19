# S27 preservation and controller qualification

[Implementation/evidence](../../evidence/s27-controller-protocol-2026-10-19.md)
records C1–C4 implementation and a failed C5/R06 live feasibility gate. S27 remains
In Progress. The design and S26 historical baseline are unchanged.

- `entry.json` pins the entry revision, environment and original design/product hashes.
- `disposition.json` inherits S26's exact per-file RF owners and explicitly enumerates
  the new S27 files. It does not silently assign future files or overwrite S26.
- `holdout.json` is immutable `s27-holdout-v1`; expected labels are kept outside native
  requests, and all first attempts are retained separately in dated evidence.
- `verification.json` records executed local checks and the failing live gate.

Run `pnpm typecheck`, `pnpm test:s27`, `pnpm check:s27` and `pnpm lint`.
`pnpm check:s27:qualification` must fail on the recorded FEASIBILITY_FAILED report.
A live retest requires environment credentials and `pnpm test:s27:live`; it must
retain first failures and never reset counters within an admitted task. Changes to
request templates, schemas, fixture graph evidence or arguments require a fresh
source-bound qualification, not reuse of old HTTP success.
