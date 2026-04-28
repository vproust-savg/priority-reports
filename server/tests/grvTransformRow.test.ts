// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvTransformRow.test.ts
// PURPOSE: Characterization tests for GRV Log transformRow.
//          Proves transformRow handles all subform shapes
//          (null, undefined, complete, empty TEXT).
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// WHY: Import the registered report to access transformRow.
// The import triggers self-registration; we pull it from the registry.
import '../src/reports/grvLog';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('grv-log')!;
const transformRow = report.transformRow;

// WHY: This is the exact shape that enrichRows writes onto each row.
// With $expand, Priority puts the same shape on the same property.
const FULL_ROW = {
  DOCNO: 'GR26000100',
  TYPE: 'WHIN',
  ORDNAME: 'PO-2026-0042',
  CURDATE: '2025-06-15T00:00:00Z',
  SUPNAME: 'V001',
  CDES: 'Acme Foods',
  STATDES: 'Received',
  TOTPRICE: 1250.50,
  TOWARHSDES: 'Main Warehouse',
  OWNERLOGIN: 'jsmith',
  DOCUMENTSTEXT_SUBFORM: {
    TEXT: '<p>Driver ID : John Smith<br>Licence Plate : ABC-1234</p><div>Truck Temp. °F (dry if ambient) : 34<br>Product Surface Temp. °F : 36</div><p>Condition of Product (accept/reject) : accept<br>Condition of Truck (accept/reject) : accept</p><p>Time of Receiving : 10:30 AM</p><p>Comments : All good</p>',
  },
};

describe('GRV Log transformRow', () => {
  it('extracts all fields from row with complete subform', () => {
    const result = transformRow(FULL_ROW);
    expect(result.date).toBe('2025-06-15T00:00:00Z');
    expect(result.docNo).toBe('GR26000100');
    expect(result.poNumber).toBe('PO-2026-0042');
    expect(result.vendor).toBe('Acme Foods');
    expect(result.warehouse).toBe('Main Warehouse');
    expect(result.status).toBe('Received');
    expect(result.total).toBe(1250.50);
    expect(result.driverId).toBe('John Smith');
    expect(result.licensePlate).toBe('ABC-1234');
    expect(result.truckTemp).toBe('34');
    expect(result.productTemp).toBe('36');
    expect(result.productCondition).toBe('accept');
    expect(result.truckCondition).toBe('accept');
    expect(result.receivingTime).toBe('10:30 AM');
    expect(result.comments).toBe('All good');
    expect(result.receivedBy).toBe('jsmith');
  });

  it('handles null subform (no remarks for this GRV)', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: null };
    const result = transformRow(row);
    expect(result.docNo).toBe('GR26000100');
    expect(result.poNumber).toBe('PO-2026-0042');
    expect(result.vendor).toBe('Acme Foods');
    expect(result.driverId).toBeNull();
    expect(result.licensePlate).toBeNull();
    expect(result.truckTemp).toBeNull();
    expect(result.productTemp).toBeNull();
    expect(result.productCondition).toBeNull();
    expect(result.truckCondition).toBeNull();
    expect(result.comments).toBeNull();
    expect(result.receivingTime).toBeNull();
  });

  it('returns null poNumber when ORDNAME is missing or null', () => {
    const { ORDNAME: _ordname, ...rowWithoutOrdname } = FULL_ROW;
    expect(transformRow(rowWithoutOrdname).poNumber).toBeNull();

    const rowWithNullOrdname = { ...FULL_ROW, ORDNAME: null };
    expect(transformRow(rowWithNullOrdname).poNumber).toBeNull();
  });

  it('handles undefined subform (property missing from response)', () => {
    const { DOCUMENTSTEXT_SUBFORM: _, ...rowWithout } = FULL_ROW;
    const result = transformRow(rowWithout);
    expect(result.docNo).toBe('GR26000100');
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles empty TEXT string', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: '' } };
    const result = transformRow(row);
    expect(result.driverId).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('handles subform with TEXT: null', () => {
    const row = { ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: null } };
    const result = transformRow(row);
    expect(result.driverId).toBeNull();
  });
});
