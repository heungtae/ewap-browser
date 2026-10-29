# S27 cross-case evaluation — first run, 2026-10-29

**FEASIBILITY_FAILED:** the first run of the separately authored
[corpus](../baselines/s27-cross/corpus.json) produced 281/288 matching phase
selections and 8/12 cases with every phase matching. All 288 native calls
returned HTTP 200. The [report](s27-cross-first-2026-10-29.json) retains each
synthetic frame, canonical native request digest, bounded parsed native response,
locally attached result, per-call status and selection. The adapter attaches
frame correlation locally; no provider echo or signature is claimed.

Each phase used a distinct request context and budget. English and Korean cases
were evaluated with both candidate orders; evidence completeness and recovery
availability were each varied for their relevant phases. Intent additionally
crossed Ask and Act modes independent of the expected category. These are
independent synthetic observations, not one continuous task or actual browser
execution. Four action requests each exercised selected-fragment user-span
binding in both candidate orders; the remaining empty-fragment cases do not
constitute argument binding evidence. Actual target binding, consent and
dispatch remain outside this test.

All seven disagreements involved `next_tool` for analysis: JEV selected
`read_table` rather than expected `interpret_data`. An independent review found
that the frames did not establish whether the already acquired dataset was
accessible to the analyst or whether materializing existing records was needed
first. The disagreements are therefore not confirmed model errors. The phase
inputs and labels should be revised before evaluating a newly authored holdout;
the existing report and its expectations must not be relabeled after the run.

The exact [runner](../baselines/s27-cross/first-live-multiphase.txt),
[fixture](../baselines/s27-cross/first-multiphase-fixture.txt),
[observations](../baselines/s27-cross/first-multiphase-observations.txt),
[vocabulary](../baselines/s27-cross/first-multiphase-vocabulary.txt),
[schedule](../baselines/s27-cross/first-multiphase-schedule.txt) and
[audit checker](../baselines/s27-cross/first-check-multiphase.txt) are retained
as historical source snapshots. The report's corpus and source digests bind
the first five; the audit checker independently reconstructed and parsed all
288 recorded synthetic requests and responses. Neither the corpus nor the
captured finite answers contains credentials or real page data.
