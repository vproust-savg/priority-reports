# Spec 03a — Backend: Advanced Filter Engine + Expanded Filter Options

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat query-param filtering with a structured filter engine that accepts Airtable-style filter groups (AND/OR with one nesting level), and expand the filters endpoint with warehouse/user dropdowns + column metadata.

**Architecture:** New `POST /query` endpoint accepts a `FilterGroup` tree in the request body. An OData filter builder translates server-side conditions to OData `$filter` strings, silently skipping client-side conditions (the frontend handles those). The existing GET endpoint stays for backward compatibility.

**Tech Stack:** Express + TypeScript, Zod validation, Upstash Redis cache, Priority oData API

> **Session scope:** ~1 hour Claude Code work (backend session only)
> **Date:** 2026-03-21
> **Status:** Ready to build
> **Parallel with:** spec-03b-frontend-advanced-filters.md (frontend session)
> **Depends on:** Spec 02a (backend already built — Priority client, report registry, GRV Log)

---

## 1. Scope

### 1.1 What Changes

1. New shared types — `FilterCondition`, `FilterGroup`, `FilterOperator`, `ColumnFilterMeta`, `QueryRequest`
2. OData filter builder service — translates a `FilterGroup` tree into an OData `$filter` string
3. New `POST /api/v1/reports/:reportId/query` endpoint
4. Expanded `/filters` endpoint — add `warehouses`, `users`, and `columns` metadata
5. Column filter metadata on GRV Log report definition
6. Report registry interface updated with `filterColumns`

### 1.2 Out of Scope

- Frontend changes (Spec 03b)
- Page renaming (frontend-only change)
- Client-side filtering logic (frontend responsibility)
- Removing the existing GET endpoint (stays for backward compatibility)
- Additional reports beyond GRV Log

### 1.3 Contract with Frontend (Spec 03b)

**New endpoint:** `POST /api/v1/reports/:reportId/query`

**Request body:**
```typescript
{
  filterGroup: FilterGroup;   // Filter tree (AND/OR groups)
  page: number;               // Default: 1
  pageSize: number;            // Default: 50
}
```

**Response shape:** Same `ApiResponse<T>` envelope — **do not modify `shared/types/api.ts`**.

**Updated filters endpoint:** `GET /api/v1/reports/:reportId/filters`

```typescript
{
  meta: { reportId: string; generatedAt: string },
  filters: {
    vendors: FilterOption[],
    statuses: FilterOption[],
    warehouses: FilterOption[],    // NEW
    users: FilterOption[]          // NEW
  },
  columns: ColumnFilterMeta[]     // NEW — tells frontend what operators/inputs each column supports
}
```

**Existing endpoint stays:** `GET /api/v1/reports/:reportId` with query params continues to work unchanged.

---

## 2. File Structure

### 2.1 New Files

| File | Purpose | ~Lines |
|------|---------|--------|
| `server/src/services/odataFilterBuilder.ts` | Converts FilterGroup tree to OData `$filter` string | ~110 |
| `server/src/routes/querySchemas.ts` | Zod validation schemas for POST /query request | ~40 |
| `server/src/routes/query.ts` | POST `/query` endpoint | ~110 |
| `server/tests/odataFilterBuilder.test.ts` | Unit tests for OData filter builder | ~140 |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `shared/types/filters.ts` | Replace flat `FilterValues` with new filter types |
| `server/src/config/reportRegistry.ts` | Add `filterColumns` to `ReportConfig` interface |
| `server/src/reports/grvLog.ts` | Add `filterColumns`, add `TOWARHSNAME` to `$select`, import shared `escapeODataString` |
| `server/src/routes/filters.ts` | Add warehouses, users, columns; use `Promise.allSettled` |
| `server/src/services/cache.ts` | Add `buildQueryCacheKey()` for POST body hashing |
| `server/src/index.ts` | Mount query router |

### 2.3 Deleted Files

None.

---

## 3. Shared Types (`shared/types/filters.ts`)

Replace the entire file. The old `FilterValues` interface is no longer needed (the frontend manages filter state using the new `FilterGroup` type instead).

**Parallel session note:** This session owns `shared/types/filters.ts`. The frontend session checks if these types already exist and skips if so.

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for the advanced filter engine. FilterGroup is a
//          tree structure with AND/OR groups, one level of nesting.
//          Used by both backend (OData translation) and frontend (UI state).
// USED BY: routes/query.ts, odataFilterBuilder.ts, FilterBuilder.tsx,
//          ReportTableWidget.tsx, routes/filters.ts
// EXPORTS: FilterOperator, FilterCondition, FilterGroup,
//          ColumnFilterType, ColumnFilterMeta, FilterOption,
//          FiltersResponse, QueryRequest
// ═══════════════════════════════════════════════════════════════

// --- Operators ---

// WHY: Grouped by type. The frontend shows different operator sets
// per column type. The backend only translates a subset to OData
// (contains/startsWith/endsWith are NOT supported by Priority OData).
export type FilterOperator =
  // Universal — available for all column types
  | 'equals' | 'notEquals' | 'isEmpty' | 'isNotEmpty'
  // Text — client-side only (Priority OData does not support these)
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  // Date
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter' | 'isBetween'
  // Number / Currency
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' | 'between';

// --- Filter Tree ---

export interface FilterCondition {
  id: string;               // UUID for React key
  field: string;             // Column key (e.g., 'vendor', 'date', 'truckTemp')
  operator: FilterOperator;
  value: string;             // Primary value (ISO date, text, number as string)
  valueTo?: string;          // Second value for 'between' / 'isBetween' operators
}

export interface FilterGroup {
  id: string;
  conjunction: 'and' | 'or';
  conditions: FilterCondition[];
  groups: FilterGroup[];     // One level of nesting max (UI enforces this)
}

// --- Column Metadata ---

