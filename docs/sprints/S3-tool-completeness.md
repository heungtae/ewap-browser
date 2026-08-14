# S3 allowed-tool completeness matrix

Every enabled mutation tool must carry all ten companion controls defined in `AGENTS.md`.

| Tool | Schema | Registry/mode/capability/risk | Confirmation | Verifier | Audit redaction | Unit | Fixture/E2E | Evidence |
|---|---|---|---|---|---|---|---|---|
| `set_field` | `agent/tools.js` | `COMPANY_TOOLS` | R1 policy | `action-verifier.js` | `audit-recorder.js` | company tests | controlled-input fixture | `action-verifier.test.mjs` |
| `type_ax` | `agent/tools.js` | `COMPANY_TOOLS` | R1 policy | `action-verifier.js` | `audit-recorder.js` | company tests | input/controlled fixture | `action-verifier.test.mjs` |
| `set_checked` | `agent/tools.js` | `COMPANY_TOOLS` | R1 policy | `action-verifier.js` | `audit-recorder.js` | company tests | checkbox/radio fixture | `action-verifier.test.mjs` |
| `select_option` | `agent/tools.js` | `COMPANY_TOOLS` | R1 policy | `action-verifier.js` | `audit-recorder.js` | company tests | native select/modal fixture | `action-verifier.test.mjs` |

`click_ax` and `press_keys` remain disabled in `COMPANY_TOOLS`; no disabled tool is considered delivered. Each enabled tool is additionally subject to resolved Page Profile allowlisting before its schema is exposed in an Act run.
