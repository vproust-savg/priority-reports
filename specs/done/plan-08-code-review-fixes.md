# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all issues from three rounds of code review — crash prevention, error visibility, test coverage, and code quality.

**Architecture:** No architectural changes. One shared-type addition (`warnings` on `ApiResponse`), localized backend error handling fixes, four new test suites, and frontend UX/performance improvements. Each task is independently deployable.

**Tech Stack:** TypeScript, Express, Vitest, React 19, Tailwind CSS v4, TanStack Query v5

**Spec:** `specs/08-code-review-fixes/spec-08-code-review-fixes.md`

---

## File Structure

| File | Action | Task |
|------|--------|------|
| `shared/types/api.ts` | Modify | 1 |
| `server/src/reports/grvLog.ts` | Modify | 2 |
| `server/src/routes/reports.ts` | Modify | 3 |
| `server/src/routes/query.ts` | Modify | 3, 4 |
| `server/src/routes/filters.ts` | Modify | 3 |
| `server/tests/odataFilterBuilder.test.ts` | **Create** | 5 |
| `server/tests/htmlParser.test.ts` | Modify | 6 |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modify | 4, 7 |
| `client/src/components/filter/FilterConditionRow.tsx` | Modify | 8 |
| `client/src/components/filter/FilterBuilder.tsx` | Modify | 8 |
| `client/src/components/filter/FilterGroupPanel.tsx` | Modify | 8 |
| `client/src/hooks/useBaseDataset.ts` | Modify | 8 |
| `client/src/utils/clientFilter.ts` | Modify | 8 |
| `client/src/utils/clientFilter.test.ts` | **Create** | 9 |
| `client/src/utils/filterDragUtils.test.ts` | **Create** | 10 |
| `server/src/services/cache.ts` | Modify | 8 |
| `server/src/services/odataFilterBuilder.ts` | Modify | 8 |
| `client/src/utils/weekUtils.ts` | Modify | 8 |
| `client/src/hooks/useColumnManager.ts` | Modify | 8 |
| `client/src/components/Layout.tsx` | Modify | 11 |
| `client/src/components/filter/WeekPickerDropdown.tsx` | No change | — |

---

## Task 1: Add `warnings` field to `ApiResponse` (I1 Part A)

Shared type change — must go first since Tasks 3, 4 depend on it.

**Files:**
- Modify: `shared/types/api.ts:34-39`

- [ ] **Step 1: Add `warnings` to `ApiResponse`**

In `shared/types/api.ts`, add the `warnings` field:

```typescript
// WHY: Every endpoint returns this exact shape so the frontend needs
// only ONE response handler. Adding a new report never requires
// new frontend parsing logic.
export interface ApiResponse<T = Record<string, unknown>> {
  meta: ResponseMeta;
  data: T[];
  pagination: PaginationMeta;
  columns: ColumnDefinition[];
  warnings?: string[];  // WHY: Degraded data quality indicators (e.g., sub-form fetch failed)
}
```

- [ ] **Step 2: Verify both sides compile**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors (field is optional, existing code unchanged)

- [ ] **Step 3: Commit**

```bash
git add shared/types/api.ts
git commit -m "feat: add optional warnings field to ApiResponse for degraded data visibility"
```

---

## Task 2: Fix warehouse OData field + deduplicate escapeODataString (C1, I10)

Two quick fixes in `grvLog.ts`.

**Files:**
- Modify: `server/src/reports/grvLog.ts:14,17-22,45`

- [ ] **Step 1: Add import of `escapeODataString` from odataFilterBuilder**

At line 14 of `grvLog.ts`, after the existing imports, add:

```typescript
import { escapeODataString } from '../services/odataFilterBuilder';
```

- [ ] **Step 2: Delete local `escapeODataString` function**

Remove lines 17-22 (the WHY comment and the function body):

```typescript
// DELETE these 6 lines:
// WHY: OData string literals use single quotes. A bare quote in a value
// breaks the query. Doubling escapes it: O'Brien → O''Brien.
// Zod regex blocks quotes today, but this is defense in depth.
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
```

- [ ] **Step 3: Fix warehouse OData field**

Change line 45 (after the deletions above, line numbers shift — find the warehouse filterColumn entry):

From:
```typescript
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSNAME', enumKey: 'warehouses' },
```

To:
```typescript
  // WHY: TOWARHSDES (description) is in $select and matches dropdown values.
  // TOWARHSNAME (code) is not in $select and would cause filter mismatch.
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSDES', enumKey: 'warehouses' },
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run existing tests**

Run: `cd server && npm test`
Expected: All existing tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "fix: correct warehouse OData field to TOWARHSDES, deduplicate escapeODataString"
```

---

## Task 3: Guard all cache operations + Zod parses + cache.set logging (C2, C3, I2)

Crash prevention across all three route files.

**Files:**
- Modify: `server/src/routes/reports.ts:57,61,126,140,143`
- Modify: `server/src/routes/query.ts:57,125`
- Modify: `server/src/routes/filters.ts:33,87`