export type ColumnFilterType = 'text' | 'date' | 'number' | 'currency' | 'enum';

export interface ColumnFilterMeta {
  key: string;                    // Column key, matches ColumnDefinition.key
  label: string;                  // Display label
  filterType: ColumnFilterType;
  filterLocation: 'server' | 'client';
  odataField?: string;            // Priority field name (server-side columns only)
  enumKey?: string;               // Key in FiltersResponse.filters (enum columns only)
}

// --- Filter Options (unchanged from Spec 02) ---

export interface FilterOption {
  value: string;
  label: string;
}

// --- API Shapes ---

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
    warehouses: FilterOption[];
    users: FilterOption[];
  };
  columns: ColumnFilterMeta[];
}

export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}
```

**Also verify `shared/types/index.ts`** still re-exports everything. The line `export * from './filters'` already exists — no change needed.

---

## 4. OData Filter Builder (`server/src/services/odataFilterBuilder.ts`)

### 4.1 Operator → OData Mapping

| FilterOperator | OData | Applies to | Notes |
|---|---|---|---|
| `equals` | `eq` | all server-side | Strings: `FIELD eq 'value'`. Numbers: `FIELD eq 123`. Dates: `FIELD eq 2026-01-01T00:00:00Z` |
| `notEquals` | `ne` | all server-side | Same patterns as `eq` |
| `isEmpty` | `eq ''` | text/enum | `STATDES eq ''` |
| `isNotEmpty` | `ne ''` | text/enum | `STATDES ne ''` |
| `isBefore` | `lt` | date | `CURDATE lt 2026-01-01T00:00:00Z` |
| `isAfter` | `gt` | date | `CURDATE gt 2026-01-01T00:00:00Z` |
| `isOnOrBefore` | `le` | date | `CURDATE le 2026-01-01T23:59:59Z` |
| `isOnOrAfter` | `ge` | date | `CURDATE ge 2026-01-01T00:00:00Z` |
| `isBetween` | `ge` + `le` | date | `CURDATE ge {from}T00:00:00Z and CURDATE le {to}T23:59:59Z` |
| `greaterThan` | `gt` | number/currency | `TOTPRICE gt 500` |
| `lessThan` | `lt` | number/currency | `TOTPRICE lt 1000` |
| `greaterOrEqual` | `ge` | number/currency | |
| `lessOrEqual` | `le` | number/currency | |
| `between` | `ge` + `le` | number/currency | `TOTPRICE ge 100 and TOTPRICE le 500` |
| `contains` | — | SKIP | Client-side only |
| `notContains` | — | SKIP | Client-side only |
| `startsWith` | — | SKIP | Client-side only |
| `endsWith` | — | SKIP | Client-side only |

### 4.2 AND/OR Group Handling

**AND groups:** Each server-side condition generates OData independently. Client-side conditions are skipped. Safe because AND is a narrowing operation — skipping a condition just means more rows are fetched, then the frontend filters them down.

**OR groups with mixed conditions:** If ANY condition in an OR group has `filterLocation === 'client'` OR uses a client-side-only operator, the ENTIRE group is skipped for OData. The frontend handles the full group client-side.

**WHY:** In an OR group, skipping a condition means we might NOT fetch rows that match it. This is data loss, not over-fetching. So the whole group must be either fully server-side or fully client-side.

### 4.3 Complete Code

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/odataFilterBuilder.ts
// PURPOSE: Converts a FilterGroup tree into an OData $filter string.
//          Only translates server-side columns with OData-compatible
//          operators. Client-side conditions are silently skipped.
// USED BY: routes/query.ts, reports/grvLog.ts
// EXPORTS: buildODataFilter, escapeODataString
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

// WHY: OData string literals use single quotes. Doubling escapes them.
// Used here and by grvLog.ts's legacy GET endpoint buildQuery().
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_ONLY_OPS = new Set(['contains', 'notContains', 'startsWith', 'endsWith']);

function formatValue(
  field: string, op: string, value: string, filterType: string,
): string | undefined {
  if (filterType === 'date') {
    if (!DATE_REGEX.test(value)) return undefined;
    const suffix = op === 'le' ? 'T23:59:59Z' : 'T00:00:00Z';
    return `${field} ${op} ${value}${suffix}`;
  }
  if (filterType === 'number' || filterType === 'currency') {
    const num = parseFloat(value);
    if (isNaN(num)) return undefined;
    return `${field} ${op} ${num}`;
  }
  return `${field} ${op} '${escapeODataString(value)}'`;
}

function buildCondition(
  c: FilterCondition, colMap: Map<string, ColumnFilterMeta>,
): string | undefined {
  const col = colMap.get(c.field);
  if (!col || col.filterLocation !== 'server' || !col.odataField) return undefined;
  if (CLIENT_ONLY_OPS.has(c.operator)) return undefined;

  const f = col.odataField;

  switch (c.operator) {
    case 'equals': return formatValue(f, 'eq', c.value, col.filterType);
    case 'notEquals': return formatValue(f, 'ne', c.value, col.filterType);
    // WHY: isEmpty/isNotEmpty only make sense for text/enum — dates and numbers
    // have no meaningful "empty string" in OData. Skip for other types.
    case 'isEmpty': return col.filterType === 'text' || col.filterType === 'enum' ? `${f} eq ''` : undefined;
    case 'isNotEmpty': return col.filterType === 'text' || col.filterType === 'enum' ? `${f} ne ''` : undefined;
    case 'isBefore': case 'isAfter': case 'isOnOrBefore': case 'isOnOrAfter': {
      if (!DATE_REGEX.test(c.value)) return undefined;
      const dateOps: Record<string, { op: string; suffix: string }> = {
        isBefore: { op: 'lt', suffix: 'T00:00:00Z' },
        isAfter: { op: 'gt', suffix: 'T00:00:00Z' },
        isOnOrBefore: { op: 'le', suffix: 'T23:59:59Z' },
        isOnOrAfter: { op: 'ge', suffix: 'T00:00:00Z' },
      };
      const d = dateOps[c.operator];
      return `${f} ${d.op} ${c.value}${d.suffix}`;
    }
    case 'isBetween': {
      if (!DATE_REGEX.test(c.value) || !c.valueTo || !DATE_REGEX.test(c.valueTo)) return undefined;
      return `${f} ge ${c.value}T00:00:00Z and ${f} le ${c.valueTo}T23:59:59Z`;
    }
    case 'greaterThan': case 'lessThan': case 'greaterOrEqual': case 'lessOrEqual': {
      const num = parseFloat(c.value);
      if (isNaN(num)) return undefined;
      const numOps: Record<string, string> = {
        greaterThan: 'gt', lessThan: 'lt', greaterOrEqual: 'ge', lessOrEqual: 'le',
      };
      return `${f} ${numOps[c.operator]} ${num}`;
    }
    case 'between': {
      const lo = parseFloat(c.value);
      const hi = c.valueTo ? parseFloat(c.valueTo) : NaN;
      if (isNaN(lo) || isNaN(hi)) return undefined;
      return `${f} ge ${lo} and ${f} le ${hi}`;
    }
    default: return undefined;
  }
}

// WHY: In an OR group, if ANY condition is client-side or uses a client-only
// operator, we skip the ENTIRE group. Skipping one branch of an OR means
// we'd miss rows that match it — that's data loss, not over-fetching.
function isFullyServerSide(
  group: FilterGroup, colMap: Map<string, ColumnFilterMeta>,
): boolean {
  for (const c of group.conditions) {
    const col = colMap.get(c.field);
    if (!col || col.filterLocation !== 'server' || !col.odataField) return false;
    if (CLIENT_ONLY_OPS.has(c.operator)) return false;
  }
  return group.groups.every((sub) => isFullyServerSide(sub, colMap));
}

function buildGroup(
  group: FilterGroup, colMap: Map<string, ColumnFilterMeta>,
): string | undefined {
  // WHY: If THIS group is OR and has any client-side conditions/operators,
  // skip the ENTIRE group — partial OR = data loss (missing matching rows).
  if (group.conjunction === 'or' && !isFullyServerSide(group, colMap)) return undefined;

  const parts: string[] = [];

  for (const c of group.conditions) {
    const odata = buildCondition(c, colMap);
    if (odata) parts.push(odata);
  }

  for (const sub of group.groups) {
    // WHY: Child OR groups with mixed conditions must also be skipped.
    if (sub.conjunction === 'or' && !isFullyServerSide(sub, colMap)) continue;
    const subOdata = buildGroup(sub, colMap);
    if (subOdata) parts.push(`(${subOdata})`);
  }

  if (parts.length === 0) return undefined;
  return parts.join(group.conjunction === 'and' ? ' and ' : ' or ');
}

export function buildODataFilter(
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): string | undefined {
  const colMap = new Map(filterColumns.map((c) => [c.key, c]));
  return buildGroup(filterGroup, colMap);
}
```

