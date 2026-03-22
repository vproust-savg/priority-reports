# Spec 06 — Excel Export

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to export all filtered report data as an Excel file, using per-report templates from Airtable when available, with a basic Excel fallback for reports without templates.

**Architecture:** Backend-generated export. New POST endpoint receives the current filter state, fetches ALL matching rows from Priority (up to a 5,000-row hard cap), applies both server-side and client-side filters, fills an Excel template (fetched from Airtable and cached), and streams the `.xlsx` file back. Frontend adds an Export button to the toolbar and handles the file download with a 2-minute timeout.

**Tech Stack:** ExcelJS (backend Excel generation), Express streaming response, Airtable REST API (template fetch), React (frontend)

**Date:** 2026-03-22
**Status:** Ready for implementation planning
**Depends on:** Spec 02a/02b (query endpoint + report definitions), Spec 05 (TableToolbar exists)

---

## 1. Scope

### 1.1 What Changes

1. **New backend endpoint:** `POST /api/v1/reports/:reportId/export` — fetches all filtered rows, generates Excel, streams file
2. **Template service:** Fetches Excel templates from Airtable, caches in memory (24h TTL)
3. **Excel generator:** Fills template with data rows using ExcelJS, or generates basic Excel for reports without templates
4. **Report config extension:** Optional `exportConfig` on `ReportConfig` defining column mapping and data start row
5. **Server-side client filter:** Replicates `clientFilter.ts` logic on the backend so exported data matches what the user sees
6. **Frontend export button:** New button in `TableToolbar` with download icon
7. **Frontend export hook:** `useExport` manages export state, file download, and toast notifications
8. **Toast component:** Minimal toast system for success/error feedback

### 1.2 Out of Scope

- CSV export (Excel only — templates require `.xlsx`)
- Export progress bar with row-level progress (button spinner is sufficient)
- Column visibility affecting export (always uses template columns)
- Exporting only the current page (always exports ALL filtered rows)
- Template editing/uploading from the dashboard (managed in Airtable)
- Print-friendly layout or PDF export

---

## 2. File Map

### Backend (server/)

| File | Action | Purpose |
|------|--------|---------|
| `server/src/config/reportRegistry.ts` | Modify | Add `ExportConfig` interface and optional `exportConfig` to `ReportConfig` |
| `server/src/reports/grvLog.ts` | Modify | Add `exportConfig` with column mapping for GRV Log template |
| `server/src/services/templateService.ts` | Create | Fetch Excel templates from Airtable, in-memory cache with 24h TTL |
| `server/src/services/excelExporter.ts` | Create | Fill template with data rows using ExcelJS, or generate fallback Excel |
| `server/src/services/serverClientFilter.ts` | Create | Server-side replica of client filter logic (string matching, date/number ops) |
| `server/src/routes/export.ts` | Create | POST /:reportId/export endpoint — orchestrates fetch, filter, generate, stream |
| `server/src/routes/exportSchemas.ts` | Create | Zod schema for export request body validation |
| `server/src/index.ts` | Modify | Mount export router |

### Frontend (client/)

| File | Action | Purpose |
|------|--------|---------|
| `client/src/hooks/useExport.ts` | Create | Export state management: trigger, loading, error, file download, toast state |
| `client/src/components/TableToolbar.tsx` | Modify | Add Export button with download icon |
| `client/src/components/Toast.tsx` | Create | Minimal toast notification component |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modify | Wire up `useExport` hook, pass props to TableToolbar, render Toast |

### No Changes Needed

| File | Why |
|------|-----|
| `shared/types/` | No new shared types needed — export request reuses existing `FilterGroup` |
| `client/src/utils/clientFilter.ts` | Stays as-is — server-side replica is a separate file |

---

## 3. Design

### 3.1 Report Export Config

Define `ExportConfig` in `server/src/config/reportRegistry.ts`, alongside the existing `ReportConfig` interface:

