# Browser Diagnostics ZIP Closure Evidence

- Date: 2026-10-01
- Scope: existing Browser diagnostics ZIP cards S12-C1–C6; distinct from Enterprise S12 managed policy.
- Runtime: Node 20.19.6, Chrome for Testing 154.0.8037.57, headed under Xvfb/Xfce.
- Provider: controlled local HTTPS fixture, two requests (one successful answer and one HTTP 503). No live provider was contacted.

## Contract and implementation

| Card | Result and evidence |
| --- | --- |
| S12-C1 | Document 30 matches the existing export envelope, ten ZIP files, manifest sections and hashes. Documented script type counts, bounded digest lists and request-specific trace scope. |
| S12-C2 | Request/trace/session exports retain metadata only. Request-ID exports now filter execution/provider traces to that request; no-ID exports retain the bound tab's trace. Provider configuration explicitly excludes key/header values and endpoint. |
| S12-C3 | Worker validates digest shape and closed role/input/script-type count keys, reconstructs URL-shape fields, and excludes extra nested URL fields. Invalid summaries become an unavailable page section. Content truncation propagates to manifest page sections. |
| S12-C4 | Real footer and provider-error-card buttons both invoke the common ZIP generator and produce the same request ID and file contract. Error card stays available after export. |
| S12-C5 | Ten handler scenarios cover normal export, nested URL injection, malformed digest, arbitrary count key, truncation, content/provider diagnostics failure, UNKNOWN/NAVIGATION_UNVERIFIED metadata, unknown request ID and absent request ID. A second same-tab request verifies trace filtering. |
| S12-C6 | Real unpacked extension, authenticated Side Panel and worker collect a 25-row/6-column table; the generated ZIP passes the Chrome matrix below. |

## Chrome matrix

```sh
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/diagnostics-xfwm4.log 2>&1 & npm run test:chrome-diagnostics-zip'
```

Passed:

- No accepted request: footer ZIP contains REQUEST_ID_NOT_PROVIDED and 25×6 table metadata.
- 102 scripts: only 100 script digests are exported and manifest page sections report truncated.
- Successful Ask: request, provider stages and session metadata appear without prompt/response contents.
- HTTP 503: the actual error card and footer both produce a ZIP for the failed request.
- Completed-request navigation: request remains readable on the same bound tab; current document digest changes. This tests export ownership after navigation, not a new Act navigation dispatch.
- Unknown request ID: REQUEST_NOT_FOUND is isolated from trace/page collection.
- Actual worker termination/restart: a new worker target restores the completed request and produces another ZIP.
- Navigation to about:blank: unavailable content collection still produces a ZIP with execution trace.
- Every captured ZIP: ten unique entries, JSON parsing, local/central headers, offsets, sizes, CRC32 and all nine manifest SHA-256 entries agree.
- No fixture API key, prompt, response, provider error body, table cell, password, title, script, URL/query/fragment marker or provider hostname appears in any ZIP entry.
- Exactly two provider requests: exporting diagnostics causes no additional Provider calls.

The runner captures the real panel's Blob and download-anchor filename to validate bytes; it suppresses the final anchor click instead of testing the operating system's download directory. The fixture is ephemeral HTTPS rather than a fixed localhost:3000 deployment. UNKNOWN/NAVIGATION_UNVERIFIED metadata is checked in the unit lifecycle fixture; the broader actual Act navigation matrix is existing S2 evidence, not rerun here.

## Automated validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test:unit`: 100 files, 370 tests passed.
- `npm run test:fixture`: 1 test passed.
- `npm run test:e2e`: 1 source smoke test passed; separate from Chrome evidence.
- `npx tsc -p tsconfig.build.json && node scripts/build-extension.mjs`: passed without version bump; version remains 0.1.87.
- `npm run validate:package`: passed.
- `git diff --check`: passed.

## Completion boundary

S12-C1–C6 Browser diagnostics ZIP is Completed. This does not change Enterprise S12, S13 analysis acquisition, S15 managed release, Windows download behavior or live-provider qualification.
