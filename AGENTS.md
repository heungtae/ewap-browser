# Repository Guidelines

## Project Structure & Module Organization

ContextPilot is a local-first Chrome Manifest V3 extension for Ask/Act workflows. TypeScript implementation lives in `extension/src/`: `service-worker/` coordinates requests, `content/` reads pages, `sidepanel/` implements UI, and `contracts/` defines shared messages. Keep provider, policy, security, and diagnostics logic in their corresponding modules. Assets and manifest live in `extension/assets/` and `extension/manifest.json`.

Tests are organized under `extension/tests/{unit,fixture,e2e}/`. `scripts/` contains build and Chrome verification tools; `examples/` provides fixtures; `native-host/` contains the .NET host. Start at `docs/README.md` and `docs/source-guide.md` to locate implementation and verification records. Generated output lives in `dist/` and `dist-extension/`.

## Documentation and Source of Truth

Code, runtime contracts, and configuration are the single source of truth for current behavior. Tests define executable checks; dated evidence records only the revision, environment, and scope actually verified. Sprint documents are historical delivery records or explicitly pending work, not a competing implementation specification.

Keep documentation focused on source navigation, installation, testing, operations, and evidence. Update source links when moving modules. Do not recreate per-feature design documents that duplicate code or infer current support from a past plan. Preserve unresolved cross-repository work as a backlog with its original date and scope. Link retired designs through a pinned Git revision when needed to interpret historical evidence.

## Build, Test, and Development Commands

Use the pinned `pnpm@9.15.4` package manager.

- `pnpm install --frozen-lockfile`: install locked dependencies.
- `pnpm typecheck`: check strict TypeScript contracts.
- `pnpm lint`: run ESLint and Prettier checks.
- `pnpm build`: compile and bundle; **also increments the extension version**.
- `pnpm validate:package`: validate extension artifacts.
- `pnpm test:unit`, `pnpm test:fixture`, `pnpm test:e2e`: run Vitest suites.
- `pnpm test`: run the combined checks, including the version-changing build.

For verification without changing versions, use `pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs`. Load `dist-extension/` through Chrome's “Load unpacked” action. Chrome smoke tests require `CHROME_FOR_TESTING_BIN`.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, and semicolons; let Prettier format changes. ESLint rejects explicit `any` and unused variables; intentionally unused parameters use an underscore prefix. Follow existing kebab-case filenames, camelCase functions, and PascalCase types. Keep modules focused; the source-size checker limits files to 199 lines. Run `pnpm check:module-boundaries` for architectural changes.

## Testing Guidelines

Name tests `*.test.ts` and mirror the affected module under `extension/tests/unit/`. Cover behavior, permission failures, cancellation, stale bindings, and sensitive-data masking where relevant. Run affected suites and appropriate Chrome smoke tests. Record executed checks and limitations; controlled fixtures do not establish live-provider success. Use the settings and commands in [`docs/test.md`](docs/test.md) for S16 live tests.

## Commit & Pull Request Guidelines

Follow history's scoped messages, such as `feat(act): ...`, `fix(harness): ...`, and `docs(evidence): ...`. Stage only intended changes and preserve unrelated work. PR descriptions should explain the problem, resulting behavior, relevant sprint or issue, checks performed, and remaining limitations. Include screenshots for visible UI changes and evidence links for runtime claims.

## Security & Configuration

Read provider credentials from environment or supported local configuration. Never commit API keys, raw sensitive page data, or unmasked traces. Preserve consent, request/document binding, and Ask/Act authority boundaries.
