# BBD Report (Best By Dates) — Purchasing Reports Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SKILL:** Use `/priority-erp-api` before writing any Priority API code.
>
> **Spec:** `specs/spec-11-bbd-purchasing-reports.md`

**Goal:** Add a "Purchasing Reports" page with a BBD (Best By Dates) report that monitors expiring inventory from Priority's RAWSERIAL entity, with row-level color coding by urgency.

**Architecture:** Server-side report definition (same pattern as `grvLog.ts`) fetches RAWSERIAL + RAWSERIALBAL_SUBFORM, computes expiration status, filters to flagged items only. Frontend reuses `ReportTableWidget` with a new row-styling extension in `ReportTable.tsx`. Infrastructure changes generalize the filter system for multi-report support.

**Tech Stack:** Express + TypeScript backend, React 19 + Vite + Tailwind v4 frontend, TanStack Query v5, Zod validation, Upstash Redis cache.

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `server/src/reports/bbdReport.ts` | BBD report definition: columns, filters, buildQuery, transformRow, enrichRows, filterRows, fetchFilters |

### Modified Files

| File | What Changes |
|------|-------------|
| `shared/types/api.ts:22-29` | Add `rowStyleField?: string` to `ResponseMeta` |
| `shared/types/filters.ts:67-79` | Generalize `FiltersResponse.filters` to `Record<string, FilterOption[]>` |
| `server/src/config/reportRegistry.ts:34-51` | Add `filterRows?`, `fetchFilters?`, `rowStyleField?`, `clientSidePagination?` to `ReportConfig` |
| `server/src/routes/filters.ts:18,44-87` | Add BBD import, dispatch to `fetchFilters()` with GRV Log fallback |
| `server/src/routes/query.ts:24,74-88,96-107,117-130,132-149` | Add BBD import, merge base `$filter`, support `clientSidePagination`, call `filterRows()`, include `rowStyleField` in response meta |
| `server/src/routes/reports.ts` | Add BBD import, add `filterRows()` call |
| `server/src/routes/reports.ts` | Add BBD import (side-effect registration) |
| `client/src/config/pages.ts:30-45` | Add Purchasing Reports page with BBD widget |
| `client/src/components/ReportTable.tsx:13-16,37-42` | Add `rowStyleField` prop, apply row-level CSS classes |
| `client/src/components/widgets/ReportTableWidget.tsx:149-152` | Pass `rowStyleField` from response meta to ReportTable |

---

## Task 1: Generalize Shared Types (Infrastructure)

**Files:**
- Modify: `shared/types/api.ts:22-29`
- Modify: `shared/types/filters.ts:67-79`
- Modify: `server/src/config/reportRegistry.ts:34-51`

- [ ] **Step 1: Add `rowStyleField` to `ResponseMeta`**

In `shared/types/api.ts`, add the optional field to `ResponseMeta`:

```typescript
export interface ResponseMeta {
  reportId: string;
  reportName: string;
  generatedAt: string;
  cache: 'hit' | 'miss';
  executionTimeMs: number;
  source: 'priority-odata' | 'mock';
  // WHY: When present, ReportTable reads this field from each row to apply
  // per-row CSS classes (e.g., red for expired, orange for expiring-perishable).
  rowStyleField?: string;
}
```

- [ ] **Step 2: Generalize `FiltersResponse.filters`**

In `shared/types/filters.ts`, change the hardcoded `filters` shape (lines 72-77) to:

```typescript
export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  // WHY: Generic record so each report defines its own filter keys.
  // GRV Log uses 'vendors', 'statuses', etc. BBD uses 'vendors', 'brands', 'families'.
  // FilterValueInput.tsx already looks up by column.enumKey dynamically (line 30-31).
  filters: Record<string, FilterOption[]>;
  columns: ColumnFilterMeta[];
}
```

- [ ] **Step 3: Add `filterRows`, `fetchFilters`, `rowStyleField` to `ReportConfig`**

