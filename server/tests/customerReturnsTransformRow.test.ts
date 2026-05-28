// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsTransformRow.test.ts
// PURPOSE: Tests Customer Returns transformRow under all subform shapes.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// Side-effect: registers customer-returns
import '../src/reports/customerReturns';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('customer-returns')!;
const t = report.transformRow;

const FULL_ROW = {
  DOCNO: 'RT26000013',
  TYPE: 'N',
  CURDATE: '2026-05-19T00:00:00Z',
  CUSTNAME: 'C7835',
  CDES: 'Proper Hotel - DTLA',
  IVNUM: null,
  DOCUMENTSTEXT_SUBFORM: {
    TEXT: '<p>Requested By : Jean<br>Request Method (Email, Phone, Text) : Email</p><p>Return Details : cheese is moldy<br>Food Safety Concern (Yes/No) : No</p>',
  },
  EXTFILES_SUBFORM: {
    value: [
      { EXTFILEDES: 'Photo of Bag', EXTFILENUM: 1, SUFFIX: 'png', FILESIZE: 17868 },
      { EXTFILEDES: 'Screen Shot 2026-05-13 at 12.47.', EXTFILENUM: 2, SUFFIX: 'png', FILESIZE: 17868 },
    ],
  },
};

describe('Customer Returns transformRow', () => {
  it('extracts all 10 display fields plus type from row with complete subforms', () => {
    const r = t(FULL_ROW);
    expect(r.date).toBe('2026-05-19T00:00:00Z');
    expect(r.docNo).toBe('RT26000013');
    expect(r.type).toBe('N');
    expect(r.customerId).toBe('C7835');
    expect(r.customerName).toBe('Proper Hotel - DTLA');
    expect(r.invoiceNum).toBeNull();
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
    expect(r.returnDetails).toBe('cheese is moldy');
    expect(r.foodSafetyConcern).toBe('No');
    expect(r.attachments).toEqual([
      { num: 1, filename: 'Photo of Bag.png', sizeBytes: 17868 },
      { num: 2, filename: 'Screen Shot 2026-05-13 at 12.47..png', sizeBytes: 17868 },
    ]);
  });

  it('attachments empty array when EXTFILES_SUBFORM is null', () => {
    const r = t({ ...FULL_ROW, EXTFILES_SUBFORM: null });
    expect(r.attachments).toEqual([]);
  });

  it('attachments empty array when EXTFILES_SUBFORM.value is empty', () => {
    const r = t({ ...FULL_ROW, EXTFILES_SUBFORM: { value: [] } });
    expect(r.attachments).toEqual([]);
  });

  it('remarks null when DOCUMENTSTEXT_SUBFORM is null', () => {
    const r = t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: null });
    expect(r.requestedBy).toBeNull();
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
    expect(r.docNo).toBe('RT26000013');
    expect(r.customerName).toBe('Proper Hotel - DTLA');
    expect(r.attachments).toHaveLength(2);
  });

  it('remarks null when DOCUMENTSTEXT_SUBFORM.TEXT is null or empty', () => {
    expect(t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: null } }).requestedBy).toBeNull();
    expect(t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: ''  } }).requestedBy).toBeNull();
  });

  it('handles missing subform properties without throwing', () => {
    const { DOCUMENTSTEXT_SUBFORM: _d, EXTFILES_SUBFORM: _e, ...bare } = FULL_ROW;
    const r = t(bare);
    expect(r.requestedBy).toBeNull();
    expect(r.attachments).toEqual([]);
  });

  it('customerId maps CUSTNAME and customerName maps CDES', () => {
    const r = t(FULL_ROW);
    expect(r.customerId).toBe('C7835');
    expect(r.customerName).toBe('Proper Hotel - DTLA');
  });

  it('skips attachment rows with missing or empty EXTFILEDES', () => {
    const r = t({
      ...FULL_ROW,
      EXTFILES_SUBFORM: {
        value: [
          { EXTFILEDES: 'good', EXTFILENUM: 5, SUFFIX: 'pdf', FILESIZE: 1000 },
          { EXTFILEDES: null, EXTFILENUM: 6, SUFFIX: 'pdf', FILESIZE: 1000 },
          { EXTFILEDES: '', EXTFILENUM: 7, SUFFIX: 'pdf', FILESIZE: 1000 },
        ],
      },
    });
    expect(r.attachments).toEqual([{ num: 5, filename: 'good.pdf', sizeBytes: 1000 }]);
  });

  it('filename omits the dot when SUFFIX is missing', () => {
    const r = t({
      ...FULL_ROW,
      EXTFILES_SUBFORM: {
        value: [{ EXTFILEDES: 'file_with_no_ext', EXTFILENUM: 10, SUFFIX: null, FILESIZE: 50 }],
      },
    });
    expect(r.attachments).toEqual([
      { num: 10, filename: 'file_with_no_ext', sizeBytes: 50 },
    ]);
  });
});
