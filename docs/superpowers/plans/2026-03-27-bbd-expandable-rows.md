# BBD Expandable Rows + New Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Receiving Date and Value columns to the BBD report, plus a reusable expandable row system that lazy-loads warehouse/bin details from Priority's RAWSERIALBAL_SUBFORM.

**Architecture:** Three layers — (1) shared types define the expandConfig contract, (2) backend adds new fields to BBD and exposes a generic subform endpoint, (3) frontend adds reusable expand infrastructure to ReportTable and a BBD-specific detail panel. Lazy loading via TanStack Query; animations via Framer Motion clip-path reveal.

**Tech Stack:** TypeScript, Express, React 19, TanStack Query v5, Framer Motion, Tailwind CSS v4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-27-bbd-expandable-rows-design.md`

---

## File Map

### New Files (5)
| File | Responsibility |
|------|---------------|
| `server/src/routes/subform.ts` | GET /:reportId/subform/:rowKey endpoint |
| `client/src/components/details/types.ts` | DetailPanelProps interface |
| `client/src/config/detailRegistry.ts` | Maps reportId → detail React component |
| `client/src/hooks/useSubformQuery.ts` | TanStack Query hook for lazy subform fetch |
| `client/src/components/details/BbdDetailPanel.tsx` | BBD warehouse/bin detail mini-table |

### Modified Files (7)
| File | What Changes |
|------|-------------|
| `shared/types/api.ts` | Add `expandConfig` to `ResponseMeta` |
| `server/src/config/reportRegistry.ts` | Add `expandConfig` to `ReportConfig` interface |
| `server/src/reports/bbdReport.ts` | New $select fields, columns, transformRow output, expandConfig |
| `server/src/routes/query.ts` | Pass `expandConfig` into response meta |
| `server/src/index.ts` | Mount subform router |
| `client/src/config/animationConstants.ts` | Add EXPAND_REVEAL + EASE_EXPAND presets |
| `client/src/components/ReportTable.tsx` | Expand chevron, detail row, AnimatePresence |
| `client/src/components/widgets/ReportTableWidget.tsx` | expandedRows state, pass expand props |

---

## Task 1: Shared Types — Add expandConfig to ResponseMeta

**Files:**
- Modify: `shared/types/api.ts:22-32`

- [ ] **Step 1: Add expandConfig to ResponseMeta**

In `shared/types/api.ts`, add the `expandConfig` field after `rowStyleField` (line 31):

```ts
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
  // WHY: When present, the frontend enables expandable rows. rowKeyField tells
  // it which field in the row data holds the unique key for subform fetching.
  expandConfig?: {
    rowKeyField: string;
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit && cd ../client && npx tsc -b --noEmit`
Expected: Both pass (new optional field is backwards-compatible).

- [ ] **Step 3: Commit**

```bash
git add shared/types/api.ts
git commit -m "feat: add expandConfig to ResponseMeta for expandable rows"
```

---

## Task 2: Backend — Add expandConfig to ReportConfig

**Files:**
- Modify: `server/src/config/reportRegistry.ts:43-78`

- [ ] **Step 1: Add expandConfig to ReportConfig interface**

In `server/src/config/reportRegistry.ts`, add after `excelStyle` (line 77):

```ts
  // WHY: When present, enables the subform endpoint for this report.
  // The frontend uses rowKeyField to identify rows; the backend uses
  // keyField and subformName to build the Priority API call.
  expandConfig?: {
    subformName: string;
    keyField: string;
    rowKeyField: string;
  };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: PASS (new optional field).

- [ ] **Step 3: Commit**

```bash
git add server/src/config/reportRegistry.ts
git commit -m "feat: add expandConfig to ReportConfig interface"
```

---

## Task 3: Backend — Add New Fields + expandConfig to BBD Report

**Files:**
- Modify: `server/src/reports/bbdReport.ts`
- Test: `server/tests/bbdTransformRow.test.ts` (new)

- [ ] **Step 1: Write failing tests for transformRow**

Create `server/tests/bbdTransformRow.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/bbdTransformRow.test.ts
// PURPOSE: Tests for BBD report transformRow — new fields
//          (receivingDate, value, serialName, purchasePrice).
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getReport } from '../src/config/reportRegistry';

// WHY: Import bbdReport for side-effect registration into reportRegistry.
import '../src/reports/bbdReport';

describe('bbdReport transformRow', () => {
  const report = getReport('bbd')!;

  it('includes receivingDate from CURDATE', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: 'Brand1', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
    });
    expect(row.receivingDate).toBe('2026-02-05T00:00:00Z');
  });

  it('computes value = QUANT * Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
    });
    expect(row.value).toBeCloseTo(339.7, 2);
  });

  it('outputs serialName from SERIALNAME', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 5, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'Yes', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'ABC123',
    });
    expect(row.serialName).toBe('ABC123');
  });

  it('outputs purchasePrice from Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 1, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 21.69,
      SERIALNAME: '000',
    });
    expect(row.purchasePrice).toBe(21.69);
  });

  it('value is 0 when Y_8737_0_ESH is 0', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 84, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 0,
      SERIALNAME: '000',
    });
    expect(row.value).toBe(0);
  });

  it('value is 0 when Y_8737_0_ESH is null', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: null,
      SERIALNAME: '000',
    });
    expect(row.value).toBe(0);
    expect(row.purchasePrice).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/bbdTransformRow.test.ts`
Expected: FAIL — `receivingDate`, `value`, `serialName`, `purchasePrice` are all undefined.

- [ ] **Step 3: Update bbdReport.ts — $select, columns, transformRow, expandConfig**

In `server/src/reports/bbdReport.ts`, make these changes:

**Add to columns array** (after the `unit` entry at line 23, before `expiryDate`):

```ts
  { key: 'value', label: 'Value', type: 'currency' },
  { key: 'receivingDate', label: 'Recv. Date', type: 'date' },
```

**Add to filterColumns array** (after the `balance` entry at line 38, before `expiryDate`):

```ts
  { key: 'value', label: 'Value', filterType: 'number', filterLocation: 'client' },
  { key: 'receivingDate', label: 'Recv. Date', filterType: 'date', filterLocation: 'client' },
```

**Update $select** in `buildQuery` (line 59) — add `SERIALNAME,CURDATE,Y_8737_0_ESH`:

```ts
    $select: 'PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,QUANT,UNITNAME,SERIALNAME,CURDATE,Y_8737_0_ESH',
```

**Update transformRow** return object (around line 112) — add four new fields after `unit`:

```ts
    serialName: raw.SERIALNAME ?? '',
    purchasePrice: Number(raw.Y_8737_0_ESH ?? 0),
    value: Number(raw.QUANT ?? 0) * Number(raw.Y_8737_0_ESH ?? 0),
    receivingDate: raw.CURDATE,
```

**Add expandConfig** to the `reportRegistry.set` call (after `excelStyle`, around line 271):

```ts
  expandConfig: {
    subformName: 'RAWSERIALBAL_SUBFORM',
    keyField: 'SERIALNAME',
    rowKeyField: 'serialName',
  },
```

**Add to excelStyle.columnWidths** (in the `reportRegistry.set` call):

```ts
      value: 10,
      receivingDate: 11,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/bbdTransformRow.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Run full server test suite**

Run: `cd server && npm test`
Expected: All tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/bbdReport.ts server/tests/bbdTransformRow.test.ts
git commit -m "feat: add Value, Recv Date, serialName, purchasePrice to BBD report"
```

---

## Task 4: Backend — Pass expandConfig Through Response Meta

**Files:**
- Modify: `server/src/routes/query.ts:153-162`

- [ ] **Step 1: Add expandConfig to response meta**

In `server/src/routes/query.ts`, update the response construction (around line 152). Add `expandConfig` to the `meta` object after `rowStyleField`:

```ts
    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
        rowStyleField: report.rowStyleField,
        // WHY: When the report has expandConfig, pass rowKeyField to the frontend
        // so it knows which row field to use as the expand key. subformName and
        // keyField stay server-side (used by the subform endpoint).
        expandConfig: report.expandConfig
          ? { rowKeyField: report.expandConfig.rowKeyField }
          : undefined,
      },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/query.ts
git commit -m "feat: pass expandConfig through response meta to frontend"
```

---

## Task 5: Backend — Subform Endpoint

**Files:**
- Create: `server/src/routes/subform.ts`
- Modify: `server/src/index.ts:18,37`

- [ ] **Step 1: Create subform router**

Create `server/src/routes/subform.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/subform.ts
// PURPOSE: GET /api/v1/reports/:reportId/subform/:rowKey endpoint.
//          Fetches sub-form data from Priority for a single parent row.
//          Used by the frontend for lazy-loaded expandable row details.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createSubformRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { getReport } from '../config/reportRegistry';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry } from '../services/priorityHttp';

// WHY: Import report definitions so they self-register into reportRegistry.
import '../reports/grvLog';
import '../reports/bbdReport';

export function createSubformRouter(): Router {
  const router = Router();

  router.get('/:reportId/subform/:rowKey', async (req, res) => {
    const { reportId, rowKey } = req.params;

    const report = getReport(reportId);
    if (!report || !report.expandConfig) {
      res.status(404).json({ error: `No expandable config for report: ${reportId}` });
      return;
    }

    const { entity } = report;
    const { keyField, subformName } = report.expandConfig;

    try {
      // WHY: Can't use querySubform() — it returns only the first record
      // from multi-record sub-forms (Pattern B). We need the full array
      // (all warehouse balances). Fetch the raw response directly.
      const config = getPriorityConfig();
      const escapedKey = rowKey.replace(/'/g, "''");
      const url = `${config.baseUrl}${entity}(${keyField}='${escapedKey}')/${subformName}`;
      const response = await fetchWithRetry(url);

      if (response.status === 404) {
        res.json({ data: [] });
        return;
      }

      if (response.status < 200 || response.status >= 300) {
        console.error(`[subform] Priority returned ${response.status} for ${url}`);
        res.status(502).json({ error: 'Failed to fetch sub-form data from Priority' });
        return;
      }

      const parsed = JSON.parse(response.body) as { value?: Record<string, unknown>[] };
      res.json({ data: parsed.value ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[subform] Fetch failed for ${reportId}/${rowKey}: ${message}`);
      res.status(502).json({ error: `Failed to fetch sub-form data: ${message}` });
    }
  });

  return router;
}
```

- [ ] **Step 2: Mount subform router in index.ts**

In `server/src/index.ts`, add the import (after line 18):

```ts
import { createSubformRouter } from './routes/subform';
```

Add the mount (after line 37):

```ts
app.use('/api/v1/reports', createSubformRouter());
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `cd server && npm run dev`

