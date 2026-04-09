// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/airtableShortDated.test.ts
// PURPOSE: Tests for Airtable Short-Dated Items service — pure
//          functions and mocked I/O operations.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  mergeBalances,
  snapshotExtendedItem,
  fetchExtendedItems,
  refreshBalancesFromPriority,
  batchUpdateAirtableBalances,
} from './airtableShortDated';
import type { RowData } from './airtableShortDated';

// WHY: Mock environment and Priority modules at module boundary.
vi.mock('../config/environment', () => ({
  env: { AIRTABLE_TOKEN: 'test-token' },
}));

vi.mock('../config/priority', () => ({
  getPriorityConfig: () => ({
    baseUrl: 'https://test.priority.com/odata/',
    username: 'user',
    password: 'pass',
    env: 'uat',
  }),
}));

vi.mock('./priorityHttp', () => ({
  fetchWithRetry: vi.fn(),
}));

const { fetchWithRetry } = await import('./priorityHttp');
const mockFetchWithRetry = vi.mocked(fetchWithRetry);

// --- mergeBalances (pure function) ---

describe('mergeBalances', () => {
  const makeRow = (overrides = {}) => ({
    _recordId: 'recABC',
    serialName: 'LOT001',
    partNumber: 'RM001',
    partDescription: 'Sugar',
    balance: 50,
    unit: 'KG',
    value: 125,
    purchasePrice: 2.5,
    vendor: 'Acme',
    perishable: 'Yes',
    brand: 'BrandX',
    family: 'Sweeteners',
    originalExpiryDate: '2026-04-01',
    newExpiryDate: '2026-04-08',
    daysExtended: 7,
    extensionDate: '2026-04-01T12:00:00.000Z',
    ...overrides,
  });

  it('updates balance with Priority value when positive', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5 })];
    const priorityMap = new Map([['LOT001', { balance: 75, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(75);
  });

  it('preserves all other fields when merging', () => {
    const rows = [makeRow()];
    const priorityMap = new Map([['LOT001', { balance: 75, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].partNumber).toBe('RM001');
    expect(mergedRows[0].vendor).toBe('Acme');
    expect(mergedRows[0].originalExpiryDate).toBe('2026-04-01');
  });

  it('handles zero balance — does not treat 0 as missing', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5 })];
    const priorityMap = new Map([['LOT001', { balance: 0, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(0);
    expect(mergedRows[0].value).toBe(0);
  });

  it('handles missing Priority data — keeps existing Airtable balance unchanged', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5, value: 125 })];
    const priorityMap = new Map();
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(50);
    expect(mergedRows[0].value).toBe(125);
  });

  it('recalculates value rounded to 2 decimal places — no floating-point drift', () => {
    const rows = [makeRow({ balance: 0, purchasePrice: 1.1 })];
    const priorityMap = new Map([['LOT001', { balance: 1.1, purchasePrice: 1.1 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].value).toBe(1.21);
  });

  it('returns empty changedRecords list when all balances match Airtable values', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5, value: 125 })];
    const priorityMap = new Map([['LOT001', { balance: 50, purchasePrice: 2.5 }]]);
    const { changedRecords } = mergeBalances(rows, priorityMap);
    expect(changedRecords).toHaveLength(0);
  });

  it('recalculates value as balance x purchasePrice', () => {
    const rows = [makeRow({ balance: 10, purchasePrice: 3 })];
    const priorityMap = new Map([['LOT001', { balance: 20, purchasePrice: 3 }]]);
    const { mergedRows, changedRecords } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].value).toBe(60);
    expect(changedRecords).toHaveLength(1);
    expect(changedRecords[0].recordId).toBe('recABC');
  });
});

// --- snapshotExtendedItem ---