---

## 5. POST /query Endpoint

### 5.1 Zod Schemas (`server/src/routes/querySchemas.ts`)

WHY: Extracted from query.ts to keep both files under 150 lines.

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/querySchemas.ts
// PURPOSE: Zod validation schemas for the POST /query endpoint.
//          Extracted from query.ts to keep files under 150 lines.
// USED BY: routes/query.ts
// EXPORTS: QueryRequestSchema
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import type { FilterGroup } from '@shared/types';

const FilterConditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.enum([
    'equals', 'notEquals', 'isEmpty', 'isNotEmpty',
    'contains', 'notContains', 'startsWith', 'endsWith',
    'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween',
    'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'between',
  ]),
  value: z.string().default(''),
  valueTo: z.string().optional(),
});

// WHY: z.lazy for recursive type — FilterGroup contains FilterGroup[]
// WHY: .max() limits prevent abuse — UI allows 1 nesting level, but we
// cap at 10 groups / 50 conditions for defense-in-depth.
const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    id: z.string(),
    conjunction: z.enum(['and', 'or']),
    conditions: z.array(FilterConditionSchema).max(50),
    groups: z.array(FilterGroupSchema).max(10),
  }),
);

export const QueryRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(1000).default(50),
});
```

### 5.2 Route Handler (`server/src/routes/query.ts`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /api/v1/reports/:reportId/query endpoint.
//          Accepts a FilterGroup tree, translates server-side
//          conditions to OData, fetches from Priority, returns
//          same ApiResponse envelope as the GET endpoint.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildQueryCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { logApiCall } from '../services/logger';
import { QueryRequestSchema } from './querySchemas';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

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
    const cached = await cache.get<ApiResponse>(cacheKey);
    if (cached) {
      logApiCall({
        level: 'info', event: 'query_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
      });
      res.json(cached);
      return;
    }

    // WHY: Reuse report's $select and $orderby without duplicating them.
    // Call buildQuery with dummy params to get the base config.
    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });
    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    let priorityData;
    try {
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $orderby: baseParams.$orderby,
        $filter: odataFilter,
        $top: body.pageSize,
        $skip: (body.page - 1) * body.pageSize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[query] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // WHY: Some reports need sub-form data that can't use $expand.
    // enrichRows fetches sub-forms individually before transformRow parses them.
    let rawRows = priorityData.value;
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
      }
    }
    const rows = rawRows.map(report.transformRow);

    const pageSize = body.pageSize;
    const isLastPage = rows.length < pageSize;
    const totalCount = isLastPage
      ? (body.page - 1) * pageSize + rows.length
      : (body.page - 1) * pageSize + rows.length + 1;

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
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      columns: report.columns,
    };

    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'query_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
    });

    res.json(response);
  });

  return router;
}
```