In `server/src/config/reportRegistry.ts`, add three optional fields to `ReportConfig` (after `exportConfig`):

```typescript
export interface ReportConfig {
  id: string;
  name: string;
  entity: string;
  columns: ColumnDefinition[];
  filterColumns: ColumnFilterMeta[];
  buildQuery: (filters: ReportFilters) => ODataParams;
  transformRow: (raw: Record<string, unknown>) => Record<string, unknown>;
  enrichRows?: (rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
  exportConfig?: ExportConfig;
  // WHY: Post-transform row exclusion. Runs after enrichRows + transformRow.
  // Used by BBD to exclude items with balance <= 0 or non-flagged status.
  // Keeps enrichRows focused on data fetching (consistent with GRV Log pattern).
  filterRows?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  // WHY: Per-report filter fetching. When absent, filters.ts falls back to
  // hardcoded GRV Log logic. Avoids modifying grvLog.ts for multi-report support.
  fetchFilters?: () => Promise<Record<string, FilterOption[]>>;
  // WHY: When present, query.ts includes this in ResponseMeta so the frontend
  // can apply per-row styling based on the named field's value.
  rowStyleField?: string;
  // WHY: When true, query.ts uses the report's own $filter/$top/$skip from
  // buildQuery() instead of overriding them. All post-fetch rows are returned
  // to the frontend, which handles pagination client-side. Required for reports
  // like BBD where post-fetch filtering (filterRows) makes OData pagination unreliable.
  clientSidePagination?: boolean;
}
```

Add the `FilterOption` import at the top:

```typescript
import type { ColumnDefinition, ColumnFilterMeta, FilterOption } from '@shared/types';
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Run: `cd client && npx tsc -b --noEmit`

Expected: Both pass. The `FiltersResponse` change is backwards-compatible because `FilterValueInput.tsx` already casts to `Record<string, FilterOption[]>` at line 31. The `filters.ts` route builds the response object with named keys (`vendors`, `statuses`, etc.) which satisfies `Record<string, FilterOption[]>`.

- [ ] **Step 5: Commit**

```bash
git add shared/types/api.ts shared/types/filters.ts server/src/config/reportRegistry.ts
git commit -m "feat: generalize types for multi-report support (rowStyleField, fetchFilters, filterRows)"
```

---

## Task 2: Update `filters.ts` Route for Per-Report Dispatch

**Files:**
- Modify: `server/src/routes/filters.ts`

- [ ] **Step 1: Add BBD import and fetchFilters dispatch**

Replace the content of `server/src/routes/filters.ts`. The key change is: if the report has `fetchFilters()`, call it. Otherwise, fall back to the existing hardcoded GRV Log logic.

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Dispatches to report.fetchFilters() when available.
//          Falls back to hardcoded GRV Log logic when absent.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createFiltersRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { queryPriority } from '../services/priorityClient';
import { getReport } from '../config/reportRegistry';
import type { FiltersResponse, FilterOption } from '@shared/types';

// WHY: Ensure report definitions are registered even if filters.ts
// loads before reports.ts. Node module cache prevents double-registration.
import '../reports/grvLog';
import '../reports/bbdReport';

export function createFiltersRouter(cache: CacheProvider): Router {
  const router = Router();

  router.get('/:reportId/filters', async (req, res) => {
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    const cacheKey = `filters:${reportId}`;
    let cached: FiltersResponse | null = null;
    try {
      cached = await cache.get<FiltersResponse>(cacheKey);
    } catch (err) {
      console.warn(`[filters] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
    if (cached) {
      res.json(cached);
      return;
    }

    let filters: Record<string, FilterOption[]>;

    if (report.fetchFilters) {
      // WHY: Report defines its own filter fetching logic (BBD, future reports).
      try {
        filters = await report.fetchFilters();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[filters] fetchFilters failed for ${reportId}: ${message}`);
        res.status(502).json({ error: `Failed to fetch filters: ${message}` });
        return;
      }
    } else {
      // WHY: Fallback for GRV Log — hardcoded logic preserved until grvLog.ts
      // is migrated to fetchFilters() in a future cleanup.
      let vendorData;
      try {
        vendorData = await queryPriority(report.entity, {
          $select: 'SUPNAME,CDES',
          $orderby: 'CDES',
          $top: 1000,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[filters] Priority fetch failed: ${message}`);
        res.status(502).json({ error: `Failed to fetch filters: ${message}` });
        return;
      }

      const vendorSet = new Set<string>();
      for (const row of vendorData.value) {
        const name = row.CDES as string;
        if (name) vendorSet.add(name);
      }

      const vendors: FilterOption[] = Array.from(vendorSet)
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const statuses: FilterOption[] = [
        { value: 'Received', label: 'Received' },
        { value: 'Cancelled', label: 'Cancelled' },
      ];

      filters = { vendors, statuses, warehouses: [], users: [] };
    }

    const response: FiltersResponse = {
      meta: {
        reportId,
        generatedAt: new Date().toISOString(),
      },
      filters,
      columns: report.filterColumns,
    };

    // WHY: Cache filter options for 5 min — they change infrequently
    cache.set(cacheKey, response, 300).catch((err) => {
      console.warn(`[filters] Cache write failed for ${cacheKey}:`, err);
    });

    res.json(response);
  });

  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`

Expected: Will fail because `../reports/bbdReport` doesn't exist yet. This is expected — it will pass after Task 4. For now, temporarily comment out the BBD import to verify the filters refactor compiles. Then uncomment it.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/filters.ts
git commit -m "feat: filters route dispatches to report.fetchFilters() with GRV Log fallback"
```

