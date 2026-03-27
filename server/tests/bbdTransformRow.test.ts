// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/bbdTransformRow.test.ts
// PURPOSE: Tests for BBD report transformRow — new fields
//          (receivingDate, value, serialName, purchasePrice).
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getReport } from '../src/config/reportRegistry';

// WHY: Import bbdReport for side-effect registration into reportRegistry.
import '../src/reports/bbdReport';

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

  it('computes value = QUANT * Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
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
    });
    expect(row.value).toBe(0);
    expect(row.purchasePrice).toBe(0);
  });
});
