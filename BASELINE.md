# Company Web Agent baseline record

## Provenance

| Item | Value |
|---|---|
| Upstream | `https://github.com/webbrain-one/webbrain.git` |
| Imported commit | `ec76e498ee38a827d6bafc4838cc44f40ea08cd9` |
| Import date | 2026-08-14 |
| Upstream version | `31.0.1` |
| License | MIT; upstream `LICENSE` retained |
| Company branch | `master` |
| Import commit | `d839b744` |

The import preserves the upstream source tree. Company architecture and security documents use the `company-` prefix so the upstream `docs/architecture.md` and `docs/security-model.md` remain available to upstream baseline tests.

## Reproduction environment

| Tool | Observed version |
|---|---|
| Node.js | `v20.19.6` |
| npm | `11.8.0` |
| Playwright Chromium | `147.0.7727.15` / Playwright `1217` |

```bash
npm ci
npm test
npm run test:fixtures
npm run ci:e2e:dry
```

## Baseline results

| Check | Result | Notes |
|---|---|---|
| dependency install | Pass | `npm ci`; 4 packages, no reported vulnerabilities |
| Node regression suite | Pass | `npm test` |
| DOM/browser fixture suite | Pass | `npm run test:fixtures` after Playwright Chromium installation |
| E2E workflow validation | Pass | `npm run ci:e2e:dry` |
| Chrome MV3 manifest parse/load command | Pass | Chromium headless command completed with `src/chrome` as the extension directory |

The headless load check proves the packaged manifest can be loaded by Chromium; it does not replace a managed-Chrome deployment verification, which belongs to S8.

## Baseline constraints observed

- Upstream has a broad permission, provider, network, cloud, scheduler, download/upload, CAPTCHA, social automation and WebMCP surface.
- S1 must remove or make unreachable those paths before any new company feature is introduced.
- S0 did not alter product behavior. The only company changes are provenance/inventory documents and the naming separation required to retain upstream documentation tests.

See [runtime inventory](docs/runtime-inventory.md), [tool inventory](docs/tool-inventory.md), [permission inventory](docs/permission-inventory.md), and [provider inventory](docs/provider-inventory.md).
