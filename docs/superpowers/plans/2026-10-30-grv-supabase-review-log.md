# Review log: GRV Supabase implementation plan

Plan: `docs/superpowers/plans/2026-10-30-grv-supabase.md`. Spec: `docs/superpowers/specs/2026-10-30-grv-supabase-design.md`.

## Fable review

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1 | The parity table would fail on date `equals`: the JS filter compares `…T00:00:00Z` with `YYYY-MM-DD` (High) | Accepted | Spec §6.2 says dates follow `odataFilterBuilder`, so the JS oracle is wrong for dates | Task 3: parity covers text, enum and number only; date clauses are asserted against the odataFilterBuilder semantics |
| 2 | Worktree vs the preview servers, `../.env` and the branch checkout break Task 8 (High) | Accepted | All three facts hold: `.claude/launch.json` is in the iCloud checkout, `environment.ts` reads `../.env`, and one branch can't be checked out in two worktrees | Task 8 Step 2b: remove the worktree, check out in iCloud, `npm ci`, warm, re-run the suites |
| 3 | A `refreshSource` that throws has no rule and would give a 500 (Medium) | Accepted | Without the rule the widget shows nothing | Task 4: a throw becomes 200 `{status:'error'}`, with a test |
| 4 | Subagents don't know the commit trailer (Medium) | Accepted | Required on every commit | Global Constraints line |
| 5 | Task 2's `vi.mock('pg')` mocks `types` too; there's no end-to-end check of the date parser (Medium) | Accepted | Without these changes the test would only test its own mock | Task 2 uses a partial mock; the Task 8 probe asserts `typeof curdate === 'string'` |
| 6 | Task 5 holds two reviewable units (Low) | Accepted | A reviewer could reject the polling and approve the mapping | Split into Task 5 and Task 5b |
| 7 | Task 4 tests don't cover the export 502/503 (Low) | Accepted | Step 3 promises the mapping in all three routes | Export test added |
| 8 | `name: 'GRV Log'` duplicates the old report (Low) | Accepted | It shows in `/list` and as the fallback sheet title | Renamed to `GRV Log (Supabase)` |
| 9 | Task 7 assumes `ToolbarButton` takes a `title` (Low) | Accepted | It's unverified | Task 7 Step 1: read the component first and add the prop if it's missing |

## Self-audit

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1 | There was no task to update `CLAUDE.md` for the new page, env var and date-parser trap (Medium) | Accepted | CLAUDE.md is the project memory that future sessions read | Task 8 Step 6 |
| 2 | Spec §6.2 says export also carries the history-floor warning, but an Excel download has no warnings channel (Low) | Accepted (deviation) | The user sees the warning on screen before exporting | Written down in Task 4 Step 3 as a deviation |
| 3 | The spec says enum equality is exact; the plan uses case-insensitive equality for text and enum alike (Low) | Accepted (deviation) | Dropdown values match exactly, so the results are identical. One rule matches `applyServerClientFilters` and keeps the parity table simple | Rules stated in Task 3 |

## Codex adversarial review

Verdict: needs-attention. Score = how often × how bad; under 5 means file an issue and leave the plan alone.

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1 | The record GET must send `returnFieldsByFieldId=true`, or `fields[TEMPLATE_FIELD]` is missing; the mock hid this (high) | Accepted | 10 × 4 = 40: every export would stay on the fallback. My own read-only probe used this parameter, but the plan left it out | Task 1 URL and implementation; the mock returns field-ID keys only when the parameter is present |
| 2 | A Redis outage skips `refreshSource` inside the cache try/catch (medium) | Deferred (issue) | 1 × 3 = 3 | Filed vproust-savg/priority-reports#4 |
| 3 | Number `isEmpty`/`isNotEmpty` undefined in the SQL rules (medium) | Deferred (issue) | 1 × 3 = 3; the old page skips these too | Filed vproust-savg/priority-reports#5 |
