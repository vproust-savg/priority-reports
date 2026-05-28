// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsBuildQuery.test.ts
// PURPOSE: Unit tests for Customer Returns OData query builder
//          and column definitions.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// WHY: Side-effect import — registers customer-returns into reportRegistry.
import '../src/reports/customerReturns';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('customer-returns')!;

describe('Customer Returns buildQuery', () => {
  it('$select includes composite key + 4 user fields', () => {
    const q = report.buildQuery({});
    expect(q.$select).toBe('DOCNO,TYPE,CURDATE,CUSTNAME,CDES,IVNUM');
  });

  it('applies CURDATE ge/le when from and to provided', () => {
    const q = report.buildQuery({ from: '2026-05-01', to: '2026-05-27' });
    expect(q.$filter).toContain('CURDATE ge 2026-05-01T00:00:00Z');
    expect(q.$filter).toContain('CURDATE le 2026-05-27T23:59:59Z');
    expect(q.$filter).toContain(' and ');
  });

  it('omits $filter when no filters provided', () => {
    expect(report.buildQuery({}).$filter).toBeUndefined();
  });

  it('pagination: $top and $skip respect page/pageSize', () => {
    const q = report.buildQuery({ page: 3, pageSize: 25 });
    expect(q.$top).toBe(25);
    expect(q.$skip).toBe(50);
  });

  it('defaults to page=1, pageSize=50', () => {
    const q = report.buildQuery({});
    expect(q.$top).toBe(50);
    expect(q.$skip).toBe(0);
  });

  it('$orderby is CURDATE desc', () => {
    expect(report.buildQuery({}).$orderby).toBe('CURDATE desc');
  });
});

describe('Customer Returns columns', () => {
  it('has exactly 10 columns with expected keys in order', () => {
    expect(report.columns.map((c) => c.key)).toEqual([
      'date',
      'docNo',
      'customerId',
      'customerName',
      'invoiceNum',
      'requestedBy',
      'requestMethod',
      'returnDetails',
      'foodSafetyConcern',
      'attachments',
    ]);
  });

  it('docNo, customerId, invoiceNum are copyable', () => {
    const c = (key: string) => report.columns.find((x) => x.key === key)!;
    expect(c('docNo').copyable).toBe(true);
    expect(c('customerId').copyable).toBe(true);
    expect(c('invoiceNum').copyable).toBe(true);
  });

  it('attachments column is NOT in filterColumns', () => {
    expect(report.filterColumns.find((f) => f.key === 'attachments')).toBeUndefined();
  });

  it('report is registered with id "customer-returns" and entity "DOCUMENTS_N"', () => {
    expect(report.id).toBe('customer-returns');
    expect(report.entity).toBe('DOCUMENTS_N');
    expect(report.disableCache).toBe(true);
  });
});
