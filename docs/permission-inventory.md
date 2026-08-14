# Chrome permission inventory — S0 baseline

Observed from `src/chrome/manifest.json` at the imported commit.

| Permission/surface | Baseline | Company target/disposition |
|---|---|---|
| `sidePanel`, `activeTab`, `tabs`, `scripting`, `storage`, `debugger` | Present | Retain only if S1 policy and S8 deployment evidence confirm need |
| `contextMenus`, `tabGroups`, `webNavigation`, `webRequest` | Present | Remove unless a later ADR establishes an indispensable minimal use |
| `downloads`, `alarms`, `unlimitedStorage`, `offscreen`, `privateNetworkAccess`, `tabCapture`, `clipboardWrite`, `clipboardRead` | Present | Remove |
| `<all_urls>`, `http://localhost/*`, `http://127.0.0.1/*`, `http://*/*` | Host permissions | Replace with enterprise HTTPS allowlist only |
| CSP `connect-src * data: blob:` | Present | Replace with company provider/MCP/audit endpoint allowlist |
| content scripts on `<all_urls>` | Present | Scope to approved enterprise origins or inject only after policy approval |

S1 requires an exact manifest snapshot test. Any added permission or host origin after S1 is an ADR and release-gate change.
