# S27 separately authored phase evaluation — first run, 2026-10-29

**Not qualified.** A separate GPT-6.1 Sol(low) instance authored the
[12-request corpus](../baselines/s27-multiphase/corpus.json) without reading
the repository or previous results. The corpus and fixture were pinned before
the first live run. The [report](s27-multiphase-first-2026-10-29.json) records
96 native calls with HTTP 200, 94/96 matching phase selections and 10/12 cases
matching all eight phases. The two mismatches are evidence sufficiency for
`d05` and `d07`, where the expected `ACCEPT` was `REJECT`.

The exact first-run [fixture](../baselines/s27-multiphase/first-fixture.txt),
[vocabulary](../baselines/s27-multiphase/first-vocabulary.txt), and
[runner](../baselines/s27-multiphase/first-runner.txt) are preserved with
digests matching the report. No actual browser operation or approval occurred.

Independent review identified limitations that prevent promotion to the S27
gate. Every phase received both verified-goal facts and an unresolved prior
mutation, without saying whether that mutation belonged to the current task.
Consequently, the two evidence-sufficiency disagreements are not confirmed model
errors. The fixture also supplied pre-decided subgoals and verdict-like facts,
coupled language to ordering/evidence/recovery variations, and did not advance
state between phases. Only search next-tool cases checked a real argument;
empty fragments in other phases did not constitute argument verification.

Future evaluation must use phase-specific raw observations, explicit task and
dispatch identity, independently varied inputs, and a fresh independently
authored corpus. Actual multi-phase continuity and failure cases require separate
tests. This report is retained as the first attempt, not a release or live-page
qualification. The raw response and credentials are not stored.