```typescript
export interface ExportConfig {
  mapping: Record<string, string>;  // Template column letter → data field key
  dataStartRow: number;             // First data row in template (e.g., 5)
  sheetIndex?: number;              // Which sheet to fill (default: 0)
}

export interface ReportConfig {
  // ... existing fields ...
  exportConfig?: ExportConfig;
}
```

**GRV Log mapping** (template columns A-M → data fields):

| Template Col | Template Header | Data Field |
|:---:|---|---|
| A | Date | `date` |
| B | Time | *(empty — not in report data)* |
| C | PO Number/BOL# | `docNo` |
| D | Vendor | `vendor` |
| E | Driver I.D. checked Y-N-Kn | `driverId` |
| F | Driver Name | *(empty — not in report data)* |
| G | License Plate # | `licensePlate` |
| H | Truck Temp | `truckTemp` |
| I | Product Surface Temp | `productTemp` |
| J | Condition of Product | `productCondition` |
| K | Condition of Truck | `truckCondition` |
| L | Recv'rs Initials | `receivedBy` |
| M | Comments | `comments` |

```typescript
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
}
```

Columns B (Time) and F (Driver Name) have no matching data field — they remain empty in the export. Future reports can fill them if the data becomes available.

### 3.2 Template Service

**File:** `server/src/services/templateService.ts` (~60 lines)

Fetches Excel templates from the Airtable API Reports table and caches them.

**Interface:**
```typescript
function getTemplate(reportId: string): Promise<Buffer | null>
```

**Airtable API details:**
- **Base URL:** `https://api.airtable.com/v0/`
- **Auth header:** `Authorization: Bearer ${process.env.AIRTABLE_TOKEN}`
- **Base ID:** `appjwOgR4HsXeGIda`
- **Table ID:** `tblvqv3S31KQhKRU6`
- **Template field ID:** `fldTbiJ7t4Ldd3cH9`
- **Report ID field ID:** `fldrsiqwORzxJ6Ouq`

**Flow:**
1. Check in-memory cache (`Map<string, { buffer: Buffer; fetchedAt: number }>`)
2. If cached and within 24h TTL → return cached buffer
3. If miss or expired:
   a. Call Airtable REST API to list records, filtered by Report ID:
      `GET /v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6?filterByFormula={fldrsiqwORzxJ6Ouq}=...`
   b. The Template field (`fldTbiJ7t4Ldd3cH9`) is a `multipleAttachments` type — it returns an **array** of attachment objects: `[{ url, filename, size, type }]`
   c. Pick the **first** attachment from the array (there should be exactly one template per report)
   d. Download the `.xlsx` file from the attachment's `url` field using a plain HTTP GET
   e. **Cache the downloaded file Buffer, NOT the Airtable attachment URL** (Airtable attachment URLs are temporary and expire after a few hours)
   f. Return the buffer
4. If no Template attachment exists (field is empty/missing) → return `null` (triggers fallback mode)

**Error handling:** If Airtable or the download fails, log the error and return `null` (triggers fallback mode rather than failing the entire export).

### 3.3 Excel Generation

**File:** `server/src/services/excelExporter.ts` (~120 lines)

Two modes: template-based and fallback. Expected output file size: ~50-100KB for 500 rows with 13 columns. Buffering the entire response is fine at these sizes.

#### Template Mode

Uses ExcelJS to load the template and fill in data:

1. Load template Buffer into an ExcelJS `Workbook` via `workbook.xlsx.load(buffer)`
2. Get target worksheet by `sheetIndex` (default: first sheet, index 0)
3. Identify the empty data region: rows from `dataStartRow` to just before the footer
4. If data rows exceed the template's empty rows: use `worksheet.spliceRows()` to insert additional rows, shifting the footer (instructions, verification) down
5. If data rows are fewer: leave extra template rows empty (or remove them)
6. Fill each data row: iterate over `exportConfig.mapping`, for each entry convert the column letter to a column number (e.g., 'A' → 1, 'M' → 13) and write the value to `worksheet.getRow(rowNum).getCell(colNum)`
7. Return the workbook buffer via `workbook.xlsx.writeBuffer()`