---

## Task 3: Update `query.ts` and `reports.ts` Routes

**Files:**
- Modify: `server/src/routes/query.ts`
- Modify: `server/src/routes/reports.ts`

- [ ] **Step 1: Add BBD import to `query.ts`**

At line 24, after `import '../reports/grvLog';`, add:

```typescript
import '../reports/bbdReport';
```

- [ ] **Step 2: Fix filter/pagination logic for `clientSidePagination` reports**

The current `query.ts` overwrites the report's `$filter`, `$top`, and `$skip` with its own values. This breaks BBD, which needs its own `EXPIRYDATE le ...` filter and fetches all matching rows. Apply these changes to the POST `/:reportId/query` handler:

**Change the OData params construction (around lines 74-88):**

Replace:
```typescript
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
```

With:
```typescript
    const hasClientFilters = hasClientOnlyConditions(body.filterGroup, report.filterColumns);
    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });

    // WHY: Merge the report's base $filter (e.g., BBD's EXPIRYDATE cutoff) with
    // UI-generated OData filter. Both are ANDed when present.
    const combinedFilter = [baseParams.$filter, odataFilter].filter(Boolean).join(' and ') || undefined;

    // WHY: clientSidePagination reports (like BBD) use the report's own $top/$skip
    // because post-fetch filtering (filterRows) makes OData pagination unreliable.
    // Standard reports use query.ts-controlled pagination.
    let fetchTop: number;
    let fetchSkip: number;
    if (report.clientSidePagination) {
      fetchTop = baseParams.$top ?? 2000;
      fetchSkip = baseParams.$skip ?? 0;
    } else {
      fetchTop = hasClientFilters ? CLIENT_FILTER_MAX_FETCH : body.pageSize;
      fetchSkip = hasClientFilters ? 0 : (body.page - 1) * body.pageSize;
    }

    let priorityData;
    try {
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $orderby: baseParams.$orderby,
        $filter: combinedFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      });
```

- [ ] **Step 3: Add `filterRows()` call after transform**

After the line `let rows = rawRows.map(report.transformRow);` (line 107), add:

```typescript
    // WHY: Post-transform row exclusion. BBD uses this to remove items
    // with balance <= 0 or without a flagged expiration status.
    if (report.filterRows) {
      rows = report.filterRows(rows);
    }
```

