# S27 v2 evaluation without numerical thresholds — 2026-10-28

At the user's direction, the 0.9 confidence, selected-probability and
evidence-sufficiency acceptance thresholds were removed. These values remain
recorded, while frame/candidate/model binding, response schemas, probability
distribution validity, incomplete-state handling and fragment checks remain in
effect. Returned `UNKNOWN`, `INSPECT_MORE`, `NEED_INPUT` and `UNSUPPORTED`
retain their control meanings; a syntactically valid response does not itself
authorize browser dispatch or bypass consent.

The [new live report](s27-v2-no-threshold-2026-10-28.json) records 12/12
native and accepted outcomes matching the previously used synthetic v2 cases.
The two cases with an explicit conservative expected outcome still require
`UNKNOWN` or `INSPECT_MORE`; they are not unlabeled cases. A separate unit
check verifies that an unlabeled case accepts a nonempty response, whereas a
missing response or an error does not pass. Labeled cases must still match.

The run used the existing interactive-shell credential, revision `764ac9e88`
with uncommitted v2 and acceptance changes, and
`S27_V2_REPORT=/tmp/s27-v2-no-threshold-20261028.json pnpm test:s27:v2`.
The checked report binds the frozen corpus, bundled controller source and
runner digests and contains no credential or raw provider response.

This is another run of a corpus already inspected and evaluated; it is not an
independent holdout, live-page execution, or complete S27 acceptance. Previous
[threshold-gated results](s27-v2-live-2026-10-28.md) are retained as historical
evidence. Removing the thresholds changes how decisions proceed and does not
establish their semantic correctness on unknown tasks.
