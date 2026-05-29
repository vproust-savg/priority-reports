// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsLineItems.test.ts
// PURPOSE: Unit tests for the Customer Returns line-item helpers —
//          explosion, field mapping, quantity formatting, enum options.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  formatQuantityUnit,
  explodeReturnRows,
  lineItemFields,
  collectReturnFilterOptions,
} from '../src/services/customerReturnsLineItems';

describe('formatQuantityUnit', () => {
  it('combines quantity and unit', () => {
    expect(formatQuantityUnit(1, 'cs')).toBe('1 cs');
  });

  it('keeps zero (a real quantity, not missing)', () => {
    expect(formatQuantityUnit(0, 'ea')).toBe('0 ea');
  });

  it('returns just the number when unit is absent', () => {
    expect(formatQuantityUnit(5, null)).toBe('5');
    expect(formatQuantityUnit(5, '')).toBe('5');
  });

  it('returns null when quantity is missing', () => {
    expect(formatQuantityUnit(null, 'cs')).toBeNull();
    expect(formatQuantityUnit(undefined, 'cs')).toBeNull();
    expect(formatQuantityUnit('', 'cs')).toBeNull();
  });
});

describe('explodeReturnRows', () => {
  it('emits one row per line item, preserving document fields', () => {
    const rows = [
      {
        DOCNO: 'RT1', TYPE: 'N',
        TRANSORDER_N_SUBFORM: [{ PARTNAME: 'A' }, { PARTNAME: 'B' }],
      },
    ];
    const out = explodeReturnRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0].DOCNO).toBe('RT1');
    expect(out[1].DOCNO).toBe('RT1');
    expect(lineItemFields(out[0]).sku).toBe('A');
    expect(lineItemFields(out[1]).sku).toBe('B');
  });

  it('emits a single blank row when a return has no line items', () => {
    const out = explodeReturnRows([{ DOCNO: 'RT2', TYPE: 'N', TRANSORDER_N_SUBFORM: [] }]);
    expect(out).toHaveLength(1);
    expect(out[0].DOCNO).toBe('RT2');
    expect(lineItemFields(out[0]).sku).toBeNull();
  });

  it('treats a missing subform as zero line items (still one row)', () => {
    const out = explodeReturnRows([{ DOCNO: 'RT3', TYPE: 'N' }]);
    expect(out).toHaveLength(1);
    expect(lineItemFields(out[0]).sku).toBeNull();
  });

  // WHY: Line items come from the parent $expand, so they must survive even when
  // remarks/attachments enrichment never ran (explodeRows is independent of it).
  it('explodes regardless of remarks/attachments enrichment', () => {
    const rows = [{ DOCNO: 'RT4', TYPE: 'N', TRANSORDER_N_SUBFORM: [{ PARTNAME: 'X' }] }];
    const out = explodeReturnRows(rows);
    expect(out).toHaveLength(1);
    expect(lineItemFields(out[0]).sku).toBe('X');
  });
});

describe('lineItemFields', () => {
  it('maps all seven display fields from a line item', () => {
    const raw = explodeReturnRows([{
      TRANSORDER_N_SUBFORM: [{
        PARTNAME: '10254', PDES: 'Sparkling Water', TQUANT: 1, TUNITNAME: 'cs',
        RETREASONCODE: '008', RETREASONDES: 'Damaged In Transit',
        TOSERIALNAME: '6948', Y_2301_0_ESH: '2027-08-14T00:00:00Z',
      }],
    }])[0];
    expect(lineItemFields(raw)).toEqual({
      sku: '10254',
      itemName: 'Sparkling Water',
      quantity: '1 cs',
      returnCode: '008',
      returnReason: 'Damaged In Transit',
      lotNumber: '6948',
      expDate: '2027-08-14T00:00:00Z',
    });
  });

  it('returns all-null fields for a no-line-item row', () => {
    const raw = explodeReturnRows([{ TRANSORDER_N_SUBFORM: [] }])[0];
    expect(lineItemFields(raw)).toEqual({
      sku: null, itemName: null, quantity: null, returnCode: null,
      returnReason: null, lotNumber: null, expDate: null,
    });
  });
});

describe('collectReturnFilterOptions', () => {
  const rows = [
    { TRANSORDER_N_SUBFORM: [
      { RETREASONCODE: '008', RETREASONDES: 'Damaged In Transit' },
      { RETREASONCODE: null, RETREASONDES: null },
    ] },
    { TRANSORDER_N_SUBFORM: [
      { RETREASONCODE: '008', RETREASONDES: 'Damaged In Transit' }, // dup
      { RETREASONCODE: '012', RETREASONDES: 'Wrong Item' },
    ] },
  ];

  it('dedupes codes and reasons with value = stored value', () => {
    const { returnCodes, returnReasons } = collectReturnFilterOptions(rows);
    expect(returnCodes).toEqual([
      { value: '008', label: '008 — Damaged In Transit' },
      { value: '012', label: '012 — Wrong Item' },
    ]);
    expect(returnReasons).toEqual([
      { value: 'Damaged In Transit', label: 'Damaged In Transit' },
      { value: 'Wrong Item', label: 'Wrong Item' },
    ]);
  });

  it('skips null codes/reasons', () => {
    const { returnCodes, returnReasons } = collectReturnFilterOptions([
      { TRANSORDER_N_SUBFORM: [{ RETREASONCODE: null, RETREASONDES: null }] },
    ]);
    expect(returnCodes).toEqual([]);
    expect(returnReasons).toEqual([]);
  });
});
