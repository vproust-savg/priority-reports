# BBD Report: New Fields + Expandable Rows

**Date:** 2026-03-27
**Report:** BBD — Best By Dates (Purchasing page)
**Entity:** RAWSERIAL (key: SERIALNAME)
**Subform:** RAWSERIALBAL_SUBFORM (Pattern B — multi-record, returns `{"value": [...]}`)

---

## 1. Goals

1. Add **Receiving Date** and **Value** columns to the BBD main table
2. Add **expandable rows** — clicking any row reveals warehouse/bin breakdown from RAWSERIALBAL_SUBFORM
3. Make the expandable row system **reusable** — other reports can opt in by providing a detail component and config

---

## 2. New Main-Line Columns

### 2.1 Data Source

Both fields come from RAWSERIAL (same entity already queried):

| Display Column | Priority Field | Type | Notes |
|---------------|---------------|------|-------|
| Receiving Date | `CURDATE` | date | Already confirmed via API test |
| Value | `Y_8737_0_ESH * QUANT` | currency | Y_8737_0_ESH = purchase price (custom field, not in XML metadata). Multiply by QUANT (lot quantity, already fetched) |

### 2.2 Column Order (Final)

1. Part Number
2. Part Description
3. Balance
4. Unit
5. **Value** ← new (Balance × Purchase Price, formatted as `$X,XXX.XX`)
6. **Receiving Date** ← new (CURDATE, formatted as date)
7. Expir. Date
8. Days Left
9. Status
10. Vendor
11. Perishable
12. Brand
13. Family

### 2.3 Backend Changes — `bbdReport.ts`