- [ ] **Step 4: Update pagination logic for `clientSidePagination`**

Replace the pagination section (around lines 117-130):

```typescript
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
```

With:
```typescript
    // WHY: Pagination depends on the report's strategy.
    // clientSidePagination: all rows returned, frontend paginates.
    // Standard: server-side pagination with client filter support.
    const totalBeforePagination = rows.length;
    let totalCount: number;

    if (report.clientSidePagination) {
      // WHY: All filtered rows returned to frontend. Frontend handles pagination.
      totalCount = totalBeforePagination;
    } else if (hasClientFilters) {
      const start = (body.page - 1) * body.pageSize;
      rows = rows.slice(start, start + body.pageSize);
      totalCount = totalBeforePagination;
    } else {
      totalCount = rows.length < body.pageSize
        ? (body.page - 1) * body.pageSize + rows.length
        : (body.page - 1) * body.pageSize + rows.length + 1;
    }
```

- [ ] **Step 5: Add `rowStyleField` to response meta**

In the response object (around line 132-140), add `rowStyleField`:

```typescript
    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
        rowStyleField: report.rowStyleField,
      },
      // ... rest unchanged
    };
```

- [ ] **Step 6: Add BBD import and `filterRows()` to `reports.ts`**

In `server/src/routes/reports.ts`, add the import after the GRV Log import:

```typescript
import '../reports/bbdReport';
```

Also find the `let rows = rawRows.map(report.transformRow);` line in `reports.ts` and add after it:

```typescript
    if (report.filterRows) {
      rows = report.filterRows(rows);
    }
```

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/query.ts server/src/routes/reports.ts
git commit -m "feat: query/reports routes support clientSidePagination, filterRows, and rowStyleField"
```

---

## Task 4: Create BBD Report Definition (Backend)

**Files:**
- Create: `server/src/reports/bbdReport.ts`

This is the core of the implementation. Follow the pattern from `grvLog.ts` exactly.

**IMPORTANT:** Before writing this file, use the `/priority-erp-api` skill to load Priority API patterns. You'll need it for OData query construction and sub-form handling.

- [ ] **Step 1: Create `server/src/reports/bbdReport.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/bbdReport.ts
// PURPOSE: BBD (Best By Dates) report. Queries RAWSERIAL for items
//          nearing or past expiration. Two-step fetch for balance
//          sub-form. Computes expiration status and filters to
//          flagged items only. Provides dropdown filter values.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterOption } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { queryPriority, querySubform } from '../services/priorityClient';

// --- Column Definitions ---

const columns: ColumnDefinition[] = [
  { key: 'partNumber', label: 'Part Number', type: 'string' },
  { key: 'partDescription', label: 'Part Description', type: 'string' },
  { key: 'balance', label: 'Balance', type: 'number' },
  { key: 'expiryDate', label: 'Expir. Date', type: 'date' },
  { key: 'daysUntilExpiry', label: 'Days Left', type: 'number' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'perishable', label: 'Perishable', type: 'string' },
  { key: 'brand', label: 'Brand', type: 'string' },
  { key: 'family', label: 'Family', type: 'string' },
];

// --- Filter Column Metadata ---

const filterColumns: ColumnFilterMeta[] = [
  { key: 'partNumber', label: 'Part Number', filterType: 'text', filterLocation: 'client' },
  { key: 'partDescription', label: 'Part Description', filterType: 'text', filterLocation: 'client' },
  { key: 'balance', label: 'Balance', filterType: 'number', filterLocation: 'client' },
  { key: 'expiryDate', label: 'Expir. Date', filterType: 'date', filterLocation: 'client' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'client', enumKey: 'vendors' },
  { key: 'perishable', label: 'Perishable', filterType: 'enum', filterLocation: 'client', enumKey: 'perishables' },
  { key: 'brand', label: 'Brand', filterType: 'enum', filterLocation: 'client', enumKey: 'brands' },
  { key: 'family', label: 'Family', filterType: 'enum', filterLocation: 'client', enumKey: 'families' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'client', enumKey: 'statuses' },
];

