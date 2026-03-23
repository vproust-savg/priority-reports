# Spec 10: Cache Strategy & Loading UX Optimization

## Problem

The dashboard feels broken when filters change. The two-phase loading system (quick query + 15-20s base dataset) provides no visual feedback during loading. `keepPreviousData` silently shows stale data, making it impossible to tell if a filter change registered. Users think the app is frozen.

## Solution

1. **Remove two-phase loading** — single server-side query per filter change (~3-5s with enrichment)
2. **Show skeleton** during every filter-triggered fetch so users know it's loading
3. **15-minute Redis cache** with manual refresh button — repeat queries are instant
4. **Pre-cache current week on server startup** — first load is instant
5. **Server-side post-enrichment filtering** for client-only columns (driver ID, temps, etc.)

## Architecture Change

### Current (two-phase)
```
Filter change → Quick query (50 rows, 1s) → Show partial data
             → Base query (1000 rows, 15-20s) → Switch to full dataset
             → Client-side filtering from base dataset
```

### New (server-side only)
```
Filter change → Show skeleton → Server query (50 rows + enrichment, 3-5s)
             → Server applies OData filters + post-enrichment filters
             → Returns filtered, paginated, enriched data → Show table
             → Cached for 15 min → repeat filter = instant
```

## Detailed Changes

### 1. Remove Two-Phase Loading (Client)

**Delete files:**
- `client/src/hooks/useBaseDataset.ts`
- `client/src/hooks/useFilteredData.ts`
- `client/src/components/LoadingBar.tsx` (designed for two-phase, skeleton replaces it)

**Simplify `client/src/components/widgets/ReportTableWidget.tsx`:**
- Remove `useBaseDataset` hook, `useFilteredData` hook
- Remove `isBaseReady`, `isPlaceholderData`, `loadingPhase`, OR-group warning
- Remove `hasAnyClientConditions`, `hasSkippedOrGroups` imports
- Single data source: `useReportQuery` only
- Pagination from server response (`query.data.pagination`)

**Simplified ReportTableWidget structure:**
```tsx
export default function ReportTableWidget({ reportId }) {
  const { filterGroup, debouncedGroup, page, setPage, ... } = useFilterState();
  const filtersQuery = useFiltersQuery(reportId);
  const query = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page,
    pageSize: 50,
  });

  return (
    <>
      <TableToolbar onRefresh={...} isRefreshing={...} ... />
      {/* Filter/Column panels (unchanged) */}
      {query.isLoading && <TableSkeleton />}
      {query.error && <ErrorState onRetry={() => query.refetch()} />}
      {!query.isLoading && !query.error && query.data?.data.length === 0 && <EmptyState />}
      {query.data && query.data.data.length > 0 && (
        <>
          <ReportTable columns={...} data={query.data.data} />
          <Pagination page={page} totalCount={query.data.pagination.totalCount} ... />
        </>
      )}
    </>
  );
}
```

**Simplify `client/src/utils/clientFilter.ts`:**
- Remove all exports — server handles filtering now
- Delete file entirely if nothing else imports it
- Update `client/src/utils/clientFilter.test.ts` accordingly

### 2. Loading UX — Skeleton on Filter Change

**Remove `keepPreviousData` from `useReportQuery` for filter changes.**

When filters change, `query.isLoading` becomes `true` and `ReportTableWidget` shows `<TableSkeleton />` with shimmer animation. This is the loading indicator — no separate progress bar needed.

**Keep `keepPreviousData` for pagination only.** When the user clicks Page 2, old data stays visible while Page 2 loads (better UX than flashing skeleton for a 1-2s page load). Implement by splitting the query key: filter changes produce a new query key (skeleton), page changes use the same base key with `keepPreviousData`.

**Update `client/src/hooks/useReportQuery.ts`:**
```tsx
export function useReportQuery(reportId: string, params: ReportQueryParams) {
  // WHY: Separate filter key from page key so that filter changes show
  // skeleton (isLoading=true) but page changes show keepPreviousData.
  const filterKey = JSON.stringify(params.filterGroup);

  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, filterKey, params.page, params.pageSize],
    queryFn: async () => { ... },
    staleTime: 15 * 60 * 1000,
    // WHY: keepPreviousData is enabled — but when the filterKey portion
    // of the queryKey changes, TanStack treats it as a new query entirely
    // (cache miss) so isLoading=true and skeleton shows.
    // When only page changes, it's a cache miss for that page but
    // keepPreviousData shows the previous page's data while loading.
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
```