**$select:** Add `SERIALNAME,CURDATE,Y_8737_0_ESH` to the existing `$select` string. SERIALNAME is needed as the row key for subform fetching (it's the entity key but not auto-returned by `$select`).

**transformRow():** Add two new output fields:
```
receivingDate: raw.CURDATE
value: Number(raw.QUANT ?? 0) * Number(raw.Y_8737_0_ESH ?? 0)
```

**columns[]:** Insert two new `ColumnDefinition` entries:
- `{ key: 'value', label: 'Value', type: 'currency' }` — after `unit`
- `{ key: 'receivingDate', label: 'Recv. Date', type: 'date' }` — after `value`

**filterColumns[]:** Add filter entries for the two new columns:
- `{ key: 'value', label: 'Value', filterType: 'number', filterLocation: 'client' }`
- `{ key: 'receivingDate', label: 'Recv. Date', filterType: 'date', filterLocation: 'client' }`

**excelStyle.columnWidths:** Add `value: 10` and `receivingDate: 11`.

**transformRow must also output `serialName` and `purchasePrice`** — these are needed by the expandable row system:
- `serialName: raw.SERIALNAME` — row key for subform fetch
- `purchasePrice: Number(raw.Y_8737_0_ESH ?? 0)` — passed to detail panel for per-warehouse value calc

These two fields are NOT in `columns[]` (not displayed as table columns), but they travel in the row data object.

---

## 3. Expandable Rows — Reusable System

### 3.1 Architecture Overview

Three layers, each with a single responsibility:

| Layer | File | Responsibility |
|-------|------|---------------|
| **Expand infrastructure** | `ReportTable.tsx` | Renders chevron, toggles expand state, renders detail `<tr>` |
| **Expand orchestration** | `ReportTableWidget.tsx` | Manages `expandedRows` state, passes config to ReportTable |
| **Detail content** | `BbdDetailPanel.tsx` (new) | Fetches subform data, renders warehouse/bin table |

### 3.2 Report-Level Config — `ReportConfig` Extension

Add to `ReportConfig` interface in `server/src/config/reportRegistry.ts`:

```ts
expandConfig?: {
  subformName: string;    // e.g. 'RAWSERIALBAL_SUBFORM'
  keyField: string;       // e.g. 'SERIALNAME' — field on the parent entity used as the subform lookup key
  rowKeyField: string;    // e.g. 'serialName' — transformed row field that holds the key value
};
```

BBD registers:
```ts
expandConfig: {
  subformName: 'RAWSERIALBAL_SUBFORM',
  keyField: 'SERIALNAME',
  rowKeyField: 'serialName',
},
```

This config travels to the frontend via `ResponseMeta.expandConfig` — the same pattern used by `rowStyleField`.

### 3.3 New API Endpoint — Lazy Subform Fetch

**Route:** `GET /api/v1/reports/:reportId/subform/:rowKey`

**Location:** New file `server/src/routes/subform.ts` (mounted in `index.ts` alongside other routers).

**Logic:**
1. Look up `reportId` in `reportRegistry` — 404 if not found or no `expandConfig`
2. Call `querySubform(report.entity, { [report.expandConfig.keyField]: rowKey }, report.expandConfig.subformName)`
3. Return `{ data: value[] }` (the subform rows array)

**Error handling:**
- 404 from Priority → return `{ data: [] }` (empty — no warehouse balances)
- 500 from Priority → return 502 with error message

**No server-side caching** for the subform endpoint — the data is small (typically 1-3 rows per lot), fetched on demand, and TanStack Query handles client-side caching with `staleTime`.

### 3.4 Frontend — Expand Infrastructure in ReportTable

**New props on `ReportTableProps`:**
```ts
reportId?: string;          // needed to pass to DetailComponent for API calls
expandConfig?: {
  rowKeyField: string;      // field in row data to use as unique key
  DetailComponent: ComponentType<DetailPanelProps>;
};
expandedRows?: Set<string>;
onToggleExpand?: (rowKey: string) => void;
```

**Rendering changes:**
- When `expandConfig` is present, render a narrow first column with a `ChevronRight` icon (from lucide-react, 16px)
- Chevron rotates 90° on expand (CSS `transition-transform duration-200`)
- Row gets `cursor-pointer` and click handler calls `onToggleExpand(rowKey)`
- After each expanded row's `<tr>`, render a detail `<tr>` with a single `<td colSpan={columns.length + 1}>` containing `<DetailComponent row={row} reportId={reportId} />`
- Detail row is a plain `<tr>` containing a single `<td colSpan>`. Inside that `<td>`, wrap the detail content in `<AnimatePresence>` + `<motion.div>` using `FADE_SLIDE_UP` preset from `animationConstants.ts`, respecting `useReducedMotion()`. (Note: `motion.tr` is unreliable for height animation — use `motion.div` inside the cell instead.)

**Keyboard accessibility:** The chevron cell is a `<button>` with `aria-expanded` and `aria-label="Expand row details"`. Enter/Space toggles.

### 3.5 Frontend — Expand Orchestration in ReportTableWidget

When `data.meta.expandConfig` is present:

```ts
const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());

const toggleExpand = useCallback((rowKey: string) => {
  setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
    return next;
  });
}, []);
```

Pass to `<ReportTable>`:
```ts
expandConfig={{
  rowKeyField: data.meta.expandConfig.rowKeyField,
  DetailComponent: getDetailComponent(reportId),  // from a registry map
}}
expandedRows={expandedRows}
onToggleExpand={toggleExpand}
```

### 3.6 Detail Component Registry

New file: `client/src/config/detailRegistry.ts`

Maps `reportId` → detail component:
```ts
export const detailRegistry: Record<string, ComponentType<DetailPanelProps>> = {
  bbd: BbdDetailPanel,
};

export function getDetailComponent(reportId: string) {
  return detailRegistry[reportId] ?? null;
}
```

This is the extension point. Adding expandable rows to another report = create a detail panel component + register it here.

### 3.7 Detail Panel Props Interface

Shared interface in `client/src/components/details/types.ts`:

```ts
export interface DetailPanelProps {
  row: Record<string, unknown>;   // parent row data (includes all transformed fields)
  reportId: string;               // for API calls
}
```

---

## 4. BBD Detail Panel — `BbdDetailPanel.tsx`

**Location:** `client/src/components/details/BbdDetailPanel.tsx`

### 4.1 Data Fetching

Uses TanStack Query with a custom hook `useSubformQuery`:

```ts
// client/src/hooks/useSubformQuery.ts
function useSubformQuery(reportId: string, rowKey: string) {
  return useQuery({
    queryKey: ['subform', reportId, rowKey],
    queryFn: () => fetchSubform(reportId, rowKey),
    staleTime: 5 * 60 * 1000,  // 5 min — subform data rarely changes mid-session
    enabled: !!rowKey,
  });
}
```

API call: `GET /api/v1/reports/bbd/subform/{serialName}`

### 4.2 Rendered Content

A mini-table inside the expanded row with these columns:

| Column | Source | Type |
|--------|--------|------|
| Warehouse | `WARHSNAME` | string |
| Bin | `LOCNAME` | string |
| Qty | `BALANCE` | number |
| Unit | `UNITNAME` | string |
| Value | `BALANCE * purchasePrice` (from parent row) | currency |

### 4.3 Styling

- Background: `bg-slate-50/60` — slightly recessed to visually nest under the parent row
- Left border: `border-l-2 border-l-primary/30` — subtle indicator connecting to parent
- Padding: `pl-12` (indented to clear the chevron column)
- Mini-table uses `text-sm` (smaller than main table) with `text-slate-600`
- Loading state: `<Loader2 className="animate-spin" size={16} />` with "Loading..." text
- Empty state: "No warehouse data available" in `text-slate-400`
- Error state: "Failed to load details" in `text-red-500`

### 4.4 Value Calculation

The parent row's `purchasePrice` field (from `Y_8737_0_ESH`) is available in `row.purchasePrice`. Each subform row's value = `subformRow.BALANCE * row.purchasePrice`. This avoids fetching the purchase price again.

---

## 5. Shared Types Updates

### 5.1 `shared/types/api.ts` — ResponseMeta

Add to `ResponseMeta`:
```ts
expandConfig?: {
  rowKeyField: string;   // only field the frontend needs — which row field holds the unique key
};
```

### 5.2 `shared/types/widget.ts` — No Changes

Widget config stays the same. Expandability is driven by report config (server-side), not widget config (page layout).

---

## 6. File Inventory

### New Files (4)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `server/src/routes/subform.ts` | Subform fetch endpoint | ~60 |
| `client/src/components/details/BbdDetailPanel.tsx` | BBD warehouse detail panel | ~80 |
| `client/src/components/details/types.ts` | Shared DetailPanelProps interface | ~15 |
| `client/src/config/detailRegistry.ts` | Maps reportId → detail component | ~20 |

### New Files (continued)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `client/src/hooks/useSubformQuery.ts` | TanStack Query hook for lazy subform fetch | ~25 |

### Modified Files (6)

| File | Changes |
|------|---------|
| `server/src/reports/bbdReport.ts` | Add SERIALNAME + CURDATE + Y_8737_0_ESH to $select, new columns, transformRow, expandConfig |
| `server/src/config/reportRegistry.ts` | Add `expandConfig` to ReportConfig interface |
| `server/src/index.ts` | Mount subform router |
| `client/src/components/ReportTable.tsx` | Add reportId prop, expand chevron, detail row rendering, AnimatePresence |
| `client/src/components/widgets/ReportTableWidget.tsx` | expandedRows state, pass expandConfig + reportId + callbacks |
| `shared/types/api.ts` | Add expandConfig to ResponseMeta |

---

## 7. Edge Cases

| Case | Handling |
|------|---------|
| `Y_8737_0_ESH = 0` | Value shows `$0.00` — correct (no purchase price recorded) |
| RAWSERIALBAL_SUBFORM returns empty array | Detail panel shows "No warehouse data available" |
| RAWSERIALBAL_SUBFORM returns 404 | Treated as empty (consistent with `querySubform()` returning null) |
| Multiple warehouses | All rows displayed in mini-table; values sum may differ from main-line value due to rounding |
| Row already expanded + data refreshes | `expandedRows` state preserved across refetches; TanStack Query re-fetches stale subform data |
| Rapid expand/collapse clicks | `AnimatePresence` handles exit animations; no double-fetch due to TanStack Query dedup |
| Very long SERIALNAME values | URL-encoded in the API call; `querySubform()` already handles single-quote escaping |
| Screen readers | Chevron button has `aria-expanded`, detail row has `role="row"` with nested table |

---

## 8. Test Plan

### 8.1 Backend Tests

**File:** `server/tests/bbdTransformRow.test.ts`

| Test | Assertion |
|------|-----------|
| transformRow includes `receivingDate` from CURDATE | `expect(row.receivingDate).toBe('2026-02-05T00:00:00Z')` |
| transformRow computes `value` = QUANT × Y_8737_0_ESH | `expect(row.value).toBe(339.7)` for QUANT=10, price=33.97 |
| transformRow outputs `serialName` from SERIALNAME | `expect(row.serialName).toBe('0000')` |
| transformRow outputs `purchasePrice` from Y_8737_0_ESH | `expect(row.purchasePrice).toBe(33.97)` |
| value is 0 when Y_8737_0_ESH is 0 | `expect(row.value).toBe(0)` |
| value is 0 when Y_8737_0_ESH is null/undefined | `expect(row.value).toBe(0)` |

**File:** `server/tests/subformEndpoint.test.ts`

| Test | Assertion |
|------|-----------|
| GET /api/v1/reports/bbd/subform/:key returns subform data | Status 200, body has `data` array |
| GET /api/v1/reports/nonexistent/subform/:key returns 404 | Report not in registry |
| GET /api/v1/reports/grv-log/subform/:key returns 404 | Report has no expandConfig |

### 8.2 Frontend Tests

**File:** `client/src/components/details/BbdDetailPanel.test.tsx`

| Test | Assertion |
|------|-----------|
| Renders loading state while fetching | `Loader2` spinner visible |
| Renders warehouse rows after fetch | Row count matches subform data |
| Computes value = subform BALANCE × parent purchasePrice | Formatted currency in cell |
| Renders empty state when no data | "No warehouse data" message |

**File:** `client/src/components/ReportTable.test.tsx` (expand behavior)

| Test | Assertion |
|------|-----------|
| Renders chevron when expandConfig provided | Button with `aria-expanded` present |
| No chevron when expandConfig absent | No expand buttons rendered |
| Clicking row toggles expansion | `onToggleExpand` called with rowKey |
| Expanded row renders DetailComponent | Detail content visible in DOM |
| Chevron rotates when expanded | CSS transform applied |

---

## 9. Reusability Checklist

To add expandable rows to any future report:

1. **Backend:** Add `expandConfig` to the report's `reportRegistry.set()` call
2. **Frontend:** Create a detail panel component implementing `DetailPanelProps`
3. **Registry:** Add the component to `detailRegistry.ts`
4. **Done.** No changes to ReportTable, ReportTableWidget, or the subform endpoint.

---

## 10. Out of Scope

- Server-side caching of subform responses (TanStack Query handles client-side)
- Expand-all / collapse-all buttons (can be added later)
- Subform data in Excel export (export reflects main table only)
- Keyboard navigation between expanded rows (standard tab order suffices)
