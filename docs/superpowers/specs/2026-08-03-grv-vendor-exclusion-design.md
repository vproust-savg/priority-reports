# GRV Log — Exclude Vendor V8491 (Petrovich Caviar) (Design)

**Date:** 2026-08-03
**Status:** Draft — pending Codex adversarial review and Victor's sign-off

## Problem

The Receiving Log dashboard (GRV Log widget) hangs on "Loading..." and
times out in production. Victor attributes it to GRV volume from vendor
Petrovich Caviar (SUPNAME `V8491`) flooding DOCUMENTS_P — and,
independent of the timeout, wants that vendor's GRVs out of the
food-safety receiving report as a standing business rule.

Context established during the (interrupted) systematic-debugging pass:

- `grv-log` sets `disableCache: true` — every page load hits Priority live.
- The default filter group (`isInWeek` date range + `STATDES notEquals
  'Canceled'`) is fully server-side: `hasClientOnlyConditions` is false,
  so the main fetch is `$top=50` per page. Raw GRV volume therefore
  inflates Priority's **scan/sort cost**, not our response size.
- An added `SUPNAME ne 'V8491'` reduces the rows Priority returns, but
  `ne` predicates typically defeat indexes — it may not reduce Priority's
  scan work. **The timeout cure is a hypothesis to verify, not a
  certainty.** The exclusion ships either way (business rule).

## Requirements

1. GRVs with `SUPNAME = 'V8491'` never appear in the GRV Log dashboard
   table or its Excel export; no UI filter combination can reveal them.
2. "Petrovich Caviar" is no longer offered in the Vendor filter dropdown.
   Up to 1 hour of staleness (the `filters:grv-log` Redis TTL) is
   acceptable; selecting the stale option harmlessly returns 0 rows.
3. The exclusion keys on the stable vendor **code** (`SUPNAME`), never
   the display name (`CDES`) — display names can be renamed in Priority.
4. No behavior change for other reports (customer-returns, bbd) or other
   vendors.
5. Timed before/after evidence of whether the exclusion resolves the
   timeout. If it does not, the systematic-debugging investigation
   resumes as follow-up work — the exclusion is not declared the fix.

## Design

### 1. Base-filter exclusion — `server/src/reports/grvLog.ts`

```ts
// WHY: Petrovich Caviar floods DOCUMENTS_P with GRVs and is out of scope
// for the food-safety receiving log (business rule, Victor 2026-08-03).
// Seeded into the base $filter so no UI filter combination can reveal it —
// query.ts and export.ts both AND baseParams.$filter into every fetch.
// SUPNAME (stable vendor code), not CDES (renamable display name).
export const EXCLUDED_VENDOR_SUPNAME = 'V8491';
```

In `buildQuery()`, seed the conditions array instead of starting empty:

```ts
const conditions: string[] = [`SUPNAME ne '${EXCLUDED_VENDOR_SUPNAME}'`];
```

Propagation is automatic: `query.ts` and `export.ts` merge
`baseParams.$filter` with the UI-derived OData filter, so the dashboard
table and Excel export are both covered by this one change. The file's
intent block gains the new export.

### 2. Vendor dropdown skip — `server/src/routes/filters.ts`

In the fallback vendor-collection loop, skip the excluded vendor before
adding its display name:

```ts
import { EXCLUDED_VENDOR_SUPNAME } from '../reports/grvLog';
// ...
if (row.SUPNAME === EXCLUDED_VENDOR_SUPNAME) continue;
```

Single source of truth — the literal `'V8491'` exists once, in grvLog.ts.
No cache-flush plumbing for the 1-hour `filters:` TTL (Requirement 2).

### 3. Tests (TDD — written first, must fail before the fix)

New `server/src/reports/grvLog.test.ts`, accessing the report via
`reportRegistry.get('grv-log')` (same pattern as bbdReport tests):

- `buildQuery({ page: 1, pageSize: 50 })` → `$filter` is exactly
  `SUPNAME ne 'V8491'` (exclusion present even with no user filters).
- `buildQuery` with `from`/`to` set → exclusion ANDed with date
  conditions, `$top`/`$skip` math unchanged.

### 4. Out of scope

- Generic `excludedVendors` config (one vendor, one report today — YAGNI;
  Approach B rejected).
- Post-fetch `filterRows` exclusion (Approach C — wrong layer: rows would
  still be fetched, zero performance effect, corrupts page counts).
- Root-cause fix for Priority-side slowness if the exclusion doesn't cure
  the timeout (follow-up under systematic debugging).

## Verification & Deploy

1. **Pre-implementation evidence (read-only):**
   a. Railway logs — recent `query_fetch` / 502 entries for grv-log:
      real durations, and which phase fails (Priority fetch vs enrichment).
   b. Timed probe A: production `POST /api/v1/reports/grv-log/query` with
      the default filter group (reproduces the user-visible hang).
   c. Timed probe B: same request plus a vendor-exclusion condition
      (UI-equivalent `CDES ne 'Petrovich Caviar'`, or a direct Priority
      probe on `SUPNAME` if credentials are available locally) —
      simulates the fix without deploying.
2. Pre-deploy checklist: `npx tsc -b --noEmit` (client),
   `npx tsc --noEmit` (server), `npm test` (server).
3. Push to `main` → Railway auto-deploy. Deploy detection via a read-only
   discriminating probe (`/api/health` has no build marker).
4. Post-deploy: timed re-probe of the default query; spot-check that no
   returned row has vendor "Petrovich Caviar"; verify the Receiving Log
   loads at the Airtable embed page (iframe behavior can differ).
5. If probe B or the post-deploy probe still times out: resume Phase-1
   debugging (prime suspect: `STATDES ne 'Canceled'` scan cost inside
   Priority; secondary: shared 100 calls/min budget contention from the
   50-per-page subform enrichment).

## Decision History

- 2026-08-03: Timeout reported. Systematic debugging Phase 1 gathered the
  code-path evidence above; production probes were pending when Victor
  identified the V8491 GRV flood and requested the exclusion.
- Goal = "Both" (standing business rule + timeout-fix hypothesis) — Victor.
- Mechanism = hard exclusion, not a removable chip — Victor. Rationale:
  business rule; nobody should re-enable the slow view by deleting a chip.
- Approach A (base-filter + dropdown skip) chosen over B (generic config —
  speculative) and C (post-fetch filtering — wrong layer).
- Codex adversarial review requested by Victor before sign-off.
