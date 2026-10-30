# Review log: GRV receiving log from Supabase

Spec: `docs/superpowers/specs/2026-10-30-grv-supabase-design.md`

## Builder check

A fresh subagent read the spec plus copies of the relevant source files.

| # | Question | Pile | Resolution |
|---|----------|------|------------|
| 1 | Does the GRV template have headers in N–Q, and who writes the P/Q headers? | Answered already | I downloaded the template read-only. Its header row is row 4 and ends at M, so N, O and P are already headerless today; P and Q stay that way (§6.2). The check also turned up a template-lookup bug (Report ID is now the formula `100+autonumber`, value `101`), which went to the "theirs" pile. |
| 2 | What happens if Victor keeps `comments` or the condition fields out of the view? | Minor (my call) | The column is dropped from columns, filters, transformRow and export, not left blank (§5). |
| 3 | Can the pooler probe and local run happen before rollout, and with what credentials? | Minor (my call) | Code and unit tests come first. The probe and a local end-to-end run, using the real role, gate the merge (§5 build order, §6.2). |

## Fable review

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1 | Parity check skips the columns whose wire types change (pg returns `Date` and numeric as a string) (High) | Accepted | The client cells were written for Priority's shapes, so a wrong type breaks rendering and sorting quietly. | §6.2 shape contract; §7 shape tests; §8.5 compares every column |
| 2 | `/refresh` not covered (High) | Accepted | Checked `queryRefresh.ts`: it only clears caches and never fetches. | §6.2 states the refresh route is a no-op for this report |
| 3 | NULL semantics differ from the JS filter on negative operators (Medium-High) | Accepted | Parsed columns are NULL whenever a line is missing, so this is common. | §6.2 `coalesce(col,'')` rule; §7 NULL fixtures |
| 4 | Runtime Supabase failure and a pool with no error listener could crash the process (Medium) | Accepted | It would take down the Priority reports, which breaks the anti-goal. | §6.2 502 on runtime failure, pool `error` listener; §7 test |
| 5 | New runtime dependency `pg` carries deploy risk (Medium) | Accepted | One local docker build is cheap. | §8.2 docker build before the first push |
| 6 | §3/§11 said "no Airtable change" after the lookup bug was found; "gate below" pointed upward (Low) | Accepted | Contradiction | §3, §11 and §5 wording |
| 7 | Parity on "one recent week" gets noise from sync lag (Low) | Accepted | Cheap to avoid | §8.5 uses a completed past week |

## Self-audit

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1 | The `fetchRows` signature had no row limit, yet query and export each need their own cap (Medium) | Accepted | Two callers with different caps; the routes own truncation | §6.2 signature `{ limit, signal }`; routes pass cap + 1 and warn themselves |
| 2 | Connection string holds a password; TLS to the pooler is unspecified (Medium) | Accepted | A secret could leak into logs; node-postgres TLS defaults can fail or get silently disabled | §6.2: secret, never logged, `.env.example` placeholder; the probe settles TLS without disabling verification |
| 3 | The date filter needs an SQL expression, but `sqlColumn` is a "plain map" (Low) | Accepted | Storing expressions in config invites injection-shaped code | §6.2: `sqlColumn` is an identifier; the builder adds the date cast by `filterType` |
| 4 | Column types and labels were not pinned, only keys (Low) | Accepted | The client cells switch on type | §6.1 keys, labels and types match `grv-log` |
| 5 | §5 pointed at "the gate below", which is above (Low) | Accepted | Wording | Fixed with the Fable #6 change |

## Codex adversarial review

Verdict: needs-attention. Three findings. Score = how often (1–10) × how bad (1–10); under 5 means file an issue and leave the spec alone.

| # | Finding (severity) | Decision | Reason | Change made |
|---|--------------------|----------|--------|-------------|
| 1a | Remark-only edits may never reach Supabase, beyond D1's 5 minutes (high) | Accepted in part → Victor | Frequency 2 × severity 3 = 6. The real bound comes from the sync's nightly 1-day and Sunday 7/31-day windows: up to a week for GRVs under 31 days old. The fix lives in the sync, so whether that bound is acceptable is Victor's call. | §9 states the actual bound; added to Victor's questions |
| 1b | Remarks kill switch freezes parsed fields silently (high, same finding) | Deferred (issue) | Frequency 1 × severity 3 = 3 | Filed vproust-savg/priority-reports#2; §9 links it |
| 2 | Date ranges before 2026-06-28 silently return incomplete results (medium) | Accepted | Frequency 2 × severity 3 = 6. Cheap: a warning through the existing `warnings` channel, which the widget already renders | §6.2 history-floor warning; §7 tests |
| 3 | Fallback Excel moves the tracker columns out of P/Q (medium) | Deferred (issue) | Frequency 2 × severity 2 = 4. The fallback writes labelled headers, so nothing is misread; only the print layout differs. Today's broken template lookup is a separate question for Victor. | Filed vproust-savg/priority-reports#3; §9 links it |

## Changes after the reviews

| # | Change | Why |
|---|--------|-----|
| 1 | D10: the Refresh button re-reads the last 30 days through a new backend request (§5.6). It uses a `refreshSource` hook on the refresh route (§6.2) and the existing toolbar button with done/timeout/error messages (§6.4), plus tests (§7). | Victor, 2026-10-30, answering Codex #1a ("add a refresh button that refreshes the last 30 days"). It replaces the open question about late remark edits. Codex #1a is now resolved by D10. The dashboard role gains one narrow write (queueing a refresh request), deduplicated on the backend side to protect the Priority budget. |
| 2 | Filled in the delivered Supabase contract (§5): view `priority_reports.grv_receiving_log`, role `priority_reports_server`, session pooler with `sslmode=require`, refresh functions, masking, parser differences. `curdate` is a `date`, so the date filter compares directly and the reader must stop node-postgres from turning `date` into a local-time JS Date (§6.2). Refresh handles `busy` (the nightly sync window). | The GRV backend session's reply, 2026-10-30 |
| 3 | Template lookup: fixed in code with `ExportConfig.templateRecordId = 'recJluOijRUZcZnBS'`, fetched by record ID, for both GRV pages; it lands first (§6.2) | Victor, asked to choose: "i am not sure, do what you think best". I chose the record ID because it is the only key Airtable never changes (`Report ID` already did), and it needs no Airtable edit. Scored 9 × 4 = 36. |