---

## 6. Expanded Filters Endpoint (`server/src/routes/filters.ts`)

### 6.1 New Data Sources

**Warehouses** — from Priority `WAREHOUSES` entity:
```
GET /WAREHOUSES?$select=WARHSNAME,WARHSDES&$filter=INACTIVE ne 'Y'&$orderby=WARHSDES&$top=500
```
Map: `{ value: WARHSNAME, label: WARHSDES }`

**Users** — from Priority `USERLIST` entity:
```
GET /USERLIST?$select=USERLOGIN,USERNAME&$filter=INACTIVE ne 'Y'&$orderby=USERNAME&$top=500
```
Map: `{ value: USERLOGIN, label: USERNAME }`

### 6.2 Complete Code (full file replacement)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Vendors, warehouses, and users fetched from Priority.
//          Statuses are hardcoded (small known set). Also returns
//          column filter metadata for the filter builder UI.
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

// WHY: Extracted to named functions for Promise.allSettled — each can
// fail independently without blocking the others.
async function fetchVendors(entity: string): Promise<FilterOption[]> {
  const data = await queryPriority(entity, {
    $select: 'SUPNAME,CDES',
    $orderby: 'CDES',
    $top: 1000,
  });
  const map = new Map<string, string>();
  for (const row of data.value) {
    const code = row.SUPNAME as string;
    const name = row.CDES as string;
    if (code && name && !map.has(code)) map.set(code, name);
  }
  return Array.from(map.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchWarehouses(): Promise<FilterOption[]> {
  const data = await queryPriority('WAREHOUSES', {
    $select: 'WARHSNAME,WARHSDES',
    $filter: "INACTIVE ne 'Y'",
    $orderby: 'WARHSDES',
    $top: 500,
  });
  return data.value
    .filter((r) => r.WARHSNAME && r.WARHSDES)
    .map((r) => ({ value: r.WARHSNAME as string, label: r.WARHSDES as string }));
}

async function fetchUsers(): Promise<FilterOption[]> {
  const data = await queryPriority('USERLIST', {
    $select: 'USERLOGIN,USERNAME',
    $filter: "INACTIVE ne 'Y'",
    $orderby: 'USERNAME',
    $top: 500,
  });
  return data.value
    .filter((r) => r.USERLOGIN && r.USERNAME)
    .map((r) => ({ value: r.USERLOGIN as string, label: r.USERNAME as string }));
}

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
    const cached = await cache.get<FiltersResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // WHY: Promise.allSettled so one failed lookup doesn't block others.
    // If warehouses fail to load, vendors and statuses still work.
    const [vendorResult, warehouseResult, userResult] = await Promise.allSettled([
      fetchVendors(report.entity),
      fetchWarehouses(),
      fetchUsers(),
    ]);

    const vendors = vendorResult.status === 'fulfilled' ? vendorResult.value : [];
    const warehouses = warehouseResult.status === 'fulfilled' ? warehouseResult.value : [];
    const users = userResult.status === 'fulfilled' ? userResult.value : [];

    if (vendorResult.status === 'rejected') console.warn('[filters] Vendor fetch failed:', vendorResult.reason);
    if (warehouseResult.status === 'rejected') console.warn('[filters] Warehouse fetch failed:', warehouseResult.reason);
    if (userResult.status === 'rejected') console.warn('[filters] User fetch failed:', userResult.reason);

    const statuses: FilterOption[] = [
      { value: 'Received', label: 'Received' },
      { value: 'Cancelled', label: 'Cancelled' },
    ];

    const response: FiltersResponse = {
      meta: { reportId, generatedAt: new Date().toISOString() },
      filters: { vendors, statuses, warehouses, users },
      columns: report.filterColumns,
    };

    // WHY: Cache filter options for 5 min — they change infrequently
    cache.set(cacheKey, response, 300).catch(() => {});
    res.json(response);
  });

  return router;
}
```

---

## 7. Report Registry + GRV Log Updates

### 7.1 Updated `ReportConfig` Interface (`server/src/config/reportRegistry.ts`)

Add `filterColumns` to the interface and import `ColumnFilterMeta`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/reportRegistry.ts
// PURPOSE: Code-defined report configs. Each report specifies its
//          Priority entity, columns, OData query builder, and row
//          transformer. Adding a report = one file + register here.
// USED BY: routes/reports.ts, routes/filters.ts, routes/query.ts
// EXPORTS: ReportConfig, ReportFilters, reportRegistry, getReport
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';

export interface ReportFilters {
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportConfig {
  id: string;
  name: string;
  entity: string;
  columns: ColumnDefinition[];
  filterColumns: ColumnFilterMeta[];  // NEW — column filter metadata for filter builder
  buildQuery: (filters: ReportFilters) => ODataParams;
  transformRow: (raw: Record<string, unknown>) => Record<string, unknown>;
  // WHY: Priority's $expand truncates responses for some entities (DOCUMENTS_P).
  // Reports that need sub-form data use this to fetch it in a second step.
  enrichRows?: (rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
}

export const reportRegistry = new Map<string, ReportConfig>();

export function getReport(id: string): ReportConfig | undefined {
  return reportRegistry.get(id);
}
```

### 7.2 Updated GRV Log (`server/src/reports/grvLog.ts`)

Four changes:
1. Add `filterColumns` array (14 entries)
2. Add `TOWARHSNAME` to `$select` (needed for OData `$filter` on warehouse)
3. Replace local `escapeODataString` with import from `odataFilterBuilder`
4. Add `filterColumns` to the registry entry

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.ts
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P, then
//          fetches DOCUMENTSTEXT_SUBFORM per row (two-step pattern).
//          Parses HTML remarks into 7 structured inspection fields.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { querySubform } from '../services/priorityClient';
import { parseGrvRemarks } from '../services/htmlParser';
import { escapeODataString } from '../services/odataFilterBuilder';

