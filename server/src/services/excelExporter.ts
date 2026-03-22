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
  await workbook.xlsx.load(templateBuffer as unknown as ArrayBuffer);

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
