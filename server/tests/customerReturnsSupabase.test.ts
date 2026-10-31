// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsSupabase.test.ts
// PURPOSE: Verify the Supabase-backed Customer Returns report: row transform,
//          SQL built by fetchRows (Final rule + user filter), dropdown queries,
//          history-floor warning and the report definition.
//          supabaseDb is mocked — no real database is reachable from tests.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FilterGroup } from '@shared/types';

vi.mock('../src/services/supabaseDb', () => ({
  querySupabase: vi.fn().mockResolvedValue([]),
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

import {
  transformCustomerReturnSupabaseRow,
  buildReturnsHistoryFloorWarnings,
  CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR,
} from '../src/reports/customerReturnsSupabase';
import { reportRegistry } from '../src/config/reportRegistry';
import { querySupabase } from '../src/services/supabaseDb';

const report = () => reportRegistry.get('customer-returns-supabase')!;

const FLOOR_WARNING =
  'This page holds returns from 2026-06-29 on. For earlier dates, use the Customer Returns page.';

function emptyGroup(): FilterGroup {
  return { id: 'root', conjunction: 'and', conditions: [], groups: [] };
}

beforeEach(() => {
  vi.mocked(querySupabase).mockReset();
  vi.mocked(querySupabase).mockResolvedValue([]);
});

describe('transformCustomerReturnSupabaseRow', () => {
  const raw = {
    docno: 'CR26000100', type: 'N', curdate: '2026-10-27', custname: 'C100', cdes: 'Acme Market',
    ivnum: 'CM26000010', requested_by: 'Jane', request_method: 'Email',
    return_details: 'Box crushed\nsecond line', food_safety_concern: 'No',
    files: [{ extfilenum: 1, name: 'Email', suffix: 'png', size: 183335 }],
    kline: 1, partname: 'SKU1', pdes: 'Olive Oil', tquant: '1', tunitname: 'cs',
    retreasoncode: 'R1', retreasondes: 'Damaged', toserialname: 'LOT9', exp_date: '2027-01-31',
  };

  it('maps the view row to the old report row shape', () => {
    const row = transformCustomerReturnSupabaseRow(raw);
    expect(row.date).toBe('2026-10-27T00:00:00Z');
    expect(row.expDate).toBe('2027-01-31T00:00:00Z');
    expect(row.attachments).toEqual([{ num: 1, filename: 'Email.png', sizeBytes: 183335 }]);
    expect(row.quantity).toBe('1 cs');
    expect(row.invoiceNum).toBe('CM26000010');
    expect(row.type).toBe('N');
    expect(row.docNo).toBe('CR26000100');
    expect(row.customerId).toBe('C100');
    expect(row.customerName).toBe('Acme Market');
    expect(row.returnDetails).toBe('Box crushed\nsecond line');
    expect(row.sku).toBe('SKU1');
    expect(row.lotNumber).toBe('LOT9');
    for (const col of report().columns) {
      expect(row).toHaveProperty(col.key);
    }
  });

  it('keeps null dates null, defaults files to [] and keeps a zero quantity', () => {
    const lineless = transformCustomerReturnSupabaseRow({
      ...raw, exp_date: null, files: null, kline: null, partname: null, pdes: null,
      tquant: null, tunitname: null, retreasoncode: null, retreasondes: null, toserialname: null,
    });
    expect(lineless.expDate).toBeNull();
    expect(lineless.attachments).toEqual([]);
    expect(lineless.sku).toBeNull();
    expect(lineless.quantity).toBeNull();

    expect(transformCustomerReturnSupabaseRow({ ...raw, files: [] }).attachments).toEqual([]);
    expect(transformCustomerReturnSupabaseRow({ ...raw, tquant: '0' }).quantity).toBe('0 cs');
    const noSuffix = transformCustomerReturnSupabaseRow({
      ...raw, files: [{ extfilenum: 2, name: 'Email', suffix: '', size: 10 }],
    });
    expect(noSuffix.attachments).toEqual([{ num: 2, filename: 'Email', sizeBytes: 10 }]);
  });
});

describe('fetchRows', () => {
  it('always applies the Final rule and orders lines within a return', async () => {
    await report().fetchRows!(emptyGroup(), { limit: 5001 });
    const [sql, params] = vi.mocked(querySupabase).mock.calls[0];
    expect(sql).toContain('from priority_reports.customer_returns_log');
    expect(sql).toContain("where statdes = 'Final' order by curdate desc, docno desc, kline asc limit $1");
    expect(params).toEqual([5001]);
  });

  it('wraps an or filter in parentheses so it cannot escape the Final rule', async () => {
    const group: FilterGroup = {
      id: 'root', conjunction: 'or', groups: [],
      conditions: [
        { id: 'c1', field: 'sku', operator: 'contains', value: 'ABC' },
        { id: 'c2', field: 'returnDetails', operator: 'contains', value: 'leak' },
      ],
    };
    await report().fetchRows!(group, { limit: 5001 });
    const [sql, params] = vi.mocked(querySupabase).mock.calls[0];
    expect(sql).toMatch(/where statdes = 'Final' and \(.+ OR .+\) order by/);
    expect(sql).toContain('"partname"');
    expect(sql).toContain('"return_details"');
    expect(sql).toContain('limit $3');
    expect(params).toEqual(['ABC', 'leak', 5001]);
  });
});

describe('fetchFilters', () => {
  it('builds the three dropdowns from Final rows only', async () => {
    vi.mocked(querySupabase)
      .mockResolvedValueOnce([
        { custname: 'C100', cdes: 'Acme Market' },
        { custname: 'C100', cdes: 'Acme Market (old)' },
        { custname: 'C200', cdes: null },
      ])
      .mockResolvedValueOnce([{ code: 'R1', des: 'Damaged' }, { code: 'R2', des: null }])
      .mockResolvedValueOnce([{ v: 'Damaged' }]);
    const result = await report().fetchFilters!();
    expect(result).toEqual({
      customers: [
        { value: 'C100', label: 'Acme Market (C100)' },
        { value: 'C200', label: 'C200 (C200)' },
      ],
      returnCodes: [
        { value: 'R1', label: 'R1 — Damaged' },
        { value: 'R2', label: 'R2' },
      ],
      returnReasons: [{ value: 'Damaged', label: 'Damaged' }],
    });
    const sqls = vi.mocked(querySupabase).mock.calls.map((c) => c[0]);
    expect(sqls).toHaveLength(3);
    for (const sql of sqls) expect(sql).toContain("statdes = 'Final'");
  });
});

describe('buildReturnsHistoryFloorWarnings', () => {
  it('pins the floor to the first synced return date', () => {
    expect(CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR).toBe('2026-06-29');
  });

  it('is silent for a range inside the held history', () => {
    const group: FilterGroup = {
      ...emptyGroup(),
      conditions: [{ id: 'c1', field: 'date', operator: 'isBetween', value: '2026-10-01', valueTo: '2026-10-31' }],
    };
    expect(buildReturnsHistoryFloorWarnings(group)).toEqual([]);
  });

  it('warns when the filter could reach earlier dates', () => {
    expect(buildReturnsHistoryFloorWarnings(emptyGroup())).toEqual([FLOOR_WARNING]);
    expect(report().queryWarnings).toBe(buildReturnsHistoryFloorWarnings);
  });
});

describe('report definition', () => {
  it('keeps the old page column keys in order', () => {
    expect(report().columns.map((c) => c.key)).toEqual([
      'date', 'docNo', 'customerId', 'customerName', 'invoiceNum', 'requestedBy', 'requestMethod',
      'returnDetails', 'foodSafetyConcern', 'attachments', 'sku', 'itemName', 'quantity',
      'returnCode', 'returnReason', 'lotNumber', 'expDate',
    ]);
  });

  it('labels the invoice column Credit Memo #', () => {
    expect(report().columns.find((c) => c.key === 'invoiceNum')!.label).toBe('Credit Memo #');
    expect(report().filterColumns.find((c) => c.key === 'invoiceNum')!.label).toBe('Credit Memo #');
  });

  it('filters every column in SQL', () => {
    for (const col of report().filterColumns) {
      expect(col.filterLocation).toBe('server');
      expect(col.sqlColumn).toBeTruthy();
    }
  });

  it('has no explode, refresh or template export and opts out of caching', () => {
    const r = report();
    expect(r.explodeRows).toBeUndefined();
    expect(r.refreshSource).toBeUndefined();
    expect(r.exportConfig).toBeUndefined();
    expect(r.disableCache).toBe(true);
    expect(r.clientSidePagination).toBe(true);
  });
});