**Date formatting:** Date fields should be written as Excel date values (not ISO strings) so they display correctly in the template's date format.

**Currency formatting:** Currency fields should be written as numbers (not formatted strings like "$1,500.00") so Excel can format them.

#### Fallback Mode

For reports WITHOUT a template or `exportConfig`:

1. Create a new ExcelJS `Workbook` + worksheet named after the report
2. Row 1: column headers from `report.columns[].label`
3. Row 2+: data rows, values from `report.columns[].key`
4. Auto-width columns based on content
5. Bold header row, freeze top row
6. Return the workbook buffer

### 3.4 Server-Side Client Filter

**File:** `server/src/services/serverClientFilter.ts` (~70 lines)

Replicates `client/src/utils/clientFilter.ts` logic on the server. This is intentional duplication (not shared code) to keep the `shared/` directory types-only per project convention.

**Exports:**
```typescript
function applyServerClientFilters(
  rows: Record<string, unknown>[],
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): Record<string, unknown>[]
```

**`filterColumns` comes from:** `report.filterColumns` on the `ReportConfig`. This is the same source the query endpoint uses when calling `buildODataFilter()`.

**Operators replicated:** `equals`, `notEquals`, `contains`, `notContains`, `startsWith`, `endsWith`, `isEmpty`, `isNotEmpty`, `greaterThan`, `lessThan`, `greaterOrEqual`, `lessOrEqual`, `between`, `isBefore`, `isAfter`, `isOnOrBefore`, `isOnOrAfter`, `isBetween`.

The logic is identical to `clientFilter.ts` — only evaluates conditions on `filterLocation: 'client'` columns and client-only operators. The backend has already applied server-side filters via OData.

### 3.5 Export Endpoint

**File:** `server/src/routes/export.ts` (~90 lines)

**Router factory:** `createExportRouter()` — takes **no arguments** (unlike `createQueryRouter(cache)`, because exports are always fresh, never cached).

**Route:** `POST /api/v1/reports/:reportId/export`

**Request body** (validated by Zod):
```typescript
{
  filterGroup: FilterGroup  // Same filter tree as the query endpoint
}
```

**Hard cap:** Maximum 5,000 rows per export. If the total fetched exceeds this, return `400 { error: "Export limited to 5,000 rows. Apply filters to reduce the dataset." }`.

**Flow:**
1. Validate request body with `ExportRequestSchema`
2. Look up report in registry → 404 if not found
3. Call `report.buildQuery({ page: 1, pageSize: 1000 })` — this is ONLY used to extract `$select` and `$orderby` from the returned `ODataParams`. The `$top`, `$skip`, and `$filter` from `buildQuery` are ignored.
4. Call `buildODataFilter(body.filterGroup, report.filterColumns)` to get the OData `$filter` string
5. **Paginated fetch loop** — fetch ALL matching rows from Priority:
   ```
   allRawRows = []
   page = 0
   loop:
     response = queryPriority(entity, {
       $select: baseParams.$select,
       $orderby: baseParams.$orderby,
       $filter: odataFilter,          // from step 4
       $top: 1000,
       $skip: page * 1000,
     })
     allRawRows.push(...response.value)
     if response.value.length < 1000 → break (last page)
     if allRawRows.length >= 5000 → break (hard cap)
     page++
   ```
6. Run `report.enrichRows(allRawRows)` if defined (with existing 200ms inter-batch delay)
7. Transform rows: `allRawRows.map(report.transformRow)`
8. Apply server-side client filters: `applyServerClientFilters(transformedRows, body.filterGroup, report.filterColumns)`
9. Get template via `getTemplate(reportId)`
10. Generate Excel:
    - If template exists AND `report.exportConfig` defined → template mode
    - Otherwise → fallback mode
11. Set response headers:
    - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
    - `Content-Disposition: attachment; filename="GRV-Log-2026-03-22.xlsx"`
