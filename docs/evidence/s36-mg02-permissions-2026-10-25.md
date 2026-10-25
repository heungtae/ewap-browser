# S36 MG02 permissions and preferences — 2026-10-25

**In Progress.** MG02 conversion, policy-floor adapter and two-store mirror verification. MG01–MG06 now have implementation paths; installed migration and full S36 acceptance remain incomplete. S37 remains Planned.

Parent: `9407c9658df46a562455583bcba8895db1e25270` plus uncommitted MG02 changes. Linux; pnpm 9.15.4, Node 20.19.6 for TypeScript/Vitest/build, Node 22.23.2 for native SQLite; controlled Chrome 147.0.7727.15. Extension version 0.1.117 is unchanged. Zero provider calls, browser business actions, actual approvals, production ownership changes and deliveries.

## Implemented source behavior

- [Converter](../../apps/chrome-extension/src/migration/mg02-convert.ts) reads only `contextpilot_permissions`, `wb_permissions` and `agent_preferences` from a frozen local-storage source. Current permissions take active-source precedence when defined, matching bootstrap selection; valid denies from either namespace are retained conservatively. Inactive legacy allows are never activated. Every allow becomes `ask` with `reusableGrant: false`; no once/session grant, value/ref or approval receipt is imported.
- Stored host/capability rules stay exact-host rules. Wildcards, invalid hosts, reusable page-method grants and unsupported rows are quarantined. A page-method deny is preserved as a narrower restriction even though the old persistent loader rejects that capability. Malformed active rules block the whole draft; malformed inactive legacy data is accounted for without widening current authority. Per-container limit is 1,024 rules, plus one preference record; oversized/invalid containers count as one reason-only disposition. Original snapshots remain browser-local under the existing MG02 staging namespace.
- [Preference conversion](../../apps/chrome-extension/src/migration/mg02-preferences.ts) reuses the actual v1/v2 approval/preference validators. Target categories are only ask/deny: Full/auto/skip are not imported as authority. Explicit raw category denies survive even when legacy mode normalization would overwrite them. Approved-plan constraints, read-scope ceiling, explicit page-method disable and display preferences are retained. Model screenshot policy is narrowed to manual-only or disabled. Missing page-method opt-in remains disabled. Target policy revision advances past the source approval revision; exhaustion/malformed preferences block the draft rather than resetting into usable grants.
- [Versioned contract](../../packages/policy-engine/src/migration-contract.ts) defines strict conversion/mirror/ack schemas. Vocabulary checks compare its capabilities/categories with current legacy contracts. [Policy adapter](../../packages/policy-engine/src/migration-evaluate.ts) maps all 21 current tools, preserves scoped/category denies, restricts host/scheme/read/plan/manual-vision boundaries, and delegates hard risks to the existing shared `evaluate` function with automatic edit/write flags disabled. Every non-denied imported action still requires explicit approval, including reads. Ask mutation and sensitive-input hard denial remain intact.

The policy adapter is not an approval issuer or a new executor. Request-side URL/effect/context, fresh site/plan consent and vision flags must come from the existing authenticated runtime/UI/owner paths, never a provider-selected payload. Existing prepared-step/ref/lease/epoch/policy-digest/one-time-proof checks remain necessary. No registry, production router, active policy or UI was switched by this slice.

## Two-store protocol and actual scope

[Extension staging](../../apps/chrome-extension/src/migration/mg02-staging.ts) uses the shared atomic IndexedDB checkpoint implementation and explicit base64url-to-hex adapter. Profile is bound to the actual profile-specific database name. Raw source backup stays local; only strict converted policy and checkpoint go to the backend port.

[Backend mirror](../../apps/agent-server/src/migration/mg02-mirror.ts) binds its profile at construction, checks the closed-admission backend epoch inside a SQLite transaction, and rejects conflicting IDs, digests, revisions, profiles or stale rows. Its acknowledgment hashes the complete header, conversion and checkpoint. The extension rereads its source after backend response/observation, verifies matching profile/epoch/revision/digest and durably records its own acknowledgment. Backend commit plus lost response or IDB ACK quota failure does not count as agreement; retry converges without overwriting old source or activating policy. No transaction is claimed to span SQLite and IndexedDB.

