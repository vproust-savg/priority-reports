# Cache Strategy & Loading UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove two-phase loading, show skeleton on filter changes, add refresh button, fix cache keys, add cache warming — make the dashboard feel instant.

**Architecture:** Single server-side query per filter change (~3-5s). Server applies OData filters + post-enrichment filters for client-only columns. 15-minute Redis cache with stable keys (stripped UUIDs). CheeseLoader placeholder for loading state.

**Tech Stack:** React 19, TanStack Query v5, Express, Upstash Redis, Zod

**Spec:** `specs/spec-10-cache-ux-optimization.md`

**Pre-deploy checklist (run before EVERY push):**
```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

---

### Task 1: Move weekUtils to shared/utils/

**Why first:** Both client (filterConstants.ts) and server (cache warming in Task 8) need week functions. Moving this first avoids import path issues in later tasks.

**Files:**
- Move: `client/src/utils/weekUtils.ts` → `shared/utils/weekUtils.ts`
- Modify: `client/src/utils/weekUtils.ts` (becomes re-export)
- Modify: `client/tsconfig.app.json` (may need path update)
- Modify: `server/tsconfig.json` (may need to include shared/utils)

- [ ] **Step 1: Create `shared/utils/weekUtils.ts`**

Copy the ENTIRE contents of `client/src/utils/weekUtils.ts` to `shared/utils/weekUtils.ts`. Update the intent block:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/weekUtils.ts
// PURPOSE: Pure date utility functions for week calculations.
//          Shared between client (WeekPicker, filter defaults)
//          and server (cache warming).
// USED BY: client/src/utils/weekUtils.ts (re-export),
//          client/src/config/filterConstants.ts,
//          server/src/index.ts (cache warming)
// EXPORTS: getMonday, getSunday, toISODate, formatWeekRange,
//          getCalendarWeeks
// ═══════════════════════════════════════════════════════════════
```

Keep all function implementations identical.

- [ ] **Step 2: Replace `client/src/utils/weekUtils.ts` with re-export**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.ts
// PURPOSE: Re-exports shared week utilities. Keeps existing
//          import paths working without changing every consumer.
// USED BY: WeekPickerDropdown.tsx, FilterConditionRow.tsx,
//          config/filterConstants.ts
// EXPORTS: getMonday, getSunday, toISODate, formatWeekRange,
//          getCalendarWeeks
// ═══════════════════════════════════════════════════════════════

export { getMonday, getSunday, toISODate, formatWeekRange, getCalendarWeeks } from '../../../shared/utils/weekUtils';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add shared/utils/weekUtils.ts client/src/utils/weekUtils.ts
git commit -m "refactor: move weekUtils to shared/utils for server reuse"
```

---

### Task 2: Fix cache key stability + add invalidateByPrefix

**Why:** Cache keys include random UUIDs from filter condition IDs, so the same logical filter produces different cache keys. Also need prefix invalidation for the refresh button.

**Files:**
- Modify: `server/src/services/cache.ts`

- [ ] **Step 1: Update `server/src/services/cache.ts`**

Replace the entire file with:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/cache.ts
// PURPOSE: Cache abstraction with Upstash Redis implementation.
//          The interface is the contract — swap implementations
//          without touching any business code.
// USED BY: routes/reports.ts, routes/filters.ts, routes/query.ts
// EXPORTS: CacheProvider, buildCacheKey, buildQueryCacheKey, createCacheProvider
// ═══════════════════════════════════════════════════════════════

import { Redis } from '@upstash/redis';
import { env } from '../config/environment';
import type { QueryRequest, FilterGroup } from '@shared/types';

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidateByPrefix(prefix: string): Promise<number>;
  isConnected(): Promise<boolean>;
}

// WHY: Cache keys must include ALL query params, not just reportId.
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string; vendor?: string; status?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 50}:${params.from ?? ''}:${params.to ?? ''}:v${params.vendor ?? ''}:st${params.status ?? ''}`;
}

// WHY: Strip condition/group `id` fields before hashing. These are random
// UUIDs used as React keys — two logically identical filters with different
// UUIDs must produce the same cache key. Without this, cache warming
// (server-generated IDs) would never match client requests.
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