describe('snapshotExtendedItem', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  const sampleRowData: RowData = {
    partNumber: 'RM001',
    partDescription: 'Sugar',
    balance: 50,
    unit: 'KG',
    value: 125,
    purchasePrice: 2.5,
    vendor: 'Acme',
    perishable: 'Yes',
    brand: 'BrandX',
    family: 'Sweeteners',
    expiryDate: '2026-04-01T00:00:00Z',
  };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes new Airtable record when lot not yet snapshotted', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const postCall = mockFetch.mock.calls[1];
    expect(postCall[1].method).toBe('POST');
    const body = JSON.parse(postCall[1].body);
    expect(body.records[0].fields).toBeDefined();
  });

  it('upserts existing record when lot already exists', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: 'recXYZ', fields: { fldPWiPg4gTuEpb7S: 3 } }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    const patchCall = mockFetch.mock.calls[1];
    expect(patchCall[1].method).toBe('PATCH');
    const body = JSON.parse(patchCall[1].body);
    expect(body.records[0].id).toBe('recXYZ');
  });

  it('does not overwrite originalExpiryDate on second call', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: 'recXYZ', fields: { fldPWiPg4gTuEpb7S: 3 } }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    const fieldKeys = Object.keys(body.records[0].fields);
    // WHY: originalExpiryDate field ID should NOT be in PATCH payload
    expect(fieldKeys).not.toContain('fldyuY9YkSEbWTPtB');
  });

  it('stores all rowData fields on POST', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    const fields = body.records[0].fields;
    expect(fields).toHaveProperty('fldoXQnAMpUjSu2Bx', 'RM001'); // partNumber
    expect(fields).toHaveProperty('fldi6NqDttCM94WzZ', 'Acme'); // vendor
  });

  it('does not throw when Airtable unavailable — calls console.warn with lot number', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LOT001'));
  });

  it('handles undefined rowData — does not crash on property access', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await expect(
      snapshotExtendedItem('LOT001', undefined, '2026-04-08T00:00:00Z', 7),
    ).resolves.not.toThrow();
  });

  it('includes typecast: true in POST/PATCH body', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await snapshotExtendedItem('LOT001', sampleRowData, '2026-04-08T00:00:00Z', 7);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.typecast).toBe(true);
  });
});

// --- refreshBalancesFromPriority ---

describe('refreshBalancesFromPriority', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty Map when input is empty — does not call Priority', async () => {
    const result = await refreshBalancesFromPriority([]);
    expect(result.size).toBe(0);
    expect(mockFetchWithRetry).not.toHaveBeenCalled();
  });

  it('chunks 31 lot numbers into two separate Priority queries', async () => {
    const lots = Array.from({ length: 31 }, (_, i) => `LOT${String(i).padStart(3, '0')}`);
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: JSON.stringify({ value: [] }) });

    await refreshBalancesFromPriority(lots);

    expect(mockFetchWithRetry).toHaveBeenCalledTimes(2);
  });

  it('merges results from multiple chunks into one Map', async () => {
    const lots = Array.from({ length: 31 }, (_, i) => `LOT${String(i).padStart(3, '0')}`);
    mockFetchWithRetry
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ value: [{ SERIALNAME: 'LOT000', QUANT: 10, Y_8737_0_ESH: 2 }] }),
      })
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ value: [{ SERIALNAME: 'LOT030', QUANT: 20, Y_8737_0_ESH: 3 }] }),
      });

    const result = await refreshBalancesFromPriority(lots);

    expect(result.size).toBe(2);
    expect(result.get('LOT000')?.balance).toBe(10);
    expect(result.get('LOT030')?.balance).toBe(20);
  });

  it('returns Map keyed by trimmed SERIALNAME', async () => {
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ value: [{ SERIALNAME: '  LOT001  ', QUANT: 10, Y_8737_0_ESH: 2 }] }),
    });

    const result = await refreshBalancesFromPriority(['LOT001']);

    expect(result.has('LOT001')).toBe(true);
  });

  it('continues on non-2xx chunk — warns and skips', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 500, body: 'Server Error' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await refreshBalancesFromPriority(['LOT001']);

    expect(warnSpy).toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});

// --- batchUpdateAirtableBalances ---

