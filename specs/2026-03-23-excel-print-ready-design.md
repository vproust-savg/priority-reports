# Excel Print-Ready Export Design

## Problem

Both Excel reports (BBD and GRV Log) export with auto-sized columns, no print setup, and no page formatting. They don't fit on a letter-size sheet when printed. Additionally, the export always includes all columns — even columns the user has hidden in the UI.

## Requirements

1. Both reports must fit on a letter-size sheet (8.5" × 11") in landscape orientation
2. Use "Fit to 1 page wide, unlimited pages tall" scaling
3. Each report defines its own column widths and font size
4. Export must respect column visibility — hidden columns are excluded
5. Export must respect column order — drag-reordered columns appear in that order
6. Export must include all filtered rows (all pages, not just the first)

## Approach: Per-Report Excel Styling

Each report defines its own `excelStyle` configuration (column widths, font size). Print setup (margins, orientation, paper size, scaling, repeat headers) is applied universally to all exports.

## Template vs Fallback Mode Scoping

Column visibility and column reordering only apply to **fallback mode** (BBD). Template mode (GRV Log) has a fixed layout defined by the Airtable template and `exportConfig.mapping` — the template's header row, column positions, and order are baked in. Attempting to hide or reorder template columns would leave empty columns with visible headers, which is worse than ignoring visibility.

- **Fallback mode:** `visibleColumnKeys` filters and reorders columns. Full control.
- **Template mode:** `visibleColumnKeys` is ignored. Template layout is authoritative.

## Changes by File

### 1. `server/src/config/reportRegistry.ts`

Add optional `excelStyle` to `ReportConfig`:

```typescript
excelStyle?: {
  columnWidths: Record<string, number>;  // column key → width in Excel character units
  fontSize?: number;                      // data font size (default 10)
}
```

### 2. `server/src/reports/bbdReport.ts`

Add `excelStyle` to self-registration:

```
columnWidths:
  partNumber: 14
  partDescription: 28
  balance: 8
  unit: 6
  expiryDate: 11
  daysUntilExpiry: 8
  status: 12
  vendor: 18
  perishable: 10
  brand: 14
  family: 14
fontSize: 9
```

### 3. `server/src/reports/grvLog.ts`

Add `excelStyle` to self-registration:

```
columnWidths:
  date: 11
  docNo: 10
  vendor: 20
  warehouse: 12
  status: 10
  total: 10
  driverId: 10
  licensePlate: 12
  truckTemp: 8
  productTemp: 8
  productCondition: 10
  truckCondition: 10
  comments: 22
  receivedBy: 12
fontSize: 8
```

### 4. `server/src/routes/exportSchemas.ts`

Add `visibleColumnKeys` to `ExportRequestSchema`:

```typescript
visibleColumnKeys: z.array(z.string()).min(1).optional()
```

Optional for backwards compatibility — if omitted, export all columns. Minimum 1 key to prevent empty exports. Unrecognized keys are silently dropped; if no valid keys remain after filtering against `report.columns`, fall back to all columns.

### 5. `server/src/routes/export.ts`

After transform + filter, before Excel generation:

1. Read `body.visibleColumnKeys`
2. If present: filter `report.columns` to only include keys in `visibleColumnKeys`, preserving the order from `visibleColumnKeys`
3. Pass the filtered columns array to the Excel generator

### 6. `server/src/services/excelExporter.ts`

#### `generateFallbackExcel(rows, columns, reportName, excelStyle?)`

- Accept optional `excelStyle` parameter
- If `excelStyle.columnWidths` provided: use those widths instead of auto-width calculation
- If `excelStyle.fontSize` provided: apply font size to all data rows AND header row (header also gets bold)
- If no `excelStyle.columnWidths`: keep existing auto-width logic as fallback
- After data fill, apply print setup:
  - Paper size: Letter (`paperSize = 1`)
  - Orientation: Landscape (`orientation = 'landscape'`)
  - Margins: 0.25" all sides including header/footer (`margins = { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.25, footer: 0.25 }`)
  - Fit to 1 page wide, unlimited height (`fitToPage = true, fitToWidth = 1, fitToHeight = 0`)
  - Print title rows: row 1 (`printTitlesRow = '1:1'`)

#### `generateTemplateExcel(templateBuffer, rows, config, excelStyle?)`

- Accept optional `excelStyle` parameter
- If `excelStyle.columnWidths` provided: override column widths on the worksheet
- After data fill, apply print setup:
  - Same settings as fallback except print title rows: `'1:' + (config.dataStartRow - 1)` to repeat the full header block (rows 1-4 for GRV Log) on every printed page

### 7. `client/src/hooks/useExport.ts`

- Accept `visibleColumnKeys` as a third positional argument: `useExport(reportId, filterGroup, visibleColumnKeys)`
- Include in POST body: `{ filterGroup, visibleColumnKeys }`

### 8. `client/src/components/widgets/ReportTableWidget.tsx`

- Derive `visibleColumnKeys` from `useColumnManager`'s `visibleColumns`: `visibleColumns.map(c => c.key)`
- Memoize with `useMemo` (join-based comparison) to keep a stable reference and avoid unnecessary re-renders of the export button
- Pass to `useExport` as third argument

## Print Setup (Applied Universally)

| Setting | Value |
|---------|-------|
| Paper size | Letter (8.5" × 11") |
| Orientation | Landscape |
| Margins | 0.25" all sides |
| Scaling | Fit to 1 page wide, unlimited pages tall |
| Header row | Repeats on every printed page |
| Frozen panes | Row 1 frozen (already in fallback) |

## What Does NOT Change

- Filter logic — already exports all filtered rows across all pages
- Row cap (5,000) — unchanged
- Template fetching from Airtable — unchanged
- GRV Log's `exportConfig` column mapping — unchanged (template path uses mapping, column widths override any widths baked into the template file)

## Implementation Notes

- When template generation fails and falls back to `generateFallbackExcel`, pass `excelStyle` to the fallback call too — otherwise a template failure produces an un-styled export.
- `visibleColumnKeys` in `useExport` must be added to the `useCallback` dependency array for `triggerExport`.

## Files Touched

8 files modified, 0 new files created.