class UpstashCacheProvider implements CacheProvider {
  private client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async get<T>(key: string): Promise<T | null> {
    return this.client.get<T>(key);
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(data), { ex: ttlSeconds });
  }

  async invalidate(key: string): Promise<void> {
    await this.client.del(key);
  }

  // WHY: SCAN-based deletion for prefix matching. Upstash REST supports
  // SCAN with MATCH pattern. Deletes all keys matching the prefix.
  async invalidateByPrefix(prefix: string): Promise<number> {
    let cursor = 0;
    let deleted = 0;
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, { match: `${prefix}*`, count: 100 });
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== 0);
    return deleted;
  }

  async isConnected(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

class InMemoryCacheProvider implements CacheProvider {
  private store = new Map<string, { data: unknown; expiresAt: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  async set(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    this.store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async invalidate(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidateByPrefix(prefix: string): Promise<number> {
    let deleted = 0;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async isConnected(): Promise<boolean> {
    return true;
  }
}

export function createCacheProvider(): CacheProvider {
  if (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN) {
    return new UpstashCacheProvider(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN);
  }
  console.warn('[cache] No Upstash credentials — using in-memory cache (data lost on restart)');
  return new InMemoryCacheProvider();
}
```

- [ ] **Step 2: Verify server compiles**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add server/src/services/cache.ts
git commit -m "fix: strip UUIDs from cache keys + add invalidateByPrefix"
```

---

### Task 3: Remove baseMode from types, schema, and logger

**Files:**
- Modify: `shared/types/filters.ts` — remove `baseMode` from `QueryRequest`
- Modify: `server/src/routes/querySchemas.ts` — remove `baseMode` from Zod schema
- Modify: `server/src/services/logger.ts` — remove `baseMode` from log type

- [ ] **Step 1: Update `shared/types/filters.ts`**

Remove lines 85-88 (the `baseMode` field and its WHY comment) from the `QueryRequest` interface:

```typescript
export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 2: Update `server/src/routes/querySchemas.ts`**

Remove the `baseMode` line (line 43) and its comment (lines 41-42):

```typescript
export const QueryRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(1000).default(50),
});
```

- [ ] **Step 3: Update `server/src/services/logger.ts`**

Remove `baseMode?: boolean;` (line 18) from the `logApiCall` parameter type.

- [ ] **Step 4: Verify both compile**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

Fix any remaining references to `baseMode` that the compiler flags.

- [ ] **Step 5: Commit**

```bash
git add shared/types/filters.ts server/src/routes/querySchemas.ts server/src/services/logger.ts
git commit -m "refactor: remove baseMode from QueryRequest type and schema"
```

---

### Task 4: Rewrite server query.ts — single-phase with post-enrichment filtering

**This is the core server change.** Remove baseMode handling, add post-enrichment filtering for client-only columns, fix totalCount pagination, add refresh endpoint, set 15-min TTL.

**Files:**
- Modify: `server/src/routes/query.ts`
- Modify: `server/src/routes/reports.ts` (remove old refresh endpoint)

- [ ] **Step 1: Rewrite `server/src/routes/query.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /api/v1/reports/:reportId/query endpoint.
//          Single-phase: OData filter → Priority fetch → enrich →
//          post-enrichment filter (client-only columns) → cache.
//          POST /:reportId/refresh invalidates all cached queries.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildQueryCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { applyServerClientFilters } from '../services/serverClientFilter';
import { logApiCall } from '../services/logger';
import { QueryRequestSchema } from './querySchemas';
import type { ApiResponse, FilterGroup, ColumnFilterMeta } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

// WHY: When request has client-only filter conditions, the server can't
// rely on OData $top for accurate pagination because post-enrichment
// filtering reduces the row count. Fetch up to this many rows, filter,
// then paginate server-side.
const CLIENT_FILTER_MAX_FETCH = 500;

const CLIENT_ONLY_OPS = new Set(['contains', 'notContains', 'startsWith', 'endsWith']);

// WHY: Recursively checks nested groups — a client-only condition
// inside a nested OR group must still trigger post-enrichment filtering.
function hasClientOnlyConditions(
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): boolean {
  for (const c of filterGroup.conditions) {
    if (!c.field) continue;
    const col = filterColumns.find((fc) => fc.key === c.field);
    if (col?.filterLocation === 'client' || CLIENT_ONLY_OPS.has(c.operator)) return true;
  }
  for (const g of filterGroup.groups) {
    if (hasClientOnlyConditions(g, filterColumns)) return true;
  }
  return false;
}

export function createQueryRouter(cache: CacheProvider): Router {
  const router = Router();

  router.post('/:reportId/query', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    let body;
    try {
      body = QueryRequestSchema.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: 'Invalid request body', details: err });
      return;
    }

    const cacheKey = buildQueryCacheKey(reportId, body);
    const cacheTtl = 900; // 15 minutes

    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    let cached: ApiResponse | null = null;
    try {
      cached = await cache.get<ApiResponse>(cacheKey);
    } catch (err) {
      console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
    if (cached) {
      cached.meta.cache = 'hit';
      cached.meta.executionTimeMs = Date.now() - startTime;
      logApiCall({
        level: 'info', event: 'query_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
        odataFilter: odataFilter ?? 'none',
      });
      res.json(cached);
      return;
    }

    // WHY: When client-only filters are active, OData can't filter those
    // columns. Fetch more rows, apply post-enrichment filter, then
    // paginate server-side. $skip=0 because we paginate after filtering.
    const hasClientFilters = hasClientOnlyConditions(body.filterGroup, report.filterColumns);
    const fetchTop = hasClientFilters ? CLIENT_FILTER_MAX_FETCH : body.pageSize;
    const fetchSkip = hasClientFilters ? 0 : (body.page - 1) * body.pageSize;

    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });

    let priorityData;
    try {
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $orderby: baseParams.$orderby,
        $filter: odataFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[query] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    let rawRows = priorityData.value;
    const warnings: string[] = [];
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
        warnings.push('Sub-form data unavailable — some columns may be blank');
      }
    }
    let rows = rawRows.map(report.transformRow);

    // WHY: Apply post-enrichment filtering for client-only columns.
    // OData can't filter on fields that come from HTML sub-form parsing.
    if (hasClientFilters) {
      rows = applyServerClientFilters(rows, body.filterGroup, report.filterColumns);
    }

    // WHY: When client-only filters are active, we fetched all matching
    // rows (up to 500) and filtered server-side. Now paginate manually.
    const totalBeforePagination = rows.length;
    if (hasClientFilters) {
      const start = (body.page - 1) * body.pageSize;
      rows = rows.slice(start, start + body.pageSize);
    }

    // WHY: Priority OData doesn't reliably support $count=true.
    // With client filters: we have the exact total from filtering.
    // Without: estimate — if fewer rows than pageSize, last page.
    const totalCount = hasClientFilters
      ? totalBeforePagination
      : rows.length < body.pageSize
        ? (body.page - 1) * body.pageSize + rows.length
        : (body.page - 1) * body.pageSize + rows.length + 1;

    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
      },
      data: rows,
      pagination: {
        page: body.page,
        pageSize: body.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / body.pageSize),
      },
      columns: report.columns,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    cache.set(cacheKey, response, cacheTtl).catch((err) => {
      console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
    });

    logApiCall({
      level: 'info', event: 'query_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });

    res.json(response);
  });

  // WHY: Refresh endpoint invalidates ALL cached queries for a report.
  // Uses prefix-based deletion so every filter combination is cleared.
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    try {
      const deleted = await cache.invalidateByPrefix(`query:${reportId}:`);
      console.log(`[query] Refreshed cache for ${reportId}: ${deleted} keys deleted`);
      res.json({ message: `Cache refreshed for ${reportId}`, keysDeleted: deleted });
    } catch (err) {
      console.warn(`[query] Cache refresh failed for ${reportId}:`, err);
      // WHY: Still return success — the client will refetch regardless
      res.json({ message: `Cache refresh attempted for ${reportId}` });
    }
  });

  return router;
}
```

- [ ] **Step 2: Remove old refresh endpoint from `server/src/routes/reports.ts`**

Delete the POST `/:reportId/refresh` handler (lines 153-171) from reports.ts. The new one in query.ts replaces it.

- [ ] **Step 3: Verify server compiles**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/query.ts server/src/routes/reports.ts
git commit -m "feat: single-phase query with post-enrichment filtering and refresh"
```

