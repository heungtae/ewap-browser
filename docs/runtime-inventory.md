# Upstream runtime inventory — S0 baseline

This is an observed inventory at `ec76e498ee38a827d6bafc4838cc44f40ea08cd9`, not an approval of the listed capabilities.

| Runtime area | Baseline location | Enterprise disposition |
|---|---|---|
| Chrome MV3 entry | `src/chrome/manifest.json`, `src/chrome/src/background.js` | Keep only required side-panel, AX/ref_id and CDP paths |
| Agent loop/tools | `src/chrome/src/agent/agent.js`, `tools.js`, `permission-gate.js` | Replace exposure with COMPANY_TOOLS and deterministic policy |
| Content/AX | `src/chrome/src/content/accessibility-tree.js`, `content.js` | Preserve and harden as primary semantic interface |
| CDP | `src/chrome/src/cdp/*` | Keep trusted input only; attach lifecycle must be verified |
| Providers | `src/chrome/src/providers/*` | Replace catalog with company OpenAI-compatible vLLM provider |
| Network/download | `src/chrome/src/network/*`, `download-*`, `offscreen/skill-download.js` | Remove/disable |
| Cloud/OAuth/sync | `cloud-runs.js`, `profile-sync.js`, `providers/oauth-*`, `offscreen/cloud-bridge.js` | Remove/disable |
| Scheduler/watch | `agent/scheduler.js`, `offscreen/watch-audio.js` | Remove/disable |
| CAPTCHA | `agent/captcha-*`, `capsolver-config.js` | Remove/disable |
| Social automation | `agent/social-media-downloader.js`, manifest social script | Remove/disable |
| WebMCP | `cdp/*`, agent tool definitions | Remove/disable |
| Recorder/trace | `recorder/*`, `trace/*`, `run-capture.js` | Replace with minimal redacted audit in S4 |
| Firefox build | `src/firefox` | Out of scope; exclude from company release packaging |

## Required S1 removal evidence

S1 must prove both of the following for every prohibited area: the feature is absent from the model-exposed tool list, and no background/UI/manifest path can activate it. Search-only evidence is insufficient; a negative execution or direct-invocation test is required.