- [ ] **Step 1: Fix `reports.ts` — wrap Zod parse at line 57**

Replace line 57:
```typescript
    const params = QueryParamsSchema.parse(req.query);
```

With:
```typescript
    let params;
    try {
      params = QueryParamsSchema.parse(req.query);
    } catch (err) {
      res.status(400).json({ error: 'Invalid query parameters', details: err });
      return;
    }
```

- [ ] **Step 2: Fix `reports.ts` — wrap cache.get at line 61**

Replace line 61:
```typescript
    const cached = await cache.get<ApiResponse>(cacheKey);
```

With:
```typescript
    // WHY: Redis failure should degrade to cache miss, not crash the route
    let cached: ApiResponse | null = null;
    try {
      cached = await cache.get<ApiResponse>(cacheKey);
    } catch (err) {
      console.warn(`[reports] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
```

- [ ] **Step 3: Fix `reports.ts` — add logging to cache.set catch at line 126**

Replace:
```typescript
    cache.set(cacheKey, response, 300).catch(() => {});
```

With:
```typescript
    cache.set(cacheKey, response, 300).catch((err) => {
      console.warn(`[reports] Cache write failed for ${cacheKey}:`, err);
    });
```

- [ ] **Step 4: Fix `reports.ts` — wrap Zod parse + cache.invalidate in refresh handler (lines 140-143)**

Replace:
```typescript
    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    await cache.invalidate(cacheKey);
```

With:
```typescript
    let params;
    try {
      params = QueryParamsSchema.parse(req.query);
    } catch (err) {
      res.status(400).json({ error: 'Invalid query parameters', details: err });
      return;
    }
    const cacheKey = buildCacheKey(reportId, params);

    try {
      await cache.invalidate(cacheKey);
    } catch (err) {
      console.warn(`[reports] Cache invalidate failed for ${cacheKey}:`, err);
    }
```

- [ ] **Step 5: Fix `query.ts` — wrap cache.get at line 57**

Replace:
```typescript
    const cached = await cache.get<ApiResponse>(cacheKey);
```

With:
```typescript
    let cached: ApiResponse | null = null;
    try {
      cached = await cache.get<ApiResponse>(cacheKey);
    } catch (err) {
      console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
```

- [ ] **Step 6: Fix `query.ts` — add logging to cache.set catch at line 125**

Replace:
```typescript
    cache.set(cacheKey, response, cacheTtl).catch(() => {});
```

With:
```typescript
    cache.set(cacheKey, response, cacheTtl).catch((err) => {
      console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
    });
```

- [ ] **Step 7: Fix `filters.ts` — wrap cache.get at line 33**

Replace:
```typescript
    const cached = await cache.get<FiltersResponse>(cacheKey);
```

With:
```typescript
    let cached: FiltersResponse | null = null;
    try {
      cached = await cache.get<FiltersResponse>(cacheKey);
    } catch (err) {
      console.warn(`[filters] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
```

- [ ] **Step 8: Fix `filters.ts` — add logging to cache.set catch at line 87**

Replace:
```typescript
    cache.set(cacheKey, response, 300).catch(() => {});
```

With:
```typescript
    cache.set(cacheKey, response, 300).catch((err) => {
      console.warn(`[filters] Cache write failed for ${cacheKey}:`, err);
    });
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
git add server/src/routes/reports.ts server/src/routes/query.ts server/src/routes/filters.ts
git commit -m "fix: guard cache operations and Zod parses against crashes, log cache failures"
```

---

## Task 4: Enrichment failure warning — backend + frontend (I1 Parts B+C)

Add `warnings` array to enrichment catch blocks, render warning banner on frontend.

**Files:**
- Modify: `server/src/routes/query.ts:93-101`
- Modify: `server/src/routes/reports.ts:85-95,106-123`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx:133-138`

- [ ] **Step 1: Fix `query.ts` — add warnings to enrichment and response**

Replace lines 93-101 (the enrichRows block):
```typescript
    let rawRows = priorityData.value;
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
      }
    }
```

With:
```typescript
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
```

Then add `warnings` to the existing response object (around line 106). Keep all existing `meta` and `pagination` properties unchanged — only add the `warnings` line:
```typescript
      columns: report.columns,
      warnings: warnings.length > 0 ? warnings : undefined,  // ← ADD this line
    };
```

- [ ] **Step 2: Fix `reports.ts` — same pattern**

Replace the enrichRows block (around lines 85-95):
```typescript
    let rawRows = priorityData.value;
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[reports] Sub-form enrichment failed for ${reportId}: ${message}`);
        // WHY: Continue with un-enriched rows rather than failing the request.
        // The transform will produce null fields for the missing sub-form data.
      }
    }
```

With:
```typescript
    let rawRows = priorityData.value;
    const warnings: string[] = [];
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[reports] Sub-form enrichment failed for ${reportId}: ${message}`);
        // WHY: Continue with un-enriched rows — partial data with a warning
        // is better UX than failing entirely. The transform produces null fields.
        warnings.push('Sub-form data unavailable — some columns may be blank');
      }
    }
