# S25 built-in Jev routing — 2026-10-14

Scope: Browser-local implementation and controlled verification. C1–C6 are
connected; C7 live model-pair qualification remains pending.

Revision: worktree based on `946d46d93d7c49c7586b0d508c4d49f9b4b23bcd`.
The worktree already contained unrelated S22–S24/Provider/collection changes.
This is combined-worktree evidence, not evidence for an isolated commit or release.
Extension/package version stayed `0.1.109`; packaging did not run the version bump.

## Implemented entry points

- Settings: [schema/migration](../../extension/src/settings/provider-state.ts),
  [serialized writes and roles](../../extension/src/settings/provider-settings.ts),
  [Options role controls](../../extension/src/settings/provider-role-controls.ts).
- Native contract: [Jev client](../../extension/src/providers/jev-client.ts),
  [request validator](../../extension/src/providers/jev-task-validation.ts),
  [response validator](../../extension/src/providers/jev-response.ts),
  [question templates](../../extension/src/providers/decision-questions.ts).
- Lifetime: [request bindings](../../extension/src/providers/model-bindings.ts),
  [invalidation before settings publication](../../extension/src/providers/provider-write-binding.ts),
  [decision coordinator](../../extension/src/providers/decision-coordinator.ts).
- Worker: [disclosure boundary](../../extension/src/service-worker/model-decision.ts),
  [Ask classification/direct answer/result selection](../../extension/src/service-worker/ask-model-decision.ts),
  [prepared plan/proposal review](../../extension/src/service-worker/prepared-task-review.ts),
  [workflow](../../extension/src/service-worker/workflow-model-decision.ts),
  [element](../../extension/src/service-worker/act-element-assessment-turn.ts),
  [action](../../extension/src/service-worker/model-action-decision.ts),
  [goal](../../extension/src/service-worker/model-goal-decision.ts).

Jev judgments enter typed domain validation without fabricated assistant tool
calls. Original primary tool results retain their IDs. Existing approval,
preflight, original-workflow reads and fresh-observation checks remain required.
A primary-only request keeps its streaming/completion path and sends no TypeSafe
requests. An invalid optional Jev record remains repairable and does not poison
an independently valid primary record.

## Executed checks

| Check                                                  | Result                                                                                                                           |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                       | PASS                                                                                                                             |
| `pnpm lint`                                            | PASS — ESLint and repository formatting                                                                                          |
| `pnpm check:module-boundaries`                         | PASS — 402 TypeScript modules                                                                                                    |
| `pnpm test:unit`                                       | PASS — 197 files / 976 tests                                                                                                     |
| S25-specific unit coverage                             | PASS — 58 tests across native contract, settings, gates, routing and Worker judgments                                            |
| `pnpm test:fixture`                                    | PASS — 1 test                                                                                                                    |
| `pnpm test:e2e`                                        | PASS — 1 test                                                                                                                    |
| Version-preserving TypeScript/build/package validation | PASS                                                                                                                             |
| `pnpm test:chrome-s25`                                 | PASS — 7 controlled Chrome checks                                                                                                |
| `pnpm check:source-size`                               | FAIL — existing oversized files remain, including edited legacy runners; new S25 source/test/script modules stay below 200 lines |

Controlled Chrome: Chrome for Testing `147.0.7727.15`, headless Linux, isolated
temporary profile, two HTTPS fixture hosts, dummy fixture credentials and an
explicit temporary Full approval policy for dual-path checks. No real user
profile or live Provider credentials were used.

[Machine-readable controlled report](s25-jev-routing-2026-10-14.json) and
[Options screenshot](s25-provider-settings-2026-10-14.png) record:

1. Primary-only Ask with zero native contact.
2. Native finite Ask without a primary chat call.
3. A real primary read-tool result under its original ID, followed by native
   result selection and publication of the prepared answer.
4. Native Act intent/goal decisions, existing approval checks and exactly one
   local Save dispatch.
5. A configured native HTTP 503 failure with primary fallback; rejected private
   input is absent from the Panel. The first fixture failure remains in the report.
6. Routing disabled with zero native requests.
7. Options kind-specific fields, role filtering, write-only key presentation and
   established form spacing; the native form actually hides chat Wire API.

Unit coverage also checks missing/unselected/incomplete/disabled Jev under both
failure policies; null/missing/extra optional records; legacy IDs/secrets/headers;
secret-boundary changes; stale/concurrent edits; role deletion; malformed Choice,
Noul and Score answers; low routing/verdict certainty; insufficient evidence;
response bounds/body timeout; cancellation and late-result rejection; no-progress
termination; raw UNKNOWN receipt preservation and stale observations. A failure
before dispatch preserves the approved primary plan; a failure after dispatch
blocks any further mutation at the dispatch boundary.

## Qualification limits and pending work

No TypeSafe key was available in the execution environment, so **real Jev plus
primary-model pairing is UNVERIFIED**. The fixtures implement response contracts;
they do not measure model accuracy. Existing OpenRouter availability does not
establish a qualified Jev pair.

Pending C7: Korean/English holdouts; reordered-choice and adversarial-page semantic
accuracy; live script/component/workflow/Page Method continuations; live denied
consent/two-host/config-edit/navigation/restart/lost-response cases; and comparable
primary-only/dual false completion, routing accuracy, call count, usage and latency.
The 0.8 routing and 0.9 verdict/sufficiency gates are implementation experiment
floors, not qualified production accuracy guarantees. No cost or speed improvement
is claimed. Exact calculations and generated text/plans/arguments remain primary
or code work; Jev does not create mutation authority or prove server persistence.

Platform integration, Windows, public distribution and unrelated S22–S24 live
qualification are outside this record. Installation/qualification instructions
are in [the test guide](../test.md).

The native wire contract was checked against the
[official TypeSafe OpenAPI](https://api.typesafe.ai/openapi.json).
