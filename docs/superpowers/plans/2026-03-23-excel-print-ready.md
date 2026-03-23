# Excel Print-Ready Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both Excel exports (BBD and GRV Log) fit on letter-size paper in landscape, with per-report column widths/font sizes, and respect column visibility from the UI.

**Architecture:** Per-report `excelStyle` config on `ReportConfig` drives column widths and font size. Print setup (margins, orientation, scaling) is applied universally in `excelExporter.ts`. Column visibility is sent from frontend to backend in the export POST body — only respected in fallback mode (BBD), ignored in template mode (GRV Log).

**Tech Stack:** ExcelJS (server), Zod (validation), React hooks (client), TanStack Query (client state)

**Spec:** `specs/2026-03-23-excel-print-ready-design.md`

---

### Task 1: Add `ExcelStyle` type to `ReportConfig`

**Files:**
- Modify: `server/src/config/reportRegistry.ts:34-66`

- [ ] **Step 1: Add the `ExcelStyle` interface and `excelStyle` property**

In `server/src/config/reportRegistry.ts`, add the interface before `ReportConfig` and add the optional property inside it:

```typescript
// Add after ExportConfig interface (after line 32):

export interface ExcelStyle {
  // WHY: Per-report column widths for print-ready Excel exports.
  // Keys are column keys from transformRow output. Values are Excel character-width units.
  columnWidths: Record<string, number>;
  // WHY: Per-report font size. BBD uses 9pt (11 columns), GRV Log uses 8pt (14 columns).
  // Default: 10 if omitted.
  fontSize?: number;
}

// Add inside ReportConfig interface, after clientSidePagination (after line 65):

  // WHY: Per-report Excel styling for print-ready exports. Column widths and font size
  // are applied by excelExporter.ts. When absent, fallback uses auto-width and default font.
  excelStyle?: ExcelStyle;
```

- [ ] **Step 2: Update intent block EXPORTS line**

