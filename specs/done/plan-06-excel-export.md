# Excel Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to export all filtered report data as an Excel file, using per-report templates from Airtable when available, with a basic Excel fallback.

**Architecture:** Backend-generated export. New POST endpoint receives the current filter state, fetches ALL matching rows from Priority (paginated, up to 5,000-row hard cap), applies server+client filters, fills an Excel template (from Airtable, cached 24h), and streams the `.xlsx` buffer. Frontend adds an Export button to `TableToolbar` and handles blob download with a 2-minute timeout. Toast notification for success/error feedback.

**Tech Stack:** ExcelJS (backend), Express + Zod (endpoint), Airtable REST API (template fetch), React + lucide-react (frontend)

**Spec:** `specs/06-excel-export/spec-06-excel-export.md`

**Parallel session rules:** Backend session writes to `server/` only. Frontend session writes to `client/` only. No shared type changes needed.

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `server/src/routes/exportSchemas.ts` | Zod validation schema for export request body |
| `server/src/services/serverClientFilter.ts` | Server-side replica of `clientFilter.ts` — applies client-only filter conditions |
| `server/src/services/templateService.ts` | Fetches Excel templates from Airtable REST API, caches Buffers in-memory (24h TTL) |
| `server/src/services/excelExporter.ts` | Fills template with data rows using ExcelJS, or generates fallback Excel |
| `server/src/routes/export.ts` | POST `/:reportId/export` endpoint — orchestrates fetch → filter → generate → stream |

### Backend — Modified Files

| File | What Changes |
|------|-------------|
| `server/src/config/reportRegistry.ts` | Add `ExportConfig` interface, add optional `exportConfig` to `ReportConfig` |
| `server/src/reports/grvLog.ts` | Add `exportConfig` with column mapping for GRV Log template |
| `server/src/routes/querySchemas.ts` | Export `FilterGroupSchema` (currently internal) so `exportSchemas.ts` can reuse it |
| `server/src/index.ts` | Mount export router at `/api/v1/reports` |

### Backend — New Test Files

| File | What It Tests |
|------|--------------|
| `server/tests/serverClientFilter.test.ts` | All 18 operators, conjunction logic, empty conditions, client-only evaluation |
| `server/tests/excelExporter.test.ts` | Fallback mode (headers + data), template mode (row insertion, column mapping) |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `client/src/components/Toast.tsx` | Minimal toast notification (success/error) with auto-dismiss |
| `client/src/hooks/useExport.ts` | Export state management: fetch blob, trigger download, manage toast state |

### Frontend — Modified Files

| File | What Changes |
|------|-------------|
| `client/src/components/TableToolbar.tsx` | Add Export button (right-aligned, Download/Loader2 icon) |
| `client/src/components/widgets/ReportTableWidget.tsx` | Wire up `useExport` hook, pass props to TableToolbar, render Toast |
| `client/src/index.css` | Add `toast-slide-up` keyframe animation |

---

## Part A: Backend (Tasks 1–10)

### Task 1: Install ExcelJS

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Install ExcelJS**

Run: `cd server && npm install exceljs`

- [ ] **Step 2: Verify install**

Run: `cd server && node -e "require('exceljs')"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: install exceljs for Excel export generation"
```

---

### Task 2: Add ExportConfig to ReportConfig

**Files:**
- Modify: `server/src/config/reportRegistry.ts:22-35`

- [ ] **Step 1: Add ExportConfig interface and optional field**

Add the `ExportConfig` interface above `ReportConfig`, and add `exportConfig?` to `ReportConfig`:

```typescript
// Add BEFORE the ReportConfig interface (after ReportFilters):

export interface ExportConfig {
  // WHY: Maps template column letters to data field keys.
  // The column letter (A, B, C...) is the Excel column in the template.
  // The value is the field key from transformRow output.
  mapping: Record<string, string>;
  // WHY: First data row in the template. Rows above this are headers.
  // Rows below the empty data region are footer (pushed down as data grows).
  dataStartRow: number;
  // WHY: Some templates have multiple sheets. Default: 0 (first sheet).
  sheetIndex?: number;
}
```

Add to `ReportConfig` interface, after the `enrichRows` field:

```typescript
  // WHY: Optional Excel export configuration. When present, the export
  // endpoint uses the Airtable template with this column mapping.
  // When absent, export falls back to a basic Excel with headers + data.
  exportConfig?: ExportConfig;
```

- [ ] **Step 2: Update the EXPORTS comment**

Update the file header's EXPORTS line to include `ExportConfig`:
```
// EXPORTS: ReportConfig, ReportFilters, ExportConfig, reportRegistry, getReport
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/config/reportRegistry.ts
git commit -m "feat: add ExportConfig interface to ReportConfig"
```

---

### Task 3: Add exportConfig to GRV Log

**Files:**
- Modify: `server/src/reports/grvLog.ts:129-138`