```

Add `warnings` to the existing response object (around line 106). Keep all existing `meta` and `pagination` properties unchanged — only add the `warnings` line:
```typescript
      columns: report.columns,
      warnings: warnings.length > 0 ? warnings : undefined,  // ← ADD this line
    };
```

- [ ] **Step 3: Add warning banner to `ReportTableWidget.tsx`**

After the existing `hasSkippedOr` warning banner (after line 138), add:

```typescript
      {activeData?.warnings && activeData.warnings.length > 0 && activeData.warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}
```

- [ ] **Step 4: Verify both sides compile**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run server tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/query.ts server/src/routes/reports.ts client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: surface enrichment failure as warning banner instead of silent blank columns"
```

---

## Task 5: Write `odataFilterBuilder` test suite (C4)

TDD for the most critical untested code. Tests the existing implementation — no production code changes.

**Files:**
- Create: `server/tests/odataFilterBuilder.test.ts`
- Reference: `server/src/services/odataFilterBuilder.ts` (135 lines, 15 server-side operators)

- [ ] **Step 1: Create test file with helpers**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/odataFilterBuilder.test.ts
// PURPOSE: Tests for OData filter string generation from FilterGroup
//          trees. Covers all operators, edge cases, and safety checks.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildODataFilter, escapeODataString } from '../src/services/odataFilterBuilder';
import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

const COLUMNS: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME', enumKey: 'vendors' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', odataField: 'STATDES', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', odataField: 'TOTPRICE' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'driverId', label: 'Driver ID', filterType: 'text', filterLocation: 'client' },
];

function makeGroup(
  conditions: FilterCondition[],
  conjunction: 'and' | 'or' = 'and',
  groups: FilterGroup[] = [],
): FilterGroup {
  return { id: 'root', conjunction, conditions, groups };
}

function makeCond(
  field: string, operator: string, value = '', valueTo?: string,
): FilterCondition {
  return { id: 'c1', field, operator: operator as FilterCondition['operator'], value, valueTo };
}
```

- [ ] **Step 2: Add escapeODataString + basic operator tests**

```typescript
describe('escapeODataString', () => {
  it('doubles single quotes', () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
  });
  it('handles multiple quotes', () => {
    expect(escapeODataString("it's a 'test'")).toBe("it''s a ''test''");
  });
  it('returns unchanged string without quotes', () => {
    expect(escapeODataString('ACME Corp')).toBe('ACME Corp');
  });
});

