# S34 evidence analysis foundation — 2026-10-21

Status: **In Progress**. Parent revision:
`11fd6f464bf6f77344c23091826766893c3ab1b4`. Checks include the uncommitted S34
workspace changes. Original architecture/Sprint specifications, production
extension routing, registry activation and version `0.1.117` are preserved.

## Implemented scope

- [Analysis engine](../../packages/analysis-engine/src/index.ts) resolves only
  selected fields of approved immutable datasets. It verifies original digests,
  partition/page/graph identity, TTL and exact disclosure authorization through
  an injected trusted port. It sanitizes common credential/email/URL patterns,
  excludes forbidden locator/approval/secret field names, and preserves original
  dataset and projection digests, row IDs, evidence IDs and coverage limitations.
  This is bounded projection, not whole-cache export. Pattern masking does not
  replace disclosure consent or claim universal sensitive-content detection.
- Deterministic aggregates reuse the S29 query implementation. Findings resolve
  against actual projected cells/aggregates and original evidence. Dangling
  citations, contradictory totals and unsupported prose are rejected. The
  initial supported domain is cell/count/sum/min/max/average; summary must match
  a deterministic rendering and unreviewed recommendations are rejected. General
  narrative/domain support remains pending; reference syntax alone is insufficient.
- [Responses adapter](../../packages/provider-adapters/src/responses/index.ts)
  pins endpoint/model/config revision, uses schema-constrained output and
  `store:false`, offers no browser tools, and rejects tool output, refusal,
  incomplete/foreign-model/oversized results and malformed/truncated/conflicting
  SSE. Input/stream/UTF-8 output, cancellation and timeout are bounded. It buffers
  structured output until completion; partial model text is never published.
- [Budget accounting](../../apps/agent-server/src/tasks/analysis-budget.ts)
  persists task-scoped reservations, usage and first failure in SQLite. Two
  calls reserve 24k input/4k output each (48k/8k per task); failures retain their
  reservation. Reported usage is recorded without freeing reservations for more
  calls. Input data is capped at 64 KiB and output text at 8 KiB. A conservative
  UTF-8 wire-size plus framing check may reject a request before 64 KiB if its
  token reservation cannot cover it; data is never silently truncated. Schema
  overhead is bounded separately by that check. The memory budget is for fixtures.
- [Role migration](../../apps/agent-server/src/settings/role-migration.ts)
  maps selected compatible Responses GPT and JEV records to disabled candidates.
  Invalid/disabled/incompatible records remain in a local-only repair archive;
  candidate/public fields contain no secrets. Former primary fallback becomes
  stop. [Secret writes](../../apps/agent-server/src/settings/analyst-secrets.ts)
  preserve blank-write semantics only within exact provider/endpoint/role/auth/
  credential identity. No automatic credential copying or readiness is created.
- [S33 delegation](../../apps/agent-server/src/analysis/delegate.ts) checks exact
  task revision and analysis phase. Supported data proceeds to pending controller
  acceptance; additional-data requirements return to JEV planning as proposals.
  Failed journal CAS prevents publication. This helper does not execute browser
  commands, collect data, grant consent or complete the task.

