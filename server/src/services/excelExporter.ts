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
import type { ExportConfig, ExcelStyle } from '../config/reportRegistry';

// WHY: Detects ISO date strings (e.g., "2026-01-15" or "2026-01-15T00:00:00Z")
// and converts them to Date objects so ExcelJS writes proper Excel serial dates.
// Without this, date columns show raw ISO strings instead of formatted dates.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?$/;

function toExcelValue(value: unknown): ExcelJS.CellValue {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    return new Date(value);
  }
  return value as ExcelJS.CellValue;
}

// WHY: Converts column letter (A, B, ..., Z, AA, AB) to 1-based column number.
// ExcelJS uses 1-based column numbers: A=1, B=2, ..., Z=26, AA=27.
function columnLetterToNumber(letter: string): number {
  let result = 0;
  for (let i = 0; i < letter.length; i++) {
    result = result * 26 + (letter.charCodeAt(i) - 64);
  }
  return result;
}

// WHY: ExcelJS shares style objects between cells; a deep copy lets each cell
// get its own font size and alignment without changing the template's other cells.
function copyCellStyle(style: Partial<ExcelJS.Style>): Partial<ExcelJS.Style> {
  return JSON.parse(JSON.stringify(style)) as Partial<ExcelJS.Style>;
}

function columnNumberToLetter(colNum: number): string {
  let letter = '';
  for (let n = colNum; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

export async function generateTemplateExcel(
  templateBuffer: Buffer,
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  config: ExportConfig,
  excelStyle?: ExcelStyle,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer as unknown as ArrayBuffer);

  // WHY: workbook.worksheets is 0-indexed positional array matching the visible
  // tab order. getWorksheet(number) retrieves by internal worksheet ID which can
  // differ from visual order if sheets were deleted/reordered in the template.
  const worksheet = workbook.worksheets[config.sheetIndex ?? 0];
  if (!worksheet) throw new Error('Template worksheet not found');

  // WHY: Templates can carry old revisions of the form on other sheets (the GRV
  // Log template has a blank R4 form). Printing the workbook would add them as
  // extra pages, so the export keeps only the sheet it fills.
  for (const other of [...workbook.worksheets]) {
    if (other !== worksheet) workbook.removeWorksheet(other.id);
  }
  if (config.sheetName) worksheet.name = config.sheetName;

  const dataStartRow = config.dataStartRow;
  const headerRowNum = dataStartRow - 1;

  // WHY: The form's right edge is the last labelled header cell. Mapped columns
  // past it (GRV # and the tracker columns on GRV Log) are not on the paper
  // form, so they get a header, borders and the title width added below.
  let formLastCol = 0;
  worksheet.getRow(headerRowNum).eachCell((cell, colNum) => {
    if (cell.value != null && cell.value !== '') formLastCol = Math.max(formLastCol, colNum);
  });

  // WHY: Captured before any row is inserted or filled — the template's first
  // data row is the look every data row gets, inserted rows included.
  const dataRowStyles = new Map<number, Partial<ExcelJS.Style>>();
  for (let c = 1; c <= formLastCol; c++) {
    dataRowStyles.set(c, copyCellStyle(worksheet.getRow(dataStartRow).getCell(c).style));
  }

  // WHY: Convert mapping once — from column letters to column numbers.
  const colMap = Object.entries(config.mapping).map(([letter, fieldKey]) => ({
    colNum: columnLetterToNumber(letter.toUpperCase()),
    fieldKey,
  }));

  const lastCol = Math.max(formLastCol, ...colMap.map(({ colNum }) => colNum));

  // WHY: The title and footer merges span the form (A:M on GRV Log). Widen the
  // ones that end at the form's edge to the last mapped column, and move the
  // revision stamp above the header to that edge, so the page reads as one form.
  // Done before rows are inserted: spliceRows shifts merged cells but not
  // ExcelJS's merge list, so widening afterwards would merge the wrong rows.
  if (lastCol > formLastCol) {
    const formEdgeLetter = columnNumberToLetter(formLastCol);
    const lastLetter = columnNumberToLetter(lastCol);
    const merges = (worksheet.model as unknown as { merges: string[] }).merges;
    for (const range of merges) {
      const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
      if (!match || match[3] !== formEdgeLetter) continue;
      worksheet.unMergeCells(range);
      worksheet.mergeCells(`${match[1]}${match[2]}:${lastLetter}${match[4]}`);
    }
    for (let r = 1; r < headerRowNum; r++) {
      const stampCell = worksheet.getRow(r).getCell(formLastCol);
      if (stampCell.value == null || stampCell.isMerged) continue;
      const newCell = worksheet.getRow(r).getCell(lastCol);
      newCell.value = stampCell.value;
      newCell.style = copyCellStyle(stampCell.style);
      stampCell.value = null;
    }
  }

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

  // Fill data rows
  for (let i = 0; i < rows.length; i++) {
    const excelRow = worksheet.getRow(dataStartRow + i);
    for (const { colNum, fieldKey } of colMap) {
      const value = rows[i][fieldKey];
      if (value != null) {
        excelRow.getCell(colNum).value = toExcelValue(value);
      }
    }
    excelRow.commit();
  }

  // WHY: Mapped columns past the form get the report's column label, styled
  // like the form's last header cell, so they print as part of the form.
  // With relabelHeaders, columns on the form keep their header style but take
  // the report label too.
  const formHeaderCell = worksheet.getRow(headerRowNum).getCell(formLastCol);
  for (const { colNum, fieldKey } of colMap) {
    if (colNum <= formLastCol && !config.relabelHeaders) continue;
    const headerCell = worksheet.getRow(headerRowNum).getCell(colNum);
    if (colNum > formLastCol) headerCell.style = copyCellStyle(formHeaderCell.style);
    // WHY: Some form header cells do not wrap (GRV Log's "Time"), so a longer
    // report label would be cut off at the cell edge.
    else headerCell.alignment = { ...headerCell.alignment, wrapText: true };
    headerCell.value = columns.find((c) => c.key === fieldKey)?.label ?? fieldKey;
  }

  // WHY: The template's data rows are 14pt with fixed heights, while rows the
  // splice inserted have no style at all, so long exports printed half large
  // and boxed, half small and bare. Every data-region row gets the template's
  // data-row style at the report's font size, with wrapping and no fixed height
  // so Excel grows a row to fit a long comment.
  const dataRegionRowCount = Math.max(rows.length, emptyRowCount);
  for (let r = dataStartRow; r < dataStartRow + dataRegionRowCount; r++) {
    const excelRow = worksheet.getRow(r);
    for (let c = 1; c <= lastCol; c++) {
      const style = copyCellStyle(dataRowStyles.get(Math.min(c, formLastCol)) ?? {});
      if (excelStyle?.fontSize) style.font = { ...style.font, size: excelStyle.fontSize };
      style.alignment = { ...style.alignment, vertical: 'middle', wrapText: true };
      excelRow.getCell(c).style = style;
    }
    excelRow.height = undefined as unknown as number;
  }

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
  for (const [letter, width] of Object.entries(config.unmappedColumnWidths ?? {})) {
    worksheet.getColumn(columnLetterToNumber(letter.toUpperCase())).width = width;
  }

  // WHY: Print setup — same as fallback except printTitlesRow repeats the
  // full header block (e.g., rows 1-4 for GRV Log) on every printed page.
  worksheet.pageSetup.paperSize = 1 as unknown as ExcelJS.PaperSize;
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

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateFallbackExcel(
  rows: Record<string, unknown>[],
  columns: ColumnDefinition[],
  reportName: string,
  excelStyle?: ExcelStyle,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(reportName);

  // WHY: Row 1 = bold headers from column definitions.
  // Font set to Arial at report-specific size for print consistency.
  const fontSize = excelStyle?.fontSize ?? 10;
  const headerRow = worksheet.addRow(columns.map((c) => c.label));
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: fontSize };
  });

  // WHY: Track which columns are dates so we can apply numFmt after writing.
  const dateColIndices: number[] = [];
  columns.forEach((c, i) => { if (c.type === 'date') dateColIndices.push(i + 1); });

  // Data rows
  for (const row of rows) {
    const excelRow = worksheet.addRow(columns.map((c) => {
      const val = row[c.key];
      // WHY: Write numbers as numbers so Excel can format/sort them.
      if ((c.type === 'currency' || c.type === 'number') && val != null) {
        return typeof val === 'number' ? val : parseFloat(String(val));
      }
      // WHY: Convert ISO date strings to Date objects so Excel stores them
      // as serial dates (sortable, formattable) instead of raw text.
      if (c.type === 'date' && val != null) {
        return toExcelValue(val);
      }
      return val ?? '';
    }));
    // WHY: Apply MM/DD/YY format to date cells in this row.
    for (const colIdx of dateColIndices) {
      excelRow.getCell(colIdx).numFmt = 'MM/DD/YY';
    }
    // WHY: Apply Arial font at report-specific size to all data cells.
    excelRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: fontSize };
    });
  }

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

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // WHY: Print setup — landscape letter, narrow margins, fit to 1 page wide.
  // Applied universally so every export is print-ready out of the box.
  worksheet.pageSetup.paperSize = 1 as unknown as ExcelJS.PaperSize; // Letter
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

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
