# S26 frozen migration baseline

This directory records the existing implementation, not a replacement design.
The architecture and runtime contracts remain unchanged. No production source,
permission, provider configuration or stored user data was changed by S26.

- [Source baseline](source-baseline.json): HEAD, initial dirty/untracked planning
  files, versions, source/config/test hashes and pre-build artifact hashes. The
  detailed design revision is reconciled against the actual implementation tree.
- [Disposition](disposition.json): exact Git-visible tracked and untracked file
  paths, RF01–RF30 owners, target responsibilities, disposition and owning Sprint.
  Paths are enumerated explicitly; validation does not assign wildcard/default
  ownership to a new file or alias. Tests with a matching source inherit its RF
  owner; general fixtures, evidence and tools belong to RF30.
- [Storage](storage.json): keys, source readers/writers, schema/area and conversion,
  archive, adapter or retirement decisions. Access-site hashes contain no record
  values. [Storage characterization](../../../extension/tests/unit/migration/s26-storage-baseline.test.ts)
  executes real decoders for v1/v2, disabled settings and malformed recipe records.
- [Consumers](consumers.json): static import callers, native protocol/registration,
  deployment artifacts, external routes and remaining compatibility uncertainty.
- [Legacy routes](legacy-routes.json): exact message names and source occurrences;
  S37 deletion requires caller/message/storage scans, not filename aliases.
- [Qualification](qualification.json): version 1 holdout definitions, immutable
  first-attempt IDs, seven metric denominators and separate fixture/live scopes.
  The 100 Ask and 100 Action definitions are frozen evaluation specifications;
  their fixture variants are not 200 executed independent release observations.
  Live holdouts must be qualified in S36 before a release claim. Backend restart
  cases intentionally remain pending until the backend exists.
- [Behavior](behavior.json): executed public-boundary regression cases and issue
  ownership. [Source size](source-size.json) retains pre-existing failures.
- [Presentation report](ui/report.json): stable paired DOM/focus/layout samples,
  fixed CSS-pixel viewport/device scale, computed fonts, PNG and structural hashes.
  The same extension artifacts, Chrome build and Linux font environment are used
  for both samples. Screenshots contain fixture data only. Synthetic UI events
  exercise rendering and interaction, not dispatch authority.

Run `node scripts/s26-inventory.mjs`,
`node --test scripts/s26-baseline.test.mjs`, and
`pnpm exec vitest run extension/tests/unit/migration/s26-storage-baseline.test.ts`.
For Chrome, first build without bumping versions as documented in AGENTS.md, then
run `CHROME_FOR_TESTING_BIN=<chrome> node --experimental-websocket scripts/chrome-s26-smoke.mjs`.

Inventory coverage includes all Git-visible files, including the planning files
already untracked at entry and this characterization. `.git`, dependencies,
ignored local configuration and generated outputs are excluded by `.gitignore`;
pre-build artifacts are hashed separately. No profile directory, credentials or
raw diagnostics are imported. There are no S26 temporary runtime adapters or a
new executor. Future adapters require a caller, version, RF owner and S37 expiry.

UI structure, IDs/classes, transcript ordering, dialogs, focus and navigation are
preserved. Only the role/status/help semantics explicitly listed in architecture
section 6.3 may change during the owning future Sprint. S26 changes no wording.

First-attempt UI files with names `panel-run_started`, `panel-run_terminal`,
`panel-permission_required` and `workflow-plan-review` may also be present. They
are retained characterization attempts; the final report lists accepted captures.
Failures and driver recovery are recorded in the dated evidence; none are live
model, MCP, OS installation or deployment qualification.