---

### Task 5: Add cache warming on server startup

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Update `server/src/index.ts`**

Add cache warming after the server starts listening. Import weekUtils from shared:

```typescript
import { getMonday, getSunday, toISODate } from '../../shared/utils/weekUtils';
```

Add the `warmCache` function before the `isDirectRun` block:

```typescript
// WHY: Pre-cache the default view (current week) so the first user
// sees data instantly instead of waiting 3-5s on cold load.
async function warmCache(cache: CacheProvider) {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);

  const body = {
    filterGroup: {
      id: 'warmup',
      conjunction: 'and' as const,
      conditions: [{
        id: 'warmup-date',
        field: 'date',
        operator: 'isInWeek' as const,
        value: toISODate(monday),
        valueTo: toISODate(sunday),
      }],
      groups: [],
    },
    page: 1,
    pageSize: 50,
  };

  // WHY: Hit our own endpoint via HTTP to reuse all query logic
  // (OData translation, enrichment, caching). Simpler than
  // extracting and calling the handler function directly.
  const port = env.PORT;
  try {
    const response = await fetch(`http://localhost:${port}/api/v1/reports/grv-log/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { meta: { cache: string; executionTimeMs: number }; data: unknown[] };
    console.log(`[warmup] Pre-cached current week: ${data.data.length} rows in ${data.meta.executionTimeMs}ms`);
  } catch (err) {
    console.warn('[warmup] Cache warming failed:', err);
  }
}
```

Then in the `app.listen` callback, add after the existing log line:

```typescript
    // WHY: Fire-and-forget — don't block server readiness on cache warming
    warmCache(cache);
