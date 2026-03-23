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
