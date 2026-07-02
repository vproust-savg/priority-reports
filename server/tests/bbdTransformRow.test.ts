// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/bbdTransformRow.test.ts
// PURPOSE: Tests for BBD report — transformRow fields, sumBinBalances,
//          buildQuery shape, and filterRows exclusion.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getReport } from '../src/config/reportRegistry';

// WHY: Named import also side-effect-registers the report into reportRegistry.
import { sumBinBalances } from '../src/reports/bbdReport';

describe('bbdReport transformRow', () => {
  const report = getReport('bbd')!;

  it('includes receivingDate from CURDATE', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: 'Brand1', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
    });
    expect(row.receivingDate).toBe('2026-02-05T00:00:00Z');
  });

  it('computes value = bin balance sum * Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 6 }, { BALANCE: 4 }],
    });
    expect(row.value).toBeCloseTo(339.7, 2);
  });

  it('outputs serialName from SERIALNAME', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 5, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'Yes', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'ABC123',
    });
    expect(row.serialName).toBe('ABC123');
  });

  it('outputs purchasePrice from Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 1, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 21.69,
      SERIALNAME: '000',
    });
    expect(row.purchasePrice).toBe(21.69);
  });

  it('value is 0 when Y_8737_0_ESH is 0', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 84, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 0,
      SERIALNAME: '000',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 84 }],
    });
    expect(row.value).toBe(0);
  });

  it('value is 0 when Y_8737_0_ESH is null', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: null,
      SERIALNAME: '000',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 10 }],
    });
    expect(row.value).toBe(0);
    expect(row.purchasePrice).toBe(0);
  });

  it('balance = sum of RAWSERIALBAL_SUBFORM bins, not QUANT', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L1',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 3 }, { BALANCE: 4 }],
    });
    expect(row.balance).toBe(7);
  });

  it('balance is 0 when the lot has no bin rows (fully consumed)', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L2',
      RAWSERIALBAL_SUBFORM: [],
    });
    expect(row.balance).toBe(0);
    expect(row.value).toBe(0);
  });

  it('balance goes negative when bins net below zero', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L3',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 2 }, { BALANCE: -5 }],
    });
    expect(row.balance).toBe(-3);
  });
});

describe('sumBinBalances', () => {
  it('sums BALANCE across multiple bins', () => {
    expect(sumBinBalances([{ BALANCE: 3 }, { BALANCE: 2 }])).toBe(5);
  });

  it('counts negative bins against the total', () => {
    expect(sumBinBalances([{ BALANCE: 5 }, { BALANCE: -7 }])).toBe(-2);
  });

  it('returns 0 for an empty array', () => {
    expect(sumBinBalances([])).toBe(0);
  });

  it('returns 0 when the sub-form is missing', () => {
    expect(sumBinBalances(undefined)).toBe(0);
  });

  it('coerces numeric-string BALANCE values', () => {
    expect(sumBinBalances([{ BALANCE: '4' }, { BALANCE: '1.5' }])).toBe(5.5);
  });

  it('treats missing or non-numeric BALANCE as 0', () => {
    expect(sumBinBalances([{}, { BALANCE: 'abc' }, { BALANCE: 2 }])).toBe(2);
  });
});

describe('bbdReport buildQuery', () => {
  const report = getReport('bbd')!;

  it('expands RAWSERIALBAL_SUBFORM with nested $select on BALANCE', () => {
    const params = report.buildQuery({});
    expect(params.$expand).toBe('RAWSERIALBAL_SUBFORM($select=BALANCE)');
  });

  it('fetches up to 5000 rows to clear the 2000-row truncation', () => {
    const params = report.buildQuery({});
    expect(params.$top).toBe(5000);
  });
});
