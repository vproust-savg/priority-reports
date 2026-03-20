# Spec 02b — Frontend Real Data: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace demo pages and mock widgets with a real GRV Log report page that fetches live Priority data, with date range, vendor, and status filters, plus pagination.

**Architecture:** `ReportTableWidget` replaces `DemoTableWidget` — it manages filter state, fetches filter options via `useFiltersQuery`, passes filters to `useReportQuery`, and renders FilterBar + table + pagination. The pages config switches from demo pages to a single QC page. The widget system remains config-driven.

**Tech Stack:** React 19, TanStack Query v5, Tailwind CSS v4, TypeScript strict, Zod validation

**Spec:** `specs/spec-02b-frontend-real-data.md`

**Mandatory code rules:** Read `CLAUDE.md` before writing any code. Every file needs an intent block, WHY comments on non-obvious decisions, max 150 lines per file. Apple/Stripe aesthetic — use `--color-primary` (#007AFF), `rounded-2xl`, system fonts, no Tailwind v3 patterns.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `shared/types/filters.ts` | NEW (if not created by backend session) — `FilterOption`, `FilterValues`, `FiltersResponse` |
| `shared/types/index.ts` | MOD — re-export filters |
| `client/src/hooks/useReportQuery.ts` | MOD — add vendor/status params |
| `client/src/hooks/useFiltersQuery.ts` | NEW — TanStack Query hook for filter options |
| `client/src/components/FilterBar.tsx` | NEW — Date range + vendor/status dropdowns |
| `client/src/components/Pagination.tsx` | NEW — Previous/Next pagination bar with record count |
| `client/src/components/widgets/ReportTableWidget.tsx` | NEW — Filter state + FilterBar + table + pagination |
| `client/src/config/pages.ts` | MOD — replace demo pages with QC page |
| `client/src/config/widgetRegistry.ts` | MOD — register ReportTableWidget |
| `client/src/App.tsx` | MOD — default redirect to /qc |
| `client/src/components/widgets/DemoTableWidget.tsx` | DELETE |

---

### Task 1: Shared Filter Types

If the backend session already created `shared/types/filters.ts`, verify the content matches and skip this task.

**Files:**
- Create: `shared/types/filters.ts`
- Modify: `shared/types/index.ts`

- [ ] **Step 1: Check if file already exists**

Run: `cat shared/types/filters.ts 2>/dev/null || echo "NOT FOUND"`
If it exists AND contains `FilterOption`, `FilterValues`, `FiltersResponse` → skip to Step 3.

- [ ] **Step 2: Create `shared/types/filters.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for report filter dropdowns and filter state.
//          Used by both backend (to build filter responses) and
//          frontend (to manage filter UI state).
// USED BY: routes/filters.ts, FilterBar.tsx, ReportTableWidget.tsx
// EXPORTS: FilterOption, FilterValues, FiltersResponse
// ═══════════════════════════════════════════════════════════════

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterValues {
  from: string;
  to: string;
  vendor: string;
  status: string;
}

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
  };
}
```

- [ ] **Step 3: Ensure `shared/types/index.ts` re-exports filters**

Add this line if not already present:

```typescript
export * from './filters';
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/types/filters.ts shared/types/index.ts
git commit -m "feat: add shared filter types (FilterOption, FilterValues, FiltersResponse)"
```

---

### Task 2: Extend `useReportQuery` Hook

**Files:**
- Modify: `client/src/hooks/useReportQuery.ts`

- [ ] **Step 1: Add vendor and status to params interface**

In `client/src/hooks/useReportQuery.ts`, replace the `ReportQueryParams` interface:

Old:
```typescript
interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}
```

New:
```typescript
interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
}
```

- [ ] **Step 2: Add params to URLSearchParams**

After the existing `if (params.to)` line, add:

```typescript
      if (params.vendor) searchParams.set('vendor', params.vendor);
      if (params.status) searchParams.set('status', params.status);
```

- [ ] **Step 3: Update intent block**

Change `USED BY` from:
```
// USED BY: DemoTableWidget, future widget components
```
To:
```
// USED BY: ReportTableWidget
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useReportQuery.ts
git commit -m "feat: add vendor and status filter params to useReportQuery"
```

---

### Task 3: Create `useFiltersQuery` Hook

**Files:**
- Create: `client/src/hooks/useFiltersQuery.ts`

- [ ] **Step 1: Create `client/src/hooks/useFiltersQuery.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFiltersQuery.ts
// PURPOSE: TanStack Query hook for fetching report filter options.
//          Returns vendor and status lists for dropdown population.
//          Cached for 5 minutes — filter options change infrequently.
// USED BY: ReportTableWidget
// EXPORTS: useFiltersQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { FiltersResponse } from '@shared/types';

export function useFiltersQuery(reportId: string) {
  return useQuery<FiltersResponse>({
    queryKey: ['filters', reportId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/reports/${reportId}/filters`);
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    // WHY: 5 minutes — filter options (vendor list, status list) change infrequently
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useFiltersQuery.ts
git commit -m "feat: add useFiltersQuery hook for report filter options"
```

---

### Task 4: Create FilterBar Component

**Files:**
- Create: `client/src/components/FilterBar.tsx`

- [ ] **Step 1: Create `client/src/components/FilterBar.tsx`**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/FilterBar.tsx
// PURPOSE: Horizontal filter bar with date range and dropdown filters.
//          Renders inside widget card, above the table. Uses native
//          HTML inputs — no external date picker or dropdown library.
// USED BY: ReportTableWidget
// EXPORTS: FilterBar
// ═══════════════════════════════════════════════════════════════

import type { FiltersResponse, FilterValues } from '@shared/types';

interface FilterBarProps {
  filters: FiltersResponse['filters'] | undefined;
  filtersLoading: boolean;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}

export default function FilterBar({ filters, filtersLoading, values, onChange }: FilterBarProps) {
  const update = (field: keyof FilterValues, value: string) => {
    onChange({ ...values, [field]: value });
  };

  const labelClass = 'text-xs font-medium text-slate-500 uppercase tracking-wider';
  const inputClass =
    'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors';

  return (
    {/* WHY: bg-slate-50/60 creates visual separation from table content — matches table header tint */}
    <div className="flex flex-col lg:flex-row flex-wrap items-start lg:items-end gap-4 px-5 py-4 bg-slate-50/60 border-b border-slate-100">
      <div className="flex flex-col gap-1">
        <label className={labelClass}>From</label>
        <input
          type="date"
          value={values.from}
          onChange={(e) => update('from', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>To</label>
        <input
          type="date"
          value={values.to}
          onChange={(e) => update('to', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Vendor</label>
        <select
          value={values.vendor}
          onChange={(e) => update('vendor', e.target.value)}
          disabled={filtersLoading}
          className={`${inputClass} ${filtersLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">{filtersLoading ? 'Loading...' : 'All Vendors'}</option>
          {filters?.vendors.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Status</label>
        <select
          value={values.status}
          onChange={(e) => update('status', e.target.value)}
          disabled={filtersLoading}
          className={`${inputClass} ${filtersLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">{filtersLoading ? 'Loading...' : 'All Statuses'}</option>
          {filters?.statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/FilterBar.tsx
git commit -m "feat: add FilterBar component with date range, vendor, status controls"
```

---

### Task 5: Create ReportTableWidget

This is the largest component. It replaces `DemoTableWidget` with filter state, FilterBar, table rendering (copied from DemoTableWidget), and pagination.

**Files:**
- Create: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Read `DemoTableWidget.tsx` for the table rendering code**

Read `client/src/components/widgets/DemoTableWidget.tsx` — copy the table `<thead>` and `<tbody>` JSX verbatim into the new component.

- [ ] **Step 2: Create `client/src/components/widgets/ReportTableWidget.tsx`**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Full report widget with filter bar, data table, and
//          pagination. Replaces DemoTableWidget. Manages filter
//          state locally and passes filters to useReportQuery.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// PROPS: reportId (string) — which report to fetch
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { formatCellValue } from '../../utils/formatters';
import FilterBar from '../FilterBar';
import type { FilterValues } from '@shared/types';

function getDefaultFilters(): FilterValues {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  return {
    from: thirtyDaysAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
    vendor: '',
    status: '',
  };
}

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const [filters, setFilters] = useState<FilterValues>(getDefaultFilters());
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtersQuery = useFiltersQuery(reportId);

  // WHY: If filter options fail to load, dropdowns still show "All" default — report is still usable
  if (filtersQuery.error) console.warn('Failed to load filter options:', filtersQuery.error);

  const { data, isLoading, error, refetch } = useReportQuery(reportId, {
    from: filters.from,
    to: filters.to,
    vendor: filters.vendor || undefined, // WHY: Don't send empty string to API
    status: filters.status || undefined,
    page,
    pageSize,
  });

  // WHY: Reset to page 1 when any filter changes — current page may not exist in new result set
  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <>
      <FilterBar
        filters={filtersQuery.data?.filters}
        filtersLoading={filtersQuery.isLoading}
        values={filters}
        onChange={handleFilterChange}
      />

      {isLoading && (
        <div className="p-6 space-y-4">
          {/* WHY: Pulse skeleton conveys "data is coming" — more polished than bare text */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="h-4 bg-slate-100 rounded w-1/6" />
              <div className="h-4 bg-slate-100 rounded w-1/4" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-1/6" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-6 text-center">
          <p className="text-red-500 text-sm mb-3">Failed to load data</p>
          <button onClick={() => refetch()} className="text-sm text-primary font-medium hover:underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && (!data || data.data.length === 0) && (
        <div className="p-8 text-center">
          <p className="text-slate-500 text-sm font-medium">No results found</p>
          <p className="text-slate-400 text-xs mt-1">Try adjusting your date range or filters</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50/80">
                  {data.columns.map((col) => (
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
                {data.data.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors duration-150 ${
                      rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
                    }`}
                  >
                    {data.columns.map((col) => {
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.pagination.totalCount)} of{' '}
              {data.pagination.totalCount} results
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= data.pagination.totalPages}
                className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 3: Count lines — must be under 150**

Run: `wc -l client/src/components/widgets/ReportTableWidget.tsx`
Expected: ~160 lines — over 150 limit. Extract pagination into `client/src/components/Pagination.tsx`:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Pagination.tsx
// PURPOSE: Simple Previous/Next pagination bar with record count.
//          Apple-style pill buttons with subtle primary tint.
// USED BY: ReportTableWidget
// EXPORTS: Pagination
// ═══════════════════════════════════════════════════════════════

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, totalCount, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
      <span className="text-xs text-slate-500">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} results
      </span>
      <div className="flex gap-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

Then in `ReportTableWidget.tsx`, replace the inline pagination block with:
```tsx
import Pagination from '../Pagination';
// ... and in the JSX:
<Pagination
  page={page}
  pageSize={pageSize}
  totalCount={data.pagination.totalCount}
  totalPages={data.pagination.totalPages}
  onPageChange={setPage}
/>
```

After extraction, verify both files are under 150 lines:
```bash
wc -l client/src/components/widgets/ReportTableWidget.tsx client/src/components/Pagination.tsx
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx client/src/components/Pagination.tsx
git commit -m "feat: add ReportTableWidget with filters, table, and pagination"
```

---

### Task 6: Update Config Files

**Files:**
- Modify: `client/src/config/pages.ts`
- Modify: `client/src/config/widgetRegistry.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Replace pages config**

In `client/src/config/pages.ts`, replace the entire `pages` array (the argument to `z.array(PageConfigSchema).parse([...])`) with:

```typescript
export const pages = z.array(PageConfigSchema).parse([
  {
    id: 'qc',
    name: 'Quality Control',
    path: '/qc',
    widgets: [
      {
        id: 'grv-log',
        reportId: 'grv-log',
        type: 'table',
        title: 'GRV Log — Goods Receiving Vouchers',
        colSpan: 12,
      },
    ],
  },
]);
```

- [ ] **Step 2: Update widget registry**

In `client/src/config/widgetRegistry.ts`:

Replace import:
```typescript
import DemoTableWidget from '../components/widgets/DemoTableWidget';
```
With:
```typescript
import ReportTableWidget from '../components/widgets/ReportTableWidget';
```

Replace registry entry:
```typescript
  table: DemoTableWidget,
```
With:
```typescript
  table: ReportTableWidget,
```

Remove the comment `// Future: kpi: KPIWidget, chart: ChartWidget, download: DownloadWidget`.

Also update `client/src/utils/formatters.ts` intent block line 6 — change `USED BY: DemoTableWidget` to `USED BY: ReportTableWidget`.

Also update `shared/types/index.ts` intent block — change `EXPORTS: Everything from api.ts and widget.ts` to `EXPORTS: Everything from api.ts, widget.ts, and filters.ts`.

- [ ] **Step 3: Update default redirect in `client/src/App.tsx`**

Replace:
```typescript
<Route path="/" element={<Navigate to="/overview" replace />} />
```
With:
```typescript
<Route path="/" element={<Navigate to="/qc" replace />} />
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/config/pages.ts client/src/config/widgetRegistry.ts client/src/App.tsx
git commit -m "feat: replace demo pages with QC page, register ReportTableWidget"
```

---

### Task 7: Delete DemoTableWidget

**Files:**
- Delete: `client/src/components/widgets/DemoTableWidget.tsx`

- [ ] **Step 1: Verify no remaining imports of DemoTableWidget**

Run: `grep -r "DemoTableWidget" client/src/`
Expected: No results (widgetRegistry was updated in Task 6)

- [ ] **Step 2: Delete the file**

```bash
rm client/src/components/widgets/DemoTableWidget.tsx
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/widgets/DemoTableWidget.tsx
git commit -m "chore: delete DemoTableWidget — replaced by ReportTableWidget"
```

---

### Task 8: Visual Verification

Start the dev server and verify the UI works.

- [ ] **Step 1: Start the frontend dev server**

Run: `cd client && npm run dev`
Expected: Vite starts on http://localhost:5173

- [ ] **Step 2: Verify default redirect**

Navigate to `http://localhost:5173/`
Expected: Redirects to `/qc`

- [ ] **Step 3: Verify QC page renders**

At `/qc`, verify:
- Nav shows "Quality Control" tab (active)
- Widget card titled "GRV Log — Goods Receiving Vouchers"
- FilterBar visible with From date, To date, Vendor dropdown, Status dropdown
- From date defaults to 30 days ago
- To date defaults to today

- [ ] **Step 4: Verify filter interactions**

- Change date range → data refetches (loading state appears briefly)
- Select a vendor → data refetches
- Select a status → data refetches
- Select "All Vendors" → clears vendor filter

- [ ] **Step 5: Verify table rendering** (requires backend running)

If backend is running on port 3001:
- Table shows 14 columns with real GRV data
- Currency columns right-aligned with $ formatting
- Date columns formatted (e.g., "Mar 19, 2026")
- Pagination shows "Showing 1–50 of X results"

If backend is NOT running:
- Error state shows "Failed to load data" with Retry button (expected)

---

### Task 9: Airtable Status Update

Use the `/airtable-api` skill for API patterns. Only run after Tasks 1-8 pass.

- [ ] **Step 1: Update record fields**

Use `PATCH` to update record `recJluOijRUZcZnBS` in table `tblvqv3S31KQhKRU6` in base `appjwOgR4HsXeGIda`:
- Field `fldAAdwPBUQBRQet7` (Claude Status) → `"Frontend Built"`
- Field `fld1cKObhpMuz3VYq` (Claude Comments) → `"QC page with GRV Log widget. ReportTableWidget with FilterBar (date range, vendor, status dropdowns). Pagination controls. Replaces demo pages."`

**NEVER modify `fld88uqAVUuDWUaBQ` (Victor Status) or `fldfGYjvGFcxvGC1K` (Victor Comments).**

- [ ] **Step 2: Add record comment**

`POST /v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6/recJluOijRUZcZnBS/comments`

Body: `{"text": "2026-03-20: Frontend report page built. ReportTableWidget with FilterBar (date range, vendor, status dropdowns). Pagination controls. QC page with GRV Log widget. Replaced demo pages and DemoTableWidget. Updated by Claude Code."}`