**Wait — the above won't work.** TanStack Query's `keepPreviousData` applies to ANY query key change, not just page changes. The real solution: use `placeholderData` conditionally, or accept that filter changes also show keepPreviousData briefly.

**Simpler approach:** Remove `keepPreviousData` entirely. Both filter changes AND page changes show skeleton. This is consistent, predictable, and clearly communicates "loading." The skeleton shows for 0-5s max (cache hits are instant).

```tsx
export function useReportQuery(reportId: string, params: ReportQueryParams) {
  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, params],
    queryFn: async () => { ... },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    // WHY: No keepPreviousData — show skeleton on every data change.
    // Old data showing silently made the app feel broken.
    // With 15-min cache, most loads are instant (0ms) so skeleton barely flashes.
  });
}
```

### 3. Server-Side Post-Enrichment Filtering

**Problem:** 7 columns have `filterLocation: 'client'` (driverId, licensePlate, truckTemp, productTemp, productCondition, truckCondition, comments). These come from HTML sub-form parsing, not OData fields. The server can't filter them via `$filter`.

**Solution:** After enrichment, apply a second filter pass on the server for client-only columns. The server already has `server/src/services/serverClientFilter.ts` (used by the export route) that does exactly this.

**Update `server/src/routes/query.ts`:**
```
1. Parse request body
2. Build OData filter (server-side columns only) → $filter
3. Fetch from Priority with $filter, $top, $skip
4. Enrich rows (sub-form data)
5. Apply post-enrichment filter (client-only columns) ← NEW
6. Transform rows
7. Paginate and return
```

**Important: `$top` and `$skip` interaction with post-enrichment filtering.**

When client-only filters are active, the server can't rely on OData `$top/$skip` for accurate pagination because post-enrichment filtering reduces the row count. Two options:

**(a) Over-fetch then filter:** Fetch more rows from Priority (e.g., 200 instead of 50), apply post-enrichment filter, return the first 50. This gives correct pagination but wastes API bandwidth.

**(b) Fetch all matching rows, filter, then paginate server-side:** Fetch up to 1000 rows with OData date/vendor/status filters, enrich all, apply client filters, paginate to 50. Slower but accurate.

**Recommendation: (a) Over-fetch with multiplier.** When the request has client-only filter conditions, multiply `$top` by 4 (fetch 200 instead of 50). If fewer than `pageSize` rows remain after filtering, the user is near the last page. This balances speed and accuracy. The cache makes subsequent requests instant anyway.

**How to detect client-only conditions:** Use the existing `filterColumns` metadata from the report definition. Check if any condition targets a column with `filterLocation: 'client'`.

### 4. Refresh Button

**Add to `client/src/components/TableToolbar.tsx`:**
- New `onRefresh` and `isRefreshing` props
- Render a `RefreshCw` icon button (from lucide-react) next to Export
- Spinning animation while refreshing

**Client logic in ReportTableWidget:**
```tsx
const handleRefresh = async () => {
  await fetch(`/api/v1/reports/${reportId}/refresh`, { method: 'POST' });
  queryClient.invalidateQueries({ queryKey: ['report', reportId] });
};
```

**Server: rewrite the refresh endpoint** in `server/src/routes/query.ts` (move from `reports.ts`):
- Accept POST body with `reportId`
- Invalidate all cache keys matching `query:${reportId}:*`
- Implementation: add `invalidateByPrefix(prefix: string)` to `CacheProvider`
  - **Upstash:** Use `SCAN` cursor-based iteration + `DEL` (Upstash REST supports SCAN)
  - **In-memory:** Iterate `store.keys()` and delete matching

### 5. Server Cache — 15 Minute TTL, Stable Cache Keys

**Remove `baseMode` handling from `server/src/routes/query.ts`.**
Single cache path: `buildQueryCacheKey(reportId, body)` with 15 min TTL.

**Fix cache key stability:** The current `buildQueryCacheKey` uses `JSON.stringify(body.filterGroup)` which includes condition `id` fields (random UUIDs). Two logically identical filters with different UUIDs produce different cache keys.

**Fix:** Strip `id` fields before hashing:
```tsx
function stripIds(group: FilterGroup): unknown {
  return {
    conjunction: group.conjunction,
    conditions: group.conditions.map(c => ({
      field: c.field, operator: c.operator, value: c.value, valueTo: c.valueTo,
    })),
    groups: group.groups.map(stripIds),
  };
}

export function buildQueryCacheKey(reportId: string, body: QueryRequest): string {
  const filterHash = JSON.stringify(stripIds(body.filterGroup));
  return `query:${reportId}:p${body.page}:s${body.pageSize}:${filterHash}`;
}
```