Update line 7 to include `ExcelStyle`:
```typescript
// EXPORTS: ReportConfig, ReportFilters, ExportConfig, ExcelStyle, reportRegistry, getReport
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS (new interface, no consumers yet)

- [ ] **Step 4: Commit**

```bash
git add server/src/config/reportRegistry.ts
git commit -m "feat: add ExcelStyle interface to ReportConfig"
```

---

### Task 2: Add `excelStyle` to BBD report

**Files:**
- Modify: `server/src/reports/bbdReport.ts:240-255`

- [ ] **Step 1: Add `excelStyle` to BBD self-registration**

In `server/src/reports/bbdReport.ts`, add after `clientSidePagination: true,` (line 254):

```typescript
  excelStyle: {
    columnWidths: {
      partNumber: 14,
      partDescription: 28,
      balance: 8,
      unit: 6,
      expiryDate: 11,
      daysUntilExpiry: 8,
      status: 12,
      vendor: 18,
      perishable: 10,
      brand: 14,
      family: 14,
    },
    fontSize: 9,
  },
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/reports/bbdReport.ts
git commit -m "feat: add excelStyle config to BBD report (9pt, 11 column widths)"
```

---

### Task 3: Add `excelStyle` to GRV Log report

**Files:**
- Modify: `server/src/reports/grvLog.ts:162-189`

- [ ] **Step 1: Add `excelStyle` to GRV Log self-registration**

In `server/src/reports/grvLog.ts`, add after the `exportConfig` block (after line 188, before the closing `});`):

```typescript
  // WHY: Only columns present in exportConfig.mapping get widths applied
  // in template mode. warehouse, status, total are NOT mapped (they don't
  // exist in the GRV Log template) so they are omitted here.
  excelStyle: {
    columnWidths: {
      date: 11,
      docNo: 10,
      vendor: 20,
      driverId: 10,
      licensePlate: 12,
      truckTemp: 8,
      productTemp: 8,
      productCondition: 10,
      truckCondition: 10,
      comments: 22,
      receivedBy: 12,
    },
    fontSize: 8,
  },
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "feat: add excelStyle config to GRV Log report (8pt, 14 column widths)"
```

---

### Task 4: Update `excelExporter.ts` — fallback mode print setup + styling

**Files:**
- Modify: `server/src/services/excelExporter.ts:1-153`
- Test: `server/tests/excelExporter.test.ts`

- [ ] **Step 1: Write failing test for fallback print setup**

Add to `server/tests/excelExporter.test.ts`, inside the `generateFallbackExcel` describe block:

```typescript
  it('applies print setup and excelStyle when provided', async () => {
    const style = {
      columnWidths: { name: 20, amount: 12, date: 15 },
      fontSize: 9,
    };
    const buffer = await generateFallbackExcel(testRows, testColumns, 'Styled Report', style);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Print setup
    expect(ws.pageSetup.paperSize).toBe(1); // Letter
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(ws.pageSetup.fitToPage).toBe(true);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
    expect(ws.pageSetup.printTitlesRow).toBe('1:1');

    // Margins
    expect(ws.pageSetup.margins?.left).toBe(0.25);
    expect(ws.pageSetup.margins?.right).toBe(0.25);
    expect(ws.pageSetup.margins?.top).toBe(0.25);
    expect(ws.pageSetup.margins?.bottom).toBe(0.25);

    // Column widths from excelStyle
    expect(ws.getColumn(1).width).toBe(20); // name
    expect(ws.getColumn(2).width).toBe(12); // amount
    expect(ws.getColumn(3).width).toBe(15); // date

    // Font size on header (bold + Arial + 9pt)
    const headerFont = ws.getRow(1).getCell(1).font;
    expect(headerFont?.bold).toBe(true);
    expect(headerFont?.size).toBe(9);
    expect(headerFont?.name).toBe('Arial');

    // Font size on data row (Arial + 9pt, not bold)
    const dataFont = ws.getRow(2).getCell(1).font;
    expect(dataFont?.size).toBe(9);
    expect(dataFont?.name).toBe('Arial');
    expect(dataFont?.bold).toBeFalsy();
  });

  it('uses auto-width when no excelStyle provided', async () => {
    const buffer = await generateFallbackExcel(testRows, testColumns, 'Auto Report');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Should still have print setup (applied universally)
    expect(ws.pageSetup.paperSize).toBe(1);
    expect(ws.pageSetup.orientation).toBe('landscape');

    // Auto-width should be based on content length (not excelStyle)
    // "Amount" header = 6 chars + 2 padding = 8 width
    expect(ws.getColumn(2).width).toBe(8);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test`
Expected: FAIL — `generateFallbackExcel` doesn't accept 4th argument yet

- [ ] **Step 3: Update import and function signature**

In `server/src/services/excelExporter.ts`:

Update the import on line 12:
```typescript
import type { ExportConfig, ExcelStyle } from '../config/reportRegistry';
```

Update `generateFallbackExcel` signature (line 102-105):
```typescript
export async function generateFallbackExcel(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  reportName: string,
  excelStyle?: ExcelStyle,
): Promise<Buffer> {
```

- [ ] **Step 4: Apply font to header row**

Replace the header row creation (lines 110-112):
```typescript
  // WHY: Row 1 = bold headers from column definitions.
  // Font set to Arial at report-specific size for print consistency.
  const fontSize = excelStyle?.fontSize ?? 10;
  const headerRow = worksheet.addRow(columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: fontSize };
  });
```

- [ ] **Step 5: Apply font to data rows**

After each data row is created (inside the `for (const row of rows)` loop, after the date numFmt block, around line 136):
```typescript
    // WHY: Apply Arial font at report-specific size to all data cells.
    excelRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: fontSize };
    });
