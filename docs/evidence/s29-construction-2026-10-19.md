# S29 semantic Codebase construction — 2026-10-19

**In Progress. Structural implementation and controlled verification delivered;
S28 prerequisite acceptance is still incomplete. S29 is not marked complete.**

## Revision, environment and authority

Base revision: `5ee4c7062`, dirty working tree. Node `20.19.6`, pnpm `9.15.4`,
TypeScript `5.7.3`, Vitest `3.2.4`, Zod `4.6.7`, fake-indexeddb `6.2.4`.
Controlled browser: `Chrome/147.0.7727.15` on Linux.

Original architecture and Sprint design files remain unchanged, as do existing
production extension sources, manifest/version `0.1.117` and selected entrypoint.
The graph uses the separate `contextpilot-codebase-v1-<profile-guard>` database.
No legacy learned records or user storage were migrated/deleted. No provider/MCP
tools were advertised; S30 owns registry integration. No JEV annotations or GPT
schema generation occur: S27's failed live qualification is retained.

Approvals minted: **0**. Browser mutation dispatches: **0**. Model calls: **0**.
DOM edits below are synthetic test-fixture setup, not dispatched agent actions.

## Implementation and checks

- **C1 / R01:** `codebase-schema` owns closed observation, graph, evidence,
  coverage, dataset, query and advisory contracts. Six JSON Schema goldens and a
  deterministic observation-to-graph golden are checked. Validation checks
  digests, counts, partition/parent/edge/evidence references, predicate/status and
  immutable evidence IDs. Persistent action candidates have no live refs/grants,
  carry unknown business effects and explicitly remain non-executable.
- **C2 / R02:** interruptible traversal checks cancellation/document identity and
  the 10-second unit deadline. It examines at most 5,000 nodes and prioritizes at
  most 1,000 semantic results under the stricter 256-KiB batch cap. Open shadow
  trees share counters; absent frame adapters yield explicit coverage gaps.
  Sensitive subtrees and input values are excluded before emission. Samples cap
  at five rows, twenty cells per row and 200 characters per cell. Byte trimming
  uses bounded binary search rather than repeated full-prefix serialization.
- **C3 / R03:** deterministic native/ARIA component priority, nested ownership,
  external form ownership, caption/label names, singleton controls, observed
  constraints/options and separate structural/state fingerprints. Unknown field
  types/units/requiredness and button business effects remain unknown. Semantics
  cannot override observed kind; annotation entry explicitly refuses operation
  until JEV qualification exists.
- **C4 / R04:** profile/origin/account partitions, exact hashed route/query
  context, unique attribute/structural reconciliation and new identities for
  ambiguous repeated names. Partial discovery cannot prove removals. Full
  discovery produces tombstones; dependent records become stale. Mutation
  coalescing uses 250 ms/one-second flush bounds, 128 roots/20% escalation and
  at most two full rediscoveries before `PAGE_UNSTABLE`. Inactive observers only
  mark stale; they do not capture page bodies.
- **C5 / R05:** eleven IndexedDB stores with scope/kind/name/parent/status/source/
  time indexes. CAS, immutable versions, idempotency and graph changes share a
  write transaction. Dataset chunks are immutable and digest checked, require
  current graph/evidence provenance and expire within 24 hours. Pinning is
  deadline bounded. Cache accounting reserves serialized records, indexes and
  metadata, including an 8-MiB headroom inside the 100-MiB ceiling. Eviction uses
  whole unpinned pages/old unpinned snapshots and retains idempotency journals;
  pinned/active exhaustion aborts without losing committed facts.
- **C6 / R06:** a DOM-only collector port is separated from repository-side
  discovery/read composition. Bound read services reject stale projections;
  discovery checks permission/context/cancellation/deadline before committing.
  Bounded search/inspection and immutable query helpers are fixture callable.
  Implemented query operators are projection, typed equality filters, count,
  sum/min/max/average; numerical results report IEEE-754 compensated summation,
  null exclusion, unit and lineage. Unsupported operators are rejected rather
  than advertised. Advisory imports retain source revision/time/history while
  refusing authority-bearing fields and preserving source records.