`PolicyMirrorPort` is a trusted composition port requiring authenticated profile/channel ownership. The current fixture uses an in-process port, not installed authenticated IPC. Local/backend acknowledgments are consistency records, not standalone authorization tokens or a cryptographic attestation. S36 coordinator composition and actual source/target writer freeze remain unregistered in production. A blocked draft may be mirrored for inspection; matching acknowledgments never override its deny state or open admission.

## Executed checks

| Command | Result and bounded scope |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS, ESLint/Prettier |
| `pnpm test:s36` | PASS, 87/87 across 17 files; 19 new MG02 checks |
| `pnpm test:unit` | PASS, 1,340/1,340 across 272 files |
| `pnpm test:fixture` / `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm check:module-boundaries` | PASS, 423 extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, local development artifact; version unchanged |
| `pnpm build:s36:mg02` | PASS, isolated backend/extension fixture bundle |
| Node 22.23.2 `--test scripts/s36/mg02-sqlite.test.mjs` | PASS, 2/2 real SQLite + controlled IndexedDB protocol tests |
| `CHROME_FOR_TESTING_BIN=... S36_MG02_EVIDENCE_DIR=docs/evidence/s36-mg02-chrome-2026-10-25 pnpm test:chrome-s36:mg02` | PASS, six controlled real-Chrome IndexedDB/policy checks |
| `pnpm check:s36:mg02` | PASS, cumulative inventory, bounded source size, browser/backend import boundaries and preserved production/design hashes |
| `git diff --check` | PASS |

A final negative test exposed an imported runtime-data denial returning `explicit` for method/network-result tools when the caller omitted the disclosure flag. Those known channels now enforce the denial independently of that flag; the test failed before the fix and passed afterward. Typecheck/lint otherwise passed. Intentional negatives include conflicting aliases, malformed active permissions/preferences, once/page-method grants, exhausted revisions, stale policy/epoch/profile, wrong acknowledgment, lost response, ACK quota failure, source changes during backend observation, source-origin restrictions, sensitive/Ask mutations and blocked disclosure/vision/plan/read scopes.

[Conversion tests](../../extension/tests/unit/migration/s36/mg02-convert.test.ts), [policy tests](../../extension/tests/unit/migration/s36/mg02-policy.test.ts) and [staging tests](../../extension/tests/unit/migration/s36/mg02-staging.test.ts) execute the actual converter, current policy evaluator and IDB staging with controlled source/mirror ports. [Native tests](../../scripts/s36/mg02-sqlite.test.mjs) additionally use actual on-disk SQLite, close/reopen, source retention, lost-response recovery, mirror conflict/profile/digest/epoch rejection and unchanged legacy namespace/closed admission. IndexedDB in the native test is `fake-indexeddb`.

The [Chrome fixture](../../extension/tests/fixture/s36/mg02-chrome-cases.ts) uses real IndexedDB in a temporary loopback page/profile and controlled storage/backend/UI context. [Report](s36-mg02-chrome-2026-10-25/report.json) records source revision/dirty caveat and browser version. Counts, both acknowledgments, retained deny, Full allow downgraded to explicit, close/reopen/idempotence/source preservation and revoked epoch are checked. The fixture issues no real approval or browser business action and is not an installed-extension/native transport/UI-continuity qualification.

## Remaining work

All six migration units now have scoped implementation/evidence, but production integration is still incomplete: authenticated profile-bound source/mirror transport, actual legacy/backend writer fencing and drain/CDP ownership, global manifest acknowledgments, source cleanup/retention, MG01 OS/session setup, active target policy/Settings and UI/window continuity. Imported allows deliberately require fresh authority; this draft is not a replacement for future explicitly configured target policy.

S27/JEV and later live/product prerequisites, 100 Ask/100 multi-step Action holdouts, supported-OS install/upgrade/repair/rollback, compatible release artifacts and actual S37 delivery/retirement remain open. No old key/message/executor/transport has been removed or re-enabled. The original cross-repository Platform backlog dated 2026-09-06 remains external and unresolved.
