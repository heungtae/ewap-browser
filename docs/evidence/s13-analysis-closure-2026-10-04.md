# S13 Ask/Act Analysis Data Browser Closure Evidence

- Date: 2026-10-04
- Scope: Browser analysis acquisition S13-C1~C8, separate from Enterprise S13 Act audit evidence.
- Browser: Google Chrome for Testing 147.0.7727.15, headed under Xvfb with Xfce window manager.
- Runtime: Node 20.19.6; extension version 0.1.87.
- Provider: controlled local HTTPS OpenAI-compatible fixture. No production provider was contacted.
- State tested: current working tree, including the previously uncommitted S13 implementation. These results do not describe an already published commit.

## Implementation and card coverage

| Card | Implementation and verified boundary |
| --- | --- |
| S13-C1 | Closed Act route gate preserves the user's Ask/Act mode. Read-only analysis and action planning remain distinct; unit route tests and Chrome Ask/Act flows pass. |
| S13-C2 | Combine DOM collection discovery and exact-origin/path/version reviewed API availability. Unique sources proceed to permission; ambiguous sources require Panel selection. Selection is rediscovered and bound to the same request and page scope. Chrome unique/multiple collection and collection/API selection pass; stale selection unit tests pass. |
| S13-C3 | Independent R0 `collection_read` and `page_api_read` grants. API normal/partial/capped/invalid/timeout cases each invoke the read once, without automatic retry or mutation. Stop discards a delayed read before Provider reinjection. |
| S13-C4 | Provider receives bounded sanitized records, collected count, coverage, reason and truncation. API and table context caps return `partial`/`CONTEXT_TRUNCATED`; SVG/canvas return `viewport_only`; unsupported pagination returns `unavailable`/`UNSUPPORTED_OBJECT`. |
| S13-C5 | Ask resumes source selection and one-request permission on the existing request and reinjects the selected source into its read-only Provider turn. Unit tests reject scope changes before dispatch, after response and before the next tool-loop turn without publishing stale deltas. |
| S13-C6 | Act reinjects analysis into its answer/action-planning path. An action proposal still waits for separate mutation review; no fixture save occurs from the R0 read. Request-local analysis and scope survive workflow selection in memory but cannot be resumed from persisted metadata after restart. |
| S13-C7 | Unreviewed API candidates terminate with `REQUIRES_ADAPTER_REVIEW`, without reading or passing candidates/data to the answer Provider. Late Ask answers and Act proposals after scope changes fail/cancel without publishing or saving. Worker restart terminates pending source selection without replay. |
| S13-C8 | Actual production extension, Side Panel and Service Worker exercised through a controlled HTTPS provider. API/collection selection, permission resume, bounded reinjection, coverage, review, Stop, scope invalidation, persistence/export privacy and restart checks all pass. |

The selected-source assertion applies to `[UNTRUSTED_ANALYSIS_DATA]`. Ordinary semantic projection may contain visible text from other page objects. Sanitized analysis cells intentionally reach the current Provider request; raw locator/function/cursor/endpoint authority does not.

## Chrome commands and results

```sh
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/xfwm4-s13.log 2>&1 & npm run test:chrome-analysis-data'
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/xfwm4-s13-collection.log 2>&1 & npm run test:chrome-collection'
```

Both commands exited with status 0.

- Analysis smoke: unique-source Ask/Act and multi-source selection/permission resume passed. The selected second table contributes `SELECTED_BETA`, excluding `UNSELECTED_ALPHA` from the analysis block.
- Reviewed API competing with a collection: selection and independent R0 permission precede one read and Ask reinjection. Ask/Act matrix passes for complete, partial, cap, invalid schema and timeout, with no retry or mutation.
- Act analysis success still requires separate mutation review. Cancelling review produces no save.
- Stop during delayed MAIN read prevents late reinjection. Same-document scope changes while the Provider is held reject the late Ask answer and Act proposal; `S13_LATE_ANSWER` is absent from Panel output and save count remains zero.
- Collection coverage passes for the context cap, SVG/canvas viewport and unsupported pagination. Unreviewed API candidates show a review-only card for Ask and Act without executing the candidate.
- Actual successful diagnostics responses, local/session storage and Panel-generated ZIP contents exclude `S13_PRIVATE_RECORD`, `S13_SECRET_TOKEN` and `readSummary`, both after successful API analysis and after review-only termination. The ZIP verifier checks CRC, central directory offsets and manifest SHA-256. Diagnostics queries include their required request ID, sequence and limit; an error response cannot satisfy this check.
- Worker restart while source selection is pending returns a failed terminal request and does not replay acquisition or the analysis Provider turn.
- Virtual-grid regression collects 1,000 rows with EOF evidence, bounded chunk and restored scroll position. Stop returns a partial result with 67 collected rows and restores the original scroll position.

## Automated checks

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run test:fixture
npm run test:e2e
npm run check:module-boundaries
node_modules/.bin/tsc -p tsconfig.build.json
node scripts/build-extension.mjs
npm run validate:package
git diff --check
```

- TypeScript, ESLint/Prettier and package policy: passed.
- Unit: 108 files, 453 tests passed.
- Fixture: 1 test passed; source E2E: 1 test passed. These are distinct from the actual Chrome runs above.
- Module boundaries: passed for 238 TypeScript files.
- Extension artifact build: passed; this direct build did not bump package/manifest versions.
- Documentation: 159 local Markdown links validated across 29 sprint and implementation documents; missing preliminary S13 evidence links were updated to this report. Changed Chrome check scripts pass `node --check`.

## Closure boundary

S13-C1~C8 are Completed for the Browser and controlled browser/provider fixture scope. Collection virtualization builds on [S6-R closure](s6-r-closure-2026-10-01.md), with a fresh Chrome collection regression recorded above.

Site-specific production adapters, external live-provider answer quality and Enterprise Platform release/audit services remain separate. Unsupported pagination is explicitly unavailable; this closure does not claim support for every pagination or chart implementation. Coverage instructions and data envelopes are verified, but a controlled fixture does not prove arbitrary model answers obey those instructions.

The initial attempt to reuse `/tmp/chrome-linux64/chrome` failed with ENOENT after the machine restart. The successful runs use the installed Chrome for Testing path above.