12. Send the buffer: `res.send(buffer)`
13. Log the export via `logApiCall({ level: 'info', event: 'export', reportId, durationMs, cacheHit: false, rowCount: transformedRows.length, statusCode: 200, odataFilter: odataFilter ?? 'none' })`

**Filename format:** `{report.name}-{YYYY-MM-DD}.xlsx` where the date is today's date. Spaces in the report name are replaced with hyphens.

**Timing expectations:** For the GRV Log with 500 rows, the `enrichRows` step calls `querySubform` per row in batches of 10 with 200ms delay between batches. That's 50 batches * ~1-2 seconds per batch (API call time + delay) = **50-100 seconds**. The frontend must have a long timeout. For reports without `enrichRows`, the export takes only a few seconds.

### 3.6 Frontend: useExport Hook

**File:** `client/src/hooks/useExport.ts` (~60 lines)

```typescript
interface UseExportReturn {
  isExporting: boolean;
  toast: { message: string; variant: 'success' | 'error' } | null;
  clearToast: () => void;
  triggerExport: () => Promise<void>;
}

function useExport(reportId: string, filterGroup: FilterGroup): UseExportReturn
```

The hook returns toast state — it does NOT render any components. `ReportTableWidget` renders the `<Toast>` component using the returned `toast` state.

**Flow:**
1. `triggerExport()` sets `isExporting = true`
2. Creates an `AbortController` with a **2-minute timeout** (`setTimeout(() => controller.abort(), 120_000)`)
3. Sends POST to `/api/v1/reports/${reportId}/export` with `{ filterGroup }` as JSON body, `signal: controller.signal`
4. Response type: `blob` (use `response.blob()`)
5. Extracts filename from `Content-Disposition` header (parse `filename="..."` value; fallback: `export.xlsx`)
6. Creates an invisible `<a>` element, sets `href = URL.createObjectURL(blob)`, sets `download = filename`, appends to body, triggers `.click()`, removes element
7. Revokes the object URL via `URL.revokeObjectURL(href)`
8. Sets toast: `{ message: 'Export complete', variant: 'success' }`
9. On error: sets toast: `{ message: 'Export failed — please try again', variant: 'error' }`
10. Clears the timeout, sets `isExporting = false` in `finally` block

**No TanStack Query:** This is a one-shot action, not a cached query. Plain `fetch` + `useState` is appropriate.

### 3.7 Frontend: TableToolbar Update

**File:** `client/src/components/TableToolbar.tsx` (modify)

Add a third button after the Columns button:
- Icon: `Download` from lucide-react (or `Loader2` with `animate-spin` class when exporting)
- Label: "Export"
- When `isExporting`: shows spinner icon, button is disabled
- Styling: same `baseClass`/`inactiveClass` pattern as Filter and Columns buttons
- No chevron (unlike Filter and Columns — this is an action button, not a toggle)

**New props:**
```typescript
interface TableToolbarProps {
  // ... existing props ...
  isExporting: boolean;
  onExport: () => void;
}
```

### 3.8 Frontend: Toast Component

**File:** `client/src/components/Toast.tsx` (~50 lines)

Minimal toast notification for export feedback. Not a full toast system — just enough for this feature.

**Props:**
```typescript
interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
}
```

**Behavior:**
- Renders at bottom-right of the viewport (fixed position)
- Appears with a slide-up animation
- Auto-dismisses after 3 seconds (calls `onDismiss`)
- Two variants: `success` (green accent) and `error` (red accent)
- Small, non-intrusive: matches the existing UI's subtle style
- Shows a small close button (X icon) for manual dismiss

### 3.9 Frontend: ReportTableWidget Update

**File:** `client/src/components/widgets/ReportTableWidget.tsx` (modify)

Wire up the export hook:
1. Import `useExport` and `Toast`
2. Call `const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup)`
3. Pass `isExporting` and `triggerExport` to `TableToolbar` as `isExporting` and `onExport`
4. Render `{toast && <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />}` at the bottom of the component's JSX