// --- OData Query Builder ---

// WHY: Computes the 30-day cutoff internally. Ignores from/to from ReportFilters
// (those are GRV Log concepts). All BBD filters are client-side.
function buildQuery(_filters: ReportFilters): ODataParams {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + 30);
  const cutoffIso = cutoffDate.toISOString().split('T')[0] + 'T23:59:59Z';

  return {
    $select: 'PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,SERIAL',
    $filter: `EXPIRYDATE le ${cutoffIso}`,
    $orderby: 'EXPIRYDATE asc',
    // WHY: Fetch all matching rows (no server pagination). Post-fetch filtering
    // removes unflagged items, making OData pagination unreliable.
    // Using a high $top. Cursor-based pagination handles MAXAPILINES cap if needed.
    $top: 2000,
    $skip: 0,
  };
}

// --- Family Lookup Cache ---

// WHY: FAMILY_LOG lookup map built once by fetchFilters(), reused by transformRow().
// Maps family code (Y_2074_5_ESH value) → family description for display.
let familyLookupMap: Map<string, string> = new Map();

// --- Sub-form Cache ---

// WHY: Same caching pattern as GRV Log's subformCache. Balance data doesn't
// change between filter changes — cache prevents re-fetching.
const subformCache = new Map<string, Record<string, unknown> | null>();
const SUBFORM_CACHE_MAX = 5000;

// --- Enrichment (Two-Step Sub-Form Fetch) ---

// WHY: Fetches RAWSERIALBAL_SUBFORM per row in batches. Only adds balance
// data — does NOT filter rows (that's filterRows' job).
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const uncached: Record<string, unknown>[] = [];
    for (const row of batch) {
      const cacheKey = String(row.SERIAL);
      if (subformCache.has(cacheKey)) {
        row.RAWSERIALBAL_SUBFORM = subformCache.get(cacheKey);
      } else {
        uncached.push(row);
      }
    }

    if (uncached.length > 0) {
      if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      const results = await Promise.all(
        uncached.map((row) =>
          querySubform(
            'RAWSERIAL',
            { SERIAL: String(row.SERIAL) },
            'RAWSERIALBAL_SUBFORM',
          ).catch(() => null),
        ),
      );
      for (let j = 0; j < uncached.length; j++) {
        const cacheKey = String(uncached[j].SERIAL);
        subformCache.set(cacheKey, results[j]);
        uncached[j].RAWSERIALBAL_SUBFORM = results[j];
      }

      // WHY: FIFO eviction — same pattern as grvLog.ts
      if (subformCache.size > SUBFORM_CACHE_MAX) {
        const deleteCount = Math.floor(SUBFORM_CACHE_MAX * 0.2);
        let count = 0;
        for (const key of subformCache.keys()) {
          if (count >= deleteCount) break;
          subformCache.delete(key);
          count++;
        }
      }
    }
  }

  return rows;
}

// --- Row Transformer ---

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  // WHY: querySubform() already resolves Pattern A/B — it returns a single
  // record (or null), never a raw { value: [...] } array. Just read the field.
  // Balance field name needs API verification — check TBALANCE, BALANCE, WBALANCE.
  const subform = raw.RAWSERIALBAL_SUBFORM as Record<string, unknown> | null;
  const balance = Number(subform?.TBALANCE ?? subform?.BALANCE ?? 0);

  const expiryRaw = raw.EXPIRYDATE as string | null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let daysUntilExpiry = 0;
  let status: string | null = null;

  if (expiryRaw) {
    const expiryDate = new Date(expiryRaw);
    expiryDate.setHours(0, 0, 0, 0);
    daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // WHY: Y/N field. Empty string or null treated as "N" (non-perishable).
    const isPerishable = (raw.Y_9966_5_ESH as string)?.toUpperCase() === 'Y';

    // WHY: Day 0 (expiry date is today) counts as expired — the best-by date has arrived.
    if (daysUntilExpiry <= 0) {
      status = 'expired';
    } else if (isPerishable && daysUntilExpiry <= 7) {
      status = 'expiring-perishable';
    } else if (!isPerishable && daysUntilExpiry <= 30) {
      status = 'expiring-non-perishable';
    }
  }

  // WHY: Convert family code to description using the cached lookup map.
  const familyCode = (raw.Y_2074_5_ESH as string) ?? '';
  const familyDesc = familyLookupMap.get(familyCode) ?? familyCode;

  return {
    partNumber: raw.PARTNAME,
    partDescription: raw.PARTDES,
    balance,
    expiryDate: raw.EXPIRYDATE,
    daysUntilExpiry,
    status: status ?? '',
    vendor: raw.SUPDES,
    perishable: (raw.Y_9966_5_ESH as string)?.toUpperCase() === 'Y' ? 'Yes' : 'No',
    brand: raw.Y_9952_5_ESH ?? '',
    family: familyDesc,
  };
}

