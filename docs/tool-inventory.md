# Upstream tool inventory — S0 baseline

## Source of truth

Upstream model tools are declared in `src/chrome/src/agent/tools.js` as `AGENT_TOOLS`; mode/tier filtering occurs in `getToolsForMode`. The baseline supports Ask, Act and Dev modes, provider tiers, and WebMCP additions. This is incompatible with the company two-mode/allowlist design.

## Company target allowlist

| Group | Target tools |
|---|---|
| Read | `get_accessibility_tree`, `read_page`, `find_text` |
| Act | `set_field`, `set_checked`, `get_select_options`, `select_option`, `click_ax`, `press_keys`, `scroll`, `hover`, `wait_for_element`, `verify_form` |
| Control | `done` |

No tool is approved merely because it exists upstream. S1 creates the COMPANY_TOOLS registry; S2 classifies and gates every mutation; S3 adds verifier coverage for each admitted tool.

## Baseline prohibited classes

| Class | Examples to remove or deny |
|---|---|
| Arbitrary execution/developer inspection | `execute_js`, CSS/DOM patching, Dev-only tools |
| Arbitrary network/research | `fetch_url`, API replay/shortcuts, external research |
| File transfer | downloads, uploads, media capture/export |
| Autonomous activity | scheduler, watches, alarms, background jobs |
| Third-party automation | CAPTCHA solver, social-media workflows, cloud runs, WebMCP |
| Privileged configuration | provider selection/OAuth/subscription, cloud sync/import/export of secrets |

## S1 snapshot requirement

The committed company snapshot must list tool name, mode, capability, risk class, confirmation behavior, verifier and audit redaction class. Tests must assert exact equality between that snapshot and runtime model exposure.