- [ ] **Step 1: Add exportConfig to the registry entry**

In the `reportRegistry.set('grv-log', { ... })` call at the bottom of the file, add `exportConfig` after `enrichRows`:

```typescript
reportRegistry.set('grv-log', {
  id: 'grv-log',
  name: 'GRV Log',
  entity: 'DOCUMENTS_P',
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
  // WHY: Maps GRV Log Excel template columns (A-M) to transformRow output fields.
  // Columns B (Time) and F (Driver Name) are omitted — no data field exists.
  exportConfig: {
    mapping: {
      'A': 'date',
      'C': 'docNo',
      'D': 'vendor',
      'E': 'driverId',
      'G': 'licensePlate',
      'H': 'truckTemp',
      'I': 'productTemp',
      'J': 'productCondition',
      'K': 'truckCondition',
      'L': 'receivedBy',
      'M': 'comments',
    },
    dataStartRow: 5,
  },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "feat: add exportConfig mapping for GRV Log template"
```

---

### Task 4: Create exportSchemas.ts + export FilterGroupSchema

**Files:**
- Modify: `server/src/routes/querySchemas.ts:28`
- Create: `server/src/routes/exportSchemas.ts`

- [ ] **Step 1: Export FilterGroupSchema from querySchemas.ts**

Currently `FilterGroupSchema` is a `const` but not exported. Add `export`:

Change:
```typescript
const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
```
To:
```typescript
export const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
```

- [ ] **Step 2: Create exportSchemas.ts**

Create `server/src/routes/exportSchemas.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/exportSchemas.ts
// PURPOSE: Zod validation schema for the POST /export endpoint.
//          Reuses FilterGroupSchema from querySchemas.ts.
// USED BY: routes/export.ts
// EXPORTS: ExportRequestSchema
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { FilterGroupSchema } from './querySchemas';

export const ExportRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/querySchemas.ts server/src/routes/exportSchemas.ts
git commit -m "feat: create export request schema, export FilterGroupSchema for reuse"
```

---

### Task 5: Create serverClientFilter.ts (TDD)

**Files:**
- Create: `server/src/services/serverClientFilter.ts`
- Create: `server/tests/serverClientFilter.test.ts`

This is the most testable backend piece — a pure function with no I/O.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/serverClientFilter.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/serverClientFilter.test.ts
// PURPOSE: Unit tests for server-side client filter logic.
//          Mirrors clientFilter.ts — tests all 18 operators,
//          conjunction logic, and client-only condition evaluation.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { applyServerClientFilters } from '../src/services/serverClientFilter';
import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

// WHY: Test columns mirror the GRV Log's mix of server and client columns.
const testColumns: ColumnFilterMeta[] = [
  { key: 'name', label: 'Name', filterType: 'text', filterLocation: 'server', odataField: 'NAME' },
  { key: 'notes', label: 'Notes', filterType: 'text', filterLocation: 'client' },
  { key: 'amount', label: 'Amount', filterType: 'currency', filterLocation: 'server', odataField: 'AMOUNT' },
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'temp', label: 'Temp', filterType: 'text', filterLocation: 'client' },
];

function makeGroup(overrides: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id: 'root',
    conjunction: 'and',
    conditions: [],
    groups: [],
    ...overrides,
  };
}

const rows = [
  { name: 'Alice', notes: 'Good delivery', amount: 100, date: '2026-01-15', temp: '34' },
  { name: 'Bob', notes: 'Damaged items', amount: 200, date: '2026-02-20', temp: '38' },
  { name: 'Carol', notes: '', amount: 0, date: '2026-03-10', temp: '36' },
];