In another terminal:
```bash
curl -s http://localhost:3001/api/v1/reports/bbd/subform/0000 | python3 -m json.tool
```

Expected: JSON with `{"data": [{"WARHSNAME": "Main", "LOCNAME": "...", ...}]}`

```bash
curl -s http://localhost:3001/api/v1/reports/grv-log/subform/test
```

Expected: `{"error": "No expandable config for report: grv-log"}`

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/subform.ts server/src/index.ts
git commit -m "feat: add generic subform endpoint for expandable rows"
```

---

## Task 6: Frontend — Animation Presets

**Files:**
- Modify: `client/src/config/animationConstants.ts:42`

- [ ] **Step 1: Add EXPAND_REVEAL and EASE_EXPAND presets**

In `client/src/config/animationConstants.ts`, add after `REDUCED_TRANSITION` (line 42):

```ts

// --- Expandable row reveal ---
// WHY: Clip-path animation creates a clean top-down "unfold" without
// layout thrash. Height: auto is unreliable in table contexts.
export const EXPAND_REVEAL = {
  initial: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
  animate: { opacity: 1, clipPath: 'inset(0 0 0% 0)' },
  exit: { opacity: 0, clipPath: 'inset(0 0 100% 0)' },
};
// WHY: Expand is 200ms, exit is 150ms — closing feels instant.
export const EASE_EXPAND = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const };
export const EASE_COLLAPSE = { duration: 0.15, ease: 'easeOut' as const };
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/config/animationConstants.ts
git commit -m "feat: add EXPAND_REVEAL animation presets for expandable rows"
```

---

## Task 7: Frontend — Detail Panel Types + Registry

**Files:**
- Create: `client/src/components/details/types.ts`
- Create: `client/src/config/detailRegistry.ts`

- [ ] **Step 1: Create DetailPanelProps interface**

Create `client/src/components/details/types.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/details/types.ts
// PURPOSE: Shared props interface for all expandable row detail panels.
//          Every detail panel component must accept these props.
// USED BY: BbdDetailPanel, detailRegistry, ReportTable
// EXPORTS: DetailPanelProps
// ═══════════════════════════════════════════════════════════════

