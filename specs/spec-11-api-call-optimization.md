# Spec 11: Priority API Call Optimization

## Problem

The dashboard wastes API calls due to patterns established when MAXAPILINES was 2,000. The 100 calls/minute limit is **shared across all Priority users** — every unnecessary call impacts everyone on the system.

The worst offender is the GRV Log report: it makes 1 API call per row to fetch subform data (the N+1 pattern). A 50-row page load costs 51 API calls. An export of 1,000 rows costs 101 calls — more than the per-minute limit allows.

## Solution

Four targeted changes, ordered by impact:

1. **GRV Log** — Replace per-row subform fetching with `$expand` + nested `$select` (51 calls → 1)
2. **HTTP header** — Raise `maxpagesize` from 1,000 to 49,900 (matches MAXAPILINES=50,000)
3. **Export endpoint** — Cache-first fetching + raise row cap from 5,000 to 100,000
4. **Filter queries** — Cache reference data with 1-hour TTL instead of 5 minutes

## Background: What Changed

MAXAPILINES (Priority system constant) was raised from 2,000 to 50,000. This unlocks:
- `$expand` on DOCUMENTS_P — previously truncated responses, now returns complete data (verified via benchmarking: 200 rows with subform, byte-for-byte identical to two-step approach)
- Larger page sizes via `$top` — can fetch up to 5,000 rows with `$expand` per call without hitting the 3-minute timeout
- The `Prefer: odata.maxpagesize` header was set to 1,000 as a safety measure that's now unnecessarily restrictive

## Detailed Changes

### 1. GRV Log — Replace N+1 Subform Fetching with `$expand`

**Current pattern (N+1):**
```
GET DOCUMENTS_P?$select=DOCNO,TYPE,...&$top=50         → 1 API call
GET DOCUMENTS_P('DOCNO','TYPE')/DOCUMENTSTEXT_SUBFORM  → 1 API call per row
                                                        = 51 calls for 50 rows
```

**New pattern (single call):**
```
GET DOCUMENTS_P?$select=DOCNO,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN
   &$expand=DOCUMENTSTEXT_SUBFORM($select=TEXT)
   &$top=50                                             = 1 API call for 50 rows
```

**Why `transformRow` needs ZERO changes:**
- `transformRow` takes one argument: `raw` (not two arguments)
- It reads `raw.DOCUMENTSTEXT_SUBFORM` as a property on the row object (line 144)
- Currently, `enrichRows` writes subform data onto the same property: `row.DOCUMENTSTEXT_SUBFORM = result`
- With `$expand`, Priority puts the subform data on the same property name: `row.DOCUMENTSTEXT_SUBFORM = { TEXT: "..." }` or `null`
- Same property, same shape → `transformRow` works as-is

**Files to modify:**

`server/src/reports/grvLog.ts`:
- Add `$expand: 'DOCUMENTSTEXT_SUBFORM($select=TEXT)'` to `buildQuery()` returned params
- Drop `TYPE` from `$select` — it was only needed for the composite key lookup in `querySubform()` (see comment on line 69-70). `TYPE` is not used by `transformRow` or in the output.
- Remove the `enrichRows` function entirely (lines 89-141)
- Remove the module-level `subformCache` Map (lines 83-84)
- Remove `SUBFORM_CACHE_MAX`, `BATCH_SIZE`, `BATCH_DELAY_MS` constants
- Remove `enrichRows` from the `reportRegistry.set()` call (line 170) — omitting it makes all three route handlers skip the enrichment step automatically
- Remove the `import { querySubform }` and `import { escapeODataString }` if no longer used
- Keep `transformRow` unchanged — it already reads `raw.DOCUMENTSTEXT_SUBFORM`
- Update the file's intent block comment (line 3-4) to reflect the new single-call pattern

**CRITICAL: Route handlers must pass `$expand` through to `queryPriority`:**

The three route handlers construct query params differently:

| Route | File | How it builds params | `$expand` status |
|-------|------|---------------------|-----------------|
| `GET /:reportId` | `reports.ts:89-90` | Passes full `oDataParams` object from `buildQuery()` | ✅ Already works — passes all fields |
| `POST /:reportId/query` | `query.ts:94-100` | Cherry-picks `$select`, `$orderby`, `$filter`, `$top`, `$skip` | ❌ **Missing** — must add `$expand: baseParams.$expand` |
| `POST /:reportId/export` | `export.ts:65-71` | Cherry-picks `$select`, `$orderby`, `$filter`, `$top`, `$skip` | ❌ **Missing** — must add `$expand: baseParams.$expand` |

`server/src/routes/query.ts` (line 94-100):
- Add `$expand: baseParams.$expand` to the `queryPriority()` params object

`server/src/routes/export.ts` (line 65-71):
- Add `$expand: baseParams.$expand` to the `queryPriority()` params object

