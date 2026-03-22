# Spec 02b — Frontend: Real Data Display + Report Filters

> **Session scope:** ~1 hour Claude Code work (frontend session only)
> **Date:** 2026-03-20
> **Status:** Ready to build
> **Parallel with:** spec-02a-backend-real-data.md (backend session)

---

## 1. Overview

### 1.1 What We're Building

Replace the demo pages and mock data widgets with a real **GRV Log** (Goods Receiving Vouchers) report page that fetches live Priority ERP data from the backend. Add a filter bar with date range, vendor dropdown, and status dropdown filters.

The table widget becomes a full report widget: it fetches filter options from the backend, renders a filter bar, and passes active filters to the data query.

### 1.2 Scope of This Spec

1. New `ReportTableWidget` — replaces `DemoTableWidget` with filter support
2. `FilterBar` component — date range picker, vendor dropdown, status dropdown
3. `useFiltersQuery` hook — fetches available filter options from backend
4. Extend `useReportQuery` hook — pass vendor and status filter params
5. Update `pages.ts` — replace demo pages with QC page containing GRV Log
6. Add `FilterOption` and `FiltersResponse` types to shared types
7. Remove `DemoTableWidget`
8. Update Airtable API Reports table (Claude Status, Comments, record comment)

### 1.3 Out of Scope

- Backend changes (Spec 02a — parallel session)
- Advanced AND/OR filter builder (Spec 03+)
- Additional reports beyond GRV Log (future specs)
- Custom date picker library (use native HTML date inputs)
- Export/download functionality

### 1.4 Contract with Backend (Spec 02a)

The frontend consumes the API contract defined in spec-02a Section 1.4.

**Data endpoint:** `GET /api/v1/reports/grv-log`

| Param | Type | Example | Purpose |
|-------|------|---------|---------|
| `from` | ISO date string | `2026-03-01` | Filter: GRVs on or after this date |
| `to` | ISO date string | `2026-03-20` | Filter: GRVs on or before this date |
| `vendor` | string | `V00001` | Filter: GRVs from this vendor code |
| `status` | string | `Received` | Filter: GRVs with this status |
| `page` | number | `1` | Pagination page (default: 1) |
| `pageSize` | number | `50` | Records per page (default: 50) |

**Response:** Same `ApiResponse<T>` envelope from Spec 01. **The canonical shape is in `shared/types/api.ts` — do not modify it.** Spec-02a Section 1.4 is a summary; the existing interfaces are the source of truth.

**Filters endpoint:** `GET /api/v1/reports/grv-log/filters`

```typescript
{
  meta: { reportId, generatedAt },
  filters: {
    vendors: Array<{ value: string, label: string }>,
    statuses: Array<{ value: string, label: string }>
  }
}
```

---

## 2. Architecture

### 2.1 New Files

| File | Purpose |
|------|---------|
| `client/src/components/widgets/ReportTableWidget.tsx` | Table widget with integrated filter bar |
| `client/src/components/FilterBar.tsx` | Date range, vendor, status filter controls |
| `client/src/components/Pagination.tsx` | Previous/Next pagination bar with record count |
| `client/src/hooks/useFiltersQuery.ts` | TanStack Query hook for `/api/v1/reports/:reportId/filters` |
| `shared/types/filters.ts` | `FilterOption` and `FiltersResponse` types |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `client/src/hooks/useReportQuery.ts` | Add `vendor` and `status` to `ReportQueryParams` |
| `client/src/config/pages.ts` | Replace demo pages with QC page (GRV Log) |
| `client/src/config/widgetRegistry.ts` | Register `ReportTableWidget`, remove demo widget |
| `shared/types/index.ts` | Re-export new filter types |

### 2.3 Deleted Files

| File | Reason |
|------|--------|
| `client/src/components/widgets/DemoTableWidget.tsx` | Replaced by `ReportTableWidget` |

---

## 3. Shared Types

### 3.1 Filter Types (`shared/types/filters.ts`)