```

- [ ] **Step 6: Add column width logic (excelStyle or auto-width)**

Replace the auto-width block (lines 139-146):
```typescript
  // WHY: Use excelStyle column widths when provided (print-optimized).
  // Fall back to auto-width based on content length when no excelStyle.
  if (excelStyle?.columnWidths) {
    for (let i = 0; i < columns.length; i++) {
      const width = excelStyle.columnWidths[columns[i].key];
      if (width) worksheet.getColumn(i + 1).width = width;
    }
  } else {
    for (let i = 0; i < columns.length; i++) {
      const maxLength = Math.max(
        columns[i].label.length,
        ...rows.map((r) => String(r[columns[i].key] ?? '').length),
      );
      worksheet.getColumn(i + 1).width = Math.min(maxLength + 2, 40);
    }
  }
```

- [ ] **Step 7: Add print setup after frozen panes**

After the frozen panes block (line 149), add before `writeBuffer()`:
```typescript
  // WHY: Print setup — landscape letter, narrow margins, fit to 1 page wide.
  // Applied universally so every export is print-ready out of the box.
  worksheet.pageSetup.paperSize = 1; // Letter
  worksheet.pageSetup.orientation = 'landscape';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.printTitlesRow = '1:1';
  worksheet.pageSetup.margins = {
    left: 0.25, right: 0.25,
    top: 0.25, bottom: 0.25,
    header: 0.25, footer: 0.25,
  };