describe('text/enum operators', () => {
  it('builds equals for text', () => {
    const group = makeGroup([makeCond('docNo', 'equals', 'GRV-001')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("DOCNO eq 'GRV-001'");
  });
  it('builds notEquals for enum', () => {
    const group = makeGroup([makeCond('status', 'notEquals', 'Received')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES ne 'Received'");
  });
  it('builds isEmpty for text', () => {
    const group = makeGroup([makeCond('docNo', 'isEmpty')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("DOCNO eq ''");
  });
  it('builds isNotEmpty for enum', () => {
    const group = makeGroup([makeCond('vendor', 'isNotEmpty')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME ne ''");
  });
  it('escapes quotes in values', () => {
    const group = makeGroup([makeCond('vendor', 'equals', "O'Brien")]);
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'O''Brien'");
  });
});

describe('date operators', () => {
  it('builds isBefore with T00:00:00Z suffix', () => {
    const group = makeGroup([makeCond('date', 'isBefore', '2026-01-15')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE lt 2026-01-15T00:00:00Z');
  });
  it('builds isAfter', () => {
    const group = makeGroup([makeCond('date', 'isAfter', '2026-02-20')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE gt 2026-02-20T00:00:00Z');
  });
  it('builds isOnOrBefore with T23:59:59Z suffix', () => {
    const group = makeGroup([makeCond('date', 'isOnOrBefore', '2026-03-10')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE le 2026-03-10T23:59:59Z');
  });
  it('builds isOnOrAfter', () => {
    const group = makeGroup([makeCond('date', 'isOnOrAfter', '2026-03-10')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-03-10T00:00:00Z');
  });
  it('builds isBetween as ge/le range', () => {
    const group = makeGroup([makeCond('date', 'isBetween', '2026-01-01', '2026-01-31')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-01-01T00:00:00Z and CURDATE le 2026-01-31T23:59:59Z');
  });
  it('builds isInWeek same as isBetween', () => {
    const group = makeGroup([makeCond('date', 'isInWeek', '2026-03-16', '2026-03-22')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-03-16T00:00:00Z and CURDATE le 2026-03-22T23:59:59Z');
  });
  it('returns undefined for invalid date format', () => {
    const group = makeGroup([makeCond('date', 'isBefore', 'not-a-date')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('returns undefined for inverted date range', () => {
    const group = makeGroup([makeCond('date', 'isBetween', '2026-12-31', '2026-01-01')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
});

describe('numeric operators', () => {
  it('builds greaterThan', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', '100')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE gt 100');
  });
  it('builds lessThan', () => {
    const group = makeGroup([makeCond('total', 'lessThan', '50')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE lt 50');
  });
  it('builds between as ge/le range', () => {
    const group = makeGroup([makeCond('total', 'between', '10', '200')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE ge 10 and TOTPRICE le 200');
  });
  it('builds greaterOrEqual', () => {
    const group = makeGroup([makeCond('total', 'greaterOrEqual', '100')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE ge 100');
  });
  it('builds lessOrEqual', () => {
    const group = makeGroup([makeCond('total', 'lessOrEqual', '50')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE le 50');
  });
  it('returns undefined for NaN value', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', 'abc')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('returns undefined for inverted numeric range', () => {
    const group = makeGroup([makeCond('total', 'between', '200', '10')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
});
```

- [ ] **Step 3: Add conjunction, client-skip, and OR-safety tests**

```typescript
describe('conjunctions', () => {
  it('joins AND conditions with "and"', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('status', 'equals', 'Received'),
    ], 'and');
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME' and STATDES eq 'Received'");
  });
  it('joins OR conditions with "or"', () => {
    const group = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('status', 'equals', 'Cancelled'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES eq 'Received' or STATDES eq 'Cancelled'");
  });
});

describe('client-side skipping', () => {
  it('skips client-only columns', () => {
    const group = makeGroup([makeCond('driverId', 'equals', '123')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips client-only operators (contains)', () => {
    const group = makeGroup([makeCond('vendor', 'contains', 'ACM')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips conditions with unknown field', () => {
    const group = makeGroup([makeCond('unknown', 'equals', 'x')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips empty conditions (no field)', () => {
    const group = makeGroup([makeCond('', 'equals', 'x')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('filters only server-side conditions in AND group', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('driverId', 'contains', '123'),
    ], 'and');
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME'");
  });
});

describe('OR-group safety (isFullyServerSide)', () => {
  it('skips entire OR group with any client-side condition', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('driverId', 'equals', '123'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips entire OR group with client-only operator', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('docNo', 'contains', 'GRV'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('keeps OR group when fully server-side', () => {
    const group = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('status', 'equals', 'Cancelled'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES eq 'Received' or STATDES eq 'Cancelled'");
  });
});

describe('nested groups', () => {
  it('wraps nested group in parentheses', () => {
    const group = makeGroup(
      [makeCond('vendor', 'equals', 'ACME')],
      'and',
      [makeGroup([
        makeCond('status', 'equals', 'Received'),
        makeCond('status', 'equals', 'Cancelled'),
      ], 'or')],
    );
    // Nested group ID needs to differ
    group.groups[0].id = 'nested';
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME' and (STATDES eq 'Received' or STATDES eq 'Cancelled')");
  });
  it('skips nested OR group with client-side conditions', () => {
    const group = makeGroup(
      [makeCond('vendor', 'equals', 'ACME')],
      'and',
      [makeGroup([
        makeCond('status', 'equals', 'Received'),
        makeCond('driverId', 'equals', '123'),
      ], 'or')],
    );
    group.groups[0].id = 'nested';
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME'");
  });
});
```

- [ ] **Step 4: Run the test suite**

Run: `cd server && npm test -- odataFilterBuilder`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/tests/odataFilterBuilder.test.ts
git commit -m "test: add comprehensive odataFilterBuilder test suite — 25+ tests covering all operators"
```

---

## Task 6: Expand `htmlParser` test suite (I3)

The existing test file has 6 tests covering basics. Add edge cases the review found missing.

**Files:**
- Modify: `server/tests/htmlParser.test.ts` (existing file — 75 lines, 6 tests)
- Reference: `server/src/services/htmlParser.ts` (96 lines)

- [ ] **Step 1: Add edge-case tests to existing file**

Add the following tests inside the existing `describe('parseGrvRemarks', ...)` block, after the last existing test (`'handles real UAT HTML structure'`):

```typescript
  it('returns all nulls for whitespace-only string', () => {
    const result = parseGrvRemarks('   \n  ');
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles <br> tags with data attributes', () => {
    // WHY: Priority's <br> tags often have data-* attributes
    const html = 'Driver ID : DRV-1<br data-abc="true">Licence Plate : XYZ-999';
    const result = parseGrvRemarks(html);
    expect(result.driverId).toBe('DRV-1');
    expect(result.licensePlate).toBe('XYZ-999');
  });

  it('ignores lines without colons', () => {
    const html = '<p>No colon here</p><p>Driver ID : DRV-99</p>';
    expect(parseGrvRemarks(html).driverId).toBe('DRV-99');
  });

  it('handles colons in values (e.g., time format)', () => {
    const html = '<p>Comments : Arrived at 10:30 AM</p>';
    expect(parseGrvRemarks(html).comments).toBe('Arrived at 10:30 AM');
  });
```

- [ ] **Step 2: Run the test suite**

Run: `cd server && npm test -- htmlParser`
Expected: All 10 tests PASS (6 existing + 4 new)

- [ ] **Step 3: Commit**

```bash
git add server/tests/htmlParser.test.ts
git commit -m "test: expand htmlParser tests — whitespace input, br attributes, colons in values"
```

---

## Task 7: Frontend UX fixes in ReportTableWidget (I4, I6, S3, S5)

Filter error banner, `useMemo` for filtering, `CLIENT_PAGE_SIZE` constant, WHY comment.

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add `useMemo` import**

Add `useMemo` to the React import. Since there's no explicit React import (using auto-import JSX), add at line 11 (after the existing imports from hooks/utils, before the lucide import):

```typescript
import { useMemo } from 'react';
```

- [ ] **Step 2: Add `CLIENT_PAGE_SIZE` constant**

After the imports, before the component function:

```typescript
const CLIENT_PAGE_SIZE = 50;
```

- [ ] **Step 3: Add filter error banner**

Replace line 70:
```typescript
  if (filtersQuery.error) console.warn('Failed to load filter options:', filtersQuery.error);
```

With:
```typescript
  // WHY: Filter endpoint failure cascades — empty filterColumns breaks
  // extractDateConditions in useBaseDataset and shows a blank filter panel.
  // Surface the error so the user knows why filters aren't working.
  const filterLoadError = filtersQuery.error;
```

Then in the JSX, after the `isFilterOpen` block (after the closing `)}` around line 121), add:

```typescript
      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}
```

- [ ] **Step 4: Wrap filtering logic in `useMemo`**

Replace lines 72-98 (the filtering block) with:

```typescript
  // --- Row filtering and pagination ---
  const allRows = activeData?.data ?? [];

  const { filteredRows, displayData, totalCount, totalPages } = useMemo(() => {
    let filtered: Record<string, unknown>[];
    let display: Record<string, unknown>[];
    let count: number;
    let pages: number;

    if (isBaseReady || hasClientFilters) {
      // WHY: Base dataset has ALL rows — apply ALL non-date filters client-side.
      // Phase 1 with client filters uses the same client-side path.
      filtered = isBaseReady
        ? applyAllFilters(allRows, debouncedGroup, filterColumns)
        : applyClientFilters(allRows, debouncedGroup, filterColumns);
      display = filtered.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE);
      count = filtered.length;
      pages = Math.ceil(filtered.length / CLIENT_PAGE_SIZE);
    } else {
      // Phase 1 without client-side filters — server handles pagination
      filtered = allRows;
      display = allRows;
      count = quickQuery.data?.pagination.totalCount ?? 0;
      pages = quickQuery.data?.pagination.totalPages ?? 0;
    }

    return { filteredRows: filtered, displayData: display, totalCount: count, totalPages: pages };
  }, [allRows, debouncedGroup, filterColumns, page, isBaseReady, hasClientFilters, quickQuery.data?.pagination]);
```

- [ ] **Step 5: Add WHY comment on `!isBaseReady` guard**

At line 133 (the `hasSkippedOr` warning banner), add a WHY comment:

```typescript
      {/* WHY: OR-group warning only needed in Phase 1 — the backend skips mixed OR
          groups, causing over-fetching. In Phase 2 (isBaseReady), applyAllFilters
          handles all conditions client-side with full OR support, so no data is lost. */}
      {!isBaseReady && hasSkippedOr && (
```

- [ ] **Step 6: Update `Pagination` pageSize to use constant**

Replace the hardcoded `pageSize={50}` in the `Pagination` component with:
```typescript
          <Pagination
            page={page}
            pageSize={CLIENT_PAGE_SIZE}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
          />
```

- [ ] **Step 7: Verify frontend compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "fix: add filter error banner, memoize row filtering, extract CLIENT_PAGE_SIZE constant"
```

---

## Task 8: Import order, intent blocks, useBaseDataset error body (I8, I9, I10, I11)

Code quality sweep across multiple files.

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx` (imports)
- Modify: `client/src/components/filter/FilterConditionRow.tsx` (imports)
- Modify: `client/src/components/filter/FilterBuilder.tsx` (imports)
- Modify: `client/src/components/filter/FilterGroupPanel.tsx` (imports)
- Modify: `client/src/hooks/useBaseDataset.ts:89` (error body)
- Modify: `client/src/utils/clientFilter.ts` (intent block)
- Modify: `server/src/services/cache.ts` (intent block)
- Modify: `server/src/services/odataFilterBuilder.ts` (intent block)
- Modify: `client/src/utils/weekUtils.ts` (intent block)
- Modify: `client/src/hooks/useColumnManager.ts` (intent block)

- [ ] **Step 1: Fix `ReportTableWidget.tsx` imports**

CLAUDE.md order: React/libraries → hooks → components → utils → types. Reorder to:

```typescript
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useBaseDataset } from '../../hooks/useBaseDataset';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import { applyAllFilters, applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups } from '../../utils/clientFilter';
import { countActiveFilters } from '../../config/filterConstants';
```

- [ ] **Step 2: Fix `FilterConditionRow.tsx` imports**

```typescript
import { GripVertical, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FilterValueInput from './FilterValueInput';
import { OPERATORS_BY_TYPE, FILTER_INPUT_CLASS } from '../../config/filterConstants';
import { getMonday, getSunday, toISODate } from '../../utils/weekUtils';
import type { FilterCondition, ColumnFilterMeta, FiltersResponse } from '@shared/types';
```

- [ ] **Step 3: Fix `FilterBuilder.tsx` imports**

```typescript
import { DndContext, DragOverlay, useDroppable, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useFilterDrag } from '../../hooks/useFilterDrag';
import FilterConditionRow from './FilterConditionRow';
import FilterGroupPanel from './FilterGroupPanel';
import { createEmptyCondition, createEmptyGroup, FILTER_LABEL_CLASS } from '../../config/filterConstants';
import type { FilterCondition, FilterGroup, ColumnFilterMeta, FiltersResponse } from '@shared/types';
```

- [ ] **Step 4: Fix `FilterGroupPanel.tsx` imports**

```typescript
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import FilterConditionRow from './FilterConditionRow';
import { createEmptyCondition } from '../../config/filterConstants';
import type { FilterGroup, ColumnFilterMeta, FiltersResponse } from '@shared/types';
```

- [ ] **Step 5: Fix `useBaseDataset.ts` error body at line 89**

Replace:
```typescript
      if (!response.ok) throw new Error(`Base query failed: ${response.status}`);
```

With:
```typescript
      if (!response.ok) {
        // WHY: Read the response body to surface the server's error message
        // (e.g., "Sub-form data fetch failed") instead of a generic status code.
        const errorData = await response.json().catch(() => null);
        const detail = (errorData as { error?: string })?.error ?? `status ${response.status}`;
        throw new Error(`Base query failed: ${detail}`);
      }
```

- [ ] **Step 6: Update intent blocks**

**`clientFilter.ts`** — update EXPORTS line:
```typescript
// EXPORTS: applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups, applyAllFilters
```

**`cache.ts`** — update EXPORTS and USED BY:
```typescript
// USED BY: routes/reports.ts, routes/filters.ts, routes/query.ts
// EXPORTS: CacheProvider, buildCacheKey, buildQueryCacheKey, buildBaseCacheKey, createCacheProvider
```

**`odataFilterBuilder.ts`** — update USED BY:
```typescript
// USED BY: routes/query.ts, routes/export.ts, reports/grvLog.ts
```

**`weekUtils.ts`** — update USED BY:
```typescript
// USED BY: WeekPickerDropdown.tsx, FilterConditionRow.tsx, config/filterConstants.ts
```

**`useColumnManager.ts`** — update USED BY:
```typescript
// USED BY: ReportTableWidget, ColumnManagerPanel (ManagedColumn type), ColumnRow (ManagedColumn type)
```

- [ ] **Step 7: Verify both sides compile**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx client/src/components/filter/FilterConditionRow.tsx client/src/components/filter/FilterBuilder.tsx client/src/components/filter/FilterGroupPanel.tsx client/src/hooks/useBaseDataset.ts client/src/utils/clientFilter.ts server/src/services/cache.ts server/src/services/odataFilterBuilder.ts client/src/utils/weekUtils.ts client/src/hooks/useColumnManager.ts
git commit -m "fix: import order, intent blocks, useBaseDataset error body — CLAUDE.md compliance"
```

---

## Task 9: Write `clientFilter` test suite (I5)

Tests for the client-side filter engine. No production code changes.

**Files:**
- Create: `client/src/utils/clientFilter.test.ts`
- Reference: `client/src/utils/clientFilter.ts` (180 lines)

- [ ] **Step 1: Create test file with helpers**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/clientFilter.test.ts
// PURPOSE: Tests for client-side filter logic — condition evaluation,
//          group conjunctions, client-only detection, date stripping,
//          and OR-group skip detection.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  applyClientFilters,
  hasAnyClientConditions,
  hasSkippedOrGroups,
  applyAllFilters,
} from './clientFilter';
import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

const COLUMNS: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME' },
  { key: 'notes', label: 'Notes', filterType: 'text', filterLocation: 'client' },
  { key: 'temp', label: 'Temp', filterType: 'text', filterLocation: 'client' },
];

const ROWS = [
  { date: '2026-01-15', vendor: 'ACME', notes: 'Good delivery', temp: '34' },
  { date: '2026-02-20', vendor: 'Beta', notes: 'Damaged items', temp: '38' },
  { date: '2026-03-10', vendor: 'ACME', notes: '', temp: '36' },
];

function makeGroup(conditions: FilterCondition[], conjunction: 'and' | 'or' = 'and', groups: FilterGroup[] = []): FilterGroup {
  return { id: 'root', conjunction, conditions, groups };
}

function makeCond(field: string, operator: string, value = '', valueTo?: string): FilterCondition {
  return { id: `c-${field}-${operator}`, field, operator: operator as FilterCondition['operator'], value, valueTo };
}
```

- [ ] **Step 2: Add hasAnyClientConditions tests**

```typescript
describe('hasAnyClientConditions', () => {
  it('returns false when all conditions are server-side', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'ACME')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(false);
  });

  it('returns true for client-side column', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'good')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });

  it('returns true for client-only operator on server column', () => {
    const group = makeGroup([makeCond('vendor', 'contains', 'ACM')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });

  it('detects client conditions in nested groups', () => {
    const group = makeGroup([], 'and', [
      makeGroup([makeCond('notes', 'equals', 'test')]),
    ]);
    group.groups[0].id = 'nested';
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });
});
```

- [ ] **Step 3: Add applyClientFilters tests**

```typescript
describe('applyClientFilters', () => {
  it('returns all rows when no client conditions', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'ACME')]);
    expect(applyClientFilters(ROWS, group, COLUMNS)).toHaveLength(3);
  });

  it('filters by client-side contains', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'damage')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('Beta');
  });

  it('filters by client-side equals', () => {
    const group = makeGroup([makeCond('temp', 'equals', '34')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
  });

  it('handles OR conjunction', () => {
    const group = makeGroup([
      makeCond('temp', 'equals', '34'),
      makeCond('temp', 'equals', '38'),
    ], 'or');
    expect(applyClientFilters(ROWS, group, COLUMNS)).toHaveLength(2);
  });

  it('handles AND conjunction', () => {
    const group = makeGroup([
      makeCond('notes', 'contains', 'good'),
      makeCond('temp', 'equals', '34'),
    ], 'and');
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
  });

  it('filters by isEmpty', () => {
    const group = makeGroup([makeCond('notes', 'isEmpty')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
    expect(result[0].date).toBe('2026-03-10');
  });
});
```

- [ ] **Step 4: Add applyAllFilters and hasSkippedOrGroups tests**

```typescript
describe('applyAllFilters', () => {
  it('applies non-date server conditions too', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'acme')]);
    const result = applyAllFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(2);
  });

  it('strips date conditions (handled by server)', () => {
    const group = makeGroup([
      makeCond('date', 'isBefore', '2026-02-01'),
      makeCond('vendor', 'equals', 'acme'),
    ]);
    // date condition stripped — only vendor filter applied
    const result = applyAllFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(2);
  });

  it('returns all rows when only date conditions exist', () => {
    const group = makeGroup([makeCond('date', 'isBefore', '2026-02-01')]);
    expect(applyAllFilters(ROWS, group, COLUMNS)).toHaveLength(3);
  });
});

describe('hasSkippedOrGroups', () => {
  it('returns false for AND group with client conditions', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'test')], 'and');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(false);
  });

  it('returns true for OR group with client condition', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('notes', 'contains', 'test'),
    ], 'or');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(true);
  });

  it('returns false for OR group with only server conditions', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('vendor', 'equals', 'Beta'),
    ], 'or');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(false);
  });

  it('detects skipped OR in nested groups', () => {
    const group = makeGroup([], 'and', [
      makeGroup([
        makeCond('vendor', 'equals', 'ACME'),
        makeCond('notes', 'contains', 'test'),
      ], 'or'),
    ]);
    group.groups[0].id = 'nested';
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(true);
  });
});
```

- [ ] **Step 5: Run the test suite**

Run: `cd client && npx vitest run src/utils/clientFilter.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/clientFilter.test.ts
git commit -m "test: add clientFilter test suite — condition evaluation, conjunctions, date stripping"
```

---

## Task 10: Write `filterDragUtils` test suite (I7)

Tests for the drag & drop tree manipulation functions. No production code changes.

**Files:**
- Create: `client/src/utils/filterDragUtils.test.ts`
- Reference: `client/src/utils/filterDragUtils.ts` (80 lines)

- [ ] **Step 1: Create test file**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/filterDragUtils.test.ts
// PURPOSE: Tests for drag & drop tree manipulation — finding condition
//          containers and moving conditions between groups immutably.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { findConditionContainer, moveConditionInTree } from './filterDragUtils';
import type { FilterGroup, FilterCondition } from '@shared/types';

function makeCond(id: string): FilterCondition {
  return { id, field: 'test', operator: 'equals', value: '' };
}

function makeRoot(): FilterGroup {
  return {
    id: 'root',
    conjunction: 'and',
    conditions: [makeCond('c1'), makeCond('c2')],
    groups: [{
      id: 'g1',
      conjunction: 'or',
      conditions: [makeCond('c3'), makeCond('c4')],
      groups: [],
    }],
  };
}

describe('findConditionContainer', () => {
  it('finds condition in root', () => {
    expect(findConditionContainer(makeRoot(), 'c1')).toBe('root');
  });

  it('finds condition in nested group', () => {
    expect(findConditionContainer(makeRoot(), 'c3')).toBe('g1');
  });

  it('returns null for unknown condition', () => {
    expect(findConditionContainer(makeRoot(), 'c99')).toBeNull();
  });
});

describe('moveConditionInTree', () => {
  it('reorders within root group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c2', 'root', 0);
    expect(result.conditions.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('moves condition from root to nested group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c1', 'g1', 0);
    expect(result.conditions.map((c) => c.id)).toEqual(['c2']);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  });

  it('moves condition from nested group to root', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c3', 'root', 2);
    expect(result.conditions.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c4']);
  });

  it('returns unchanged root for unknown condition', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c99', 'root', 0);
    expect(result).toBe(root); // Same reference — no mutation
  });

  it('inserts at specific index within nested group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c1', 'g1', 1);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c3', 'c1', 'c4']);
  });

  it('is immutable — does not mutate original', () => {
    const root = makeRoot();
    const original = JSON.stringify(root);
    moveConditionInTree(root, 'c1', 'g1', 0);
    expect(JSON.stringify(root)).toBe(original);
  });
});
```

- [ ] **Step 2: Run the test suite**

Run: `cd client && npx vitest run src/utils/filterDragUtils.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/utils/filterDragUtils.test.ts
git commit -m "test: add filterDragUtils test suite — container finding, cross-group moves, immutability"
```

---

## Task 11: Suggestions batch (S1-S11)

Lower-priority fixes. Each is small and independent.

**Files:**
- Modify: `server/src/reports/grvLog.ts` (S1 — subformCache cap)
- Modify: `client/src/components/filter/WeekPickerDropdown.tsx` (S2 — nested ternary)
- Modify: `client/src/utils/clientFilter.ts` (S4, S6 — predicate dedup, variable shadow)
- Modify: `client/src/components/Layout.tsx` (S7 — DEV badge)
- Modify: various files for S5, S9, S10, S11 (WHY comments, WHAT comments)

- [ ] **Step 1: S1 — Add size cap to subformCache in `grvLog.ts`**

After the `subformCache.set(cacheKey, results[j])` line in `enrichRows`, add eviction logic:

```typescript
        subformCache.set(cacheKey, results[j]);
```

And add a new constant + helper at the top of the enrichRows function:

```typescript
const SUBFORM_CACHE_MAX = 5000;

// After the inner loop that sets cache entries:
if (subformCache.size > SUBFORM_CACHE_MAX) {
  // WHY: FIFO eviction using Map insertion order. Delete oldest 20%
  // to avoid evicting on every single insert after reaching the cap.
  const deleteCount = Math.floor(SUBFORM_CACHE_MAX * 0.2);
  let count = 0;
  for (const key of subformCache.keys()) {
    if (count >= deleteCount) break;
    subformCache.delete(key);
    count++;
  }
}
```

- [ ] **Step 2: S6 — Fix variable shadowing in `clientFilter.ts:148`**

Replace:
```typescript
    const col = columns.find((col) => col.key === c.field);
```

With:
```typescript
    const col = columns.find((fc) => fc.key === c.field);
```

- [ ] **Step 3: S7 — Wrap DEV badge in `Layout.tsx`**

Replace:
```typescript
            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
              DEV
            </span>
```

With:
```typescript
            {import.meta.env.DEV && (
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                DEV
              </span>
            )}
```

- [ ] **Step 4: S5 — Add WHY comment on `!isBaseReady` guard**

This was already added in Task 7 Step 5. Skip if already done.

- [ ] **Step 5: Verify everything compiles**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Run all tests**

Run: `cd server && npm test && cd ../client && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/src/reports/grvLog.ts client/src/utils/clientFilter.ts client/src/components/Layout.tsx
git commit -m "chore: subformCache size cap, fix variable shadow, hide DEV badge in production"
```

---

## Verification

After all tasks are complete:

```bash
cd server && npx tsc --noEmit          # Shared types + backend compile
cd client && npx tsc --noEmit          # Frontend compiles
cd server && npm test                   # All server tests pass (including new suites)
cd client && npx vitest run            # All client tests pass (including new suites)
```

Manual spot checks:
1. Send `?page=abc` to GET `/api/v1/reports/grv-log` → should return 400, not 500
2. All endpoints work normally when Redis is healthy
3. Apply any filter → verify results still show correctly
4. Dev server shows "DEV" badge, production build does not

---

## Deferred Suggestions

These spec items are intentionally deferred — low impact, can be done in a future cleanup pass:

- **S2** — Nested ternary in `WeekPickerDropdown.tsx` (extract `getDayCellClass()`)
- **S4** — Duplicated "is active condition" predicate (extract `isActiveCondition()`)
- **S8** — Near-duplicate `evaluateGroup` / `evaluateAllConditions` (parameterize)
- **S9** — WHAT comments to remove across 5 files
- **S10** — Misleading WHY comments in 3 files
- **S11** — `filterDragUtils.ts` one-level nesting assumption undocumented
