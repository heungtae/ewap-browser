# S28 implementation inventory

The successor `disposition.json` extends S27 without rewriting historical RF
ownership. `verification.json` identifies this dirty-tree verification and its
limits. Source/design preservation is checked against S27's entry hashes.

Run `pnpm build:s28`, `pnpm check:s28`, `pnpm test:s28`, and the controlled Chrome
smoke as documented in the [dated evidence](../../evidence/s28-workspace-bridge-2026-10-19.md).
The target is not selected by production packaging. S28 remains In Progress.
