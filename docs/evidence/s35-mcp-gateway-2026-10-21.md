# S35 local MCP gateway foundation — 2026-10-21

Status: **In Progress**. Parent revision:
`3ec11d80f` plus uncommitted S35 changes. Original architecture/Sprint documents,
production extension routing, version `0.1.117` and original Platform backlog are
preserved. This is an isolated composition, not installed product activation.

## Source and authority boundaries

- [Gateway](../../apps/mcp-server/src/entry.ts) uses pinned MCP TypeScript SDK
  `1.32.1` stdio, bounded input/output and request/result correlation. It does not
  open a network listener or connect directly to Chrome/content. A caller must
  explicitly supply `CONTEXTPILOT_MCP_PAIRING` pointing to an owned private file
  in an owned private directory; symlinks and public files are rejected.
- [Local IPC](../../apps/agent-server/src/mcp/listen.ts) is a separate named
  `wca.mcp-ipc/v1` adapter, preserving the original extension-native protocol.
  A private Unix socket uses a fresh one-shot nonce/HMAC, bounded frames/queues,
  monotonic request IDs, paired client grants and fresh grant checks. Windows
  ACL qualification is unavailable and fails closed. No global client settings
  or pairing installation are changed by the implementation/test runner.
- [Task API](../../apps/agent-server/src/mcp/task-api.ts) validates paired
  profile, exact HTTPS origin, tab and mode. JEV-owned admission requires injected
  controller/runtime readiness; external control requires explicit negotiation.
  SQLite retains scoped opaque handles, idempotent admissions and an outbox.
  Disconnect neither destroys tasks nor creates approval. Status/cancel cannot
  enumerate or address another client's tasks. Admission is bounded to 32 active
  tasks per owner; each task has at most 64 external call records.
- [External tools](../../apps/agent-server/src/mcp/external-tools.ts) expose only
  registered negotiated canonical schemas, then invoke the existing S30
  `ToolRuntime.prepare/requestApproval/execute` pipeline. Client arguments cannot
  supply approvals. Only the trusted UI/policy port can provide an approval ID.
  Scope/lease/epoch and exact origin are rechecked, including before side effects.
  Call IDs bind canonical input digests. Duplicate settled calls return the same
  receipt; unfinished/reconstructed/ambiguous calls cannot be dispatched again.
  New call IDs cannot bypass an unresolved task step. Stop revokes live pending
  runtime prompts; action verification remains separate from goal acceptance.
- Registry qualification is unchanged. `task.complete` and `analysis.run` remain
  unavailable rather than exposing unqualified completion/analyst authority.
  Read results currently return the shared receipt boundary; full referenced
  dataset/result disclosure and complete external plan advancement remain pending.

