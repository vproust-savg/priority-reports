// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvLogSupabase.test.ts
// PURPOSE: Verify the Supabase-backed GRV report: row transform, SQL built by
//          fetchRows, filter column metadata, dropdown queries and export mapping.
//          supabaseDb is mocked — no real database is reachable from tests.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FilterGroup } from '@shared/types';

vi.mock('../src/services/supabaseDb', () => ({
  querySupabase: vi.fn().mockResolvedValue([]),
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

import { transformGrvSupabaseRow } from '../src/reports/grvLogSupabase';
import { reportRegistry } from '../src/config/reportRegistry';
import { querySupabase } from '../src/services/supabaseDb';

const report = () => reportRegistry.get('grv-log-supabase')!;

function emptyGroup(): FilterGroup {
  return { id: 'root', conjunction: 'and', conditions: [], groups: [] };
}

beforeEach(() => {
  vi.mocked(querySupabase).mockReset();
  vi.mocked(querySupabase).mockResolvedValue([]);
});

const raw = {
  docno: 'GR26001234', curdate: '2026-10-27', receiving_time: '09:30', ordname: 'PO26000001',
  vendor_name: 'Acme Foods', towarhsdes: 'Main', statdes: 'Final', totprice: 12.5,
  driver_id: 'D1', license_plate: 'ABC123', truck_temp: '34', product_temp: '36',
  product_condition: 'Accept', truck_condition: 'Clean', ttt_check: null,
  temp_tracker_accepted: 'Yes', comments: 'ok', ownerlogin: 'jdoe',
};

describe('transformGrvSupabaseRow', () => {
  it('formats date as midnight UTC and keeps total a number', () => {
    const row = transformGrvSupabaseRow(raw);
    expect(row.date).toBe('2026-10-27T00:00:00Z');
    expect(row.total).toBe(12.5);
    expect(typeof row.total).toBe('number');
    expect(row.docNo).toBe('GR26001234');
    expect(row.poNumber).toBe('PO26000001');
    expect(row.vendor).toBe('Acme Foods');
    expect(row.warehouse).toBe('Main');
    expect(row.status).toBe('Final');
    expect(row.receivedBy).toBe('jdoe');
  });

  it('keeps a null tracker null and emits every column key', () => {
    const row = transformGrvSupabaseRow(raw);
    expect(row.tttCheck).toBeNull();
    for (const col of report().columns) {
      expect(row).toHaveProperty(col.key);
    }
  });
});

describe('TTT Check', () => {
  it('shows the view\'s ttt_check exactly as computed there', () => {
    // WHY: The view applies the rule (not-cold GRV -> N/A, Yes -> Accept, No stays No);
    // the dashboard must not remap it again.
    for (const value of ['N/A', 'Accept', 'No', 'Y - TempTale 4 QBV31A05S0']) {
      expect(transformGrvSupabaseRow({ ...raw, ttt_check: value }).tttCheck).toBe(value);
    }
    expect(transformGrvSupabaseRow(raw).tttCheck).toBeNull();
  });

  it('selects ttt_check and not the raw tracker answers', async () => {
    await report().fetchRows!(emptyGroup(), { limit: 10 });
    const [sql] = vi.mocked(querySupabase).mock.calls[0];
    expect(sql).toContain('ttt_check');
    expect(sql).not.toContain('temp_tracker_included');
    expect(sql).not.toContain('temp_tracker_accepted');
  });
});

describe('fetchRows', () => {
  it('builds SQL with no where for an empty group', async () => {
    await report().fetchRows!(emptyGroup(), { limit: 5001 });
    const [sql, params] = vi.mocked(querySupabase).mock.calls[0];
    expect(sql).toContain('from priority_reports.grv_receiving_log');
    expect(sql).not.toMatch(/\bwhere\b/i);
    expect(sql).toContain('order by curdate desc, docno desc limit $1');
    expect(params).toEqual([5001]);
  });

  it('numbers the limit param after the filter params', async () => {
    const group: FilterGroup = {
      ...emptyGroup(),
      conditions: [{ id: 'c1', field: 'docNo', operator: 'equals', value: 'x' }],
    };
    await report().fetchRows!(group, { limit: 5001 });
    const [sql, params] = vi.mocked(querySupabase).mock.calls[0];
    expect(sql).toMatch(/where .*docno/i);
    expect(sql).toContain('limit $2');
    expect(params).toEqual(['x', 5001]);
  });

  it('returns the rows querySupabase gives back', async () => {
    vi.mocked(querySupabase).mockResolvedValue([{ docno: 'A' }]);
    expect(await report().fetchRows!(emptyGroup(), { limit: 10 })).toEqual([{ docno: 'A' }]);
  });
});

describe('fetchFilters', () => {
  it('maps the distinct queries to option lists, TTT Check from the view\'s ttt_check', async () => {
    vi.mocked(querySupabase)
      .mockResolvedValueOnce([{ v: 'Acme' }])
      .mockResolvedValueOnce([{ v: 'Main' }])
      .mockResolvedValueOnce([{ v: 'Final' }])
      .mockResolvedValueOnce([{ v: 'Accept' }, { v: 'N/A' }, { v: 'No' }]);
    const result = await report().fetchFilters!();
    expect(result).toEqual({
      vendors: [{ value: 'Acme', label: 'Acme' }],
      warehouses: [{ value: 'Main', label: 'Main' }],
      statuses: [{ value: 'Final', label: 'Final' }],
      tttChecks: [
        { value: 'Accept', label: 'Accept' },
        { value: 'N/A', label: 'N/A' },
        { value: 'No', label: 'No' },
      ],
    });
    const sqls = vi.mocked(querySupabase).mock.calls.map((c) => c[0]);
    expect(sqls[0]).toContain('vendor_name');
    expect(sqls[1]).toContain('towarhsdes');
    expect(sqls[2]).toContain('statdes');
    expect(sqls[3]).toContain('ttt_check');
  });
});

describe('report definition', () => {
  it('has server-side sqlColumn on every filter column', () => {
    const r = report();
    for (const f of r.filterColumns) {
      expect(f.sqlColumn).toBeTruthy();
      expect(f.filterLocation).toBe('server');
    }
    expect(r.filterColumns.map((f) => f.key)).toEqual(r.columns.map((c) => c.key));
  });

  it('has one TTT Check column right after Truck Condition, filtering on ttt_check', () => {
    const r = report();
    const keys = r.columns.map((c) => c.key);
    expect(keys.indexOf('tttCheck')).toBe(keys.indexOf('truckCondition') + 1);
    expect(r.columns.find((c) => c.key === 'tttCheck')!.label).toBe('TTT Check');
    expect(keys).not.toContain('tempTrackerIncluded');
    expect(keys).not.toContain('tempTrackerAccepted');
    const filter = r.filterColumns.find((f) => f.key === 'tttCheck')!;
    expect(filter.sqlColumn).toBe('ttt_check');
    expect(filter.filterType).toBe('enum');
    expect(filter.enumKey).toBe('tttChecks');
  });

  it('exports the 17 page columns inside the official GRV Log form, labelled as on the page', () => {
    const r = report();
    expect(r.name).toBe('GRV Log');
    const cfg = r.exportConfig!;
    expect(cfg.templateRecordId).toBe('recJluOijRUZcZnBS');
    expect(cfg.dataStartRow).toBe(5);
    expect(cfg.sheetName).toBe('Inbound Log 2026');
    expect(cfg.relabelHeaders).toBe(true);
    // One letter per page column, A to Q, in page order
    expect(Object.keys(cfg.mapping)).toEqual('ABCDEFGHIJKLMNOPQ'.split(''));
    expect(Object.values(cfg.mapping)).toEqual(r.columns.map((c) => c.key));
    expect(Object.keys(r.excelStyle!.columnWidths).sort()).toEqual(r.columns.map((c) => c.key).sort());
  });

  it('opts out of caching and paginates client-side', () => {
    expect(report().disableCache).toBe(true);
    expect(report().clientSidePagination).toBe(true);
  });
});