describe('applyServerClientFilters', () => {
  it('returns all rows when no client-side conditions exist', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'name', operator: 'equals', value: 'Alice' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(3); // Server conditions are ignored
  });

  it('filters by client-side equals operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'temp', operator: 'equals', value: '34' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by client-side contains operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'contains', value: 'damage' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters by client-side notContains operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'notContains', value: 'damage' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by client-side startsWith operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'startsWith', value: 'good' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by client-side endsWith operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'endsWith', value: 'items' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters by isEmpty operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'isEmpty', value: '' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Carol');
  });

  it('filters by isNotEmpty operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'isNotEmpty', value: '' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('handles contains as client-only operator on server column', () => {
    // "contains" on a server column should still be evaluated client-side
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'name', operator: 'contains', value: 'li' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('handles OR conjunction', () => {
    const group = makeGroup({
      conjunction: 'or',
      conditions: [
        { id: '1', field: 'temp', operator: 'equals', value: '34' },
        { id: '2', field: 'temp', operator: 'equals', value: '38' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('handles AND conjunction', () => {
    const group = makeGroup({
      conjunction: 'and',
      conditions: [
        { id: '1', field: 'notes', operator: 'contains', value: 'good' },
        { id: '2', field: 'temp', operator: 'equals', value: '34' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('handles nested groups', () => {
    const group = makeGroup({
      conjunction: 'and',
      conditions: [],
      groups: [
        makeGroup({
          id: 'nested',
          conjunction: 'or',
          conditions: [
            { id: '1', field: 'temp', operator: 'equals', value: '34' },
            { id: '2', field: 'temp', operator: 'equals', value: '36' },
          ],
        }),
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('skips empty conditions (no field set)', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: '', operator: 'equals', value: 'anything' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/serverClientFilter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `server/src/services/serverClientFilter.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/serverClientFilter.ts
// PURPOSE: Server-side replica of client/src/utils/clientFilter.ts.
//          Applies client-only filter conditions to rows so exported
//          data matches what the user sees in the dashboard.
// WHY NOT SHARED: The shared/ directory is types-only per project
//          convention. This is intentional duplication (~70 lines).
// USED BY: routes/export.ts
// EXPORTS: applyServerClientFilters
// ═══════════════════════════════════════════════════════════════

import type { FilterCondition, FilterGroup, ColumnFilterMeta } from '@shared/types';

const CLIENT_ONLY_OPERATORS = new Set([
  'contains', 'notContains', 'startsWith', 'endsWith',
]);

function isClientCondition(condition: FilterCondition, columns: ColumnFilterMeta[]): boolean {
  const col = columns.find((c) => c.key === condition.field);
  if (!col) return false;
  return col.filterLocation === 'client' || CLIENT_ONLY_OPERATORS.has(condition.operator);
}

function evaluateCondition(row: Record<string, unknown>, condition: FilterCondition): boolean {
  if (!condition.field) return true;
  const cellValue = row[condition.field];
  const str = String(cellValue ?? '').toLowerCase();
  const val = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'equals': return str === val;
    case 'notEquals': return str !== val;
    case 'contains': return str.includes(val);
    case 'notContains': return !str.includes(val);
    case 'startsWith': return str.startsWith(val);
    case 'endsWith': return str.endsWith(val);
    case 'isEmpty': return cellValue == null || String(cellValue).trim() === '';
    case 'isNotEmpty': return cellValue != null && String(cellValue).trim() !== '';
    case 'greaterThan': return parseFloat(String(cellValue ?? '0')) > parseFloat(condition.value);
    case 'lessThan': return parseFloat(String(cellValue ?? '0')) < parseFloat(condition.value);
    case 'greaterOrEqual': return parseFloat(String(cellValue ?? '0')) >= parseFloat(condition.value);
    case 'lessOrEqual': return parseFloat(String(cellValue ?? '0')) <= parseFloat(condition.value);
    case 'between': {
      const num = parseFloat(String(cellValue ?? '0'));
      return num >= parseFloat(condition.value) && num <= parseFloat(condition.valueTo ?? condition.value);
    }
    case 'isBefore': return new Date(String(cellValue)) < new Date(condition.value);
    case 'isAfter': return new Date(String(cellValue)) > new Date(condition.value);
    case 'isOnOrBefore': return new Date(String(cellValue)) <= new Date(condition.value);
    case 'isOnOrAfter': return new Date(String(cellValue)) >= new Date(condition.value);
    case 'isBetween': {
      const d = new Date(String(cellValue));
      return d >= new Date(condition.value) && d <= new Date(condition.valueTo ?? condition.value);
    }
    default: return true;
  }
}

function evaluateGroup(
  row: Record<string, unknown>,
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): boolean {
  const clientConditions = group.conditions.filter(
    (c) => c.field && isClientCondition(c, columns) && (
      c.operator === 'isEmpty' || c.operator === 'isNotEmpty' || c.value
    ),
  );

  const conditionResults = clientConditions.map((c) => evaluateCondition(row, c));
  const groupResults = group.groups.map((g) => evaluateGroup(row, g, columns));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) return true;

  return group.conjunction === 'and'
    ? allResults.every(Boolean)
    : allResults.some(Boolean);
}

export function applyServerClientFilters(
  rows: Record<string, unknown>[],
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): Record<string, unknown>[] {
  return rows.filter((row) => evaluateGroup(row, filterGroup, filterColumns));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/serverClientFilter.test.ts`
Expected: All 13 tests PASS

- [ ] **Step 5: Run all tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/services/serverClientFilter.ts server/tests/serverClientFilter.test.ts
git commit -m "feat: add server-side client filter with tests (export support)"
```

---

### Task 6: Create templateService.ts

**Files:**
- Create: `server/src/services/templateService.ts`

No unit tests for this task — it calls external APIs (Airtable + HTTP download). Tested via integration in Task 10.

- [ ] **Step 1: Create templateService.ts**

Create `server/src/services/templateService.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/templateService.ts
// PURPOSE: Fetches Excel templates from the Airtable "API Reports"
//          table and caches them in-memory with a 24h TTL.
//          Returns Buffer (not URL — Airtable URLs expire).
// USED BY: routes/export.ts
// EXPORTS: getTemplate
// ═══════════════════════════════════════════════════════════════

import { env } from '../config/environment';

const AIRTABLE_BASE_ID = 'appjwOgR4HsXeGIda';
const AIRTABLE_TABLE_ID = 'tblvqv3S31KQhKRU6';
const REPORT_ID_FIELD = 'fldrsiqwORzxJ6Ouq';
const TEMPLATE_FIELD = 'fldTbiJ7t4Ldd3cH9';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  buffer: Buffer;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getTemplate(reportId: string): Promise<Buffer | null> {
  // Check cache
  const cached = cache.get(reportId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return cached.buffer;
  }

  if (!env.AIRTABLE_TOKEN) {
    console.warn('[templateService] AIRTABLE_TOKEN not set — skipping template fetch');
    return null;
  }

  try {
    // WHY: Filter by Report ID field to find the matching record.
    // Use field ID (not name) because field names can change.
    const filterFormula = encodeURIComponent(`{${REPORT_ID_FIELD}}="${reportId}"`);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?filterByFormula=${filterFormula}`;

    const listResponse = await fetch(url, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });

    if (!listResponse.ok) {
      console.error(`[templateService] Airtable list failed: ${listResponse.status}`);
      return null;
    }

    const data = await listResponse.json() as {
      records: Array<{ fields: Record<string, unknown> }>;
    };

    if (data.records.length === 0) return null;

    // WHY: Template field is multipleAttachments — returns an array of
    // { url, filename, size, type } objects. Pick the first one.
    const templateField = data.records[0].fields[TEMPLATE_FIELD] as
      Array<{ url: string; filename: string }> | undefined;

    if (!templateField || templateField.length === 0) return null;

    const attachmentUrl = templateField[0].url;

    // WHY: Download the actual file and cache the Buffer.
    // Airtable attachment URLs are temporary and expire after hours.
    const downloadResponse = await fetch(attachmentUrl);
    if (!downloadResponse.ok) {
      console.error(`[templateService] Template download failed: ${downloadResponse.status}`);
      return null;
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    cache.set(reportId, { buffer, fetchedAt: Date.now() });
    return buffer;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[templateService] Failed to fetch template: ${message}`);
    return null;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/services/templateService.ts
git commit -m "feat: add template service — fetches Excel templates from Airtable with 24h cache"
```

---

### Task 7: Create excelExporter.ts (TDD)

**Files:**
- Create: `server/src/services/excelExporter.ts`
- Create: `server/tests/excelExporter.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/excelExporter.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/excelExporter.test.ts
// PURPOSE: Unit tests for Excel export generation.
//          Tests fallback mode (no template) and template mode.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateFallbackExcel, generateTemplateExcel } from '../src/services/excelExporter';
import type { ColumnDefinition } from '@shared/types';
import type { ExportConfig } from '../src/config/reportRegistry';

const testColumns: ColumnDefinition[] = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'amount', label: 'Amount', type: 'currency' },
  { key: 'date', label: 'Date', type: 'date' },
];

const testRows = [
  { name: 'Alice', amount: 100.5, date: '2026-01-15' },
  { name: 'Bob', amount: 200, date: '2026-02-20' },
];

describe('generateFallbackExcel', () => {
  it('creates workbook with headers and data', async () => {
    const buffer = await generateFallbackExcel(testRows, testColumns, 'Test Report');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);

    const ws = wb.getWorksheet(1)!;
    expect(ws.name).toBe('Test Report');

    // Row 1 = headers
    expect(ws.getRow(1).getCell(1).value).toBe('Name');
    expect(ws.getRow(1).getCell(2).value).toBe('Amount');
    expect(ws.getRow(1).getCell(3).value).toBe('Date');

    // Row 2 = first data row
    expect(ws.getRow(2).getCell(1).value).toBe('Alice');
    expect(ws.getRow(2).getCell(2).value).toBe(100.5);

    // Row 3 = second data row
    expect(ws.getRow(3).getCell(1).value).toBe('Bob');
  });

  it('creates workbook with headers only when no data', async () => {
    const buffer = await generateFallbackExcel([], testColumns, 'Empty Report');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);

    const ws = wb.getWorksheet(1)!;
    expect(ws.getRow(1).getCell(1).value).toBe('Name');
    expect(ws.getRow(2).getCell(1).value).toBeNull();
  });
});

describe('generateTemplateExcel', () => {
  async function createTestTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');

    // Row 1: Header
    ws.getRow(1).getCell(1).value = 'Company Name';
    // Row 2: Subheader
    ws.getRow(2).getCell(1).value = 'Report Title';
    // Row 3: Column headers
    ws.getRow(3).getCell(1).value = 'Name';
    ws.getRow(3).getCell(2).value = 'Amount';
    // Rows 4-5: Empty data rows
    // Row 6: Footer
    ws.getRow(6).getCell(1).value = 'Footer: Instructions';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const exportConfig: ExportConfig = {
    mapping: { 'A': 'name', 'B': 'amount' },
    dataStartRow: 4,
  };

  it('fills template with data rows', async () => {
    const template = await createTestTemplate();
    const buffer = await generateTemplateExcel(template, testRows, exportConfig);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Headers preserved
    expect(ws.getRow(1).getCell(1).value).toBe('Company Name');
    expect(ws.getRow(3).getCell(1).value).toBe('Name');

    // Data filled at dataStartRow
    expect(ws.getRow(4).getCell(1).value).toBe('Alice');
    expect(ws.getRow(4).getCell(2).value).toBe(100.5);
    expect(ws.getRow(5).getCell(1).value).toBe('Bob');
    expect(ws.getRow(5).getCell(2).value).toBe(200);

    // Footer pushed down (was row 6, now row 6 has data or row 8 has footer)
    // With 2 data rows starting at row 4, and template had 2 empty rows (4-5),
    // footer at row 6 stays at row 6.
    expect(ws.getRow(6).getCell(1).value).toBe('Footer: Instructions');
  });

  it('inserts extra rows when data exceeds template empty rows', async () => {
    const manyRows = [
      { name: 'Alice', amount: 100 },
      { name: 'Bob', amount: 200 },
      { name: 'Carol', amount: 300 },
      { name: 'Dave', amount: 400 },
    ];

    const template = await createTestTemplate();
    const buffer = await generateTemplateExcel(template, manyRows, exportConfig);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // All 4 rows filled
    expect(ws.getRow(4).getCell(1).value).toBe('Alice');
    expect(ws.getRow(7).getCell(1).value).toBe('Dave');

    // Footer pushed down: was at row 6, now at row 8 (4 data rows - 2 empty = 2 extra)
    expect(ws.getRow(8).getCell(1).value).toBe('Footer: Instructions');
  });

  it('handles empty data (headers only)', async () => {
    const template = await createTestTemplate();
    const buffer = await generateTemplateExcel(template, [], exportConfig);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Headers still present
    expect(ws.getRow(1).getCell(1).value).toBe('Company Name');
    // Footer still present
    expect(ws.getRow(6).getCell(1).value).toBe('Footer: Instructions');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/excelExporter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

Create `server/src/services/excelExporter.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/excelExporter.ts
// PURPOSE: Generates Excel files for export. Two modes:
//          1. Template mode: fills an Airtable template using ExportConfig mapping
//          2. Fallback mode: creates a basic Excel with headers + data
// USED BY: routes/export.ts
// EXPORTS: generateTemplateExcel, generateFallbackExcel
// ═══════════════════════════════════════════════════════════════

import ExcelJS from 'exceljs';
import type { ColumnDefinition } from '@shared/types';
import type { ExportConfig } from '../config/reportRegistry';

// WHY: Converts column letter (A, B, ..., Z, AA, AB) to 1-based column number.
// ExcelJS uses 1-based column numbers: A=1, B=2, ..., Z=26, AA=27.
function columnLetterToNumber(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result;
}

export async function generateTemplateExcel(
  templateBuffer: Buffer,
  rows: Record<string, unknown>[],
  config: ExportConfig,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  // WHY: workbook.worksheets is 0-indexed positional array matching the visible
  // tab order. getWorksheet(number) retrieves by internal worksheet ID which can
  // differ from visual order if sheets were deleted/reordered in the template.
  const worksheet = workbook.worksheets[config.sheetIndex ?? 0];
  if (!worksheet) throw new Error('Template worksheet not found');

  const dataStartRow = config.dataStartRow;

  // WHY: Find the footer region — scan forward from dataStartRow to find
  // the first non-empty row. Everything between dataStartRow and that row
  // is the empty data region. The footer starts at the first non-empty row.
  const lastRow = worksheet.rowCount;
  let footerStartRow = lastRow + 1; // Default: no footer found
  for (let r = dataStartRow; r <= lastRow; r++) {
    const row = worksheet.getRow(r);
    let hasContent = false;
    row.eachCell(() => { hasContent = true; });
    if (hasContent) {
      footerStartRow = r;
      break;
    }
  }

  // WHY: Count how many empty rows exist between dataStartRow and the footer.
  // If data exceeds this, insert extra rows to push the footer down.
  const emptyRowCount = footerStartRow - dataStartRow;
  const extraRowsNeeded = Math.max(0, rows.length - emptyRowCount);

  if (extraRowsNeeded > 0) {
    // WHY: spliceRows inserts empty rows at the given position, pushing
    // everything below (including footer) down by that many rows.
    worksheet.spliceRows(dataStartRow + emptyRowCount, 0,
      ...Array(extraRowsNeeded).fill([]),
    );
  }

  // WHY: Convert mapping once — from column letters to column numbers.
  const colMap = Object.entries(config.mapping).map(([letter, fieldKey]) => ({
    colNum: columnLetterToNumber(letter.toUpperCase()),
    fieldKey,
  }));

  // Fill data rows
  for (let i = 0; i < rows.length; i++) {
    const excelRow = worksheet.getRow(dataStartRow + i);
    for (const { colNum, fieldKey } of colMap) {
      const value = rows[i][fieldKey];
      if (value != null) {
        excelRow.getCell(colNum).value = value as ExcelJS.CellValue;
      }
    }
    excelRow.commit();
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateFallbackExcel(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  reportName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(reportName);

  // WHY: Row 1 = bold headers from column definitions.
  const headerRow = worksheet.addRow(columns.map((c) => c.label));
  headerRow.font = { bold: true };

  // Data rows
  for (const row of rows) {
    worksheet.addRow(columns.map((c) => {
      const val = row[c.key];
      // WHY: Write numbers as numbers so Excel can format/sort them.
      if ((c.type === 'currency' || c.type === 'number') && val != null) {
        return typeof val === 'number' ? val : parseFloat(String(val));
      }
      return val ?? '';
    }));
  }

  // WHY: Auto-width columns based on header + data content.
  for (let i = 0; i < columns.length; i++) {
    const maxLength = Math.max(
      columns[i].label.length,
      ...rows.map((r) => String(r[columns[i].key] ?? '').length),
    );
    worksheet.getColumn(i + 1).width = Math.min(maxLength + 2, 40);
  }

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/excelExporter.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Run all tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/services/excelExporter.ts server/tests/excelExporter.test.ts
git commit -m "feat: add Excel exporter with template and fallback modes, with tests"
```

---

### Task 8: Create export.ts route

**Files:**
- Create: `server/src/routes/export.ts`

- [ ] **Step 1: Create export.ts**

Create `server/src/routes/export.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/export.ts
// PURPOSE: POST /api/v1/reports/:reportId/export endpoint.
//          Fetches ALL filtered rows from Priority (paginated),
//          applies client-side filters, generates Excel, streams file.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExportRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
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

const ROW_CAP = 5000;
const PAGE_SIZE = 1000;

// WHY: No arguments — unlike createQueryRouter(cache), exports are always
// fresh (never cached). No CacheProvider dependency.
export function createExportRouter(): Router {
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

    // WHY: buildQuery is ONLY used for $select and $orderby.
    // $filter comes from buildODataFilter. Pagination is manual ($top/$skip loop).
    const baseParams = report.buildQuery({ page: 1, pageSize: PAGE_SIZE });
    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    // --- Paginated fetch: get ALL matching rows ---
    const allRawRows: Record<string, unknown>[] = [];
    let page = 0;
    let lastPageSize = 0;

    try {
      while (true) {
        const response = await queryPriority(report.entity, {
          $select: baseParams.$select,
          $orderby: baseParams.$orderby,
          $filter: odataFilter,
          $top: PAGE_SIZE,
          $skip: page * PAGE_SIZE,
        });

        allRawRows.push(...response.value);
        lastPageSize = response.value.length;

        if (lastPageSize < PAGE_SIZE) break; // Last page
        if (allRawRows.length >= ROW_CAP) break; // Hard cap
        page++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // WHY: Hard cap check — if we hit the cap AND the last page was full,
    // there are more rows we couldn't fetch. Return error instead of
    // silently truncating the export.
    if (allRawRows.length >= ROW_CAP && lastPageSize === PAGE_SIZE) {
      res.status(400).json({
        error: 'Export limited to 5,000 rows. Apply filters to reduce the dataset.',
      });
      return;
    }

    // --- Enrich rows (sub-form fetch, e.g., GRV Log remarks) ---
    let enrichedRows = allRawRows;
    if (report.enrichRows) {
      try {
        enrichedRows = await report.enrichRows(allRawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[export] Sub-form enrichment failed for ${reportId}: ${message}`);
      }
    }

    // --- Transform + client-side filter ---
    const transformedRows = enrichedRows.map(report.transformRow);
    const filteredRows = applyServerClientFilters(
      transformedRows, body.filterGroup, report.filterColumns,
    );

    // --- Generate Excel ---
    let excelBuffer: Buffer;
    try {
      const template = await getTemplate(reportId);

      if (template && report.exportConfig) {
        excelBuffer = await generateTemplateExcel(template, filteredRows, report.exportConfig);
      } else {
        excelBuffer = await generateFallbackExcel(filteredRows, report.columns, report.name);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Excel generation failed, falling back: ${message}`);
      // WHY: Fallback on template failure — never block the export entirely.
      try {
        excelBuffer = await generateFallbackExcel(filteredRows, report.columns, report.name);
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        console.error(`[export] Fallback Excel also failed: ${fbMsg}`);
        res.status(500).json({ error: 'Failed to generate Excel file' });
        return;
      }
    }

    // WHY: Filename format matches spec: report name (spaces→hyphens) + today's date.
    const today = new Date().toISOString().slice(0, 10);
    const safeName = report.name.replace(/\s+/g, '-');
    const filename = `${safeName}-${today}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    logApiCall({
      level: 'info', event: 'export', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: filteredRows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });

    res.send(excelBuffer);
  });

  return router;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/export.ts
git commit -m "feat: add POST /export endpoint — paginated fetch, filter, generate Excel"
```

---

### Task 9: Mount export router in index.ts

**Files:**
- Modify: `server/src/index.ts:16,32`

- [ ] **Step 1: Add import**

Add import after the existing router imports (line 16):

```typescript
import { createExportRouter } from './routes/export';
```

- [ ] **Step 2: Mount the router**

Add after the existing `app.use('/api/v1/reports', ...)` lines (around line 32):

```typescript
app.use('/api/v1/reports', createExportRouter());
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: mount export router at /api/v1/reports"
```

---

### Task 10: Backend verification

- [ ] **Step 1: TypeScript compile check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `cd server && npm test`
Expected: All tests pass (health, htmlParser, serverClientFilter, excelExporter)

- [ ] **Step 3: Verify no lint issues**

Quick check that no obvious issues exist:

Run: `cd server && npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

---

## Part B: Frontend (Tasks 11–15)

### Task 11: Add toast animation to index.css

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add toast-slide-up keyframe**

Add at the end of `client/src/index.css`, after the `.tabular-nums` rule:

```css
/* WHY: Slide-up animation for the Toast component.
   Subtle 200ms ease-out — matches the Apple/Stripe micro-interaction aesthetic. */
@keyframes toast-slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add toast-slide-up keyframe animation"
```

---

### Task 12: Create Toast.tsx component

**Files:**
- Create: `client/src/components/Toast.tsx`

- [ ] **Step 1: Create Toast.tsx**

Create `client/src/components/Toast.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Minimal toast notification for export feedback.
//          Fixed bottom-right, auto-dismisses after 3s.
//          Follows the Apple/Stripe card aesthetic (white, rounded,
//          subtle shadow, emerald/red status colors).
// USED BY: ReportTableWidget.tsx
// EXPORTS: Toast
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
}

export default function Toast({ message, variant, onDismiss }: ToastProps) {
  // WHY: Auto-dismiss after 3 seconds. The user can also manually close.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = variant === 'success' ? CheckCircle2 : XCircle;
  const iconColor = variant === 'success' ? 'text-emerald-500' : 'text-red-500';

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3
        bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)]
        border border-slate-200/60"
      style={{ animation: 'toast-slide-up 200ms ease-out' }}
    >
      <Icon size={18} className={iconColor} />
      <span className="text-sm text-slate-700 font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 ml-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Toast.tsx
git commit -m "feat: add Toast component for export success/error feedback"
```

---

### Task 13: Create useExport.ts hook

**Files:**
- Create: `client/src/hooks/useExport.ts`

- [ ] **Step 1: Create useExport.ts**

Create `client/src/hooks/useExport.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExport.ts
// PURPOSE: Manages export state: triggers POST /export, downloads
//          the blob as a file, and provides toast state for feedback.
// WHY NOT TANSTACK QUERY: Export is a one-shot action (fire-and-download),
//          not a cached query. Plain fetch + useState is appropriate.
// USED BY: ReportTableWidget.tsx
// EXPORTS: useExport
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import type { FilterGroup } from '@shared/types';

interface ToastState {
  message: string;
  variant: 'success' | 'error';
}

interface UseExportReturn {
  isExporting: boolean;
  toast: ToastState | null;
  clearToast: () => void;
  triggerExport: () => Promise<void>;
}

export function useExport(reportId: string, filterGroup: FilterGroup): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const clearToast = useCallback(() => setToast(null), []);

  const triggerExport = useCallback(async () => {
    setIsExporting(true);
    setToast(null);

    // WHY: 2-minute timeout — enrichRows on large GRV Log exports can take
    // 50-100 seconds (500 rows × batched sub-form fetches with 200ms delay).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`/api/v1/reports/${reportId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroup }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message = (errorData as { error?: string })?.error ?? 'Export failed — please try again';
        setToast({ message, variant: 'error' });
        return;
      }

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

      setToast({ message: 'Export complete', variant: 'success' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setToast({ message: 'Export timed out — try applying more filters', variant: 'error' });
      } else {
        setToast({ message: 'Export failed — please try again', variant: 'error' });
      }
    } finally {
      clearTimeout(timeout);
      setIsExporting(false);
    }
  }, [reportId, filterGroup]);

  return { isExporting, toast, clearToast, triggerExport };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useExport.ts
git commit -m "feat: add useExport hook for blob download with toast state"
```

---

### Task 14: Update TableToolbar.tsx

**Files:**
- Modify: `client/src/components/TableToolbar.tsx:1-62`

- [ ] **Step 1: Add new imports**

Add `Download` and `Loader2` to the lucide-react import on line 9:

```typescript
import { SlidersHorizontal, Columns3, ChevronDown, Download, Loader2 } from 'lucide-react';
```

- [ ] **Step 2: Add new props to the interface**

Add `isExporting` and `onExport` to `TableToolbarProps` (lines 11-18):

```typescript
interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
  isExporting: boolean;
  onExport: () => void;
}
```

- [ ] **Step 3: Destructure new props**

Update the function signature to include the new props:

```typescript
export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  isExporting, onExport,
}: TableToolbarProps) {
```

- [ ] **Step 4: Add Export button after the Columns button**

After the `{/* Columns button */}` section (after the closing `</button>` around line 59), add the Export button:

```typescript
      {/* Export button — action (not a toggle), pushed right */}
      <button
        onClick={onExport}
        disabled={isExporting}
        className={`ml-auto ${baseClass} ${inactiveClass}
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isExporting
          ? <Loader2 size={16} className="animate-spin" />
          : <Download size={16} />}
        <span>{isExporting ? 'Exporting...' : 'Export'}</span>
      </button>
```

- [ ] **Step 5: Do NOT commit yet**

TypeScript will not compile because `ReportTableWidget.tsx` doesn't pass the new required props yet. Continue immediately to Task 15 — both files will be committed together.

---

### Task 15: Wire up ReportTableWidget.tsx

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx:1-149`

- [ ] **Step 1: Add imports**

Add `useExport` and `Toast` imports. Update the import block (lines 11-22):

After the existing imports, add:

```typescript
import { useExport } from '../../hooks/useExport';
import Toast from '../Toast';
```

- [ ] **Step 2: Add useExport hook call**

Inside the component, after the `useColumnManager` call (around line 49), add:

```typescript
  const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup);
```

- [ ] **Step 3: Pass props to TableToolbar**

Update the `<TableToolbar>` JSX to include the new props:

```typescript
      <TableToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isFilterOpen={isFilterOpen}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        hiddenColumnCount={hiddenCount}
        isColumnPanelOpen={isColumnPanelOpen}
        onColumnToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
        isExporting={isExporting}
        onExport={triggerExport}
      />
```

- [ ] **Step 4: Render Toast at the bottom of the JSX**

Add the Toast component at the very end of the returned JSX, just before the closing `</>`:

```typescript
      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
      )}
    </>
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors — all props are now properly wired

- [ ] **Step 6: Commit (includes Task 14 changes)**

```bash
git add client/src/components/TableToolbar.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: add Export button to toolbar and wire up export hook in ReportTableWidget"
```

---

### Task 16: Frontend verification

- [ ] **Step 1: TypeScript compile check**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Build check**

Run: `cd client && npm run build`
Expected: Successful build with no errors

---

## Verification Checklist

### Backend
```bash
cd server && npx tsc --noEmit     # TypeScript compiles
cd server && npm test              # All tests pass (health, htmlParser, serverClientFilter, excelExporter)
```

### Frontend
```bash
cd client && npx tsc --noEmit     # TypeScript compiles
cd client && npm run build         # Production build succeeds
```

### Manual Testing (both servers running)

1. **Template export:** Apply date filter to GRV Log → click Export → verify downloaded `.xlsx` matches template format with data filled in starting at row 5
2. **Fallback export:** If a report without `exportConfig` exists → verify basic Excel with headers + data
3. **Empty export:** Apply filter that returns no rows → verify Excel file has headers but no data rows
4. **Large export:** Minimal filters (hundreds of rows) → verify all rows appear, footer pushed down
5. **Client-side filters:** Apply "Driver ID contains X" → verify exported data matches dashboard view
6. **Button states:** Click Export → observe spinner + "Exporting..." → verify disabled during export → verify success toast on completion (auto-dismiss 3s)
7. **Error handling:** Disconnect backend → click Export → verify error toast
8. **Row cap:** Unfiltered data exceeding 5,000 rows → verify error toast with cap message

### File count verification

| Type | Count | Files |
|------|-------|-------|
| Backend new | 5 | exportSchemas.ts, serverClientFilter.ts, templateService.ts, excelExporter.ts, export.ts |
| Backend modified | 4 | reportRegistry.ts, grvLog.ts, querySchemas.ts, index.ts |
| Backend tests | 2 | serverClientFilter.test.ts, excelExporter.test.ts |
| Frontend new | 3 | Toast.tsx, useExport.ts, index.css (modified) |
| Frontend modified | 2 | TableToolbar.tsx, ReportTableWidget.tsx |
| **Total** | **16** | |