const columns: ColumnDefinition[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'docNo', label: 'GRV #', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'total', label: 'Total', type: 'currency' },
  { key: 'driverId', label: 'Driver ID', type: 'string' },
  { key: 'licensePlate', label: 'License Plate', type: 'string' },
  { key: 'truckTemp', label: 'Truck Temp °F', type: 'string' },
  { key: 'productTemp', label: 'Product Temp °F', type: 'string' },
  { key: 'productCondition', label: 'Product Condition', type: 'string' },
  { key: 'truckCondition', label: 'Truck Condition', type: 'string' },
  { key: 'comments', label: 'Comments', type: 'string' },
  { key: 'receivedBy', label: 'Received By', type: 'string' },
];

const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME', enumKey: 'vendors' },
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSNAME', enumKey: 'warehouses' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', odataField: 'STATDES', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', odataField: 'TOTPRICE' },
  { key: 'receivedBy', label: 'Received By', filterType: 'enum', filterLocation: 'server', odataField: 'OWNERLOGIN', enumKey: 'users' },
  { key: 'driverId', label: 'Driver ID', filterType: 'text', filterLocation: 'client' },
  { key: 'licensePlate', label: 'License Plate', filterType: 'text', filterLocation: 'client' },
  { key: 'truckTemp', label: 'Truck Temp °F', filterType: 'text', filterLocation: 'client' },
  { key: 'productTemp', label: 'Product Temp °F', filterType: 'text', filterLocation: 'client' },
  { key: 'productCondition', label: 'Product Condition', filterType: 'text', filterLocation: 'client' },
  { key: 'truckCondition', label: 'Truck Condition', filterType: 'text', filterLocation: 'client' },
  { key: 'comments', label: 'Comments', filterType: 'text', filterLocation: 'client' },
];

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${escapeODataString(filters.vendor)}'`);
  if (filters.status) conditions.push(`STATDES eq '${escapeODataString(filters.status)}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    // WHY: TYPE included because DOCUMENTS_P has composite key (DOCNO + TYPE),
    // needed to fetch sub-forms in the enrichRows step.
    // WHY: TOWARHSNAME added for OData $filter — TOWARHSDES is displayed, TOWARHSNAME is filtered.
    $select: 'DOCNO,TYPE,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSNAME,TOWARHSDES,OWNERLOGIN',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
}

// WHY: Priority's $expand truncates responses on DOCUMENTS_P (CloudFront
// drops connection mid-body). Two-step fetch: get rows, then fetch each
// text sub-form individually. Batched in groups of 10 for rate limit safety.
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((row) =>
        querySubform(
          'DOCUMENTS_P',
          { DOCNO: row.DOCNO as string, TYPE: row.TYPE as string },
          'DOCUMENTSTEXT_SUBFORM',
        ),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      batch[j].DOCUMENTSTEXT_SUBFORM = results[j];
    }
  }

  return rows;
}

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  const subform = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | null;
  const htmlText = (subform?.TEXT as string) ?? null;
  const remarks = parseGrvRemarks(htmlText);

  return {
    date: raw.CURDATE,
    docNo: raw.DOCNO,
    vendor: raw.CDES,
    warehouse: raw.TOWARHSDES,
    status: raw.STATDES,
    total: raw.TOTPRICE,
    ...remarks,
    receivedBy: raw.OWNERLOGIN,
  };
}

// WHY: Self-registration — importing this file adds GRV Log to the registry.
reportRegistry.set('grv-log', {
  id: 'grv-log',
  name: 'GRV Log',
  entity: 'DOCUMENTS_P',
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
});
```

---

## 8. Cache Update (`server/src/services/cache.ts`)

Complete file replacement — adds `buildQueryCacheKey` and the `QueryRequest` import:

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
import type { QueryRequest } from '@shared/types';

// WHY: Abstraction layer so we can swap from Upstash to Railway Redis
// or any other provider by implementing one file. Business code
// only knows about CacheProvider, never about Upstash directly.
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set(key: string, data: unknown, ttlSeconds: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  isConnected(): Promise<boolean>;
}

// WHY: Cache keys must include ALL query params, not just reportId.
// Otherwise different pages of the same report return wrong cached data.
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string; vendor?: string; status?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 50}:${params.from ?? ''}:${params.to ?? ''}:v${params.vendor ?? ''}:st${params.status ?? ''}`;
}

// WHY: POST bodies can't use the same cache key format as GET params.
// JSON.stringify deterministically serializes the filter tree.
// Same filters in same order = same cache key.
export function buildQueryCacheKey(reportId: string, body: QueryRequest): string {
  const filterHash = JSON.stringify(body.filterGroup);
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

  async isConnected(): Promise<boolean> {
    return true;
  }
}

export function createCacheProvider(): CacheProvider {
  if (env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN) {
    return new UpstashCacheProvider(env.UPSTASH_REDIS_URL, env.UPSTASH_REDIS_TOKEN);
  }

  // WHY: Log warning so it's obvious in Railway logs when cache isn't configured.
  console.warn('[cache] No Upstash credentials — using in-memory cache (data lost on restart)');
  return new InMemoryCacheProvider();
}
```

---

## 9. Mount Query Router (`server/src/index.ts`)

Complete file replacement — adds query router import and mount:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/index.ts
// PURPOSE: Express entry point. Mounts all routes, configures CORS
//          and JSON parsing. In production, serves the React client.
// USED BY: npm run dev, npm start, tests (imports app)
// EXPORTS: app
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/environment';
import { createCacheProvider } from './services/cache';
import { createHealthRouter } from './routes/health';
import { createQueryRouter } from './routes/query';
import { createReportsRouter } from './routes/reports';
import { createFiltersRouter } from './routes/filters';
import { logStartup } from './services/logger';

const app = express();

app.use(cors());
app.use(express.json());