The stdio implementation follows the [official SDK server documentation](https://ts.sdk.modelcontextprotocol.io/server).
CLI discovery does not by itself establish real semantic interoperability.

## Retained integration consumers

The [versioned adapter inventory](../../packages/integration-adapters/src/compatibility.ts)
requires exact named versions and explicitly rejects unavailable/incompatible
ports. [Imports](../../apps/agent-server/src/integrations/imports.ts) and
[legacy consumers](../../apps/agent-server/src/integrations/legacy-consumers.ts)
reuse the original source verifiers rather than redefining their envelopes.

| Consumer              | Retained checks / current boundary                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Signed Profile        | Original ES256 JWS, claims/nonce/page/fingerprint/TTL and replay high-water checks; original compact proof retained; imported result is advisory                               |
| Workflow              | Original schema/version, supported step names, branches and target validator; no separate executor or silent unsupported-step removal                                          |
| Outbound Business MCP | Explicitly proprietary `browser-business-mcp-legacy/v1`, original binding/arguments/page-proof and closed result validation; not presented as standards-compatible inbound MCP |
| Enterprise PDP        | Original request/response rules; deny/outage/unsupported managed-auto remain failures; no new approval tokens                                                                  |
| Audit                 | Original closed audit serializer; unexpected raw fields reject                                                                                                                 |
| Studio                | Original validation-level preview; output grants no execution authority                                                                                                        |

Existing production consumers are not switched to these wrappers. Actual outbound
services, recording UI, governance and Platform versions remain unqualified.
The original **2026-09-06 C01–C09** cross-repository backlog remains in
[Platform alignment](../platform-alignment.md#8-contract-gaps); none is relabeled
as resolved by local adapter checks.

## Executed verification

Environment: Linux; Node 20.19.6 for pnpm/TypeScript/Vitest and isolated builds;
Node 22.23.2 for actual SQLite, Unix IPC and SDK subprocess tests; pnpm 9.15.4;
TypeScript 5.7.3; Vitest 3.2.4; esbuild 0.28.2; MCP SDK 1.32.1.
SDK dependencies were installed and locked; no extension build/version bump ran.

| Executed check                                                                      | Result                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --offline --frozen-lockfile --ignore-scripts`                         | PASS, 17 locked workspace projects                                                                                 |
| `pnpm typecheck`                                                                    | PASS, strict application and package TypeScript                                                                    |
| `pnpm lint`                                                                         | PASS, full ESLint and configured Prettier checks                                                                   |
| `pnpm exec vitest run extension/tests/unit/migration/s35`                           | PASS, 5 files / 15 tests                                                                                           |
| `pnpm test:unit`                                                                    | PASS, 255 files / 1,253 tests, including original Profile/Business MCP/enterprise/audit/Studio regressions         |
| `pnpm exec vitest run extension/tests/fixture extension/tests/e2e`                  | PASS, 2 files / 2 tests                                                                                            |
| `pnpm build:s35`                                                                    | PASS, isolated gateway and backend/SDK fixture bundles                                                             |
| `/home/heungtae/.nvm/versions/node/v22.23.2/bin/node --test scripts/s35/*.test.mjs` | PASS, 10 native SQLite/Unix/SDK-stdio tests                                                                        |
| `pnpm check:s35`                                                                    | PASS, 1,553 mapped files / 33 bounded modules; preserved production/design hashes and gateway authority boundaries |
| `pnpm check:module-boundaries`                                                      | PASS, 423 extension modules                                                                                        |
| `git diff --check`                                                                  | PASS                                                                                                               |

Native checks cover scope/foreign-client denial, durable reconnect/idempotent
admission/cancel, pending approval across SDK subprocess reconnect, exactly one
settled receipt, changed-input conflict without receipt overwrite, revoked scope,
Stop, Ask mutation denial, stale prepared binding, unsupported completion/analysis,
reconstructed pending-state uncertainty, uncertain dispatch retry prevention and
oversized stdio shutdown before task admission. S35 runtime tests require Node 22;
the normal workspace Node 20 does not supply the native SQLite module.

The native fixture suite exercises actual SQLite, private Unix IPC and SDK stdio
subprocesses. Its browser adapter is controlled S30 `LiveBindings` plus fake
IndexedDB, not real Chrome. Trusted fixture UI proofs are not real user consent.
Positive approval tests assert one dispatch and one stable receipt; negative tests
assert zero dispatch, and the ambiguous case preserves one uncertain command.
No real website or outbound business mutation is claimed.

## Installed Codex / Claude attempts

[Retained report](../baselines/s35/real-clients.json): Codex CLI **0.163.0** and
Claude Code **2.1.97** each authenticated to the gateway and queried the negotiated
catalog once. Neither invoked a semantic tool: **zero task tool calls**, zero
approvals and zero dispatches. Runner classification was
`CLIENT_AUTH_OR_PROVIDER_UNAVAILABLE`; Codex exited 0 and Claude exited 1.
Exit status or successful discovery is not counted as a semantic PASS.

The CLI attempts used temporary per-invocation MCP settings against a controlled
backend with synthetic readiness. They do not establish actual JEV, product UI,
low-level browser behavior or complete R05/R06 qualification. Only output hashes
and safe classifications were retained; no credential or raw account trace was
printed/stored. The final source received further local uncertainty/compatibility
hardening after these attempts; final-source real semantic qualification is pending.

## First failures and corrections

- Unix server close already removed the socket. An extra unlink raised ENOENT
  and masked test assertions; cleanup now tolerates only that absent-path case.
- Scope validation initially applied a closed Scope schema to an extended
  admission object. Explicit scope projection fixed valid admission without
  relaxing the closed caller request contract.
- An import test used `click` instead of the original `click_by_ref` workflow
  tool. The test fixture was corrected; original workflow validation was preserved.
- The installed client failures above are retained and have not been converted
  into fixture success or hidden retries.

## Acceptance and remaining work

| Card / scenario | Implemented and locally checked                                                                           | Remaining acceptance                                                                                                    |
| --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C1 / R01        | SDK stdio, private authenticated IPC, paired scopes, negotiated schemas and private-file checks           | Installed pairing lifecycle, actual browser identity and supported OS/ACL matrix                                        |
| C2 / R02        | Durable handles/admission/outbox/status/cancel and reconnect semantics                                    | Production S33 worker/outbox draining, complete progress/journal/retention integration and real JEV tasks               |
| C3 / R03        | Explicit external-controller tasks, shared runtime approval/receipt policy parity and uncertainty fencing | Full ExternalStepProposed/plan revision journal, actual Chrome/native execution and qualified analysis/completion tools |
| C4 / R04        | Named adapters reuse original trust/validation and reject incompatible protocols                          | Actual consumer routing, recording/preview UI and real Profile/Business MCP/PDP/audit/Studio/Platform services          |
| C5 / R05        | Real Codex catalog discovery and separate SDK continuation fixture                                        | Actual Codex semantic selection/call/continuation and complete task/approval/evidence/UI trace                          |
| C5 / R06        | Real Claude catalog discovery and separate SDK pending-approval/reconnect/cancel fixture                  | Actual Claude semantic high/low-level flows under the shared enforcement matrix                                         |

S31/S33/S34 prerequisites remain incomplete, including S27's failed controller
qualification and S34's failed live analyst attempt. Product activation and S36
remain pending. No release, installation, deployment, commit or push is claimed.
