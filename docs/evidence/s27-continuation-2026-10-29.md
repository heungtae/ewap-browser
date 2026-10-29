# S27 live continuation — 2026-10-29

**S27 remains In Progress.** After the user removed numeric thresholds, the
original v1 frozen corpus was rerun against native `jev-1.13.0`. The
[sanitized report](s27-v1-current-2026-10-29.json) records 96 HTTP 200 calls,
76/96 matching decisions and 2/12 fully matching cases. The 20 mismatches were
8 recovery, 2 intent, 4 semantic selection, 4 processor and 2 semantic relation.
The original labels and prior failed reports were not altered. Several labels
are known to be ambiguous; the user has authorized excluding such cases from
a new evaluation, not silently changing the historical result.

A separately prompted GPT-6.1 Sol(low) instance authored a new
[12-request corpus](../baselines/s27-independent/corpus.json) without reading
repository files or previous outcomes. The corpus was saved and SHA-256 pinned
before the first live call. The [report](s27-independent-intent-2026-10-29.json)
records 12/12 correct intent selections and 12 HTTP 200 responses. Separately,
the fixture checked deterministic user-span binding of four synthetic search
identifiers; this check was not connected to the selected candidate's arguments.
Six requests are in
Korean and six in English, and candidate ordering alternates. The model saw
opaque task IDs, requests and generic candidate descriptions, not the labels.

Reproduce the bounded evaluation with `pnpm test:s27:independent` in the
credential-bearing interactive shell; `pnpm check:s27:independent` validates
the saved first report against corpus, source and runner hashes. This tests
intent and a separate user-span normal path; it did not bind arguments to the
selected candidate or test full multi-phase plans,
semantic relation, tool execution, real pages, approval or dispatch. It cannot
replace S27-R05/R06 in full, nor establish S33 or production readiness. Further
separately authored, unambiguous multi-phase cases and the applicable runtime
checks remain required before marking S27 complete.

## Selected-fragment binding continuation

A [subsequent real JEV run](s27-independent-binding-2026-10-29.json) tested the
four independently authored search requests in English and Korean. Each selected
the registered `search_form` fill fragment; `bindFragment` bound the fragment's
`query` to the exact user span. A different, independently valid user span was
then rejected by `bindFragment` as `ARGUMENT_SOURCE_CHANGED`. All four matched
with HTTP 200. This is one next step only: no form
submission, verification, real browser dispatch or user approval occurred.
`pnpm check:s27:independent-binding` checks the report and its corpus, bundled
source and runner digests.

The [first](s27-independent-binding-first-2026-10-29.json) and
[second](s27-independent-binding-second-2026-10-29.json) attempts are retained.
They returned 4/4, but their candidate description incorrectly included submit
and verification even though its executable fragment contained only a fill step.
The [third](s27-independent-binding-third-2026-10-29.json) corrected the
description, but its changed-source negative case used an invalid span and did
not exercise the fragment's source-digest comparison. After review, the
[fourth](s27-independent-binding-fourth-2026-10-29.json),
[fifth](s27-independent-binding-fifth-2026-10-29.json),
[sixth](s27-independent-binding-sixth-2026-10-29.json), and final reports used
valid alternate spans and each returned 4/4. Later repetitions followed runner
refactoring and size/format fixes, not new holdouts. All attempts used the same
requests and are not independent holdouts of each other.
This additional evidence addresses selected-candidate binding, but the wider
multi-phase qualification remains open.