API shape follows [OpenAI structured output documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
The public provider endpoint's compatibility is not established by local fixtures.

## Executed verification

Environment: Linux, Node 20.19.6, pnpm 9.15.4, TypeScript 5.7.3, Vitest 3.2.4,
esbuild 0.28.2. Real SQLite checks use Node 22.23.2. Offline workspace installation
reused cached locked dependencies; no new external package versions were added.

| Executed command                                                                         | Result                                                                                                            |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm install --offline --frozen-lockfile --ignore-scripts`                              | PASS, cached locked workspace install                                                                             |
| `pnpm typecheck`                                                                         | PASS, application and package TypeScript                                                                          |
| `pnpm lint`                                                                              | PASS, full ESLint and configured Prettier checks                                                                  |
| `pnpm test:s34`                                                                          | PASS, 9 files / 60 tests                                                                                          |
| `pnpm test:unit`                                                                         | PASS, 250 files / 1,238 tests, including existing provider/diagnostic regressions                                 |
| `pnpm exec vitest run extension/tests/fixture extension/tests/e2e`                       | PASS, 2 files / 2 tests                                                                                           |
| `pnpm build:s34`                                                                         | PASS, isolated Node engine/Responses/fixture bundles                                                              |
| `/home/heungtae/.nvm/versions/node/v22.23.2/bin/node --test scripts/s34/sqlite.test.mjs` | PASS, real two-connection budget/first-failure/rollback/Stop and usage checks                                     |
| `pnpm check:s34`                                                                         | PASS, 1,515 mapped files / 26 bounded source modules; historical ownership and production/design hashes preserved |
| `pnpm check:module-boundaries`                                                           | PASS, existing boundary checker, 423 extension modules                                                            |
| `git diff --check`                                                                       | PASS                                                                                                              |

Controlled transport tests verify task/consent changes during credential lookup
cause zero fetches. Resolver tests reject expiry during authorization. Analyst
ports receive a clone and cannot rewrite trusted evidence. Partial output is
not accepted; response text is checked in UTF-8 bytes, and transport exceptions
become stable safe codes. These are fixture checks, not product or live-provider
qualification.

## Actual provider attempts and first failures

- [OpenRouter report](../baselines/s34/live-openrouter.json): pinned
  `openai/gpt-4.1-mini`, one synthetic sum request, HTTP **402**,
  `ANALYSIS_HTTP_402`. No grounded output or semantic PASS was obtained. The
  second case was not dispatched. The attempt preceded final resource-accounting
  hardening; final-source live qualification remains unverified.
- [OpenAI fallback report](../baselines/s34/live-openai.json): configured test
  target `gpt-6-luna`, credential unavailable; **zero** requests. This does not
  establish model access or execution. No credential values were printed or saved.
- Initial lint found a redundant regex escape; corrected. Initial transport
  assertion expected bare output after accounting added a typed result/usage
  envelope; corrected the fixture expectation and reran. Draft resource limits
  were tightened to the original 64 KiB/8 KiB and 48k/8k construction defaults
  before final verification. Original designs were not changed.

There were zero business/browser dispatches, real user approvals, browser tool
schemas or production task admissions in S34 checks. Provider HTTP failure is
retained separately from controlled fixture success.

## Acceptance and remaining work

| Card / scenario | Implemented and checked                                                                                               | Still pending                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C1 / R01        | v1/v2 candidate conversion, repair archive and exact-boundary secret writes                                           | Actual existing Settings form/service migration, persistent secret-store integration and installation acceptance             |
| C2 / R02        | Dataset projection/digest/partition/TTL checks, selected deterministic aggregates, pre/post-send consent revalidation | Product repository/disclosure wiring and separately approved arbitrary query-reference service                               |
| C3 / R03        | Responses JSON/SSE failure handling, config pinning, bounded output/abort, persistent reservations and reported usage | Durable analysis-attempt/result journal integration and full product diagnostics correlation                                 |
| C4 / R04        | Actual value/aggregate evidence validation, explicit limitations and typed additional-data proposals                  | General-domain narrative/recommendation support and real JEV additional-data/acceptance loop                                 |
| C5 / R05        | Controlled S33 delegation, no automatic final publication, no implicit calls for inactive/non-analysis phases         | Existing execution-detail progress, one accepted UI message, reconnect and full Chrome/reference-search qualification        |
| C5 / R06        | Failed live attempt and missing fallback credential retained                                                          | Required held-out live Responses semantic qualification; actual search zero-call and zero-browser-authority runtime evidence |

S33 prerequisite/product acceptance remains open, including S27's failed live JEV
gate. `analysis.run` is not activated in the production registry. S34 cannot be
marked complete; S35 remains Planned. No Chrome, installed OS, release, deployment,
commit or push claim is made. S34 bundles are isolated under `dist/s34`.