**Stale comments to update:**
- `reports.ts` line 97: "Some reports need sub-form data that can't use $expand (e.g. GRV Log)" → update to reflect that `$expand` now works
- `grvLog.ts` line 86-88: "Priority's $expand truncates responses on DOCUMENTS_P" → remove this outdated comment

`server/src/services/priorityClient.ts`:
- Keep `querySubform()` — other entities may still need it
- No changes needed

**Impact:** 51 calls → 1 call per page load. 101 calls → 1 call per 1,000-row export page.

### 2. Raise `maxpagesize` Header to 49,900

**File to modify:**

`server/src/services/priorityHttp.ts` (line 29):
- Change `'Prefer': 'odata.maxpagesize=1000'` to `'Prefer': 'odata.maxpagesize=49900'`

**Why 49,900:** Safety margin below the 50,000 MAXAPILINES cap, same principle as the rate limiter using 95 instead of 100.

**Behavior:** This header sets the ceiling — actual page size is still controlled by each report's `$top` parameter. No report behavior changes unless it explicitly requests more than 1,000 rows (which the export endpoint will).

**Bonus fix:** BBD's `fetchFilters` queries SUPPLIERS with `$top: 1000`. With `maxpagesize=1000`, Priority could silently truncate even that. Raising to 49,900 eliminates silent truncation on all filter queries.

### 3. Export Endpoint — Cache-First + Raise Row Cap

**Current behavior:**
- `createExportRouter()` takes no arguments — no `CacheProvider` dependency (line 30)
- Always fetches fresh from Priority API
- Fetches in 1,000-row batches (`PAGE_SIZE = 1000`)
- Hard cap at 5,000 rows (`ROW_CAP = 5000`)
- On truncation: returns HTTP 400 error with no file (lines 90-95)
- Response is binary file download (`res.send(Buffer)`) — NOT JSON

**New behavior:**

`server/src/routes/export.ts`:
- **Inject CacheProvider:** Change `createExportRouter()` to `createExportRouter(cache: CacheProvider)` — same pattern as `createQueryRouter(cache)`
- **Update call site:** `server/src/index.ts` must pass `cache` to `createExportRouter(cache)`
- **Larger batches:** Change `PAGE_SIZE` from 1,000 to 5,000 (matches optimal `$top` from benchmarking)
- **Raise cap:** Change `ROW_CAP` from 5,000 to 100,000
- **Cache-first fetch loop:** Before each page fetch, check Redis. If cached, use it. If not, fetch from Priority and write to cache.
- **Truncation via response header:** Since the response is a binary file download, embed truncation signal in a custom response header `X-Export-Truncated: true` instead of a JSON field. Change the current HTTP 400 error (lines 90-95) to: still send the file, but set the header before `res.send(excelBuffer)`.
- **Update truncation error message** (line 92) to reflect new 100,000 cap

**Cache key format:**
- `export:{reportId}:p{page}:s5000:{filterHash}` — uses `stripIds()` from `cache.ts` for filter hash stability
- Export pages (5,000 rows each) and dashboard pages (50 rows each) are separate cache entries
- Primary benefit: repeated exports with the same filters are instant (cached 15 min)
- Add `buildExportCacheKey(reportId, filterGroup, page)` to `cache.ts`, reusing the existing `stripIds()` helper

**Frontend change:**

`client/src/components/widgets/ReportTableWidget.tsx` (or wherever export download is triggered):
- After receiving the export response, check `response.headers.get('x-export-truncated')`
- If `'true'`, show a warning toast: "Export limited to 100,000 rows. Apply more filters to narrow results."

### 4. Cache Filter Queries with 1-Hour TTL

**Current behavior:**
- SUPPLIERS, FAMILY_LOG, SPEC4VALUES fetched fresh every time filter panel opens
- 5-minute TTL (bare `300` literal at `filters.ts` line 102)
- 3 API calls per filter load

**New behavior:**

`server/src/routes/filters.ts` (line 102):
- Change `cache.set(cacheKey, response, 300)` to `cache.set(cacheKey, response, 3600)`
- These are reference/lookup data (supplier names, product families, spec values) that change very rarely
- The existing `/refresh` endpoint invalidates by prefix (`filters:{reportId}`), so manual refresh still clears stale filter data when needed

