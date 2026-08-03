# GRV Log — Exclude Vendor V8491 (Petrovich Caviar) (Design)

**Date:** 2026-08-03
**Status:** Draft v2 — Codex adversarial findings addressed; pending Victor's sign-off

## Problem

The Receiving Log dashboard (GRV Log widget) hangs on "Loading..." and
times out in production. Victor attributes it to GRV volume from vendor
Petrovich Caviar (SUPNAME `V8491`) flooding DOCUMENTS_P — and,
independent of the timeout, wants that vendor's GRVs out of the
food-safety receiving report as a standing business rule.

### Measured evidence (2026-08-03, read-only)

- Probe A — production `POST /grv-log/query`, default filters (week
  Jul 27–Aug 2 + status ne Canceled): **HTTP 200 in 11.4s**, 50 rows,
  **23 of 50 rows (46%) are Petrovich Caviar**.
- Probe B — same + vendor exclusion (UI-equivalent `CDES ne`): **HTTP 200
  in 8.9s**, 37 rows, 0 caviar rows.
- Railway HTTP logs, 14:39–14:56 and 15:36–15:40 (Victor's sessions):
  durations snowball 0.6s → 15s → 41s → 67s → 127s → … → **297s**, one
  **499** (client aborted; server kept processing). Deploy logs show the
  server's internal Priority limiter (95/min) saturated — "Rate limit
  window full" — during a **single** page load.
- Mechanism: each page load costs **~51 Priority calls** (1 main + 50
  remarks subform fetches; `disableCache: true`). One load consumes over
  half the 95/min budget. Retries/refreshes while "stuck" stack duplicate
  queries onto the saturated limiter — a self-amplifying retry storm.
  That is the timeout, not Priority-side scan cost of the week query.
- Consequence: the exclusion **helps** (fewer rows → fewer subform calls
  → ~25% less budget pressure this week, and 46% less noise) but is not a
  complete cure for timeouts under concurrent loads. Follow-up candidates
  (out of scope here): dedupe identical in-flight queries server-side,
  cap client retry behavior.

## Requirements

1. GRVs with `SUPNAME = 'V8491'` never appear in the GRV Log dashboard
   table or its Excel export; **no UI filter combination — including a
   top-level OR group — can reveal them**, and no pre-deploy cache entry
   may reintroduce them post-deploy.
2. "Petrovich Caviar" is no longer offered in the Vendor filter dropdown.
   Up to 1 hour of staleness (the `filters:grv-log` Redis TTL) is
   acceptable; selecting the stale option harmlessly returns 0 rows.
3. The exclusion keys on the stable vendor **code** (`SUPNAME`), never
   the display name (`CDES`).
4. No behavior change for other reports (customer-returns, bbd) or other
   vendors.
5. Timed before/after evidence of the exclusion's effect on load time,
   measured with the **exact shipped predicate** (`SUPNAME ne 'V8491'`),
   not the CDES stand-in. If timeouts persist post-deploy, the
   systematic-debugging investigation resumes as follow-up (retry-storm
   mechanism above) — the exclusion is not declared the fix.

## Design

### 1. Base-filter exclusion — `server/src/reports/grvLog.ts`

```ts
// WHY: Petrovich Caviar floods DOCUMENTS_P with GRVs (46% of week
// 2026-07-27 rows) and is out of scope for the food-safety receiving log
// (business rule, Victor 2026-08-03). Seeded into the base $filter so no
// UI filter combination can reveal it — query.ts and export.ts AND
// baseParams.$filter into every fetch (parenthesized, see combineFilters).
// SUPNAME (stable vendor code), not CDES (renamable display name).
export const EXCLUDED_VENDOR_SUPNAME = 'V8491';
```

In `buildQuery()`, seed the conditions array instead of starting empty:

```ts
const conditions: string[] = [`SUPNAME ne '${EXCLUDED_VENDOR_SUPNAME}'`];
```

The file's intent block gains the new export.

### 2. Parenthesized filter merge — `odataFilterBuilder.ts`, `query.ts`, `export.ts`

**(Codex finding 1, high.)** The current merge
`[base, odata].filter(Boolean).join(' and ')` is unsafe: with a top-level
OR group, OData precedence turns `base and A or B` into
`(base and A) or B`, letting any V8491 row matching `B` leak through.

New exported helper in `odataFilterBuilder.ts`, used by **both** routes:

```ts
// WHY: OData 'and' binds tighter than 'or'. Without parentheses, a base
// filter merged with a top-level OR group leaks rows: base and A or B
// == (base and A) or B. Wrap every part so the base filter always
// constrains the whole expression.
export function combineFilters(...parts: (string | undefined)[]): string | undefined {
  const present = parts.filter((p): p is string => Boolean(p));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return present.map((p) => `(${p})`).join(' and ');
}
```

`query.ts` and `export.ts` replace their inline joins with
`combineFilters(baseParams.$filter, odataFilter)`.

### 3. Export cache versioning — `services/cache.ts`, `export.ts`

**(Codex finding 2, high.)** Export pages are cached as raw Priority rows
keyed only by (reportId, filterGroup, page). A page cached *before*
deploy can serve V8491 rows for up to 15 minutes *after* deploy.

Fix: `buildExportCacheKey` gains the effective base `$filter` as key
material. Post-deploy keys differ from pre-deploy keys, so stale pages
can never be served again (self-versioning); old keys age out via the
existing 15-minute TTL. No manual invalidation step to forget.

### 4. Vendor dropdown skip — `server/src/routes/filters.ts`

In the fallback vendor-collection loop:

```ts
import { EXCLUDED_VENDOR_SUPNAME } from '../reports/grvLog';
// ...
if (row.SUPNAME === EXCLUDED_VENDOR_SUPNAME) continue;
```

Single source of truth — the literal `'V8491'` exists once, in grvLog.ts.
(filters.ts already imports grvLog for side effects; this becomes a named
import. No circular dependency.)

### 5. Tests (TDD — written first, must fail before the fix)

- `grvLog.test.ts` (new; access via `reportRegistry.get('grv-log')`):
  - `buildQuery({ page: 1, pageSize: 50 })` → `$filter` is exactly
    `SUPNAME ne 'V8491'`.
  - `buildQuery` with dates → exclusion ANDed; `$top`/`$skip` unchanged.
- `odataFilterBuilder.test.ts` (extend or create): `combineFilters` with
  a base filter and an OR expression → `(base) and (A or B)` — the Codex
  bypass case; single-part and empty cases.
- Export cache key: same filterGroup/page but different base filter →
  different keys (regression for finding 2).

### 6. Out of scope

- Generic `excludedVendors` config (one vendor, one report — YAGNI).
- Post-fetch `filterRows` exclusion (wrong layer; rows still fetched,
  corrupts page counts).
- Retry-storm hardening (in-flight query dedupe, client retry caps) —
  follow-up work, tracked separately after post-deploy measurement.

## Verification & Deploy

1. **Pre-implementation evidence: recorded above** (probes A/B, HTTP log
   storm, limiter saturation).
2. **(Codex finding 3, medium)** Before deploy: run the exact shipped
   predicate against Priority directly (credentials from `server/.env`):
   same `$select`/`$orderby`/date/status filters/page size, plus
   `SUPNAME ne 'V8491'` — timed, repeated 2–3×. CDES probe B is recorded
   as indicative only, not accepted as the performance conclusion.
3. Pre-deploy checklist: `npx tsc -b --noEmit` (client),
   `npx tsc --noEmit` (server), `npm test` (server).
4. Push to `main` → Railway auto-deploy. Deploy detection via read-only
   discriminating probe (`/api/health` has no build marker).
5. Post-deploy: timed re-probe of the default query (2–3×); assert no
   returned row has vendor Petrovich Caviar; one export spot-check
   confirms no V8491 rows; verify the Receiving Log loads at the Airtable
   embed page.
6. If slow loads/timeouts persist: resume systematic debugging on the
   retry-storm mechanism (dedupe/retry caps) as its own spec.

## Decision History

- 2026-08-03: Timeout reported. Systematic debugging Phase 1 gathered
  code-path evidence; Victor identified the V8491 GRV flood and requested
  the exclusion.
- Goal = "Both" (standing business rule + timeout-fix hypothesis) — Victor.
- Mechanism = hard exclusion, not a removable chip — Victor.
- Approach A (base-filter + dropdown skip) over B (generic config) and
  C (post-fetch filtering).
- Codex adversarial review (2026-08-03): needs-attention — OR-group
  bypass (high), export-cache leak (high), probe non-equivalence
  (medium). All three addressed in v2 (Design §2, §3; Verification §2).
- Production probes + Railway logs (2026-08-03) established the real
  timeout mechanism: rate-limiter saturation + retry storm from the
  50-calls-per-page enrichment; exclusion helps but retry-storm
  hardening is follow-up.
