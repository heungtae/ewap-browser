# ISS-20261031-002: Native bridge accepted ready before challenge response

Status: **검증 중**. Discovered 2026-10-31 during S28 source review. The isolated target native bridge accepted a syntactically valid `ready` before processing a challenge and sending its HMAC proof. This was reproduced with a controlled fake native port; no external host or user data was involved. The legacy production entrypoint is separate.

The bridge now enforces challenge, proof generation and ready ordering. A duplicate challenge during asynchronous signing closes the bridge; a proof is not posted after closure. This ordering check does not by itself authenticate the host response or establish platform-level native host integrity.

Regression tests in `extension/tests/unit/migration/s28/native.test.ts` cover unsolicited ready and duplicate challenge, alongside the existing actual native subprocess and authenticated daemon scenario. Actual installed Chrome and additional platform verification are required before resolving this issue. Product routing and release are not claimed.

On 2026-10-31 Linux/Node 20.19.6, `pnpm test:s28` passed 42 tests; `pnpm build:s28` and `pnpm check:s28` passed. The first boundary check reported a source-size violation; duplicate schema checks were replaced by the existing strict parsed schemas, and the final check passed. No provider call, approval or browser dispatch was made.

With source `2c9ede391`, `pnpm test:chrome-s28:native` passed using Chrome for Testing 147.0.7727.15 and an isolated native registration. [Report](../../evidence/s28-native-handshake-2026-10-31.json) records handshake and restart/reconnect, with task readiness false. This confirms the legitimate path on the controlled Linux fixture; it does not test an installed normal-user profile, malicious native host or other operating systems.