---

## 4. Data Flow Diagram

```
User clicks "Export"
       |
       v
  useExport.triggerExport()
       |
       v
  POST /api/v1/reports/:reportId/export
  Body: { filterGroup }
  (AbortController: 2-minute timeout)
       |
       v
  +------------------------------+
  |  export.ts endpoint          |
  |                              |
  |  1. Validate request         |
  |  2. buildODataFilter()       |
  |  3. Paginated Priority fetch |
  |     ($top=1000, loop until   |
  |     page < 1000 or cap hit)  |
  |  4. enrichRows() if needed   |
  |     (50-100s for 500 rows)   |
  |  5. transformRow() each      |
  |  6. applyServerClientFilters |
  |     (using report.           |
  |      filterColumns)          |
  |  7. getTemplate() from cache |
  |     or Airtable REST API     |
  |  8. Generate Excel:          |
  |     - Template mode OR       |
  |     - Fallback mode          |
  |  9. Send .xlsx buffer        |
  +------------------------------+
       |
       v
  Frontend receives blob
       |
       v
  Create <a> + trigger download
       |
       v
  Show success toast (auto-dismiss 3s)
```

---

## 5. Error Handling

| Scenario | Backend Behavior | Frontend Behavior |
|----------|-----------------|------------------|
| Report not found | 404 response | Error toast |
| Priority API fails | 502 response with error message | Error toast |
| Row cap exceeded (>5000) | 400 response: "Export limited to 5,000 rows" | Error toast |
| Airtable template fetch fails | Falls back to basic Excel (no template) | Normal download (fallback file) |
| ExcelJS template filling fails | Falls back to basic Excel, logs error | Normal download (fallback file) |
| Zero rows match filters | Returns Excel with headers only (no data rows) | Normal download (empty file) |
| Request body validation fails | 400 response | Error toast |
| Network error during download | -- | Error toast |
| Frontend timeout (2 min) | -- (request aborted) | Error toast |

**Graceful degradation:** Template failures never block the export. If the template can't be fetched or filled, the export falls back to a basic Excel file with headers and data.

---

## 6. Template Management

Templates are managed entirely in Airtable:
- **Uploading:** Replace the attachment in the Template field of the API Reports table
- **Cache refresh:** Changes propagate within 24 hours (cache TTL). For immediate updates, restart the server (clears in-memory cache).
- **Multiple sheets:** The template can have multiple sheets (the GRV Log template has "Inbound Log 2025" and "Inbound Log"). The `sheetIndex` in `exportConfig` controls which sheet receives data (default: 0, first sheet).

**Template structure requirements:**
1. Header rows (company name, form title, revision) at the top
2. Column headers in the row immediately before `dataStartRow`
3. Empty data rows starting at `dataStartRow`
4. Footer content (instructions, verification) below the empty data rows
5. The footer will be pushed down when data rows are inserted

---

## 7. Verification

### Backend
```bash
cd server && npx tsc --noEmit     # TypeScript compiles
cd server && npm test              # All tests pass
```

### Frontend
```bash
cd client && npx tsc --noEmit     # TypeScript compiles
```

### Manual Testing
1. **Template export:** Apply filters to GRV Log -> click Export -> verify downloaded file matches template format with data filled in
2. **Fallback export:** Test with a report that has no template -> verify basic Excel with headers and data
3. **Empty export:** Apply filters that return no rows -> verify Excel file has headers but no data rows
4. **Large export:** Export with minimal filters (hundreds of rows) -> verify all rows appear, footer is pushed down correctly
5. **Client-side filters:** Apply a client-side filter (e.g., Driver ID contains "X") -> verify exported data matches what's shown in the dashboard
6. **Loading state:** Click Export and observe button spinner -> verify it disables during export and shows success toast on completion
7. **Row cap:** Test with unfiltered data that exceeds 5,000 rows -> verify error toast appears with cap message
