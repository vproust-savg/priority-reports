# Customer Returns Supabase plan: review log

Plan: `docs/superpowers/plans/2026-10-31-customer-returns-supabase.md`

The spec had no outside review. Victor skipped the brainstorming questions ("ok go"), so brainstorming wrote no design document, and the spec-review chain runs only on one.

## Fable review

| # | Finding (severity) | Decision | Reason | Change made |
|---|---|---|---|---|
| 1 | The constraint "every value is a bound param" contradicts the `'Final'` literal in Task 2 (low) | accepted | Wording fix; the literal is a code constant, not user input | The Global Constraints line now names the `'Final'` constant as the one interpolated value |
| 2 | Task 4 does not probe a remark-field filter, which the spec's verification asks for (low) | accepted | It is cheap, and the live data gives a checkable number | Added a probe, `foodSafetyConcern equals 'Yes'`, with a count from the view at the same moment |
| 3 | Importing `customerReturns` in the new test pulls in priorityClient/env at init and can fail for unrelated reasons (medium) | accepted | Hardcoding the keys is more robust and still pins the order | The test hardcodes the 17 column keys in order and no longer imports the old report |
| 4 | Task 2 is large; `fetchFilters` could be split out (note) | rejected | It is one cohesive file and native execution reviews the whole branch at the end. A split adds a gate and catches nothing new | — |
| 5 | A `files: null` → `[]` assertion is missing (low) | accepted | One line pins an existing branch | Added to the edge-row test |

## Self-audit

| # | Finding (severity) | Decision | Reason | Change made |
|---|---|---|---|---|
| 1 | Task 4's fixed count "128" will drift as new returns sync (low) | accepted | A fixed expected value would make a correct build look wrong | The expected count now comes from the view at the same moment; 128 is kept as context |
| 2 | Fallback Excel export is never exercised for the new report (medium) | accepted | The export route runs the transform plus fallback, and the `attachments` array could break it | Added an export probe to Task 4 (HTTP 200, xlsx) |
| 3 | Which Priority environment the attachment download reads locally is unstated (low) | accepted | `.env` is UAT, and UAT has no such files | Task 4 notes that `railway run` injects production creds, so downloads read Live |
| 4 | Customer dropdown dedupe when one code has two names (low) | no change | `order by cdes, custname` plus first-wins is deterministic, and the old page had the same rule | — |
| 5 | `fetchRows` receives `signal` but does not use it (low) | no change | Same as GRV; `querySupabase` has a 10 s statement timeout | — |

## Codex adversarial review

Verdict: needs-attention, with one finding.

| # | Finding (severity) | Decision | Reason | Change made |
|---|---|---|---|---|
| 1 | The floor check ignores `valueTo`. An `isBetween` with a missing, malformed or inverted end date suppresses the warning, while `sqlFilterBuilder` drops the predicate and returns all history (medium) | deferred, filed as vproust-savg/priority-reports#9 | Frequency 2 (the date UI fills both ends) × severity 2 (the rows shown are correct; only the hint about older Priority-only history is missing) = 4 < 5. GRV already has this behaviour, and the shared helper keeps it. | None |
