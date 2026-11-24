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
    templateRecordId: 'recTest000000000',
    mapping: { 'A': 'name', 'B': 'amount' },
    dataStartRow: 4,
  };

  it('applies print setup and excelStyle when provided', async () => {
    const style = {
      columnWidths: { name: 18, amount: 10 },
      fontSize: 8,
    };
    const template = await createTestTemplate();
    const buffer = await generateTemplateExcel(template, testRows, testColumns, exportConfig, style);
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
    const buffer = await generateTemplateExcel(template, testRows, testColumns, exportConfig);

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
    const buffer = await generateTemplateExcel(template, manyRows, testColumns, exportConfig);

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
    const buffer = await generateTemplateExcel(template, [], testColumns, exportConfig);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.getWorksheet(1)!;

    // Headers still present
    expect(ws.getRow(1).getCell(1).value).toBe('Company Name');
    // Footer still present
    expect(ws.getRow(6).getCell(1).value).toBe('Footer: Instructions');
  });
});

describe('generateTemplateExcel print layout', () => {
  const thinBox: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  };

  // WHY: Shaped like the GRV Log form — a title merged across the form's
  // columns (A:B), a revision stamp at the form's right edge, two bordered
  // 14pt data rows with fixed heights, a merged footer, and a stale second
  // sheet. Column C is mapped but is not part of the form.
  async function createFormTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Form');
    ws.getCell('A1').value = 'Company Name';
    ws.mergeCells('A1:B1');
    ws.getCell('B2').value = 'R5 03/31/2025';
    ws.getCell('B2').alignment = { horizontal: 'right' };
    ws.getCell('A3').value = 'Name';
    ws.getCell('B3').value = 'Amount';
    for (const ref of ['A3', 'B3']) {
      ws.getCell(ref).border = thinBox;
      ws.getCell(ref).font = { name: 'Arial', size: 10, bold: true };
    }
    for (const r of [4, 5]) {
      ws.getRow(r).height = 23;
      for (const c of [1, 2]) {
        ws.getRow(r).getCell(c).border = thinBox;
        ws.getRow(r).getCell(c).font = { name: 'Arial', size: 14 };
      }
    }
    ws.getCell('A6').value = 'Footer: Instructions';
    ws.mergeCells('A6:B6');
    wb.addWorksheet('Old Form').getCell('A1').value = 'stale';
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  const formColumns: ColumnDefinition[] = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'amount', label: 'Amount', type: 'currency' },
    { key: 'note', label: 'Extra Note', type: 'string' },
  ];

  const formConfig: ExportConfig = {
    templateRecordId: 'recTest000000000',
    mapping: { 'A': 'name', 'B': 'amount', 'C': 'note' },
    dataStartRow: 4,
  };

  const fourRows = [
    { name: 'Alice', amount: 1, note: 'a' },
    { name: 'Bob', amount: 2, note: 'b' },
    { name: 'Carol', amount: 3, note: 'c' },
    { name: 'Dave', amount: 4, note: 'd' },
  ];

  async function exportForm(rows: Record<string, unknown>[], config = formConfig): Promise<ExcelJS.Workbook> {
    const buffer = await generateTemplateExcel(
      await createFormTemplate(), rows, formColumns, config, { columnWidths: {}, fontSize: 8 },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    return wb;
  }

  it('labels mapped columns past the form with the report column label, styled like the form header', async () => {
    const ws = (await exportForm(fourRows)).worksheets[0];
    expect(ws.getCell('C3').value).toBe('Extra Note');
    expect(ws.getCell('C3').border?.left?.style).toBe('thin');
    expect(ws.getCell('C3').font?.bold).toBe(true);
  });

  it('gives every data row, inserted ones included, borders, the excelStyle font size and no fixed height', async () => {
    const ws = (await exportForm(fourRows)).worksheets[0];
    // Rows 4-5 come from the template; 6-7 were inserted to fit four rows.
    for (const r of [4, 5, 6, 7]) {
      for (const c of [1, 2, 3]) {
        const cell = ws.getRow(r).getCell(c);
        expect(cell.border?.bottom?.style).toBe('thin');
        expect(cell.font?.size).toBe(8);
        expect(cell.alignment?.wrapText).toBe(true);
      }
      // WHY: no fixed height lets Excel grow the row for wrapped comments.
      expect(ws.getRow(r).height).toBeUndefined();
    }
    expect(ws.getCell('A8').value).toBe('Footer: Instructions');
  });

  it('widens merges that end at the form edge and moves the revision stamp to the new edge', async () => {
    const ws = (await exportForm(fourRows)).worksheets[0];
    const merges = (ws.model as unknown as { merges: string[] }).merges;
    expect(merges).toContain('A1:C1');
    expect(merges).toContain('A8:C8');
    expect(ws.getCell('C2').value).toBe('R5 03/31/2025');
    expect(ws.getCell('B2').value).toBeNull();
  });

  it('keeps only the filled worksheet so printing the workbook prints only the log', async () => {
    const wb = await exportForm(fourRows);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Form']);
  });

  it('relabels every mapped header from the report columns when relabelHeaders is set', async () => {
    const template = await createFormTemplate();
    const relabelled: ColumnDefinition[] = formColumns.map((c) => ({ ...c, label: c.label + ' (page)' }));
    const buffer = await generateTemplateExcel(
      template, fourRows, relabelled, { ...formConfig, relabelHeaders: true }, { columnWidths: {} },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    const ws = wb.worksheets[0];
    // Form columns keep their header style but take the report labels
    expect(ws.getCell('A3').value).toBe('Name (page)');
    expect(ws.getCell('B3').value).toBe('Amount (page)');
    expect(ws.getCell('B3').font?.bold).toBe(true);
    expect(ws.getCell('A3').alignment?.wrapText).toBe(true);
    expect(ws.getCell('C3').value).toBe('Extra Note (page)');
    // The form's width is still the template's, so the title widens to C
    const merges = (ws.model as unknown as { merges: string[] }).merges;
    expect(merges).toContain('A1:C1');
  });

  it('keeps the form header labels without relabelHeaders', async () => {
    const template = await createFormTemplate();
    const relabelled: ColumnDefinition[] = formColumns.map((c) => ({ ...c, label: c.label + ' (page)' }));
    const buffer = await generateTemplateExcel(template, fourRows, relabelled, formConfig, { columnWidths: {} });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as Buffer);
    expect(wb.worksheets[0].getCell('A3').value).toBe('Name');
  });

  it('prints with 0.2-inch margins and no header or footer space', async () => {
    const ws = (await exportForm(fourRows)).worksheets[0];
    expect(ws.pageSetup.margins).toEqual({ left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 });
  });

  // WHY: The GRV Log template is saved in Page Layout view, where Excel put the
  // columns past M (TTT Check among them) on a second page to the right.
  it('opens in Normal view even when the template is saved in Page Layout view', async () => {
    const template = new ExcelJS.Workbook();
    const sheet = template.addWorksheet('Log');
    sheet.getRow(1).getCell(1).value = 'Name';
    sheet.views = [{ state: 'normal', style: 'pageLayout', zoomScaleNormal: 125 }];
    const buffer = await generateTemplateExcel(
      Buffer.from(await template.xlsx.writeBuffer()),
      testRows,
      testColumns,
      { templateRecordId: 'rec', mapping: { A: 'name' }, dataStartRow: 2 },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets[0].views[0].style).toBeUndefined();
    expect(wb.worksheets[0].views[0].state).toBe('normal');
  });

  // WHY: The exported GRV form carried copies="12", so Excel's print dialog
  // defaulted to 12 paper copies.
  it('defaults to one printed copy even when the template asks for 12', async () => {
    const template = new ExcelJS.Workbook();
    const sheet = template.addWorksheet('Log');
    sheet.getRow(1).getCell(1).value = 'Name';
    Object.assign(sheet.pageSetup, { copies: 12 });
    const buffer = await generateTemplateExcel(
      Buffer.from(await template.xlsx.writeBuffer()),
      testRows,
      testColumns,
      { templateRecordId: 'rec', mapping: { A: 'name' }, dataStartRow: 2 },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets[0].pageSetup).toMatchObject({ copies: 1 });
  });

  it('renames the filled sheet when sheetName is set', async () => {
    const wb = await exportForm(fourRows, { ...formConfig, sheetName: 'Inbound Log 2026' });
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Inbound Log 2026']);
  });

  it('sets widths of form columns that hold no data from unmappedColumnWidths', async () => {
    const ws = (await exportForm(fourRows, {
      ...formConfig,
      mapping: { 'A': 'name', 'C': 'note' },
      unmappedColumnWidths: { 'B': 6 },
    })).worksheets[0];
    expect(ws.getColumn(2).width).toBe(6);
  });
});