```

- [ ] **Step 8: Run tests**

Run: `cd server && npm test`
Expected: ALL PASS (including new tests)

- [ ] **Step 9: Commit**

```bash
git add server/src/services/excelExporter.ts server/tests/excelExporter.test.ts
git commit -m "feat: add print setup and per-report styling to fallback Excel export"
```

---

### Task 5: Update `excelExporter.ts` — template mode print setup + styling

**Files:**
- Modify: `server/src/services/excelExporter.ts:36-100`
- Test: `server/tests/excelExporter.test.ts`

- [ ] **Step 1: Write failing test for template print setup**

Add to `server/tests/excelExporter.test.ts`, inside the `generateTemplateExcel` describe block:

```typescript
  it('applies print setup and excelStyle when provided', async () => {
    const style = {
      columnWidths: { name: 18, amount: 10 },
      fontSize: 8,
    };
    const template = await createTestTemplate();
    const buffer = await generateTemplateExcel(template, testRows, exportConfig, style);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Print setup
    expect(ws.pageSetup.paperSize).toBe(1);
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect(ws.pageSetup.fitToPage).toBe(true);
    // WHY: Template repeats rows 1 through (dataStartRow - 1) = rows 1-3
    expect(ws.pageSetup.printTitlesRow).toBe('1:3');

    // Column widths applied (A=name=18, B=amount=10)
    expect(ws.getColumn(1).width).toBe(18);
    expect(ws.getColumn(2).width).toBe(10);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd server && npm test`
Expected: FAIL — `generateTemplateExcel` doesn't accept 4th argument yet

- [ ] **Step 3: Update `generateTemplateExcel` signature**

Update signature (line 36-39):
```typescript
export async function generateTemplateExcel(
  templateBuffer: Buffer,
  rows: Record<string, unknown>[],
  config: ExportConfig,
  excelStyle?: ExcelStyle,
): Promise<Buffer> {
```

- [ ] **Step 4: Apply column widths and print setup after data fill**

After the data fill loop (after line 96, before `writeBuffer()`):

```typescript
  // WHY: Override column widths from excelStyle for print-ready layout.
  // These override any widths baked into the Airtable template.
  if (excelStyle?.columnWidths) {
    const colMap2 = Object.entries(config.mapping);
    for (const [letter, fieldKey] of colMap2) {
      const width = excelStyle.columnWidths[fieldKey];
      if (width) {
        worksheet.getColumn(columnLetterToNumber(letter.toUpperCase())).width = width;
      }
    }
  }

  // WHY: Print setup — same as fallback except printTitlesRow repeats the
  // full header block (e.g., rows 1-4 for GRV Log) on every printed page.
  worksheet.pageSetup.paperSize = 1;
  worksheet.pageSetup.orientation = 'landscape';
  worksheet.pageSetup.fitToPage = true;
  worksheet.pageSetup.fitToWidth = 1;
  worksheet.pageSetup.fitToHeight = 0;
  worksheet.pageSetup.printTitlesRow = `1:${config.dataStartRow - 1}`;
  worksheet.pageSetup.margins = {
    left: 0.25, right: 0.25,
    top: 0.25, bottom: 0.25,
    header: 0.25, footer: 0.25,
  };
```

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/services/excelExporter.ts server/tests/excelExporter.test.ts
git commit -m "feat: add print setup and per-report styling to template Excel export"
```

---

### Task 6: Update export route to pass `excelStyle` and handle `visibleColumnKeys`

**Files:**
- Modify: `server/src/routes/exportSchemas.ts:12-14`
- Modify: `server/src/routes/export.ts:126-148`

- [ ] **Step 1: Add `visibleColumnKeys` to export schema**

In `server/src/routes/exportSchemas.ts`, update the schema:

```typescript
export const ExportRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  // WHY: Optional list of visible column keys from the UI. When present,
  // the export only includes these columns in the specified order.
  // Only applies to fallback Excel mode (not template mode).
  visibleColumnKeys: z.array(z.string()).min(1).optional(),
});
```

- [ ] **Step 2: Update export route — column filtering + pass excelStyle**

In `server/src/routes/export.ts`, replace the Excel generation block (lines 126-148):

```typescript
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
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Run all tests**

Run: `cd server && npm test`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/exportSchemas.ts server/src/routes/export.ts
git commit -m "feat: pass excelStyle to Excel generators, support visibleColumnKeys in export"
```

---

### Task 7: Update frontend — send `visibleColumnKeys` in export request

**Files:**
- Modify: `client/src/hooks/useExport.ts:26,32,45,86`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx:52`

- [ ] **Step 1: Update `useExport` to accept and send `visibleColumnKeys`**

In `client/src/hooks/useExport.ts`:

Update function signature (line 26):
```typescript
export function useExport(
  reportId: string,
  filterGroup: FilterGroup,
  visibleColumnKeys?: string[],
): UseExportReturn {
```

Update the `JSON.stringify` call inside `triggerExport` (line 45):
```typescript
        body: JSON.stringify({ filterGroup, visibleColumnKeys }),
```

Update the `useCallback` dependency array (line 86):
```typescript
  }, [reportId, filterGroup, visibleColumnKeys]);
```

- [ ] **Step 2: Update `ReportTableWidget` to derive and pass `visibleColumnKeys`**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add `useMemo` to the import (line 10):
```typescript
import { useState, useMemo } from 'react';
```

Add memoized `visibleColumnKeys` after the `useColumnManager` call (after line 50):
```typescript
  // WHY: Stable reference for useExport dependency — only changes when
  // the actual set of visible column keys changes, not on every render.
  const visibleColumnKeys = useMemo(
    () => visibleColumns.map((c) => c.key),
    [visibleColumns],
  );
```

Update the `useExport` call (line 52):
```typescript
  const { isExporting, toast, clearToast, triggerExport } = useExport(
    reportId, debouncedGroup, visibleColumnKeys,
  );
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useExport.ts client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: send visible column keys to export endpoint for column visibility support"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run full server TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: Run full client TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 3: Run all server tests**

Run: `cd server && npm test`
Expected: ALL PASS

- [ ] **Step 4: Manual verification (if dev servers available)**

1. Start both dev servers (`npm run dev` in `server/` and `client/`)
2. Open the BBD report page
3. Click Export — download the Excel file
4. Open in Excel → File → Print Preview: should show landscape, letter, columns fit on one page width
5. Check that column widths match spec (Part Description widest at 28, Unit narrowest at 6)
6. Check font is Arial 9pt
7. Hide a column (e.g., "Brand") via Column Manager panel
8. Export again — "Brand" column should NOT appear in the Excel
9. Repeat for GRV Log — check 8pt font, landscape, all columns fit

- [ ] **Step 5: Push to main**

```bash
git push origin main
```