**Edge case — BBD `familyLookupMap` on cold restart:**
BBD's `fetchFilters()` has a side effect: it populates a module-level `familyLookupMap` used by BBD's `transformRow` to resolve family codes to names. With a 1-hour cache:
- After server restart, Redis still has cached filters (TTL hasn't expired)
- Filter route serves from cache → never calls `fetchFilters()` → `familyLookupMap` stays empty
- BBD's `transformRow` produces missing family names for up to 1 hour

**Fix:** In `server/src/reports/bbdReport.ts`, check if `familyLookupMap` is empty at the top of `transformRow`. If empty, return the raw family code instead of `null`. The map will be populated on the next cache miss (at most 1 hour). Alternatively, add a startup initialization that populates the map independently of the filter cache. The implementation plan should decide which approach is simpler.

## What's NOT Changing

- **BBD report** — Working fine with small dataset, no pagination needed
- **Rate limiter** — Keeping 95/min with 200ms spacing (fewer calls = more headroom)
- **`querySubform()` function** — Stays in `priorityClient.ts` for entities that need it
- **`transformRow` in grvLog.ts** — Already reads `raw.DOCUMENTSTEXT_SUBFORM`, no changes needed
- **Frontend data fetching hooks** — `useReportQuery` and `useFiltersQuery` stay the same
- **Cache TTLs for report data** — 5 min for GET, 15 min for POST query (unchanged)
- **Server-side pagination logic** — Same approach, just fewer API calls per page

## Impact Summary

| Scenario | Before | After | Savings |
|----------|--------|-------|---------|
| GRV Log page load (50 rows) | 51 API calls | 1 call | 98% fewer calls |
| GRV Log export (1,000 rows) | 101 calls | 1 call | 99% fewer calls |
| GRV Log export (40,000 rows) | Impossible (4,001 calls) | 8 calls | Now possible |
| Filter panel open (cached) | 3 calls | 0 calls | 100% fewer calls |
| Filter panel open (cold) | 3 calls | 3 calls (cached 1hr) | Same, but cached 12x longer |

## Testing Strategy (TDD)

Tests should be written BEFORE implementation to establish baseline behavior, then verified after changes.

### Phase 1: Characterization Tests (before any code changes)

These prove current behavior works and establish a safety net:

1. **`transformRow` with complete subform** — Given a row with `DOCUMENTSTEXT_SUBFORM: { TEXT: "<html>Driver ID: ABC123..." }`, verify all 7 remark fields are correctly extracted (driverId, licensePlate, truckTemp, productTemp, productCondition, truckCondition, comments).

2. **`transformRow` with null subform** — Given a row with `DOCUMENTSTEXT_SUBFORM: null`, verify all 7 remark fields are `null` and the row still contains date, docNo, vendor, warehouse, status, total, receivedBy.

3. **`transformRow` with empty TEXT** — Given `DOCUMENTSTEXT_SUBFORM: { TEXT: "" }`, verify all 7 remark fields are `null`.

4. **`parseGrvRemarks` edge cases** — Lines without colons are skipped. Unknown keys are ignored. HTML entities are decoded. `<br>` with `data-*` attributes converts to newlines.

### Phase 2: Shape Compatibility Tests

5. **`$expand` shape matches enrichRows shape** — Given a mock row exactly as `$expand` returns it (with `DOCUMENTSTEXT_SUBFORM` as a direct property), verify `transformRow` produces identical output to the current enrichRows+transformRow pipeline. This is the critical test that proves the change is safe.

6. **`$expand` null vs missing** — Verify `transformRow` handles both `DOCUMENTSTEXT_SUBFORM: null` (no subform record) and `DOCUMENTSTEXT_SUBFORM` being `undefined` (property missing from response). Both should produce null remark fields.

### Phase 3: Export Tests

7. **Export pagination terminates correctly** — With `$top=5000`, verify the fetch loop terminates when `lastPageSize < PAGE_SIZE` and when `ROW_CAP` (100,000) is hit.

8. **Export truncation header** — When row cap is hit, verify `X-Export-Truncated: true` header is set and the file is still sent (not an error).

9. **Export cache-first** — When cached pages exist, verify they're reused and only missing pages trigger API calls.

### Phase 4: Filter Cache Tests

10. **Filter TTL is 3600s** — Verify `cache.set` is called with TTL=3600 for filter responses.

11. **BBD familyLookupMap graceful degradation** — After cold restart with cached filters, verify BBD transformRow doesn't produce `null` for family names (falls back to code or triggers population).

## Files Changed Summary

| File | Change |
|------|--------|
| `server/src/reports/grvLog.ts` | Add `$expand` to buildQuery, drop `TYPE` from `$select`, remove `enrichRows` + subformCache + constants, remove `enrichRows` from registry, update comments |
| `server/src/services/priorityHttp.ts` | `maxpagesize` 1000 → 49900 (line 29) |
| `server/src/routes/query.ts` | Add `$expand: baseParams.$expand` to queryPriority call (line 94-100) |
| `server/src/routes/export.ts` | Accept `CacheProvider`, add `$expand` passthrough, cache-first fetch, $top=5000, 100K cap, truncation header |
| `server/src/routes/reports.ts` | Update stale comment about $expand (line 97) |
| `server/src/routes/filters.ts` | TTL 300 → 3600 (line 102) |
| `server/src/services/cache.ts` | Add `buildExportCacheKey()` utility |
| `server/src/index.ts` | Pass `cache` to `createExportRouter(cache)` |
| `server/src/reports/bbdReport.ts` | Handle empty `familyLookupMap` gracefully in transformRow |
| `client/` (export trigger) | Read `X-Export-Truncated` response header, show warning toast |
