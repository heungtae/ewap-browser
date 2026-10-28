# S27 clarified development examples — 2026-10-28

The [exploration](../../scripts/s27/clarified-exploration.mjs) replaces the
ambiguous questions for this separate development run with eight paired,
explicitly scoped questions. It does not change the frozen corpus, the original
controller question, production behavior or the existing activation gate.
Ambiguous original cases are not used as scored cases in this exploration.

On 2026-10-28 the existing interactive-shell credential was used to call native
`jev-1.13.0` on revision `e65ba2fab` with uncommitted exploration and analysis
changes. The [sanitized second report](s27-clarified-exploration-2026-10-28.json)
records eight out of eight expected native selections: deterministic read and
complex interpretation; date control and current result collection; runtime
aggregation and interpretation; stop without a safe observation and inspect
when one is explicitly available. Confidence ranged from 0.59 to 1.0 and
evidence-sufficiency values from 0.27 to 0.46. Values are recorded separately;
this exploration scores the chosen label only.

The [first run](s27-clarified-first-2026-10-28.json) also selected all eight
expected values. It did not retain source or request digests. The second run
added corpus, bundle, script and per-request digests after review; it is a
repeat of the development examples, not a new independent evaluation.

These examples were constructed after inspecting the prior holdout and use its
scenario frames. They are development data, not an independent holdout. The
question is overridden in this harness while the underlying frame schema still
uses `controller-v1`; it is not a released controller template version. A
successful selection is not evidence of safe argument binding, actual browser
dispatch, consent, or correct handling of unseen or insufficient-evidence
cases. It does not change the prior 0/12 gated result. A separate versioned
implementation and independently frozen evaluation are needed before any
qualification claim.

Run from an interactive shell with the supported credential environment using
`pnpm test:s27:clarified`. Results are saved by default to
`/tmp/s27-clarified-exploration.json`; `S27_EXPLORATION_REPORT` overrides the
path. The runner writes only finite selections, numerical scores and sanitized
errors, never the credential or raw response.