This ensures the cache warm-up (with server-generated UUIDs) matches the client's first request (with different UUIDs).

### 6. Pre-Cache Current Week on Server Startup

**Add cache warming to `server/src/index.ts`:**
After the server starts listening, fire-and-forget a request to populate the cache with the current week's default view.

**Implementation:** Call the same query logic directly (not via HTTP):
```tsx
async function warmCache(cache: CacheProvider) {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);
  const defaultFilter: FilterGroup = {
    id: 'warmup',
    conjunction: 'and',
    conditions: [{
      id: 'warmup-date',
      field: 'date',
      operator: 'isInWeek',
      value: toISODate(monday),
      valueTo: toISODate(sunday),
    }],
    groups: [],
  };
  // Execute the same query path as a normal POST /query request
  // (OData filter → Priority fetch → enrichment → cache write)
}
```

**Shared week utilities:** `getMonday`, `getSunday`, `toISODate` currently live in `client/src/utils/weekUtils.ts`. Move to `shared/utils/weekUtils.ts` so the server can use them. (This extends `shared/` beyond types-only — add a `shared/utils/` directory alongside `shared/types/`.)

**Cache key match:** With the `stripIds` fix above, the warm-up's `id: 'warmup'` and `id: 'warmup-date'` are stripped from the cache key, so it matches the client's request with `id: crypto.randomUUID()`.

### 7. Pagination Total Count Fix

**Problem:** The current `query.ts` sets `totalCount = rows.length` after transform, which is always ≤ pageSize. Pagination shows "Page 1 of 1" even with 200 matching rows.

**Fix:** Use the same estimation logic as `reports.ts`:
```tsx
const isLastPage = rows.length < body.pageSize;
const totalCount = isLastPage
  ? (body.page - 1) * body.pageSize + rows.length
  : (body.page - 1) * body.pageSize + rows.length + 1;
// WHY: +1 on non-last pages signals "there's at least one more page"
// Priority OData doesn't reliably support $count=true
```

## Files Changed

| Action | File | What |
|--------|------|------|
| Delete | `client/src/hooks/useBaseDataset.ts` | Two-phase hook |
| Delete | `client/src/hooks/useFilteredData.ts` | Client-side filter hook |
| Delete | `client/src/components/LoadingBar.tsx` | Phase loading bar |
| Delete/Simplify | `client/src/utils/clientFilter.ts` | Remove if unused, or keep for any remaining need |
| Update | `client/src/utils/clientFilter.test.ts` | Remove tests for deleted exports |
| Simplify | `client/src/components/widgets/ReportTableWidget.tsx` | Remove all Phase 2 logic |
| Update | `client/src/hooks/useReportQuery.ts` | Remove keepPreviousData, update staleTime to 15min |
| Update | `client/src/components/TableToolbar.tsx` | Add refresh button |
| Simplify | `server/src/routes/query.ts` | Remove baseMode, add post-enrichment filter, fix totalCount |
| Update | `server/src/routes/querySchemas.ts` | Remove `baseMode` field |
| Update | `shared/types/filters.ts` | Remove `baseMode` from `QueryRequest` type |
| Simplify | `server/src/services/cache.ts` | Remove `buildBaseCacheKey`, fix `buildQueryCacheKey` to strip IDs, add `invalidateByPrefix` |
| Update | `server/src/routes/reports.ts` | Remove old refresh endpoint (moved to query.ts) |
| Update | `server/src/index.ts` | Add cache warming on startup |
| Update | `server/src/services/logger.ts` | Remove `baseMode` from log type |
| Move | `client/src/utils/weekUtils.ts` → `shared/utils/weekUtils.ts` | Share between client and server |

## Success Criteria

1. **Filter change → skeleton shows immediately → data appears in 3-5s** (or instant if cached)
2. **No stale data display** — user always sees skeleton or current data, never old data with new filters
3. **Refresh button** clears server cache and re-fetches fresh data
4. **First load instant** — pre-cached current week, 0ms on server cache hit
5. **Client-only columns filterable** — driver ID, temps, conditions filter correctly via post-enrichment server filter
6. **Pagination correct** — totalCount estimates correctly, multi-page results paginate properly
7. **Works in Airtable iframe** — skeleton renders, refresh button works, no cross-origin issues