describe('batchUpdateAirtableBalances', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no-op when updates array is empty — fetch not called', async () => {
    await batchUpdateAirtableBalances([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends one PATCH for 10 or fewer records', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const updates = Array.from({ length: 10 }, (_, i) => ({
      recordId: `rec${i}`,
      balance: i * 10,
      value: i * 25,
    }));

    await batchUpdateAirtableBalances(updates);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('sends two PATCHes for 11 records — splits at batch size 10', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const updates = Array.from({ length: 11 }, (_, i) => ({
      recordId: `rec${i}`,
      balance: i * 10,
      value: i * 25,
    }));

    await batchUpdateAirtableBalances(updates);

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('each PATCH body uses field IDs not field names', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const updates = [{ recordId: 'rec1', balance: 50, value: 125 }];

    await batchUpdateAirtableBalances(updates);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const fieldKeys = Object.keys(body.records[0].fields);
    // WHY: Should use field IDs (fld...) not names
    expect(fieldKeys.every((k) => k.startsWith('fld'))).toBe(true);
  });
});

// --- fetchExtendedItems ---

describe('fetchExtendedItems', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when no Airtable records', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [] }),
    });

    const result = await fetchExtendedItems();
    expect(result).toHaveLength(0);
  });

  it('transforms Airtable field IDs to report key names', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [{
          id: 'recABC',
          fields: {
            fldkTERhjx4Nq2Xdj: 'LOT001',
            fldoXQnAMpUjSu2Bx: 'RM001',
            fldd0k61OHJWMGjzi: 'Sugar',
            fldVzVKOOabR0ggLw: 50,
            fldaHPFg3Kx50BM0h: 'KG',
            fldn4AaeqjPJy9n97: 125,
            fldMzTMbgo4M5Bwtg: 2.5,
            fldi6NqDttCM94WzZ: 'Acme',
            // WHY: With returnFieldsByFieldId=true, singleSelect returns plain string.
            fldsVAgVQPbAqE6Ua: 'Yes',
            fld5BAG6CMGvme9o5: 'BrandX',
            fld4VW5P7L2LH1IFW: 'Sweeteners',
            fldyuY9YkSEbWTPtB: '2026-04-01',
            fldfUUJcWVuH8fU4B: '2026-04-08',
            fldPWiPg4gTuEpb7S: 7,
            fldzmoSH9PPOFxibL: '2026-04-01T12:00:00.000Z',
          },
        }],
      }),
    });

    const result = await fetchExtendedItems();
    expect(result[0].serialName).toBe('LOT001');
    expect(result[0].partNumber).toBe('RM001');
    expect(result[0].perishable).toBe('Yes');
    expect(result[0]._recordId).toBe('recABC');
  });

  it('handles perishable field as plain string (returnFieldsByFieldId)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [{
          id: 'recABC',
          fields: { fldsVAgVQPbAqE6Ua: 'No' },
        }],
      }),
    });

    const result = await fetchExtendedItems();
    expect(result[0].perishable).toBe('No');
  });

  it('throws on Airtable API failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });

    await expect(fetchExtendedItems()).rejects.toThrow('Airtable fetch failed: 503');
  });

  it('paginates with offset cursor', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: 'rec1', fields: { fldkTERhjx4Nq2Xdj: 'LOT001' } }],
          offset: 'next-page',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          records: [{ id: 'rec2', fields: { fldkTERhjx4Nq2Xdj: 'LOT002' } }],
        }),
      });

    const result = await fetchExtendedItems();
    expect(result).toHaveLength(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // WHY: Second call should include offset parameter
    expect(mockFetch.mock.calls[1][0]).toContain('offset=next-page');
  });

  it('sorts by extensionDate descending', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          { id: 'rec1', fields: { fldkTERhjx4Nq2Xdj: 'OLD', fldzmoSH9PPOFxibL: '2026-01-01T00:00:00Z' } },
          { id: 'rec2', fields: { fldkTERhjx4Nq2Xdj: 'NEW', fldzmoSH9PPOFxibL: '2026-04-01T00:00:00Z' } },
        ],
      }),
    });

    const result = await fetchExtendedItems();
    expect(result[0].serialName).toBe('NEW');
    expect(result[1].serialName).toBe('OLD');
  });
});