const cache = createCacheProvider();

// Mount API routes
// WHY: Query router before reports router — more specific path first.
app.use('/api/v1/health', createHealthRouter(cache));
app.use('/api/v1/reports', createQueryRouter(cache));
app.use('/api/v1/reports', createReportsRouter(cache));
app.use('/api/v1/reports', createFiltersRouter(cache));

// WHY: In production, Express serves the built React app.
// In development, Vite's dev server handles the frontend.
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../../client/dist')));

  // WHY: SPA catch-all — React Router handles client-side routing.
  // Without this, direct URL access to /overview returns 404.
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../../../client/dist/index.html'));
  });
}

export { app };

// WHY: Only start listening when run directly (not when imported by tests).
const isDirectRun = require.main === module ||
  process.argv[1]?.includes('tsx');

if (isDirectRun) {
  app.listen(env.PORT, async () => {
    const cacheConnected = await cache.isConnected();
    logStartup({
      port: env.PORT,
      environment: env.NODE_ENV,
      cacheStatus: cacheConnected ? 'connected' : 'disconnected',
    });
    console.log(`Server running on http://localhost:${env.PORT}`);
  });
}
```

---

## 10. Tests (`server/tests/odataFilterBuilder.test.ts`)

### 10.1 Complete Test Code

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/odataFilterBuilder.test.ts
// PURPOSE: Unit tests for OData filter builder. Validates operator
//          translation, group handling, injection prevention, and
//          client-side condition skipping.
// ═══════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { buildODataFilter, escapeODataString } from '../src/services/odataFilterBuilder';
import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

const COLS: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME', enumKey: 'vendors' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', odataField: 'STATDES', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', odataField: 'TOTPRICE' },
  { key: 'warehouse', label: 'WH', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSNAME', enumKey: 'warehouses' },
  { key: 'driverId', label: 'Driver', filterType: 'text', filterLocation: 'client' },
];

function g(conj: 'and' | 'or', conds: Array<{ field: string; operator: string; value: string; valueTo?: string }>, groups: FilterGroup[] = []): FilterGroup {
  return { id: 'g', conjunction: conj, conditions: conds.map((c, i) => ({ id: `c${i}`, field: c.field, operator: c.operator as any, value: c.value, valueTo: c.valueTo })), groups };
}

const f = (field: string, operator: string, value: string, valueTo?: string) => ({ field, operator, value, valueTo });
const build = (group: FilterGroup) => buildODataFilter(group, COLS);

describe('buildODataFilter', () => {
  it('returns undefined for empty group', () => { expect(build(g('and', []))).toBeUndefined(); });
  it('single equals', () => { expect(build(g('and', [f('vendor', 'equals', 'V00001')]))).toBe("SUPNAME eq 'V00001'"); });
  it('multiple AND', () => { expect(build(g('and', [f('vendor', 'equals', 'V00001'), f('total', 'greaterThan', '500')]))).toBe("SUPNAME eq 'V00001' and TOTPRICE gt 500"); });
  it('OR group', () => { expect(build(g('or', [f('status', 'equals', 'Received'), f('status', 'equals', 'Cancelled')]))).toBe("STATDES eq 'Received' or STATDES eq 'Cancelled'"); });

  it('AND with nested OR', () => {
    const or = g('or', [f('status', 'equals', 'Received'), f('status', 'equals', 'Cancelled')]);
    expect(build(g('and', [f('vendor', 'equals', 'V00001')], [or]))).toBe("SUPNAME eq 'V00001' and (STATDES eq 'Received' or STATDES eq 'Cancelled')");
  });

  // Date operators
  it('isBefore', () => { expect(build(g('and', [f('date', 'isBefore', '2026-01-15')]))).toBe('CURDATE lt 2026-01-15T00:00:00Z'); });
  it('isAfter', () => { expect(build(g('and', [f('date', 'isAfter', '2026-01-15')]))).toBe('CURDATE gt 2026-01-15T00:00:00Z'); });
  it('isOnOrBefore (T23:59:59Z)', () => { expect(build(g('and', [f('date', 'isOnOrBefore', '2026-01-15')]))).toBe('CURDATE le 2026-01-15T23:59:59Z'); });
  it('isOnOrAfter (T00:00:00Z)', () => { expect(build(g('and', [f('date', 'isOnOrAfter', '2026-01-15')]))).toBe('CURDATE ge 2026-01-15T00:00:00Z'); });
  it('isBetween', () => { expect(build(g('and', [f('date', 'isBetween', '2026-01-01', '2026-01-31')]))).toBe('CURDATE ge 2026-01-01T00:00:00Z and CURDATE le 2026-01-31T23:59:59Z'); });

  // Number operators
  it('numeric between', () => { expect(build(g('and', [f('total', 'between', '100', '500')]))).toBe('TOTPRICE ge 100 and TOTPRICE le 500'); });
  it('lessOrEqual', () => { expect(build(g('and', [f('total', 'lessOrEqual', '1000')]))).toBe('TOTPRICE le 1000'); });

  // isEmpty / isNotEmpty
  it('isEmpty', () => { expect(build(g('and', [f('status', 'isEmpty', '')]))).toBe("STATDES eq ''"); });
  it('isNotEmpty', () => { expect(build(g('and', [f('vendor', 'isNotEmpty', '')]))).toBe("SUPNAME ne ''"); });

  // Client-side skipping
  it('skips client-side operators', () => { expect(build(g('and', [f('vendor', 'contains', 'test')]))).toBeUndefined(); });
  it('skips client-side columns', () => { expect(build(g('and', [f('driverId', 'equals', 'John')]))).toBeUndefined(); });

  // WHY: Root-level OR with all server-side conditions should produce OData
  it('root OR group (all server-side)', () => {
    expect(build(g('or', [f('vendor', 'equals', 'V00001'), f('status', 'equals', 'Received')]))).toBe("SUPNAME eq 'V00001' or STATDES eq 'Received'");
  });

  // WHY: Root-level OR with mixed conditions must skip entire group (data loss)
  it('skips root OR group if any condition is client-side', () => {
    expect(build(g('or', [f('vendor', 'equals', 'V00001'), f('driverId', 'equals', 'John')]))).toBeUndefined();
  });

  it('skips nested OR group if any condition is client-side', () => {
    const or = g('or', [f('vendor', 'equals', 'V00001'), f('driverId', 'equals', 'John')]);
    expect(build(g('and', [f('status', 'equals', 'Received')], [or]))).toBe("STATDES eq 'Received'");
  });

  it('skips entire OR group if any uses client-only operator', () => {
    const or = g('or', [f('vendor', 'equals', 'V00001'), f('vendor', 'contains', 'test')]);
    expect(build(g('and', [], [or]))).toBeUndefined();
  });

  // Security / edge cases
  it('ignores unknown fields', () => { expect(build(g('and', [f('nope', 'equals', 'x'), f('vendor', 'equals', 'V00001')]))).toBe("SUPNAME eq 'V00001'"); });
  it('escapes single quotes', () => { expect(build(g('and', [f('vendor', 'equals', "O'Brien")]))).toBe("SUPNAME eq 'O''Brien'"); });
  it('skips invalid dates', () => { expect(build(g('and', [f('date', 'isAfter', 'bad')]))).toBeUndefined(); });
  it('skips NaN numbers', () => { expect(build(g('and', [f('total', 'greaterThan', 'abc')]))).toBeUndefined(); });
});

describe('escapeODataString', () => {
  it('doubles quotes', () => { expect(escapeODataString("O'Brien")).toBe("O''Brien"); });
  it('no-op on clean strings', () => { expect(escapeODataString('normal')).toBe('normal'); });
});
```