import type { ComponentType } from 'react';

export interface DetailPanelProps {
  // WHY: The full parent row data object. Detail panels read fields from
  // this (e.g., purchasePrice for value calculations) without re-fetching.
  row: Record<string, unknown>;
  reportId: string;
}

export type DetailComponent = ComponentType<DetailPanelProps>;
```

- [ ] **Step 2: Create detail registry (placeholder — no BBD panel yet)**

Create `client/src/config/detailRegistry.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/detailRegistry.ts
// PURPOSE: Maps reportId → detail panel component for expandable rows.
//          Adding expandable rows to a new report = add one entry here.
// USED BY: ReportTableWidget
// EXPORTS: getDetailComponent
// ═══════════════════════════════════════════════════════════════

import type { DetailComponent } from '../components/details/types';

// WHY: Populated as detail panel components are created.
// BbdDetailPanel will be added in Task 10.
const detailRegistry: Record<string, DetailComponent> = {};

export function getDetailComponent(reportId: string): DetailComponent | null {
  return detailRegistry[reportId] ?? null;
}

export { detailRegistry };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/details/types.ts client/src/config/detailRegistry.ts
git commit -m "feat: add DetailPanelProps interface and detail registry"
```

---

## Task 8: Frontend — Expandable Row Infrastructure in ReportTable

**Files:**
- Modify: `client/src/components/ReportTable.tsx`

- [ ] **Step 1: Update ReportTable with expand support**

Replace the entire contents of `client/src/components/ReportTable.tsx`:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Supports
//          optional row-level styling and expandable row details.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ColumnDefinition } from '@shared/types';
import type { DetailComponent } from './details/types';
import { formatCellValue } from '../utils/formatters';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  EXPAND_REVEAL, EASE_EXPAND, EASE_COLLAPSE,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

// WHY: Maps status values to row CSS classes. Used when rowStyleField
// is present (e.g., BBD report colors rows by expiration urgency).
const ROW_STYLE_MAP: Record<string, string> = {
  'expired': 'bg-red-50 border-l-2 border-l-red-400',
  'expiring-perishable': 'bg-orange-50 border-l-2 border-l-orange-400',
  'expiring-non-perishable': 'bg-amber-50 border-l-2 border-l-amber-400',
};

interface ExpandConfig {
  rowKeyField: string;
  DetailComponent: DetailComponent;
}

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  rowStyleField?: string;
  reportId?: string;
  expandConfig?: ExpandConfig;
  expandedRows?: Set<string>;
  onToggleExpand?: (rowKey: string) => void;
}

export default function ReportTable({
  columns, data, rowStyleField,
  reportId, expandConfig, expandedRows, onToggleExpand,
}: ReportTableProps) {
  const reduced = useReducedMotion();
  const isExpandable = !!(expandConfig && expandedRows && onToggleExpand);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50/80">
            {isExpandable && (
              <th className="w-10 px-2 py-3" aria-label="Expand" />
            )}
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
            const styleValue = rowStyleField ? String(row[rowStyleField] ?? '') : '';
            const rowStyle = ROW_STYLE_MAP[styleValue] ?? '';
            const zebraClass = !rowStyle && rowIdx % 2 === 1 ? 'bg-slate-50/30' : '';

            const rowKey = isExpandable
              ? String(row[expandConfig.rowKeyField] ?? rowIdx)
              : '';
            const isExpanded = isExpandable && expandedRows.has(rowKey);

            // WHY: Expanded rows without a status color get a subtle blue tint
            // to visually connect the parent row to the detail panel below.
            const expandedClass = isExpanded && !rowStyle ? 'bg-blue-50/30' : '';

            return (
              <ExpandableRow
                key={isExpandable ? rowKey : rowIdx}
                row={row}
                rowIdx={rowIdx}
                columns={columns}
                rowStyle={rowStyle}
                zebraClass={zebraClass}
                expandedClass={expandedClass}
                isExpandable={isExpandable}
                isExpanded={isExpanded}
                rowKey={rowKey}
                reportId={reportId}
                expandConfig={expandConfig}
                onToggleExpand={onToggleExpand}
                reduced={reduced}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// WHY: Extracted to keep ReportTable under 200 lines and isolate
// the expand/collapse rendering logic into a focused component.
interface ExpandableRowProps {
  row: Record<string, unknown>;
  rowIdx: number;
  columns: ColumnDefinition[];
  rowStyle: string;
  zebraClass: string;
  expandedClass: string;
  isExpandable: boolean;
  isExpanded: boolean;
  rowKey: string;
  reportId?: string;
  expandConfig?: ExpandConfig;
  onToggleExpand?: (rowKey: string) => void;
  reduced: boolean;
}

function ExpandableRow({
  row, rowIdx, columns, rowStyle, zebraClass, expandedClass,
  isExpandable, isExpanded, rowKey, reportId, expandConfig,
  onToggleExpand, reduced,
}: ExpandableRowProps) {
  const DetailComponent = expandConfig?.DetailComponent;

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-blue-50/60 transition-colors duration-150 ${
          rowStyle || expandedClass || zebraClass
        } ${isExpandable ? 'cursor-pointer group' : ''}`}
        onClick={isExpandable ? () => onToggleExpand!(rowKey) : undefined}
      >
        {isExpandable && (
          <td className="w-10 px-2 py-3 text-center">
            <button
              aria-expanded={isExpanded}
              aria-label="Expand row details"
              className="p-0.5 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand!(rowKey);
              }}
              tabIndex={0}
            >
              <ChevronRight
                size={14}
                className={`text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ease-out ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </td>
        )}
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

      <AnimatePresence>
        {isExpanded && DetailComponent && reportId && (
          <tr key={`detail-${rowKey}`}>
            <td colSpan={columns.length + 1} className="p-0">
              <motion.div
                initial={reduced ? REDUCED_FADE.initial : EXPAND_REVEAL.initial}
                animate={reduced ? REDUCED_FADE.animate : EXPAND_REVEAL.animate}
                exit={reduced ? REDUCED_FADE.exit : EXPAND_REVEAL.exit}
                transition={reduced ? REDUCED_TRANSITION : (isExpanded ? EASE_EXPAND : EASE_COLLAPSE)}
              >
                <DetailComponent row={row} reportId={reportId} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ReportTable.tsx
git commit -m "feat: add expandable row infrastructure to ReportTable"
```

---

## Task 9: Frontend — Wire Expand State in ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add expand state and pass props to ReportTable**

In `client/src/components/widgets/ReportTableWidget.tsx`:

**Add imports** (around line 1-2, with existing imports):

```ts
import { useState, useMemo, useCallback } from 'react';
```

And add (after the existing imports, around line 29):

```ts
import { getDetailComponent } from '../../config/detailRegistry';
```

**Add state** inside the component function (after `const filterLoadError`, around line 62):

```ts
  // --- Expand state ---
  const expandConfig = data?.meta?.expandConfig;
  const DetailComponent = expandConfig ? getDetailComponent(reportId) : null;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const toggleExpand = useCallback((rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  }, []);
```

**Update the ReportTable JSX** (around line 158) — add the new props:

```tsx
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={displayData}
            rowStyleField={data?.meta?.rowStyleField}
            reportId={reportId}
            expandConfig={expandConfig && DetailComponent ? {
              rowKeyField: expandConfig.rowKeyField,
              DetailComponent,
            } : undefined}
            expandedRows={expandedRows}
            onToggleExpand={toggleExpand}
          />
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: wire expandable row state in ReportTableWidget"
```

---

## Task 10: Frontend — Subform Query Hook + BBD Detail Panel

**Files:**
- Create: `client/src/hooks/useSubformQuery.ts`
- Create: `client/src/components/details/BbdDetailPanel.tsx`
- Modify: `client/src/config/detailRegistry.ts`

- [ ] **Step 1: Create useSubformQuery hook**

Create `client/src/hooks/useSubformQuery.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSubformQuery.ts
// PURPOSE: TanStack Query hook for lazy-loading sub-form data.
//          Used by expandable row detail panels.
// USED BY: BbdDetailPanel (and future detail panels)
// EXPORTS: useSubformQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';

interface SubformResponse {
  data: Record<string, unknown>[];
}

export function useSubformQuery(reportId: string, rowKey: string) {
  return useQuery<SubformResponse>({
    queryKey: ['subform', reportId, rowKey],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/reports/${encodeURIComponent(reportId)}/subform/${encodeURIComponent(rowKey)}`,
      );
      if (!response.ok) throw new Error(`Subform fetch failed: ${response.status}`);
      return response.json();
    },
    // WHY: Subform data rarely changes mid-session. 5-min stale time
    // prevents re-fetching when the user collapses and re-expands a row.
    staleTime: 5 * 60 * 1000,
    enabled: !!rowKey,
  });
}
```

- [ ] **Step 2: Create BbdDetailPanel component**

Create `client/src/components/details/BbdDetailPanel.tsx`:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/details/BbdDetailPanel.tsx
// PURPOSE: Detail panel for BBD expandable rows. Shows warehouse/bin
//          breakdown from RAWSERIALBAL_SUBFORM with computed values.
// USED BY: detailRegistry.ts (registered for 'bbd' report)
// EXPORTS: BbdDetailPanel
// ═══════════════════════════════════════════════════════════════

import { Loader2 } from 'lucide-react';
import type { DetailPanelProps } from './types';
import { useSubformQuery } from '../../hooks/useSubformQuery';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export default function BbdDetailPanel({ row, reportId }: DetailPanelProps) {
  const serialName = String(row.serialName ?? '');
  const purchasePrice = Number(row.purchasePrice ?? 0);

  const { data, isLoading, error } = useSubformQuery(reportId, serialName);
  const subformRows = data?.data ?? [];

  return (
    <div className="bg-slate-50/50 border-l-2 border-l-primary/20 border-b border-slate-100 py-4 pl-14 pr-6">
      {isLoading && (
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-slate-400" />
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-500">Failed to load details</span>
      )}

      {!isLoading && !error && subformRows.length === 0 && (
        <span className="text-xs text-slate-400 italic">No warehouse data</span>
      )}

      {!isLoading && !error && subformRows.length > 0 && (
        <table className="text-xs text-slate-600">
          <thead>
            <tr>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Warehouse</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Bin</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-400 uppercase tracking-wider">Qty</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Unit</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-400 uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody>
            {subformRows.map((sfRow, idx) => {
              const balance = Number(sfRow.BALANCE ?? 0);
              const value = balance * purchasePrice;
              return (
                <tr key={idx} className="hover:bg-slate-100/50 transition-colors duration-100">
                  <td className="px-3 py-1.5">{String(sfRow.WARHSNAME ?? '')}</td>
                  <td className="px-3 py-1.5">{String(sfRow.LOCNAME ?? '')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(balance)}</td>
                  <td className="px-3 py-1.5">{String(sfRow.UNITNAME ?? '')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Register BbdDetailPanel in detailRegistry**

Update `client/src/config/detailRegistry.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/detailRegistry.ts
// PURPOSE: Maps reportId → detail panel component for expandable rows.
//          Adding expandable rows to a new report = add one entry here.
// USED BY: ReportTableWidget
// EXPORTS: getDetailComponent
// ═══════════════════════════════════════════════════════════════

