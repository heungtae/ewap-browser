# S37 retirement preflight — 2026-10-24

**Planned — preflight executed; production cutover not started.** S36 release qualification remains incomplete. This record does not satisfy S37 entry or completion.

Parent revision: `15b7f32a681d39bc847437525f0b779e57971db0` plus uncommitted preflight changes. Linux, Node 20.19.6, pnpm 9.15.4. Extension 0.1.117, unchanged. Zero provider calls, browser actions, approvals, namespace switches, source deletions and deliveries.

## Executed audit and findings

[Audit implementation](../../scripts/s37/audit.mjs) parses static relative TypeScript imports/re-exports and [runner](../../scripts/s37/run.mjs) bundles the current production Worker in memory with an esbuild dependency metafile. It hashes the actual development manifest and the Worker path declared by that emitted manifest. [Recorded output](../baselines/s37/retirement-audit.json) includes revision, dirty caveat, module paths, callers and artifact digests.

`pnpm audit:s37` returned **BLOCKED**, exit 2, as expected:

- Current manifest selects the legacy `src/service-worker/entry.js` source entrypoint.
- Six candidate source paths remain; four are reachable in the 325-module Worker graph: runtime chat, registration, Act start and harness turns.
- Runtime chat has four static callers; registration has one; Act start has one; harness turns has three. The snapshot lists exact paths.
- Offscreen entry and native client have no static relative TS import callers in this bounded scan. This is not proof that they are unused: HTML, runtime messages, dynamic loading, Native Messaging and installations require separate qualification.
- The manifest retains `offscreen` permission.
- Static results cannot establish S36 release qualification, installed single ownership, UI continuity, delivery or rollback. Even an empty candidate set remains BLOCKED. This command has no enabling/deletion/publishing action.

The six candidates are a bounded starting set from S37's named seams, not an exhaustive old-executor/message/storage inventory. Do not infer C2/C3/R02/R03 completion from this audit. Artifact hashes describe a local development build, not a signed release set or running installation.

## Checks

| Command | Result |
| --- | --- |
| `pnpm test:s37` | PASS, 4/4: AST caller accuracy, retained paths, missing artifacts and no false runtime qualification |
| `pnpm lint` | PASS, ESLint and Prettier |
| `pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs` | PASS, version-preserving development build and package validation |
| `pnpm audit:s37` | BLOCKED / exit 2, expected retirement/precondition findings |
| `pnpm check:s37` | PASS, historical inventory retained, all current files mapped, new script size bounds and frozen production/design hashes |
| `git diff --check` | PASS |

First audit iteration assumed the source Worker path also existed under `dist-extension`. The emitted build rewrites that path. The runner now reads the emitted manifest, verifies that declared Worker path is local, and hashes it. A regression test prevents one existing artifact from hiding a missing Worker. No real-client, live model, Chrome/UI, installed-OS, full unit-suite rerun or supported-release delivery was attempted in this tooling-only slice.

## Remaining work

S36 must first complete actual MG01–MG06 conversion, extension/backend acknowledgment integration, runtime drain/uncertainty handling, UI continuity, required holdouts, supported installation qualification and compatible release evidence. Only then may S37 implement single-owner admission switching and remove callers, old writers/transports and temporary shims. C4 has a partial static preflight only; C1–C5 and R01–R06 remain pending actual acceptance. The original architecture/Sprint designs, production source and UI remain unchanged. Original external Platform backlog dated 2026-09-06 remains external and unresolved.
