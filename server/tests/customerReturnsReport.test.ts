// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsReport.test.ts
// PURPOSE: Tests Customer Returns registration, single-query $expand
//          design (no enrichRows), explosion + transform, fetchFilters.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/priorityClient', async (orig) => {
  const actual = (await orig()) as object;
  return { ...actual, queryPriority: vi.fn() };
});

import '../src/reports/customerReturns';
import { reportRegistry } from '../src/config/reportRegistry';
import { queryPriority } from '../src/services/priorityClient';

const report = reportRegistry.get('customer-returns')!;

beforeEach(() => {
  vi.mocked(queryPriority).mockReset();
});

describe('customer-returns registration', () => {
  it('registers under id "customer-returns" with entity DOCUMENTS_N and disableCache:true', () => {
    expect(report.id).toBe('customer-returns');
    expect(report.entity).toBe('DOCUMENTS_N');
    expect(report.disableCache).toBe(true);
  });

  it('attachments column is NOT in filterColumns', () => {
    expect(report.filterColumns.find((f) => f.key === 'attachments')).toBeUndefined();
  });

  it('uses clientSidePagination, defines explodeRows, and has NO enrichRows', () => {
    expect(report.clientSidePagination).toBe(true);
    expect(typeof report.explodeRows).toBe('function');
    // WHY: Single $expand query replaced per-document enrichment entirely.
    expect(report.enrichRows).toBeUndefined();
  });

  it('includes the 7 line-item columns, with SKU + Lot copyable', () => {
    const byKey = new Map(report.columns.map((c) => [c.key, c]));
    for (const k of ['sku', 'itemName', 'quantity', 'returnCode', 'returnReason', 'lotNumber', 'expDate']) {
      expect(byKey.has(k)).toBe(true);
    }
    expect(byKey.get('sku')!.copyable).toBe(true);
    expect(byKey.get('lotNumber')!.copyable).toBe(true);
    expect(byKey.get('expDate')!.type).toBe('date');
  });

  it('exposes Return Code/Reason as client-side enum filters', () => {
    const code = report.filterColumns.find((f) => f.key === 'returnCode')!;
    const reason = report.filterColumns.find((f) => f.key === 'returnReason')!;
    expect(code).toMatchObject({ filterType: 'enum', filterLocation: 'client', enumKey: 'returnCodes' });
    expect(reason).toMatchObject({ filterType: 'enum', filterLocation: 'client', enumKey: 'returnReasons' });
  });
});

describe('customer-returns explodeRows + transformRow (inline $expand shapes)', () => {
  it('explodes line items and reads inline remarks (object) + attachments (array)', () => {
    const raw = [{
      DOCNO: 'RT26000014', TYPE: 'N', CURDATE: '2026-05-27T00:00:00Z',
      CUSTNAME: 'C1', CDES: 'Cust One', IVNUM: 'IV1',
      // WHY: $expand returns DOCUMENTSTEXT as an object and EXTFILES as an array.
      DOCUMENTSTEXT_SUBFORM: { TEXT: '<p>fake</p>' },
      EXTFILES_SUBFORM: [{ EXTFILEDES: 'Photo of Bag', EXTFILENUM: 1, SUFFIX: 'png', FILESIZE: 100 }],
      TRANSORDER_N_SUBFORM: [
        { PARTNAME: '10254', PDES: 'Water', TQUANT: 1, TUNITNAME: 'cs', RETREASONCODE: '008', RETREASONDES: 'Damaged In Transit', TOSERIALNAME: '6948', Y_2301_0_ESH: '2027-08-14T00:00:00Z' },
        { PARTNAME: '13623', PDES: 'Baguette', TQUANT: 0, TUNITNAME: 'ea', RETREASONCODE: null, RETREASONDES: null, TOSERIALNAME: 'HD1', Y_2301_0_ESH: '2026-12-22T00:00:00Z' },
      ],
    }];
    const exploded = report.explodeRows!(raw);
    expect(exploded).toHaveLength(2);
    const rows = exploded.map(report.transformRow);
    expect(rows[0]).toMatchObject({ docNo: 'RT26000014', customerId: 'C1', sku: '10254', quantity: '1 cs', returnCode: '008', lotNumber: '6948' });
    expect(rows[1]).toMatchObject({ sku: '13623', quantity: '0 ea', returnCode: null, returnReason: null });
    // WHY: EXTFILES array shape (from $expand) → attachments array. Repeats on
    // each exploded line-item row of the same return.
    expect(rows[0].attachments).toEqual([{ num: 1, filename: 'Photo of Bag.png', sizeBytes: 100 }]);
    expect(rows[1].attachments).toEqual([{ num: 1, filename: 'Photo of Bag.png', sizeBytes: 100 }]);
  });

  it('handles a return with no line items (single blank-line row)', () => {
    const raw = [{ DOCNO: 'RT2', TYPE: 'N', CURDATE: '2026-05-01T00:00:00Z', TRANSORDER_N_SUBFORM: [] }];
    const rows = report.explodeRows!(raw).map(report.transformRow);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ docNo: 'RT2', sku: null, quantity: null });
  });
});

describe('customer-returns fetchFilters', () => {
  it('returns customers + derived returnCodes + returnReasons', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [
        { CUSTNAME: 'C1', CDES: 'Cust One', TRANSORDER_N_SUBFORM: [{ RETREASONCODE: '008', RETREASONDES: 'Damaged In Transit' }] },
        { CUSTNAME: 'C1', CDES: 'Cust One', TRANSORDER_N_SUBFORM: [{ RETREASONCODE: '012', RETREASONDES: 'Wrong Item' }] },
      ],
    });
    const filters = await report.fetchFilters!();
    expect(filters.customers).toEqual([{ value: 'C1', label: 'Cust One (C1)' }]);
    expect(filters.returnCodes).toEqual([
      { value: '008', label: '008 — Damaged In Transit' },
      { value: '012', label: '012 — Wrong Item' },
    ]);
    expect(filters.returnReasons).toEqual([
      { value: 'Damaged In Transit', label: 'Damaged In Transit' },
      { value: 'Wrong Item', label: 'Wrong Item' },
    ]);
  });
});