---

## 11. Priority API Constraints (Reference)

These constraints affect this implementation:

- **No `startswith()` or `contains()` in OData** — operators `contains`, `startsWith`, `endsWith`, `notContains` are client-side only
- **Rate limit:** 100 calls/minute — the new warehouses and users lookups add 2 more calls to the filters endpoint. With the existing vendor lookup, that's 3 parallel calls. Well within limits.
- **MAXAPILINES cap:** 2,000 records per query context — pagination with `$top`/`$skip` works up to this limit.
- **OData operators:** `eq`, `ne`, `gt`, `ge`, `lt`, `le`, `and`, `or` — all used by the filter builder
- **Single quotes in values:** Must be escaped as `''` — handled by `escapeODataString()`

---

## 12. Acceptance Criteria

### Must Pass

- [ ] `POST /api/v1/reports/grv-log/query` with empty filterGroup returns all data
- [ ] POST with date condition filters by date range in OData
- [ ] POST with vendor condition filters by SUPNAME in OData
- [ ] POST with warehouse condition filters by TOWARHSNAME in OData
- [ ] POST with nested OR group produces correct OData with parentheses
- [ ] POST with client-side-only conditions (e.g., `contains`) skips them in OData
- [ ] POST with mixed OR group (server + client) skips entire group in OData
- [ ] `GET /api/v1/reports/grv-log/filters` returns `warehouses` array
- [ ] `GET /api/v1/reports/grv-log/filters` returns `users` array
- [ ] `GET /api/v1/reports/grv-log/filters` returns `columns` with 14 entries
- [ ] Each column has correct `filterType`, `filterLocation`, `odataField`
- [ ] Existing GET endpoint still works unchanged
- [ ] Cache works for POST endpoint
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] `cd server && npm test` passes (existing + new tests)
- [ ] OData filter builder has unit tests for all operator types
- [ ] All files under 150 lines with intent blocks

### Security

- [ ] Unknown field names in conditions are silently ignored
- [ ] String values are escaped via `escapeODataString()`
- [ ] Number values are validated with `parseFloat()`
- [ ] Date values are regex-validated

---

## 13. Common Mistakes to Avoid

- Using `$expand=DOCUMENTSTEXT_SUBFORM` — this truncates on CloudFront. Keep the existing two-step fetch via `enrichRows()`.
- Using `startswith()` or `contains()` in OData — Priority returns 501. These are client-side only.
- Modifying `shared/types/api.ts` — the `ApiResponse` envelope must stay unchanged.
- Building `$filter` with user input without escaping — always use `escapeODataString()`.
- Making files > 150 lines — split if approaching the limit.
- Forgetting intent blocks on new files.
- Not handling `WAREHOUSES` or `USERLIST` fetch failures gracefully — use `Promise.allSettled()`.
- Using `app.get('*', ...)` for catch-all — Express 5 requires `app.get('/{*path}', ...)`.
- Using `$expand` on DOCUMENTS_P — use the two-step `querySubform()` pattern.

---

## 14. Implementation Plan

### TSC Expectations