// --- Post-Transform Row Exclusion ---

// WHY: Runs after enrichRows + transformRow. Removes items that don't meet
// alert criteria: balance must be > 0 and status must be flagged.
function filterRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const filtered = rows.filter((row) => {
    const balance = Number(row.balance);
    const status = row.status as string;
    return balance > 0 && status !== '';
  });

  // WHY: Sort — expired first (descending by date), then expiring (ascending by date)
  return filtered.sort((a, b) => {
    const statusA = a.status as string;
    const statusB = b.status as string;
    const isExpiredA = statusA === 'expired' ? 0 : 1;
    const isExpiredB = statusB === 'expired' ? 0 : 1;

    if (isExpiredA !== isExpiredB) return isExpiredA - isExpiredB;

    const daysA = Number(a.daysUntilExpiry);
    const daysB = Number(b.daysUntilExpiry);

    // WHY: Expired items sorted by expiry descending (most recently expired first).
    // Expiring items sorted ascending (soonest expiry first).
    if (statusA === 'expired') return daysB - daysA;
    return daysA - daysB;
  });
}

// --- Filter Options Fetcher ---

// WHY: Queries SUPPLIERS, SPEC4VALUES, FAMILY_LOG for dropdown values.
// Also builds the familyLookupMap used by transformRow.
async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  // Fetch all three lookups in parallel
  const [suppliersData, spec4Data, familyData] = await Promise.all([
    queryPriority('SUPPLIERS', {
      $select: 'SUPDES',
      $orderby: 'SUPDES',
      $top: 1000,
    }),
    queryPriority('SPEC4VALUES', {
      $select: 'SPEC4',
      $orderby: 'SPEC4',
      $top: 500,
    }).catch((err) => {
      // WHY: SPEC4VALUES may not have API access enabled. Log warning
      // so it's discoverable, but don't fail the whole filter fetch.
      console.warn('[bbd] SPEC4VALUES fetch failed, brands dropdown will be empty:', err instanceof Error ? err.message : err);
      return { value: [] };
    }),
    queryPriority('FAMILY_LOG', {
      $select: 'FAMILYNAME,FAMILYDESC',
      $orderby: 'FAMILYDESC',
      $top: 500,
    }),
  ]);

  // Vendors — deduplicate
  const vendorSet = new Set<string>();
  for (const row of suppliersData.value) {
    const name = row.SUPDES as string;
    if (name) vendorSet.add(name);
  }
  const vendors: FilterOption[] = Array.from(vendorSet)
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Brands from SPEC4VALUES
  // WHY: SPEC4VALUES field name needs API verification. Might be SPEC4, SPECVAL, etc.
  const brandSet = new Set<string>();
  for (const row of spec4Data.value) {
    const val = (row.SPEC4 ?? row.SPECVAL ?? row.SPEC4VAL) as string;
    if (val) brandSet.add(val);
  }
  const brands: FilterOption[] = Array.from(brandSet)
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Families from FAMILY_LOG — also build the lookup map for transformRow
  const newFamilyMap = new Map<string, string>();
  const families: FilterOption[] = [];
  for (const row of familyData.value) {
    const code = row.FAMILYNAME as string;
    const desc = row.FAMILYDESC as string;
    if (code && desc) {
      newFamilyMap.set(code, desc);
      families.push({ value: desc, label: desc });
    }
  }
  // WHY: Update module-level map atomically. transformRow reads this.
  familyLookupMap = newFamilyMap;

  // Perishable — hardcoded
  const perishables: FilterOption[] = [
    { value: 'Yes', label: 'Yes' },
    { value: 'No', label: 'No' },
  ];

  // Statuses — hardcoded
  const statuses: FilterOption[] = [
    { value: 'expired', label: 'Expired' },
    { value: 'expiring-perishable', label: 'Expiring Soon (Perishable)' },
    { value: 'expiring-non-perishable', label: 'Expiring Soon' },
  ];

  return { vendors, brands, families, perishables, statuses };
}