- **C7:** unit/golden/fake IndexedDB tests and actual Chrome first-visit/revisit/
  delta, real transaction races and injected storage-failure cases were executed.

[Source entrypoints](../source-guide.md) and
[successor inventory](../baselines/s29/README.md) identify executable ownership.

## Executed commands

- `pnpm typecheck`, `pnpm lint`.
- `pnpm test:s29`: 18 checks at final local review.
- `pnpm exec vitest run extension/tests/unit --reporter=json --outputFile=/tmp/s29-unit-final.json`:
  1,101/1,101 PASS across 219 test files, including 18 S29 checks.
- `pnpm build:s29`: separate browser/Node public package artifacts, no version bump.
- `pnpm check:s29`: new-module size/import boundaries, preserved production/design
  hashes, successor file ownership and schema/build goldens.
- `pnpm check:s27`, `pnpm check:s28`, `pnpm check:module-boundaries`:
  inherited regressions plus current successor inventory.
- `pnpm install --frozen-lockfile`; fixture/E2E suites; version-preserving original
  extension TypeScript/bundle/package validation.
- `CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome pnpm test:chrome-s29`:
  [machine result](s29-chrome-2026-10-19/report.json).

The final machine verification file records the actual command results and source
hashes; historical or fixture results do not qualify external sites/providers.

## Chrome observations and first failures

Observed cases include nested tables without flattened child rows, unchanged
revisit IDs, changed/removal invalidation, explicit form ownership, captions,
open shadow trees, denied frames, cancellation, deadline, private regions,
sensitive input exclusion, 128 components and 256 actions. The 6,000-node fixture
stops at 5,000 examined. The 1,100-control fixture hits the 1,000-result selection
limit and then the byte limit: the current report records 583 retained and 517
omitted records, `partial`, never complete. Wide samples hit all selected sample
caps and report truncation. Counts/timings are in the dated JSON report.

Two real browser database connections race: exactly one commits revision 4.
A deliberately injected `QuotaExceededError` aborts another transaction and
preserves revision 3. This is an injected failure test, not exhaustion of the
browser's actual disk quota. Storage estimate after the small graph fixture was
2,349,627 bytes; cache headroom includes initial index/database overhead. This is
not a qualification of every physical backend's exact 100-MiB behavior.

First failures retained in [failure log](s29-first-failures-2026-10-19.json): the
initial Chrome test incorrectly expected all 1,000 nodes despite the earlier
byte cap; the assertion was corrected to honor both fixed design limits. An open
shadow test exposed a missing traversal branch, which was implemented without
weakening the test. Initial CommonJS/ESM test imports, callback shadowing, stage
counter wiring and lint errors were corrected before final checks.

## Completion limits and handoff

S28 remains In Progress; its prerequisite gate prevents S29 completion regardless
of these structural results. Production task admission, Worker/content/native
transport composition, S30 tool advertising and S33 controller activation are not
established by direct fixture port calls. Chrome IndexedDB tests use an isolated
fixture origin to exercise the real engine; they are not a claim of completed
extension-origin/process integration. No Windows/macOS, public-site, MCP-client,
live-provider, release/store or long-term migration qualification is claimed.

Unavailable frame adapters remain explicit gaps, not complete traversal claims.
Sort/range/group query operators, full Level 2/advanced collectors and annotation
qualification are unavailable here. Task-wide durable budgets/leases remain
owned by the later task runtime; operation-level caps cannot be presented as that
runtime's completed accounting. Existing source-size/diagnostics ZIP baseline
failures remain outside this change. Close the S28/runtime integration gates
before selecting these target paths in production.

IndexedDB transaction/abort behavior was checked against the
[W3C IndexedDB specification](https://www.w3.org/TR/IndexedDB/); fake tests follow
the [fake-indexeddb project API](https://github.com/dumbmatter/fakeIndexedDB).