> **⚠️ TypeScript fails between Tasks 1–5** (expected — `FiltersResponse` shape in `filters.ts` route doesn't match the updated type until Task 6).
> **✅ TSC passes from Task 6 onward.** `npm test` works throughout (Vitest compiles per-file).

---

### Task 1: Create Branch + Shared Types

**Files:**
- Create branch: `feat/03a-backend-advanced-filters`
- Modify: `shared/types/filters.ts` (full replacement)
- Verify: `shared/types/index.ts`

- [ ] **Step 1:** Read `CLAUDE.md` — note mandatory code rules.
- [ ] **Step 2:** Create branch: `git checkout -b feat/03a-backend-advanced-filters`
- [ ] **Step 3:** Replace `shared/types/filters.ts` with the complete code from **Section 3**.
- [ ] **Step 4:** Verify `shared/types/index.ts` has `export * from './filters'` — no change needed.
- [ ] **Step 5:** Note: TSC will fail (expected — `filters.ts` route uses old `FiltersResponse` shape).

---

### Task 2: OData Filter Builder

**Files:**
- Create: `server/src/services/odataFilterBuilder.ts`

- [ ] **Step 1:** Create `server/src/services/odataFilterBuilder.ts` with the complete code from **Section 4.3**.
- [ ] **Step 2:** Verify the file is under 150 lines and has an intent block.

---

### Task 3: OData Filter Builder Tests

**Files:**
- Create: `server/tests/odataFilterBuilder.test.ts`

- [ ] **Step 1:** Create `server/tests/odataFilterBuilder.test.ts` with the complete code from **Section 10.1**.
- [ ] **Step 2:** Run: `cd server && npm test`
- [ ] **Step 3:** Expected: all tests pass (existing health + htmlParser tests, plus new odataFilterBuilder tests).

---

### Task 4: Report Registry Update

**Files:**
- Modify: `server/src/config/reportRegistry.ts`

- [ ] **Step 1:** Replace `server/src/config/reportRegistry.ts` with the complete code from **Section 7.1**.
- [ ] **Step 2:** Verify `ColumnFilterMeta` import from `@shared/types` is present.
- [ ] **Step 3:** Note: TSC still fails (expected — `grvLog.ts` doesn't provide `filterColumns` yet).

---

### Task 5: GRV Log Update

**Files:**
- Modify: `server/src/reports/grvLog.ts`

- [ ] **Step 1:** Replace `server/src/reports/grvLog.ts` with the complete code from **Section 7.2**.
- [ ] **Step 2:** Verify: local `escapeODataString` function is gone — imported from `odataFilterBuilder` instead.
- [ ] **Step 3:** Verify: `$select` now includes `TOWARHSNAME` (for OData filtering).
- [ ] **Step 4:** Verify: `filterColumns` is included in the `reportRegistry.set()` call.
- [ ] **Step 5:** Note: TSC still fails (expected — `filters.ts` route not updated yet).

---

### Task 6: Filters Route Rewrite

**Files:**
- Modify: `server/src/routes/filters.ts` (full replacement)

- [ ] **Step 1:** Replace `server/src/routes/filters.ts` with the complete code from **Section 6.2**.
- [ ] **Step 2:** Run: `cd server && npx tsc --noEmit`
- [ ] **Step 3:** Expected: **TSC passes!** (all type mismatches resolved).

---

### Task 7: Cache Update

**Files:**
- Modify: `server/src/services/cache.ts` (full replacement)

- [ ] **Step 1:** Replace `server/src/services/cache.ts` with the complete code from **Section 8**.
- [ ] **Step 2:** Run: `cd server && npx tsc --noEmit` — passes.

---

### Task 8: Query Route

**Files:**
- Create: `server/src/routes/querySchemas.ts`
- Create: `server/src/routes/query.ts`

- [ ] **Step 1:** Create `server/src/routes/querySchemas.ts` with the complete code from **Section 5.1**.
- [ ] **Step 2:** Create `server/src/routes/query.ts` with the complete code from **Section 5.2**.
- [ ] **Step 3:** Verify both files are under 150 lines and have intent blocks.
- [ ] **Step 4:** Run: `cd server && npx tsc --noEmit` — passes.

---

### Task 9: Mount Query Router

**Files:**
- Modify: `server/src/index.ts` (full replacement)

- [ ] **Step 1:** Replace `server/src/index.ts` with the complete code from **Section 9**.
- [ ] **Step 2:** Run: `cd server && npx tsc --noEmit` — passes.

---

### Task 10: Run All Tests + Verify

- [ ] **Step 1:** Run: `cd server && npm test`
- [ ] **Step 2:** Expected: all tests pass (health, htmlParser, odataFilterBuilder).
- [ ] **Step 3:** Run: `cd server && npx tsc --noEmit` — passes.
- [ ] **Step 4:** Verify no remaining imports of `FilterValues` in `server/`:
  ```bash
  grep -r "FilterValues" server/src/ --include="*.ts"
  ```
  Expected: no results (the server never imported `FilterValues`).
- [ ] **Step 5:** Verify all modified/created files are under 150 lines:
  ```bash
  wc -l server/src/services/odataFilterBuilder.ts server/src/routes/query.ts server/src/routes/filters.ts server/src/reports/grvLog.ts server/src/config/reportRegistry.ts server/src/services/cache.ts server/src/index.ts
  ```

---

### Task 11: Commit

- [ ] **Step 1:** Stage all changes:
  ```bash
  git add shared/types/filters.ts server/src/services/odataFilterBuilder.ts server/src/routes/querySchemas.ts server/src/routes/query.ts server/tests/odataFilterBuilder.test.ts server/src/config/reportRegistry.ts server/src/reports/grvLog.ts server/src/routes/filters.ts server/src/services/cache.ts server/src/index.ts
  ```
- [ ] **Step 2:** Commit:
  ```bash
  git commit -m "feat: add POST /query endpoint with OData filter builder and expanded filters"
  ```

---

### Task 12: Airtable Status Update

- [ ] **Step 1:** Use the `/airtable-api` skill for patterns.
- [ ] **Step 2:** Update record `recJluOijRUZcZnBS` in table `tblvqv3S31KQhKRU6` (base `appjwOgR4HsXeGIda`):
  - Field `fldAAdwPBUQBRQet7` (Claude Status) → `"In Progress"`
  - Field `fld1cKObhpMuz3VYq` (Claude Comments) → `"Spec 03a backend complete: POST /query endpoint with OData filter builder, expanded /filters with warehouses+users+columns. All tests pass."`
- [ ] **Step 3:** Add a comment to the record via POST.
- [ ] **Step 4:** **NEVER modify** fields `fld88uqAVUuDWUaBQ` (Victor Status) or `fldfGYjvGFcxvGC1K` (Victor Comments).