// --- Self-Registration ---

reportRegistry.set('bbd', {
  id: 'bbd',
  name: 'BBD — Best By Dates',
  entity: 'RAWSERIAL',
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
  filterRows,
  fetchFilters,
  rowStyleField: 'status',
  // WHY: BBD fetches all matching rows and filters in code (filterRows).
  // OData pagination is unreliable when post-fetch exclusion removes rows.
  // Frontend handles pagination client-side.
  clientSidePagination: true,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`

Expected: PASS. If `querySubform` signature doesn't match (it expects a different key format), check `server/src/services/priorityClient.ts` and adjust the `enrichRows` call.

- [ ] **Step 3: Uncomment the BBD import in filters.ts if you commented it in Task 2**

- [ ] **Step 4: Verify full server build**

Run: `cd server && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/bbdReport.ts
git commit -m "feat: BBD report definition with expiration logic, sub-form enrichment, and filter fetching"
```

---

## Task 5: Add Row-Level Styling to ReportTable (Frontend)

**Files:**
- Modify: `client/src/components/ReportTable.tsx`

- [ ] **Step 1: Add `rowStyleField` prop and style map**

Update `ReportTable.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Supports
//          optional row-level styling via rowStyleField.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import { formatCellValue } from '../utils/formatters';

// WHY: Maps status values to row CSS classes. Used when rowStyleField
// is present (e.g., BBD report colors rows by expiration urgency).
// Generic — any report can define status values that map to these classes.
const ROW_STYLE_MAP: Record<string, string> = {
  'expired': 'bg-red-50 border-l-2 border-l-red-400',
  'expiring-perishable': 'bg-orange-50 border-l-2 border-l-orange-400',
  'expiring-non-perishable': 'bg-amber-50 border-l-2 border-l-amber-400',
};

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  rowStyleField?: string;
}

export default function ReportTable({ columns, data, rowStyleField }: ReportTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider ${
                  col.type === 'currency' || col.type === 'number' ? 'text-right' : ''
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => {
            // WHY: When rowStyleField is set, look up the row's status value
            // in ROW_STYLE_MAP for per-row color coding. Falls back to
            // standard zebra striping when no match or no rowStyleField.
            const styleValue = rowStyleField ? String(row[rowStyleField] ?? '') : '';
            const rowStyle = ROW_STYLE_MAP[styleValue] ?? '';
            const zebraClass = !rowStyle && rowIdx % 2 === 1 ? 'bg-slate-50/30' : '';

            return (
              <tr
                key={rowIdx}
                className={`border-b border-slate-100 hover:bg-blue-50/60 transition-colors duration-150 ${
                  rowStyle || zebraClass
                }`}
              >
                {columns.map((col) => {
                  const { formatted, isNegative } = formatCellValue(row[col.key], col.type);
                  return (
                    <td
                      key={col.key}
                      className={`px-5 py-3 text-slate-700 whitespace-nowrap ${
                        col.type === 'currency' || col.type === 'number' ? 'text-right tabular-nums' : ''
                      } ${isNegative ? 'text-red-500' : ''}`}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Pass `rowStyleField` from ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`, update the `ReportTable` usage (around line 149-152):

Change:
```typescript
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={displayData}
          />
```

To:
```typescript
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={displayData}
            rowStyleField={data?.meta?.rowStyleField}
          />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`

Expected: PASS. The `data?.meta?.rowStyleField` access works because `ApiResponse.meta` is `ResponseMeta` which now has `rowStyleField?: string`.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ReportTable.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: row-level color coding in ReportTable via rowStyleField"
```

---

## Task 6: Add Purchasing Reports Page (Frontend Config)

**Files:**
- Modify: `client/src/config/pages.ts`

- [ ] **Step 1: Add the Purchasing Reports page**

In `client/src/config/pages.ts`, add the new page to the `pages` array (after the Receiving Log entry):

```typescript
  {
    id: 'purchasing-reports',
    name: 'Purchasing Reports',
    path: '/purchasing-reports',
    widgets: [
      {
        id: 'bbd',
        reportId: 'bbd',
        type: 'table',
        title: 'BBD — Best By Dates',
        colSpan: 12,
      },
    ],
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/config/pages.ts
git commit -m "feat: add Purchasing Reports page with BBD widget"
```

---

## Task 7: Integration Verification

- [ ] **Step 1: Run full TypeScript checks**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

Expected: Both PASS cleanly. Any failure here blocks the Railway Docker build.

- [ ] **Step 2: Start the dev servers**

Terminal 1: `cd server && npm run dev`
Terminal 2: `cd client && npm run dev`

- [ ] **Step 3: Verify the page loads**

Navigate to `http://localhost:5173/purchasing-reports`. Verify:
- Nav tab "Purchasing Reports" appears
- BBD widget renders (may show loading → error if Priority API credentials aren't configured locally)
- If API is available, verify:
  - Data loads with colored rows
  - Filters panel opens with dropdowns populated
  - Column manager works
  - Pagination works

- [ ] **Step 4: Verify GRV Log still works**

Navigate to `http://localhost:5173/receiving-log`. Verify:
- Data still loads correctly
- Filters still work (vendors, statuses dropdowns)
- No regressions from the `FiltersResponse` type change

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes from manual testing"
```

---

## Task 8: Pre-Deploy Verification

- [ ] **Step 1: Run pre-deploy checklist**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
```

Both must pass cleanly — any error kills the Railway Docker build.

- [ ] **Step 2: Test Docker build locally (optional)**

```bash
docker build -t priority-dashboard . && docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 priority-dashboard
```

- [ ] **Step 3: Push to deploy**

Only push when instructed by the user.

---

## API Field Verification Checklist

These fields need verification against the live Priority API. The implementing session should test these before finalizing:

- [ ] `Y_9966_5_ESH` exists on RAWSERIAL (Perishable SPEC9)
- [ ] `Y_9952_5_ESH` exists on RAWSERIAL (Brand SPEC4)
- [ ] `Y_2074_5_ESH` exists on RAWSERIAL (Family code)
- [ ] `RAWSERIALBAL_SUBFORM` — determine if it's Pattern A (single entity) or Pattern B (multi-record). Identify the balance field name (`TBALANCE`, `BALANCE`, or other).
- [ ] `SPEC4VALUES` entity — verify API access, confirm the field name for values (try `SPEC4`, `SPECVAL`, `SPEC4VAL`)
- [ ] `FAMILY_LOG` entity — verify `FAMILYNAME` and `FAMILYDESC` field names
- [ ] `SUPPLIERS` entity — verify `SUPDES` works for vendor descriptions (already used by GRV Log, should work)

Test command:
```bash
curl -u "username:password" -H "IEEE754Compatible: true" \
  "https://us.priority-connect.online/odata/Priority/tab{CODE}.ini/{COMPANY}/GetMetadataFor(entity='RAWSERIAL')"
```
