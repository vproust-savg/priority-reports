# Build log: GRV receiving log from Supabase

Branch `feat/grv-supabase` (worktree `~/worktrees/priority-reports-grv-supabase`, outside iCloud). Built 2026-10-30/31 by subagents, one task at a time, with a Claude review on every task, Codex per phase, a final whole-branch review on the most capable model, and one Codex high pass. Not pushed, not merged.

## Commits
| Task | Commits | Review |
|---|---|---|
| 1 Template lookup by Airtable record ID | 8803aee | clean |
| 2 pg pool | 4d85e91 | clean |
| 3 FilterGroup → SQL | 86122e3 | clean (opus) |
| 4 Report hooks + routes | dad387b, 3a065e7 | clean; Codex P1 (clientSidePagination ignored) fixed |
| 5 grv-log-supabase report | b4b8c18 | clean |
| 5b History floor + 30-day refresh | ee622d6 | clean |
| 6 Hidden page | 65947b5 | 1 parked (all-hidden department fallback, 1×2) |
| 7 Refresh outcome UI | 34c99c7, 6b996f1 | 1 fix round (overlapping clicks) |
| Final fix wave | 50aa359, 9bed15a, 979d79b | re-review 4/4 addressed |
| Docs | 534d604 + this log | — |

## What the final review caught
- **TLS (critical, 10×8).** node-postgres treats `sslmode=require` as verify-full, and Supabase Root 2021 CA isn't in Node's store, so every connection would have failed after deploy (`SELF_SIGNED_CERT_IN_CHAIN`). Fixed by pinning the root CA in `server/src/config/supabaseRootCa.ts` (SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, expires 2031-04-26) and stripping the URL's ssl params in `buildPoolConfig`. Proof without the password: a dummy-password connect from inside the rebuilt production image now fails with `password authentication failed` (TLS validated) instead of a certificate error.
- **Refresh failures looked like success (Codex P2, 2×3).** A non-2xx response, an unreadable body, or a network error now shows "Refresh could not be confirmed; showing the last synced data", and the table still reloads.

## Verified
- Server 507/507, client 186/186 (run twice), both `tsc` clean, lint unchanged at 10 pre-existing problems.
- `docker build` OK. Booting the image without `SUPABASE_GRV_DATABASE_URL`: health 200, `grv-log-supabase` answers 503 "Supabase is not configured for this report", all 4 reports listed, the hidden URL serves.

## Live checks (2026-10-31)
The URL lives only in Railway (Victor's ruling, 2026-10-31). Every live check ran with `railway run -p ba2225e5-2792-4708-aa66-d3b178cfb8d0 -e production -s priority-reports -- …`, so the secret never reached a file or a transcript. Nothing called `request_grv_refresh()`.
- **Probe through `priority_reports_server`:** TLS with the pinned root passes. The view holds 850 GRVs (2026-06-29 to 2026-10-30). `curdate` is a string and `totprice` a number. `statement_timeout` is `10s`.
- **Startup-parameter timeout:** Supavisor ignores `statement_timeout` sent at login (the role default `15s` applied, and `pg_sleep(11)` completed). The SET stays. It used to run unawaited from the pool's `connect` event, which raced the first query (pg deprecation warning). Fixed in f8bd2fd: the SET is awaited once per client on checkout. Server 509/509, `tsc` clean, warning gone live.
- **Local end-to-end** (`grv-wt-backend` / `grv-wt-frontend` in the local `.claude/launch.json`):
  - the hidden page renders with no nav tab and no console errors;
  - vendor, tracker and isEmpty filters work, and the history-floor warning shows for a range before 2026-06-28;
  - template-mode export: Airtable template fetched by record ID, Temp Tracker Included in column P, Accepted in Q.
- **Parity, 2026-10-18..24 vs `grv-log` on Priority production:** 30/30 GRVs and all 16 shared columns identical. Only the within-day row order differs: the new page sorts date then GRV # descending; the old one keeps Priority's order.
- **Speed for that week:** old 8.0 s, new 0.14 s warm. The first load after boot takes about 1.5 s (TLS and connect).
- **Open:** `temp_tracker_accepted` is NULL on all 850 rows. It may only be because the "Temp Tracker Accepted" line was added to the form on 2026-10-30. Backend boss has been asked to confirm against the raw remarks; the dashboard can't read them.
- **Not exercised live:** the Refresh button. It queues a 30-day Priority re-read, so it's left to unit tests and the first production use.

## Rulings
See the controller ledger summary in the hand-off message; each is also recorded in the spec/plan review logs where it changed a document.

## Issues filed
#2, #3, #4 (from spec/plan reviews), #6, #7 (deferred build minors), #8 (pre-existing refresh error on other widgets). #5 fixed on this branch (number isEmpty → IS NULL).