describe('generateTemplateExcel form text', () => {
  const columns: ColumnDefinition[] = [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'note', label: 'Note', type: 'string' },
  ];
  const config: ExportConfig = {
    templateRecordId: 'recTest000000000',
    mapping: { 'A': 'name', 'D': 'note' },
    dataStartRow: 3,
  };
  const formText = { '1. cold @ <41': '1. cold @ <38', '8. reject >41': '8. reject >40' };

  // WHY: Shaped like the GRV Log footer — a rich-text rule, a merged rule and a
  // bold merged warning. The form is A:C; column D is mapped past it, so the
  // merges get widened.
  async function createFormTextTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Form');
    ws.getCell('A2').value = 'Name';
    ws.getCell('C2').value = 'Form edge';
    ws.getCell('A5').value = 'Instructions:';
    ws.getCell('A6').value = { richText: [{ text: '1. cold @ ' }, { font: { underline: true }, text: '<' }, { text: '41' }] };
    ws.getCell('C6').value = '4. kept';
    ws.getCell('B7').value = '8. reject >41';
    ws.mergeCells('B7:C7');
    ws.getCell('A8').value = '**kept warning -\nsecond line**';
    ws.mergeCells('A8:C8');
    ws.getRow(8).height = 27;
    // An empty merge down column A: ExcelJS's cell.text throws on its second cell.
    ws.mergeCells('A9:A10');
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function exportRows(count: number, exportConfig: ExportConfig): Promise<ExcelJS.Worksheet> {
    const rows = Array.from({ length: count }, (_, i) => ({ name: `row ${i}`, note: 'n' }));
    const buffer = await generateTemplateExcel(await createFormTextTemplate(), rows, columns, exportConfig);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.worksheets[0];
  }

  it.each([1, 2, 6])('swaps the listed lines as plain text and keeps the rest of the form (%i data rows)', async (count) => {
    const ws = await exportRows(count, { ...config, formText });
    const heading = 5 + Math.max(0, count - 2);
    expect(ws.getCell(`A${heading + 1}`).value).toBe('1. cold @ <38');
    expect(ws.getCell(`C${heading + 1}`).value).toBe('4. kept');
    expect(ws.getCell(`B${heading + 2}`).value).toBe('8. reject >40');
    expect(ws.getCell(`A${heading + 3}`).value).toBe('**kept warning -\nsecond line**');
    // Two printed lines need 30pt; the template's 27pt cut the tails of the letters.
    expect(ws.getRow(heading + 3).height).toBe(30);
    const merges = (ws.model as unknown as { merges: string[] }).merges;
    expect(merges).toEqual(expect.arrayContaining([`B${heading + 2}:D${heading + 2}`, `A${heading + 3}:D${heading + 3}`]));
  });

  it('leaves the form text as it is without formText', async () => {
    const ws = await exportRows(2, config);
    expect(ws.getCell('A6').text).toBe('1. cold @ <41');
    expect(ws.getCell('B7').value).toBe('8. reject >41');
  });
});