```typescript
export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterValues {
  from: string;     // ISO date string
  to: string;       // ISO date string
  vendor: string;   // Empty string = all
  status: string;   // Empty string = all
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

### 3.2 Updated Re-exports (`shared/types/index.ts`)

Add: `export * from './filters';`

---

## 4. Hooks

### 4.1 Extended `useReportQuery` (`client/src/hooks/useReportQuery.ts`)

Add `vendor` and `status` to the params interface:

```typescript
interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  vendor?: string;   // NEW
  status?: string;   // NEW
}
```

In the `queryFn`, add the new params to `URLSearchParams`:
```typescript
if (params.vendor) searchParams.set('vendor', params.vendor);
if (params.status) searchParams.set('status', params.status);
```

**The queryKey already includes `params`**, so TanStack Query will automatically cache each filter combination separately. No other changes needed.

Also update the intent block's `USED BY` to reference `ReportTableWidget` instead of `DemoTableWidget`.

### 4.2 New `useFiltersQuery` (`client/src/hooks/useFiltersQuery.ts`)

```typescript
// Fetches available filter options for a report.
// Returns vendor and status lists for dropdown population.
// Cached for 5 minutes — filter options change infrequently.

export function useFiltersQuery(reportId: string) {
  return useQuery<FiltersResponse>({
    queryKey: ['filters', reportId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/reports/${reportId}/filters`);
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## 5. Components

### 5.1 FilterBar (`client/src/components/FilterBar.tsx`)

A horizontal bar above the table with three filter controls. Renders inside the widget card, above the table.

**Layout:** Horizontal flex row with gaps. On mobile (< lg), wraps to a column.

**Controls:**

| Control | Type | Behavior |
|---------|------|----------|
| Date From | Native `<input type="date">` | Defaults to 30 days ago |
| Date To | Native `<input type="date">` | Defaults to today |
| Vendor | Native `<select>` | Options from `/filters` endpoint. Default: "All Vendors" (empty value) |
| Status | Native `<select>` | Options from `/filters` endpoint. Default: "All Statuses" (empty value) |

**Why native HTML controls:** No dependency on a date picker or dropdown library. Native date inputs work well in modern browsers and match the Apple/system aesthetic. Can be swapped for a library in future specs without changing the data flow.

**Props:**
```typescript
interface FilterBarProps {
  filters: FiltersResponse['filters'] | undefined;  // From useFiltersQuery
  filtersLoading: boolean;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}
```

**`FilterValues` interface** — define this in `shared/types/filters.ts` alongside `FilterOption` and `FiltersResponse`, since both `FilterBar` and `ReportTableWidget` use it:
```typescript
export interface FilterValues {
  from: string;     // ISO date string
  to: string;       // ISO date string
  vendor: string;   // Empty string = all
  status: string;   // Empty string = all
}
```

**Styling guidelines:**
- Use the same subtle aesthetic as the rest of the dashboard
- **Bar background:** `bg-slate-50/60 border-b border-slate-100` — subtle tinted background separates the filter zone from table content (matches the table header `bg-slate-50/80` band, creating visual continuity)
- Labels: `text-xs font-medium text-slate-500 uppercase tracking-wider` (matches table headers)
- Inputs: `text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white` with `focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors` — the `bg-white` is needed because the bar has a tinted background
- Select dropdowns: Same styling as inputs
- Padding: `px-5 py-4` (matches table cell padding horizontally)

**Filter application:** Filters are applied on change (no "Apply" button). Each filter change triggers a new API request via TanStack Query. The `staleTime` ensures rapid back-and-forth doesn't hammer the server.

### 5.2 ReportTableWidget (`client/src/components/widgets/ReportTableWidget.tsx`)

Replaces `DemoTableWidget`. Same table rendering logic, but adds:

1. **Filter state management** — local `useState<FilterValues>` with defaults
2. **Filter query** — calls `useFiltersQuery(reportId)` to get dropdown options
3. **Renders FilterBar** above the table
4. **Passes filter values** to `useReportQuery(reportId, { ...filterValues, page, pageSize })`

**Component structure:**
```typescript
export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const [filters, setFilters] = useState<FilterValues>(getDefaultFilters());
  const [page, setPage] = useState(1);
  const filtersQuery = useFiltersQuery(reportId);
  const reportQuery = useReportQuery(reportId, {
    from: filters.from,
    to: filters.to,
    vendor: filters.vendor || undefined,   // WHY: Don't send empty string to API
    status: filters.status || undefined,
    page,
    pageSize: 50,
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
      {/* Table rendering — same as current DemoTableWidget */}
      {/* Pagination — see Section 5.4 */}
    </>
  );
}
```

> **Note:** The widget is rendered inside `WidgetShell` by `WidgetRenderer.tsx`. Do not add a card wrapper — just return the inner content (FilterBar + table + pagination).

**`getDefaultFilters()` — define as a module-level function in `ReportTableWidget.tsx`:**
```typescript
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
```

**Default filter values:**
- `from`: 30 days ago (ISO string, e.g., `2026-02-18`)
- `to`: today (ISO string, e.g., `2026-03-20`)
- `vendor`: `''` (all vendors)
- `status`: `''` (all statuses)

**Why 30 days default:** Shows a useful window of recent GRVs without returning too many records on first load. Matches the backend's `$top=50` default page size.

**Loading states:**
- FilterBar loading: Show disabled dropdowns with "Loading..." placeholder text. Disabled inputs get `opacity-50 cursor-not-allowed` to communicate non-interactivity.
- Table loading: Show a pulsing placeholder with `animate-pulse` — three rows of `bg-slate-100 rounded h-4` bars at varying widths (`w-full`, `w-5/6`, `w-4/6`). This conveys "data is coming" better than a bare "Loading..." string and matches the Apple/Stripe feel.
- Both load in parallel (two separate TanStack Query hooks)

**Error handling:**
- Filter query fails: Dropdowns show "All" option only (still usable, just no dropdown options). Log warning to console.
- Report query fails: Same error + retry UI as current `DemoTableWidget`

**Empty state:**
- When filters return zero results, show: "No results found" as primary text (`text-slate-500 text-sm font-medium`) and "Try adjusting your date range or filters" as secondary hint (`text-slate-400 text-xs mt-1`). This guides the user toward a fix instead of a dead end.

### 5.3 Table Rendering

The table rendering is based on the current `DemoTableWidget`:
- Column headers from `data.columns`
- Type-aware cell formatting via `formatCellValue()`
- Striped rows, hover effects, right-aligned numbers
- Same Stripe-style aesthetic

**Copy the table rendering logic from `DemoTableWidget`** with one addition:
- Add `whitespace-nowrap` to all `<td>` elements. With 14 columns, text wrapping inside cells creates uneven row heights and makes the table hard to scan. Horizontal scroll (`overflow-x-auto`) handles overflow cleanly. The one exception: if a future column contains long free-text (e.g., Comments), that column can drop `whitespace-nowrap` — but for Spec 02, all 14 GRV columns contain short values (dates, IDs, temps, statuses).

### 5.4 Pagination

The current `DemoTableWidget` doesn't render pagination controls — it relies on the default `page=1&pageSize=50`. This spec adds a simple pagination bar below the table.

**Pagination UI:**

```
Showing 1–50 of 142 results       [← Previous]  [Next →]
```

**Requirements:**
- Show "Showing X–Y of Z results" text on the left
- Previous/Next buttons on the right
- Disable Previous on first page, Next on last page
- Previous calls `setPage(page - 1)`, Next calls `setPage(page + 1)` (state from `ReportTableWidget`)
- Use `pagination.page`, `pagination.totalCount`, `pagination.totalPages` from the API response
- Same text styling as the filter labels (`text-xs text-slate-500`)
- Buttons: `text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors` — subtle pill shape gives tactile clickability (Apple HIG pattern for secondary actions)
- Padding: `px-5 py-3 border-t border-slate-100` (mirrors FilterBar's bottom border)

**State:** `page` is managed via `useState` in `ReportTableWidget` (see Section 5.2). Changing any filter resets page to 1 via `handleFilterChange`.

**Vendor dropdown note:** The dropdown displays vendor `label` (e.g., "Internal Use") but sends vendor `value` (e.g., "V00001") to the API. The backend filters on `SUPNAME eq '{value}'`. This value/label mapping comes from the `/filters` endpoint.

---

## 6. Config Changes

### 6.1 Pages Config (`client/src/config/pages.ts`)

Replace the demo pages with real pages:

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

**Why remove demo pages:** They reference `demo-sales-orders` and `demo-inventory` report IDs which will no longer exist after the backend removes mock data (Spec 02a). Keeping them would cause 404 errors.

**Why "Quality Control" page name:** GRVs are food safety inspection records. Grouping them under QC makes sense and leaves room for future inspection reports on the same page.

**Why single page:** Start with one page. Additional pages (Sales, Inventory, etc.) will be added in future specs as we build more reports.

**Navigation:** Nav tabs in `Layout.tsx` auto-generate from the `pages` array. No changes to `Layout.tsx` are needed — removing demo pages and adding QC automatically updates the nav.

### 6.2 Default Route Update

In `App.tsx`, the default route redirects to `/overview`. Since we're removing that page, update the redirect:

**Current:** `<Route path="/" element={<Navigate to="/overview" replace />} />`
**New:** `<Route path="/" element={<Navigate to="/qc" replace />} />`

### 6.3 Widget Registry (`client/src/config/widgetRegistry.ts`)

```typescript
import ReportTableWidget from '../components/widgets/ReportTableWidget';

export const widgetRegistry: Record<string, ComponentType<WidgetProps>> = {
  table: ReportTableWidget,   // WHY: Same type key, new component
};
```

---

## 7. Component File Sizes

Every new file must stay under 150 lines. Here's the expected breakdown:

| File | Estimated Lines | Notes |
|------|----------------|-------|
| `FilterBar.tsx` | ~80 | Four filter controls + styling |
| `ReportTableWidget.tsx` | ~120 | Filter state + filter bar + table + skeleton loading |
| `Pagination.tsx` | ~45 | Previous/Next bar with record count (extracted from ReportTableWidget) |
| `useFiltersQuery.ts` | ~25 | Thin TanStack Query wrapper |
| `shared/types/filters.ts` | ~20 | Two interfaces |

---

## 8. Airtable Status Update

After the frontend is successfully built and tested, update the Airtable API Reports table:

**Table:** `tblvqv3S31KQhKRU6` | **Base:** `appjwOgR4HsXeGIda`
**Record:** `recJluOijRUZcZnBS` (GRV Log)

1. **Update fields:**
   - `Claude Status` (`fldAAdwPBUQBRQet7`) → new status value (e.g., "Frontend Built")
   - `Claude Comments` (`fld1cKObhpMuz3VYq`) → brief description of what was built

2. **Add record comment:**
   ```
   POST /v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6/recJluOijRUZcZnBS/comments
   Body: {"text": "2026-03-20: Frontend report page built. ReportTableWidget with FilterBar (date range, vendor, status dropdowns). Pagination controls. QC page with GRV Log widget. Updated by Claude Code."}
   ```

**NEVER modify `Victor Status` or `Victor Comments` fields.**

---

## 9. Acceptance Criteria

### Must Pass

- [ ] QC page loads with GRV Log widget at `/qc`
- [ ] Default route (`/`) redirects to `/qc`
- [ ] FilterBar renders with date range (from/to), vendor dropdown, status dropdown
- [ ] Default date range is last 30 days
- [ ] Vendor dropdown populates from `/api/v1/reports/grv-log/filters`
- [ ] Status dropdown populates from `/api/v1/reports/grv-log/filters`
- [ ] Changing any filter triggers a new data fetch
- [ ] "All Vendors" and "All Statuses" options clear the respective filter
- [ ] Table displays all 14 columns from the backend (including parsed HTML fields)
- [ ] Currency columns are right-aligned with proper formatting
- [ ] Date columns are formatted (not raw ISO strings)
- [ ] Pagination shows "Showing X–Y of Z results" with Previous/Next buttons
- [ ] Loading states display correctly (filters loading, data loading)
- [ ] Error state shows retry button
- [ ] Empty state shows "No data available" message
- [ ] Filter query failure degrades gracefully (dropdowns show "All" only)
- [ ] Demo pages and `DemoTableWidget` are removed
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] Airtable API Reports record updated (Claude Status, Comments, record comment)

### File Size

- [ ] Every file under 150 lines
- [ ] Intent blocks on all new files
- [ ] WHY comments on non-obvious decisions

### Design

- [ ] Native HTML date inputs and select elements (no external libraries)
- [ ] Filter styling matches dashboard aesthetic (Apple/Stripe-like)
- [ ] No Tailwind v3 patterns — use v4 conventions
- [ ] System font stack only (no Google Fonts)

---

## 10. Development Notes

### Testing Without the Backend

While the backend (Spec 02a) is being built in parallel, you can test the frontend with:

1. **Mock the API response locally** — create a temporary mock in `useReportQuery` that returns the expected `ApiResponse` shape with sample data matching the 14-column schema from Spec 02a Section 5.2.

2. **Mock the filters response** — create a temporary mock in `useFiltersQuery` that returns:
   ```typescript
   { vendors: [{ value: 'V00001', label: 'Internal Use' }], statuses: [{ value: 'Received', label: 'Received' }, { value: 'Cancelled', label: 'Cancelled' }] }
   ```

3. **Remove mocks when done** — once the backend is live, remove any local mocks and verify the full data flow works end-to-end.

**Important:** The mock data approach is only for development iteration. The final frontend must work against the real backend API.

### Column Width Considerations

The GRV Log has 14 columns. Some will be narrow (Status, Temp) and some wide (Vendor, Comments). The table uses `overflow-x-auto` which allows horizontal scrolling when the table is wider than the viewport. No column width constraints are needed — let the browser auto-size based on content.

If columns feel cramped after seeing real data, a future spec can add explicit column widths to the `ColumnDefinition` type.
