# Browser S10-C1–C5 Page API Closure Evidence

- Date: 2026-10-01
- Scope: legacy Browser S10 Page API execution, redacted Discovery, ephemeral review surface and reviewed read-only fixture adapter contract.
- Distinct from Enterprise S10 Profile acceptance and S13 Ask/Act analysis source integration.
- Runtime: Node 20.19.6; Chrome for Testing 154.0.8037.57; extension 0.1.87.
- New S10/Discovery tests run headed under Xvfb/Xfce with explicit X11 selection. HTTPS fixtures use ephemeral certificates and local host resolution; no production provider/site was contacted.

## Closed cards

### Review follow-up (2026-10-01)

Review of commit `825aa4cd0` reproduced a P1 with the production runner and
request lifecycle plus delayed scripting responses: Stop during the MAIN probe
still permits one mutation injection; starting a new request on the same tab
lets the old operation mark the new request as dispatched. API-10/11 below
cover post-dispatch Stop, not cancellation while preparing. Remediation and
additional Chrome evidence are completed separately in [S10-R](../sprints/s10-r-page-api-request-cancellation.md).

| Card | Implementation and evidence |
| --- | --- |
| S10-C1 | Real Side Panel Act proposal → explicit approval → separate page_api permission → document-pinned MAIN invocation → isolated native option selection → VERIFIED. True return without UI change remains UNKNOWN. |
| S10-C2 | API-01–14 matrix below; existing Chrome preview and signed/page-derived Act regression passed. |
| S10-C3 | D-01–09 matrix below; fixed scanner and actual Side Panel lifecycle evidence. |
| S10-C4 | Review dialog marks hints without changing extension storage, executable registry or chat/model tools. Close, tab switch, navigation and pending Stop discard candidates. External reviewer authentication/task systems are outside this Browser contract. |
| S10-C5 | Fixed fixture_summary v1 adapter for exact https://page-api-fixture.invalid/variant; summary enum; separate page_api_read/R0 permission; document/scope binding; closed result schema; caps; no retry. Internal runtime entrypoint intersects local/enterprise policy and RequestContext. Automatic Ask/Act source selection/reinjection remains S13 work. |

## API-01–14 evidence map

| ID | Evidence |
| --- | --- |
| API-01 | Chrome: explicit review and permission precede one invocation; selected High is independently VERIFIED. Receiver identity is preserved by the page API call. |
| API-02 | Chrome: already-selected High performs a read-only existence probe and zero mutation invocations. |
| API-03 | Chrome: API version changes while approval is pending; unavailable probe prevents invocation. Unit probes reject false, raw string and object claims. |
| API-04 | Unit: closed proposal rejects extra fields, JS/function paths and unsupported enum. Runner rejects enum outside registry. |
| API-05 | Unit: changed option, approval digest, completion digest and registry version cannot dispatch. |
| API-06 | Chrome: full navigation during pending approval invalidates the proposal; the new document receives zero calls. Post-dispatch SPA scope change cannot become VERIFIED. Unit: scope change while marker is being written prevents invocation. |
| API-07 | Unit: different origin, forged action_ref and unknown option are rejected; invalid frame/document injection results cannot become accepted reads. Chrome rejects forged ACT_APPROVE. |
| API-08 | Chrome: page returns a success-shaped object with a secret token but leaves UI unchanged; terminal is UNKNOWN/POSTCONDITION_UNVERIFIED. Unit observer rejects an option belonging to another control, wrong option, hidden control and truncated projection. |
| API-09 | Chrome: throw → UNKNOWN/PAGE_API_CALL_FAILED; hung promise → UNKNOWN/PAGE_API_TIMEOUT. Unit fake clock confirms the five-second invocation deadline and no redispatch. |
| API-10 | Chrome: Stop and real Worker termination after dispatch keep one call; restart restores UNKNOWN. Unit: concurrent approvals cannot pass the asynchronous probe twice. |
| API-11 | Chrome: delayed page completion after Stop cannot change the terminal outcome. Unit: scope changes after invocation cannot be VERIFIED even if UI observation reports satisfied. |
| API-12 | Unit: R2/server-side adapters fail registry validation. Existing managed policy denial/outage tests remain green; the read contract rejects denied/failed authorization before MAIN. No live enterprise PDP was tested. |
| API-13 | Chrome: model tool schemas exclude implementation names; diagnostic bundle excludes fixture credential, error and raw return markers. MAIN result enum and closed read schema prevent raw result propagation. Provider secret storage is an intentional fixture configuration, not evidence of credential-free settings storage. |
| API-14 | Existing actual Chrome preview E2E and S7 ordinary signed/page-derived Act passed. This is the available regression suite, not an additional real-site Variant qualification. |

