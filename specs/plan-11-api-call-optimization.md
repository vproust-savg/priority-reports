# API Call Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Priority API calls by 98% on GRV Log pages (51→1 call), enable 40K-row exports, and extend filter caching from 5 min to 1 hour.

**Architecture:** Replace per-row subform fetching with OData `$expand`, raise the `maxpagesize` header ceiling, add cache-first export with 100K cap, and extend filter TTL. All changes are backend-only except one frontend toast for export truncation.

**Tech Stack:** TypeScript, Express, Vitest, Upstash Redis, React 19

**Spec:** `specs/spec-11-api-call-optimization.md`

---

## File Structure

| File | Action | Task |
|------|--------|------|
| `server/tests/grvTransformRow.test.ts` | **Create** | 1 |
| `server/src/reports/grvLog.ts` | Modify | 2 |
| `server/src/routes/query.ts` | Modify | 3 |
| `server/src/routes/export.ts` | Modify | 5 |
| `server/src/routes/reports.ts` | Modify | 3 |
| `server/src/services/priorityHttp.ts` | Modify | 4 |
| `server/src/services/cache.ts` | Modify | 5 |
| `server/src/index.ts` | Modify | 5 |
| `server/src/routes/filters.ts` | Modify | 6 |
| `client/src/hooks/useExport.ts` | Modify | 7 |

---

## Task 1: Characterization Tests for GRV Log transformRow

Safety net before touching grvLog.ts. Proves current behavior so we know the refactor didn't break anything.

**Files:**
- Create: `server/tests/grvTransformRow.test.ts`

- [ ] **Step 1: Write characterization tests**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvTransformRow.test.ts
// PURPOSE: Characterization tests for GRV Log transformRow.
//          Proves subform shape compatibility between enrichRows
//          (current) and $expand (new) approaches.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// WHY: Import the registered report to access transformRow.
// The import triggers self-registration; we pull it from the registry.
import '../src/reports/grvLog';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('grv-log')!;
const transformRow = report.transformRow;

// WHY: This is the exact shape that enrichRows writes onto each row.
// With $expand, Priority puts the same shape on the same property.
const FULL_ROW = {
  DOCNO: 'GR26000100',
  TYPE: 'WHIN',
  CURDATE: '2025-06-15T00:00:00Z',
  SUPNAME: 'V001',
  CDES: 'Acme Foods',
  STATDES: 'Received',
  TOTPRICE: 1250.50,
  TOWARHSDES: 'Main Warehouse',
  OWNERLOGIN: 'jsmith',
  DOCUMENTSTEXT_SUBFORM: {
    TEXT: '<p>Driver ID : John Smith<br>Licence Plate : ABC-1234</p><div>Truck Temp. °F (dry if ambient) : 34<br>Product Surface Temp. °F : 36</div><p>Condition of Product (accept/reject) : accept<br>Condition of Truck (accept/reject) : accept</p><p>Comments : All good</p>',
  },
};

