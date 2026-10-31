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

## Not yet verified (gated on the password reaching the local `.env`)
- Live probe with the real role (row count, `typeof curdate === 'string'`, `SET statement_timeout` accepted).
- Local end-to-end in the browser (rows, tracker columns, dropdowns, refresh, export P/Q).
- Parity with the old page on a completed past week, and speed (old ~51 Priority calls vs new).

## Rulings
See the controller ledger summary in the hand-off message; each is also recorded in the spec/plan review logs where it changed a document.

## Issues filed
#2, #3, #4 (from spec/plan reviews), #6, #7 (deferred build minors), #8 (pre-existing refresh error on other widgets). #5 fixed on this branch (number isEmpty → IS NULL).