## Discovery D-01–09 evidence map

| ID | Evidence |
| --- | --- |
| D-01 | Chrome: bound real Side Panel receives only redacted ordinal hints for the current top document. |
| D-02 | Chrome: navigation invalidates displayed candidates; tab switch closes the review dialog; after actual Worker restart only a new explicit scan produces candidates. Unit: changed scope discards an in-flight response. |
| D-03 | Chrome: accessor getter count is zero; a throwing Proxy trap is omitted without raw error; slow reflection ends MAIN_UNRESPONSIVE with no candidates. Unit: malformed/error response fails closed. Reflection traps are untrusted page execution, not a guarantee of side-effect-free reflection. |
| D-04 | Chrome: oversized inline script reports truncated. Unit: an injected 97-hint result exceeds the closed 96-candidate cap and is rejected. |
| D-05 | Chrome: scanner adds no fixture HTTP request; external-script-only identifiers do not appear in candidates. Normal page resource loading is separate from scanner fetching. |
| D-06 | Chrome: page getter/function/Proxy/storage markers and raw root/function/endpoint names do not appear in panel, extension storage or diagnostic export. |
| D-07 | Chrome: dormant endpoint hints remain labels; no endpoint call or public function invocation occurs. Scanner supports function/inline-literal hints only; WS/event/storage/custom-element execution is unavailable. |
| D-08 | Chrome: marking review-needed does not change extension storage and exposes no invoke/data-read button. Closing during pending scan leaves no late candidates. |
| D-09 | Independent bundled action/read fixture contracts pass exact scope, enum, permission and postcondition/schema checks. Discovery candidate_ref is not accepted as a read binding. No runtime promotion or external handoff system is introduced. |

## Read-only adapter contract

- One fixed public API: appData.apiVersion=1 and appData.readSummary(summary), called with its receiver. No arbitrary function path, endpoint, selector, cursor or caller-defined argument exists.
- Source binding includes run/tab, actual Chrome documentId, document/page epochs, exact origin/path and adapter ID/version.
- page_api permission alone cannot authorize page_api_read. Chrome verifies separate local R0 permission plus the real Community policy boundary. Production internal entrypoint rechecks local permission after enterprise authorization.
- MAIN caps the closed transfer at 200 rows, 160 characters per category and 32 KiB UTF-8. Worker independently validates {records:[{category,count}],total,eof}, rejects unknown/credential fields and inconsistent EOF/total, and emits at most 100 sanitized rows. A context cap downgrades complete to partial/truncated.
- Total read transaction deadline is five seconds. Stop/scope checks run around authorization and invocation; consumed run/adapter bindings cannot retry. At 256 consumed bindings a runner fails closed instead of evicting replay protection.
- The read Chrome test loads a supplemental test module into an ephemeral copy of dist-extension. It exercises the real scripting API, actual document binding, shared PermissionManager/Community policy and the production read runner/schema. It does not exercise an Ask/Act source-selection UI or the unconnected S13 internal entrypoint. Production runtime messages and model tools do not expose that test module.

## Commands and results

```sh
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/s10-xfwm4.log 2>&1 & npm run test:chrome-s10'
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome xvfb-run -a sh -c 'xfwm4 --compositor=off >/tmp/s10-discovery-xfwm4.log 2>&1 & npm run test:chrome-page-api-discovery'
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome node --experimental-websocket scripts/chrome-preview-e2e.mjs
CHROME_FOR_TESTING_BIN=/tmp/chrome-linux64/chrome npm run test:chrome-s7
```

All passed. Automated validation:

- npm run typecheck; npm run lint: passed.
- npm run test:unit: 102 files / 424 tests passed.
- npm run test:fixture and npm run test:e2e: one test each passed; source smoke is distinct from Chrome evidence.
- npx tsc -p tsconfig.build.json && node scripts/build-extension.mjs: passed; no version bump.
- npm run validate:package; npm run check:module-boundaries: passed.
- git diff --check and changed-document local link validation: passed.

## Completion boundary

Browser S10-C1–C5 is Completed for these local action/Discovery and internal read-contract fixtures. Actual site adapter support, live providers/PDP, Platform release, external review identity/tasks and S13 natural-language Page API acquisition/reinjection remain separate work. New Discovery hints never confer execution or data-read authority.