describe('GRV Log transformRow', () => {
  it('extracts all fields from row with complete subform', () => {
    const result = transformRow(FULL_ROW);
    expect(result.date).toBe('2025-06-15T00:00:00Z');
    expect(result.docNo).toBe('GR26000100');
    expect(result.vendor).toBe('Acme Foods');
    expect(result.warehouse).toBe('Main Warehouse');
    expect(result.status).toBe('Received');
    expect(result.total).toBe(1250.50);
    expect(result.driverId).toBe('John Smith');
    expect(result.licensePlate).toBe('ABC-1234');
    expect(result.truckTemp).toBe('34');
    expect(result.productTemp).toBe('36');
    expect(result.productCondition).toBe('accept');
    expect(result.truckCondition).toBe('accept');
    expect(result.comments).toBe('All good');
    expect(result.receivedBy).toBe('jsmith');
  });

  it('handles null subform (no remarks for this GRV)', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: null };
    const result = transformRow(row);
    expect(result.docNo).toBe('GR26000100');
    expect(result.vendor).toBe('Acme Foods');
    expect(result.driverId).toBeNull();
    expect(result.licensePlate).toBeNull();
    expect(result.truckTemp).toBeNull();
    expect(result.productTemp).toBeNull();
    expect(result.productCondition).toBeNull();
    expect(result.truckCondition).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles undefined subform (property missing from response)', () => {
    const { DOCUMENTSTEXT_SUBFORM: _, ...rowWithout } = FULL_ROW;
    const result = transformRow(rowWithout);
    expect(result.docNo).toBe('GR26000100');
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles empty TEXT string', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: '' } };
    const result = transformRow(row);
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles subform with TEXT: null', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: null } };
    const result = transformRow(row);
    expect(result.driverId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd server && npx vitest run tests/grvTransformRow.test.ts
```

Expected: All 5 tests PASS. These characterize current behavior — they must pass now AND after the refactor.

- [ ] **Step 3: Commit**

```bash
git add server/tests/grvTransformRow.test.ts
git commit -m "test: add characterization tests for GRV Log transformRow"
```

---

## Task 2: Replace GRV Log N+1 with $expand

The biggest win: 51 API calls → 1 per page load.

**Files:**
- Modify: `server/src/reports/grvLog.ts`

- [ ] **Step 1: Add $expand to buildQuery and drop TYPE from $select**

In `server/src/reports/grvLog.ts`, replace `buildQuery` return value (lines 68-76):

```typescript
  return {
    // WHY: $expand fetches DOCUMENTSTEXT_SUBFORM inline — no separate
    // enrichRows step needed. Verified working with MAXAPILINES=50,000.
    $select: 'DOCNO,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN',
    $expand: 'DOCUMENTSTEXT_SUBFORM($select=TEXT)',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
```

Changes from current:
- Removed `TYPE` from `$select` (was only needed for composite key in querySubform)
- Added `$expand: 'DOCUMENTSTEXT_SUBFORM($select=TEXT)'`

- [ ] **Step 2: Remove enrichRows, subformCache, and related code**

Delete lines 79-141 (the subformCache, constants, and enrichRows function). Also remove the `enrichRows` property from the `reportRegistry.set()` call (line 170).

Remove unused imports at the top of the file:
```typescript
// DELETE these two imports:
import { querySubform } from '../services/priorityClient';
import { escapeODataString } from '../services/odataFilterBuilder';
```

- [ ] **Step 3: Update the intent block comment**

Replace lines 3-4:
```typescript
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P with
//          $expand to fetch DOCUMENTSTEXT_SUBFORM inline (single call).
//          Parses HTML remarks into 7 structured inspection fields.
```

- [ ] **Step 4: Run characterization tests**

```bash
cd server && npx vitest run tests/grvTransformRow.test.ts
```

Expected: All 5 tests PASS — transformRow didn't change, so existing behavior is preserved.

- [ ] **Step 5: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: TypeScript compile check**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors. Removed imports and functions should not be referenced anywhere else.

- [ ] **Step 7: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "feat: replace GRV Log N+1 subform fetch with \$expand (51 calls → 1)"
```

---

## Task 3: Pass $expand Through Route Handlers

query.ts cherry-picks params from buildQuery and currently skips $expand. reports.ts already passes the full object. export.ts will be fully rewritten in Task 5 (which includes $expand).

**Files:**
- Modify: `server/src/routes/query.ts:94-100`
- Modify: `server/src/routes/reports.ts:97`

- [ ] **Step 1: Add $expand to query.ts**

In `server/src/routes/query.ts`, find the `queryPriority` call (lines 94-100) and add `$expand`:

```typescript
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $expand: baseParams.$expand,
        $orderby: baseParams.$orderby,
        $filter: combinedFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      });
```

- [ ] **Step 2: Update stale comments**

In `server/src/routes/reports.ts`, update the comment at line 97:
```typescript
    // WHY: Some reports use $expand to fetch sub-form data inline.
    // enrichRows is only needed for entities where $expand doesn't work.
```

- [ ] **Step 3: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: TypeScript compile check**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/query.ts server/src/routes/reports.ts
git commit -m "feat: pass \$expand through query route handler"
```

---

## Task 4: Raise maxpagesize Header to 49,900

One-line change. Must come before the export task since export uses $top=5000.

**Files:**
- Modify: `server/src/services/priorityHttp.ts:29`

- [ ] **Step 1: Change the header value**

In `server/src/services/priorityHttp.ts`, line 29:

```typescript
        // WHY: Ceiling for Priority API response size. Actual page size
        // controlled by each report's $top parameter. Set to 49,900
        // (safety margin below MAXAPILINES=50,000).
        'Prefer': 'odata.maxpagesize=49900',
```

- [ ] **Step 2: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/services/priorityHttp.ts
git commit -m "feat: raise maxpagesize header from 1000 to 49900"
```

---

## Task 5: Export Endpoint — Cache-First + Raise Row Cap

Inject CacheProvider, raise cap to 100K, fetch in 5K batches, check cache before each page fetch.

**Files:**
- Modify: `server/src/services/cache.ts`
- Modify: `server/src/routes/export.ts`
- Modify: `server/src/index.ts:35`

- [ ] **Step 1: Add buildExportCacheKey to cache.ts**

In `server/src/services/cache.ts`, add after `buildQueryCacheKey` (after line 47):

```typescript
export function buildExportCacheKey(reportId: string, filterGroup: FilterGroup, page: number): string {
  const filterHash = JSON.stringify(stripIds(filterGroup));
  return `export:${reportId}:p${page}:s5000:${filterHash}`;
}
```

Update the intent block EXPORTS line to include `buildExportCacheKey`.

Update the import to include `FilterGroup`:
```typescript
import type { QueryRequest, FilterGroup } from '@shared/types';
```

- [ ] **Step 2: Run TypeScript compile check**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Rewrite export.ts with cache-first logic**

Replace the full contents of `server/src/routes/export.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/export.ts
// PURPOSE: POST /api/v1/reports/:reportId/export endpoint.
//          Cache-first paginated fetch from Priority, applies
//          client-side filters, generates Excel, streams file.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExportRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildExportCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { applyServerClientFilters } from '../services/serverClientFilter';
import { getTemplate } from '../services/templateService';
import { generateTemplateExcel, generateFallbackExcel } from '../services/excelExporter';
import { logApiCall } from '../services/logger';
import { ExportRequestSchema } from './exportSchemas';

// WHY: Import report definitions so they self-register into reportRegistry.
// Same pattern as query.ts — ensures reports are available when this router loads.
import '../reports/grvLog';
import '../reports/bbdReport';

const ROW_CAP = 100_000;
const PAGE_SIZE = 5000;
const CACHE_TTL = 900; // 15 minutes, matches query cache

// WHY: CacheProvider injected — same pattern as createQueryRouter(cache).
// Enables cache-first fetching: check Redis before hitting Priority API.
export function createExportRouter(cache: CacheProvider): Router {
  const router = Router();

  router.post('/:reportId/export', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    let body;
    try {
      body = ExportRequestSchema.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: 'Invalid request body', details: err });
      return;
    }

    const baseParams = report.buildQuery({ page: 1, pageSize: PAGE_SIZE });
    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    // WHY: Merge the report's base $filter (e.g., BBD's EXPIRYDATE cutoff) with
    // UI-generated OData filter. Both are ANDed when present. Same pattern as query.ts.
    const combinedFilter = [baseParams.$filter, odataFilter].filter(Boolean).join(' and ') || undefined;

    // --- Cache-first paginated fetch ---
    const allRawRows: Record<string, unknown>[] = [];
    let page = 0;
    let lastPageSize = 0;
    let truncated = false;
    let cacheHits = 0;

    try {
      while (true) {
        // WHY: Check cache before hitting Priority API. Repeated exports
        // with the same filters are instant (cached 15 min).
        const cacheKey = buildExportCacheKey(reportId, body.filterGroup, page);
        let pageRows: Record<string, unknown>[] | null = null;

        try {
          pageRows = await cache.get<Record<string, unknown>[]>(cacheKey);
        } catch {
          // WHY: Cache read failure is non-fatal — fall through to API fetch
        }

        if (pageRows) {
          cacheHits++;
          allRawRows.push(...pageRows);
          lastPageSize = pageRows.length;
        } else {
          const response = await queryPriority(report.entity, {
            $select: baseParams.$select,
            $expand: baseParams.$expand,
            $orderby: baseParams.$orderby,
            $filter: combinedFilter,
            $top: PAGE_SIZE,
            $skip: page * PAGE_SIZE,
          });

          allRawRows.push(...response.value);
          lastPageSize = response.value.length;

          // WHY: Cache freshly fetched pages so subsequent exports reuse them.
          cache.set(cacheKey, response.value, CACHE_TTL).catch((err) => {
            console.warn(`[export] Cache write failed for ${cacheKey}:`, err);
          });
        }

        if (lastPageSize < PAGE_SIZE) break; // Last page
        if (allRawRows.length >= ROW_CAP) {
          truncated = true;
          break;
        }
        page++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // --- Enrich rows (sub-form fetch, e.g., legacy reports without $expand) ---
    // WHY: Fail the export if enrichment fails — for reports using enrichRows,
    // it populates most columns. Silently continuing would produce a mostly-empty export.
    let enrichedRows = allRawRows;
    if (report.enrichRows) {
      try {
        enrichedRows = await report.enrichRows(allRawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[export] Sub-form enrichment failed for ${reportId}: ${message}`);
        res.status(502).json({ error: `Sub-form data fetch failed: ${message}` });
        return;
      }
    }

    // --- Transform + post-transform exclusion + client-side filter ---
    let transformedRows = enrichedRows.map(report.transformRow);

    // WHY: Post-transform row exclusion. BBD uses this to remove items
    // with balance <= 0 or without a flagged expiration status. Same as query.ts.
    if (report.filterRows) {
      transformedRows = report.filterRows(transformedRows);
    }

    const filteredRows = applyServerClientFilters(
      transformedRows, body.filterGroup, report.filterColumns,
    );

    // --- Determine export columns (visibility + order from UI) ---
    // WHY: Only applies to fallback mode. Template mode ignores visibility
    // because the template has a fixed layout with baked-in headers.
    let exportColumns = report.columns;
    if (body.visibleColumnKeys && !report.exportConfig) {
      const validKeys = new Set(report.columns.map((c) => c.key));
      const filtered = body.visibleColumnKeys
        .filter((key) => validKeys.has(key))
        .map((key) => report.columns.find((c) => c.key === key)!)
        .filter(Boolean);
      // WHY: If all keys were invalid, fall back to all columns rather
      // than producing an empty export.
      if (filtered.length > 0) exportColumns = filtered;
    }

    // --- Generate Excel ---
    let excelBuffer: Buffer;
    try {
      const template = await getTemplate(reportId);

      if (template && report.exportConfig) {
        excelBuffer = await generateTemplateExcel(
          template, filteredRows, report.exportConfig, report.excelStyle,
        );
      } else {
        excelBuffer = await generateFallbackExcel(
          filteredRows, exportColumns, report.name, report.excelStyle,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Excel generation failed, falling back: ${message}`);
      // WHY: Fallback on template failure — never block the export entirely.
      // Pass excelStyle to fallback too so it stays print-ready.
      try {
        excelBuffer = await generateFallbackExcel(
          filteredRows, exportColumns, report.name, report.excelStyle,
        );
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        console.error(`[export] Fallback Excel also failed: ${fbMsg}`);
        res.status(500).json({ error: 'Failed to generate Excel file' });
        return;
      }
    }

    // WHY: Filename format matches spec: report name (spaces→hyphens) + today's date.
    // Strip non-ASCII chars (e.g., em dash "—" in "BBD — Best By Dates") because
    // HTTP Content-Disposition headers only allow ASCII (RFC 7230). Node throws
    // ERR_INVALID_CHAR on non-ASCII header values.
    const today = new Date().toISOString().slice(0, 10);
    const safeName = report.name.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, '-').replace(/-{2,}/g, '-');
    const filename = `${safeName}-${today}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // WHY: Binary response can't include JSON metadata. Custom header
    // lets the frontend detect truncation and show a warning toast.
    if (truncated) {
      res.setHeader('X-Export-Truncated', 'true');
    }
    res.send(excelBuffer);

    logApiCall({
      level: 'info', event: 'export', reportId,
      durationMs: Date.now() - startTime, cacheHit: cacheHits > 0,
      rowCount: filteredRows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });
  });

  return router;
}
```

- [ ] **Step 4: Update index.ts to pass cache to export router**

In `server/src/index.ts`, line 35, change:

```typescript
app.use('/api/v1/reports', createExportRouter(cache));
```

- [ ] **Step 5: Run TypeScript compile check**

```bash
cd server && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add server/src/services/cache.ts server/src/routes/export.ts server/src/index.ts
git commit -m "feat: export endpoint cache-first fetch, 5K batches, 100K cap, truncation header"
```

---

## Task 6: Extend Filter Cache TTL to 1 Hour

One-line change. The BBD familyLookupMap graceful degradation is already in place — `bbdReport.ts` line 110 has `familyLookupMap.get(familyCode) ?? familyCode`, so an empty map falls back to the raw code instead of null.

**Files:**
- Modify: `server/src/routes/filters.ts:102`

- [ ] **Step 1: Change filter TTL from 300 to 3600**

In `server/src/routes/filters.ts`, line 101-102:

```typescript
    // WHY: Cache filter options for 1 hour — they are reference/lookup data
    // (supplier names, product families) that change very rarely.
    // The /refresh endpoint can invalidate by prefix if needed.
    cache.set(cacheKey, response, 3600).catch((err) => {
```

- [ ] **Step 2: Run full test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/filters.ts
git commit -m "feat: extend filter cache TTL from 5 min to 1 hour"
```

---

## Task 7: Frontend — Export Truncation Warning

Read the `X-Export-Truncated` header and show a warning toast.

**Files:**
- Modify: `client/src/hooks/useExport.ts`

- [ ] **Step 1: Add truncation check after successful response**

In `client/src/hooks/useExport.ts`, after the `response.ok` check succeeds and before downloading the blob (between lines 58 and 60), add truncation detection. Replace the success toast logic (line 79):

```typescript
      const blob = await response.blob();

      // WHY: Parse filename from Content-Disposition header.
      // Format: attachment; filename="GRV-Log-2026-03-22.xlsx"
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] ?? 'export.xlsx';

      // WHY: Create an invisible <a> element to trigger the browser's
      // native file download. This avoids needing a file-saver library.
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);

      // WHY: Export response is a binary file — can't include JSON metadata.
      // The server sets X-Export-Truncated header when the 100K row cap was hit.
      const wasTruncated = response.headers.get('X-Export-Truncated') === 'true';
      if (wasTruncated) {
        setToast({ message: 'Export limited to 100,000 rows. Apply more filters to narrow results.', variant: 'error' });
      } else {
        setToast({ message: 'Export complete', variant: 'success' });
      }
```

- [ ] **Step 2: Update the timeout comment**

At line 40-41, update the comment since enrichRows batching no longer applies to GRV Log:

```typescript
    // WHY: 2-minute timeout — large exports (40K+ rows) with multiple
    // Priority API pages can take over a minute.
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd client && npx tsc -b --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useExport.ts
git commit -m "feat: show warning toast when export hits 100K row cap"
```

---

## Task 8: Pre-Deploy Verification

**Files:** None (verification only)

- [ ] **Step 1: Run full backend test suite**

```bash
cd server && npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run TypeScript compile checks (both client and server)**

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit
```

Expected: No errors. Both must pass — any TypeScript error kills the Railway Docker build.

- [ ] **Step 3: Verify grvLog.ts is under 200 lines**

After removing enrichRows (~60 lines), subformCache (~5 lines), and constants (~3 lines), the file should be well under 200 lines.

```bash
wc -l server/src/reports/grvLog.ts
```

Expected: ~140 lines (was 209).

- [ ] **Step 4: Verify no unused imports**

```bash
cd server && npx tsc --noEmit 2>&1 | grep -i "unused"
cd ../client && npx tsc -b --noEmit 2>&1 | grep -i "unused"
```

Expected: No unused variable/import errors.

- [ ] **Step 5: Commit all remaining changes (if any)**

```bash
git status
```

If clean, nothing to do. If there are unstaged changes, stage and commit them.
