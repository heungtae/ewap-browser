# ISS-20261018-004: Development diagnostic values hidden by release redaction

## Tracking

| Field             | Value                                                                               |
| ----------------- | ----------------------------------------------------------------------------------- |
| Status / updated  | Resolved for development logging scope / 2026-10-18 KST                            |
| Request           | Keep development logs unmasked; apply masking in release builds                     |
| Affected scope    | Method traces, Provider/JEV logs, diagnostic export and build/package policy        |
| Analysis baseline | `9d30fa88989b427acd6382b8e518d5f417f44ea2` plus current uncommitted logging changes |
| Related issue     | [ISS-20261018-003](2026-10-18-provider-call-correlation.md)                         |
| Fix / artifact    | Uncommitted; local development build 0.1.117                                        |
| Next verification | Separate prepared-action review failure remains; public deployment unverified       |

## Occurrence and cause

The 0.1.116 user diagnostic export linked calls correctly, but target names,
arguments and prose remained masked. Provider request/response summaries also
replaced contents with lengths and hashes. Export separately reduced request,
chat and configuration records. These policies applied to development and
release artifacts alike.

## Change and boundaries

- The builder fixes `development` or `release` in all entry bundles. Default
  `pnpm build` is development; `pnpm build:release` enables release masking.
- Development method traces preserve captured values without redaction,
  including credentials. Provider/JEV events include captured request and
  response bodies. Diagnostic exports retain prompts, captured chat events,
  configuration values and page URL/title/referrer.
- Release builds retain field/prose masking, metadata-only export and content
  response re-masking. Runtime settings cannot override a compiled release.
- Release smoke and local ZIP packaging reject unmasked development artifacts.
  `build-info.json`, trace snapshots and ZIP manifests report the diagnostic mode.
- Getters and arbitrary `toJSON` are not executed. Size/depth/retention limits
  remain explicit. Page acquisition, Provider egress, consent and execution
  authority are not changed by the diagnostic policy. Existing redacted
  records cannot be reconstructed.

## Acceptance and evidence

| ID  | Condition                               | Result                                                                                    |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| R01 | Development trace and content export    | Captured target, prompt, arguments and credentials remain visible; PASS                   |
| R02 | Development bundle                      | Captured request/chat/config/page identity values retained; tab ownership preserved; PASS |
| R03 | Release trace, export and compiled flag | Masking preserved; conflicting runtime global cannot enable development policy; PASS      |
| R04 | Release packaging                       | Development artifact rejected; masked release artifact accepted; PASS                     |
| R05 | Getter/cycle/size handling              | No getter/toJSON calls; cycles and truncation explicit; PASS                              |
| R06 | User runtime development export         | 0.1.117 export retains raw prompt, target, Provider/JEV inputs and responses; PASS          |

Tests and commands: [verification evidence](../../evidence/development-diagnostics-2026-10-18.md).

## History

- 2026-10-18: Implemented from the explicit user request. Full unit suite
  (201 files / 990 tests), fixture/E2E (2 tests), type, affected-file lint,
  module boundary, both compiled modes and actual release package checks passed.
  Final unpacked artifact is development 0.1.117. User runtime verification is pending.
- 2026-10-18 follow-up: User export for request
  `adeb6dd2-d2b2-4096-97fd-6c05541bb358` confirms development mode, unmasked
  captured values and correlated response handling. R06 passes for this supplied
  runtime sample. Existing depth/retention bounds still apply: two large request
  events truncate deep tool-schema fields and the worker reports 80,455 dropped
  records. The final prepared-action review blocks execution and is classified as
  `PROVIDER_UNAVAILABLE`; this separate behavior is not resolved by logging.