```

- [ ] **Step 2: Verify server compiles**

```bash
cd server && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: pre-cache current week on server startup"
```

---

### Task 6: Create CheeseLoader placeholder + update useReportQuery

**Files:**
- Create: `client/src/components/CheeseLoader.tsx`
- Modify: `client/src/hooks/useReportQuery.ts`

- [ ] **Step 1: Create `client/src/components/CheeseLoader.tsx`**

Placeholder component — the actual cheese wheel animation will be designed separately:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/CheeseLoader.tsx
// PURPOSE: Loading animation placeholder. Will be replaced with
//          a cheese wheel animation (designed via Claude artifact).
//          For now, wraps TableSkeleton with a centered message.
// USED BY: ReportTableWidget
// EXPORTS: CheeseLoader (default)
// ═══════════════════════════════════════════════════════════════

import TableSkeleton from './TableSkeleton';

export default function CheeseLoader() {
  return (
    <div>
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span>Loading data...</span>
        </div>
      </div>
      <TableSkeleton />
    </div>
  );
}
```

- [ ] **Step 2: Update `client/src/hooks/useReportQuery.ts`**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Fetches report data via POST /query endpoint. Accepts a
//          FilterGroup tree instead of flat query params.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}

export function useReportQuery(reportId: string, params: ReportQueryParams) {
  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, params],
    queryFn: async () => {
      const body: QueryRequest = {
        filterGroup: params.filterGroup,
        page: params.page,
        pageSize: params.pageSize,
      };
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Report query failed: ${response.status}`);
      return response.json();
    },
    // WHY: Match server cache TTL (15 min). Within this window,
    // TanStack serves from its local cache — no network request at all.
    staleTime: 15 * 60 * 1000,
    // WHY: No keepPreviousData — show skeleton on every data change.
    // Old data showing silently made the app feel broken. With 15-min
    // cache, most loads are instant (0ms) so skeleton barely flashes.
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 3: Verify client compiles**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/CheeseLoader.tsx client/src/hooks/useReportQuery.ts
git commit -m "feat: add CheeseLoader placeholder + remove keepPreviousData"
```

---

### Task 7: Add refresh button to TableToolbar

**Files:**
- Modify: `client/src/components/TableToolbar.tsx`

- [ ] **Step 1: Update `client/src/components/TableToolbar.tsx`**

Add `onRefresh` and `isRefreshing` props. Add a RefreshCw button next to Export:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Toolbar row with Filter, Columns, Refresh, and Export buttons.
//          Shows active filter count and hidden column count badges.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, Columns3, ChevronDown, Download, Loader2, RefreshCw } from 'lucide-react';

interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
  isExporting: boolean;
  onExport: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  isExporting, onExport,
  isRefreshing, onRefresh,
}: TableToolbarProps) {
  const hasFilters = activeFilterCount > 0;
  const hasHiddenColumns = hiddenColumnCount > 0;

  const baseClass = 'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors';
  const activeClass = 'text-primary bg-primary/5 hover:bg-primary/10';
  const inactiveClass = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

  return (
    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1">
      <button
        onClick={onFilterToggle}
        className={`${baseClass} ${hasFilters ? activeClass : inactiveClass}`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <button
        onClick={onColumnToggle}
        className={`${baseClass} ${hasHiddenColumns ? activeClass : inactiveClass}`}
      >
        <Columns3 size={16} />
        <span>Columns</span>
        {hasHiddenColumns && <span>({hiddenColumnCount} hidden)</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isColumnPanelOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* WHY: Refresh and Export pushed right together */}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`${baseClass} ${inactiveClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Refresh data (clears cache)"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={onExport}
          disabled={isExporting}
          className={`${baseClass} ${inactiveClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isExporting
            ? <Loader2 size={16} className="animate-spin" />
            : <Download size={16} />}
          <span>{isExporting ? 'Exporting...' : 'Export'}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify client compiles**

```bash
cd client && npx tsc -b --noEmit
```
Expected: clean. Props are optional so ReportTableWidget compiles without passing them.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/TableToolbar.tsx
git commit -m "feat: add refresh button to toolbar"
```

---

### Task 8: Simplify ReportTableWidget — remove two-phase loading

**This is the core client change.** Remove all Phase 2 logic, use single query, show CheeseLoader, wire up refresh.

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Rewrite `client/src/components/widgets/ReportTableWidget.tsx`**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget — single-phase server-side filtering.
//          Shows CheeseLoader during fetch, data table when ready.
//          Refresh button clears server cache for fresh data.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE_FAST } from '../../config/animationConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import CheeseLoader from '../CheeseLoader';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import { countActiveFilters } from '../../config/filterConstants';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  const query = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page,
    pageSize: 50,
  });

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(query.data?.columns);

  const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup);
  const filterLoadError = filtersQuery.error;

  // --- Refresh logic ---
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetch(`/api/v1/reports/${reportId}/refresh`, { method: 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    } finally {
      setIsRefreshing(false);
    }
  };

  const data = query.data;
  const displayData = data?.data ?? [];

  return (
    <>
      <TableToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isFilterOpen={isFilterOpen}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        hiddenColumnCount={hiddenCount}
        isColumnPanelOpen={isColumnPanelOpen}
        onColumnToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
        isExporting={isExporting}
        onExport={triggerExport}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <FilterBuilder
              filterGroup={filterGroup}
              onChange={handleFilterChange}
              columns={filterColumns}
              filterOptions={filtersQuery.data?.filters}
              filterOptionsLoading={filtersQuery.isLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isColumnPanelOpen && (
          <motion.div
            key="column-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <ColumnManagerPanel
              managedColumns={managedColumns}
              onToggle={toggleColumn}
              onReorder={reorderColumns}
              onShowAll={showAll}
              onHideAll={hideAll}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}

      {data?.warnings && data.warnings.length > 0 && data.warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}

      {query.isLoading && <CheeseLoader />}

      {query.error && <ErrorState onRetry={() => query.refetch()} />}

      {!query.isLoading && !query.error && displayData.length === 0 && <EmptyState />}

      {!query.isLoading && displayData.length > 0 && (
        <>
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={displayData}
          />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={data!.pagination.totalCount}
            totalPages={data!.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Verify client compiles**

```bash
cd client && npx tsc -b --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: simplify ReportTableWidget to single-phase loading"
```

---

### Task 9: Delete unused files + clean up

**Files:**
- Delete: `client/src/hooks/useBaseDataset.ts`
- Delete: `client/src/hooks/useFilteredData.ts`
- Delete: `client/src/components/LoadingBar.tsx`
- Simplify: `client/src/utils/clientFilter.ts` (remove unused exports)

- [ ] **Step 1: Delete files**

```bash
rm client/src/hooks/useBaseDataset.ts
rm client/src/hooks/useFilteredData.ts
rm client/src/components/LoadingBar.tsx
```

- [ ] **Step 2: Simplify `client/src/utils/clientFilter.ts`**

Check if anything still imports from it. If ReportTableWidget no longer uses it, and no other file does, delete it entirely. If tests import it, delete the test file too.

```bash
grep -r "clientFilter" client/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules
```

If only test files remain, delete both `clientFilter.ts` and `clientFilter.test.ts`.

- [ ] **Step 3: Verify both compile**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete unused two-phase loading files"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Run pre-deploy checks**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

- [ ] **Step 2: Start dev servers and test**

```bash
cd server && npm run dev &
cd client && npm run dev &
```

Open `http://localhost:5173/receiving-log`. Verify:
1. Page loads with CheeseLoader → data appears (skeleton + spinner + "Loading data...")
2. Open filter panel → change week → CheeseLoader shows → new data appears
3. Add vendor filter → CheeseLoader shows → filtered data appears
4. Click refresh button → data re-fetches
5. Repeat same filter → instant (cache hit, no CheeseLoader)

- [ ] **Step 3: Push to main**

```bash
git push origin main
```

- [ ] **Step 4: Verify on deployed Railway URL**

Wait for Railway deploy, then test on the Airtable iframe embed.