import type { DetailComponent } from '../components/details/types';
import BbdDetailPanel from '../components/details/BbdDetailPanel';

const detailRegistry: Record<string, DetailComponent> = {
  bbd: BbdDetailPanel,
};

export function getDetailComponent(reportId: string): DetailComponent | null {
  return detailRegistry[reportId] ?? null;
}

export { detailRegistry };
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useSubformQuery.ts client/src/components/details/BbdDetailPanel.tsx client/src/config/detailRegistry.ts
git commit -m "feat: add BBD detail panel with subform query hook"
```

---

## Task 11: Integration Test — End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Run full TypeScript compilation (both sides)**

Run: `cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit`
Expected: Both PASS with zero errors.

- [ ] **Step 2: Run full server test suite**

Run: `cd server && npm test`
Expected: All tests pass (existing + bbdTransformRow tests).

- [ ] **Step 3: Start both dev servers and verify BBD report loads**

Terminal 1: `cd server && npm run dev`
Terminal 2: `cd client && npm run dev`

Open `http://localhost:5173/bbd` in the browser. Verify:
1. New "Value" and "Recv. Date" columns appear in the correct positions
2. Value shows formatted currency (e.g., `$339.70`)
3. Receiving Date shows formatted date
4. Chevron icons appear in the first column
5. Clicking a row expands it, showing the warehouse/bin mini-table
6. Clicking again collapses it
7. Loading spinner shows briefly during subform fetch
8. Chevron rotates 90° when expanded, back when collapsed
9. Expanded row has subtle blue tint (for rows without status color)

- [ ] **Step 4: Test edge cases**

1. Find a row where Value is `$0.00` — verify it displays correctly
2. Expand multiple rows simultaneously — verify each loads independently
3. Collapse and re-expand a row — should load instantly (cached by TanStack Query)
4. Test on a row with a status color (red/orange/amber) — verify the color takes precedence over the blue tint

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: integration test fixes for expandable rows"
```

Only commit if changes were needed. Skip if everything passed cleanly.
