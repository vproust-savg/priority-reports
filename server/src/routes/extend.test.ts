// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/extend.test.ts
// PURPOSE: Tests for POST /bbd/extend (rowData) and
//          GET /bbd/extended endpoint.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createExtendRouter } from './extend';
import type { CacheProvider } from '../services/cache';

// WHY: Mock all external dependencies at module boundary.
vi.mock('../config/priority', () => ({
  getPriorityConfig: () => ({
    baseUrl: 'https://test.priority.com/odata/',
    username: 'user',
    password: 'pass',
    env: 'uat',
  }),
}));

vi.mock('../services/priorityHttp', () => ({
  fetchWithRetry: vi.fn(),
  postWithRetry: vi.fn(),
  extractErrorMessage: vi.fn((body: string) => body),
}));

vi.mock('../services/airtableShortDated', () => ({
  fetchExtendedItems: vi.fn().mockResolvedValue([]),
  refreshBalancesFromPriority: vi.fn().mockResolvedValue(new Map()),
  mergeBalances: vi.fn().mockReturnValue({ mergedRows: [], changedRecords: [] }),
  batchUpdateAirtableBalances: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/airtableSnapshots', () => ({
  snapshotExtendedItem: vi.fn().mockResolvedValue(undefined),
  snapshotExtendedItemsBatch: vi.fn().mockResolvedValue(undefined),
}));

const { fetchWithRetry, postWithRetry } = await import('../services/priorityHttp');
const { snapshotExtendedItemsBatch } = await import('../services/airtableSnapshots');
const {
  fetchExtendedItems,
  refreshBalancesFromPriority,
  mergeBalances,
  batchUpdateAirtableBalances,
} = await import('../services/airtableShortDated');

const mockFetchWithRetry = vi.mocked(fetchWithRetry);
const mockPostWithRetry = vi.mocked(postWithRetry);
const mockSnapshotBatch = vi.mocked(snapshotExtendedItemsBatch);
const mockFetchExtendedItems = vi.mocked(fetchExtendedItems);
const mockRefreshBalances = vi.mocked(refreshBalancesFromPriority);
const mockMergeBalances = vi.mocked(mergeBalances);
const mockBatchUpdate = vi.mocked(batchUpdateAirtableBalances);

function createMockCache(): CacheProvider {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
}

function createApp(cache: CacheProvider = createMockCache()) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createExtendRouter(cache));
  return app;
}

// WHY: Lookup responses are OData $filter results — {value:[…]} arrays.
function lookupBody(serials: Array<{ name: string; expiry?: string }>): string {
  return JSON.stringify({
    value: serials.map((s) => ({ SERIALNAME: s.name, EXPIRYDATE: s.expiry ?? '2026-04-01T00:00:00Z' })),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- ExtendRequestSchema ---

describe('ExtendRequestSchema', () => {
  const app = createApp();

  it('accepts valid request with rowData', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([{ name: 'LOT001' }]) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    expect(res.status).toBe(200);
  });

  it('accepts valid request without rowData', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([{ name: 'LOT001' }]) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    expect(res.status).toBe(200);
  });

  it('rejects invalid serialName characters', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT<script>', days: 7 }],
    });

    expect(res.status).toBe(400);
  });

  it('rejects days outside 1-365', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 0 }],
    });

    expect(res.status).toBe(400);
  });

  it('rejects empty items array', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [],
    });

    expect(res.status).toBe(400);
  });

  it('rejects items over 100 entries', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      serialName: `LOT${i}`, days: 7,
    }));

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({ items });

    expect(res.status).toBe(400);
  });

  it('accepts rowData with null vendor — normalized to empty string', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([{ name: 'LOT001' }]) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: null,
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
  });

  it('accepts serialName containing a dot', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([{ name: '2518-41.24' }]) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: '2518-41.24', days: 7 }],
    });

    expect(res.status).toBe(200);
  });
});

// --- POST /bbd/extend — rowData ---

describe('POST /bbd/extend — rowData', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: lookupBody([{ name: 'LOT001' }]),
    });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });
    mockSnapshotBatch.mockResolvedValue(undefined);
  });

  it('passes rowData to the snapshot batch after successful extension', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    // WHY: Fire-and-forget — give a tick for the promise to be called
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        serialName: 'LOT001',
        rowData: expect.objectContaining({ partNumber: 'RM001' }),
        newExpiryDate: expect.any(String),
        days: 7,
      }),
    ]);
  });

  it('still succeeds when rowData omitted — backward compatible', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
  });

  it('does not snapshot when rowData omitted', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotBatch).not.toHaveBeenCalled();
  });

  it('does not snapshot failed items', async () => {
    // WHY: Batched $filter lookups return 200 with an empty value array
    // for missing serials (not a 404 like the old single-entity GET).
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([]) });

    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'BADLOT', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotBatch).not.toHaveBeenCalled();
  });

  it('response shape unchanged — rowData not in results', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    expect(res.body.results[0]).not.toHaveProperty('rowData');
    expect(res.body.results[0]).toHaveProperty('serialName');
    expect(res.body.results[0]).toHaveProperty('success');
  });

  it('normalizes null vendor to empty string in the Airtable snapshot', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: null,
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        serialName: 'LOT001',
        rowData: expect.objectContaining({ vendor: '' }),
      }),
    ]);
  });
});

// --- POST /bbd/extend — batched lookups & cache invalidation ---

describe('POST /bbd/extend — batched lookups & cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });
    mockSnapshotBatch.mockResolvedValue(undefined);
  });

  it('batches EXPDSERIAL lookups — one GET per 30 serials', async () => {
    const app = createApp();
    const serials = Array.from({ length: 70 }, (_, i) => `LOT${String(i).padStart(3, '0')}`);
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: lookupBody(serials.map((name) => ({ name }))),
    });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: serials.map((serialName) => ({ serialName, days: 7 })),
    });

    expect(res.status).toBe(200);
    // WHY: ceil(70/30) = 3 lookup calls instead of 70 single-entity GETs.
    expect(mockFetchWithRetry).toHaveBeenCalledTimes(3);
    for (const call of mockFetchWithRetry.mock.calls) {
      expect(call[0]).toContain('EXPDSERIAL?$select=SERIALNAME,EXPIRYDATE');
    }
    expect(mockPostWithRetry).toHaveBeenCalledTimes(70);
    expect(res.body.results).toHaveLength(70);
    expect(res.body.results.every((r: { success: boolean }) => r.success)).toBe(true);
  });

  it('reports lot-not-found for serials missing from the lookup, preserving order', async () => {
    const app = createApp();
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: lookupBody([{ name: 'LOTA' }, { name: 'LOTB' }]),
    });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [
        { serialName: 'LOTA', days: 7 },
        { serialName: 'MISSING', days: 7 },
        { serialName: 'LOTB', days: 7 },
      ],
    });

    expect(res.body.results.map((r: { serialName: string }) => r.serialName))
      .toEqual(['LOTA', 'MISSING', 'LOTB']);
    expect(res.body.results[0].success).toBe(true);
    expect(res.body.results[1].success).toBe(false);
    expect(res.body.results[1].error).toBe('Lot not found in expiration tracking system');
    expect(res.body.results[2].success).toBe(true);
    expect(mockPostWithRetry).toHaveBeenCalledTimes(2);
  });

  it('matches lookup rows whose SERIALNAME carries padding whitespace', async () => {
    const app = createApp();
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: lookupBody([{ name: '  LOT001  ' }]),
    });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    expect(res.body.results[0].success).toBe(true);
  });

  it('reports lookup failure (not lot-not-found) when a lookup chunk errors', async () => {
    const app = createApp();
    mockFetchWithRetry.mockResolvedValue({ status: 500, body: 'Server Error' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    expect(res.body.results[0].success).toBe(false);
    expect(res.body.results[0].error).toContain('Lookup failed');
    expect(mockPostWithRetry).not.toHaveBeenCalled();
  });

  it('invalidates the BBD report cache once after a successful extend', async () => {
    const cache = createMockCache();
    const app = createApp(cache);
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([{ name: 'LOT001' }]) });

    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(cache.invalidateByPrefix).toHaveBeenCalledTimes(1);
    expect(cache.invalidateByPrefix).toHaveBeenCalledWith('query:bbd:');
  });

  it('does not invalidate the cache when every item fails', async () => {
    const cache = createMockCache();
    const app = createApp(cache);
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: lookupBody([]) });

    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(cache.invalidateByPrefix).not.toHaveBeenCalled();
  });
});

// --- GET /bbd/extended ---

describe('GET /bbd/extended — response format', () => {
  const app = createApp();

  it('returns 200 with data array', async () => {
    mockFetchExtendedItems.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns columns array with expected keys', async () => {
    mockFetchExtendedItems.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.body.columns).toBeDefined();
    const keys = res.body.columns.map((c: { key: string }) => c.key);
    expect(keys).toContain('serialName');
    expect(keys).toContain('originalExpiryDate');
    expect(keys).toContain('extensionDate');
  });

  it('returns empty data array when Airtable has no records', async () => {
    mockFetchExtendedItems.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.body.data).toHaveLength(0);
  });

  it('returns pagination meta with totalCount matching data length', async () => {
    const rows = [
      { _recordId: 'rec1', serialName: 'LOT001', partNumber: 'RM001', partDescription: 'Sugar',
        balance: 50, unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme', perishable: 'Yes',
        brand: 'BrandX', family: 'Sweet', originalExpiryDate: '2026-04-01',
        newExpiryDate: '2026-04-08', daysExtended: 7, extensionDate: '2026-04-01T12:00:00Z' },
    ];
    mockFetchExtendedItems.mockResolvedValue(rows);
    mockMergeBalances.mockReturnValue({ mergedRows: rows, changedRecords: [] });

    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.body.pagination.totalCount).toBe(1);
  });

  it('includes source: airtable in meta', async () => {
    mockFetchExtendedItems.mockResolvedValue([]);
    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.body.meta.source).toBe('airtable');
  });
});

describe('GET /bbd/extended — balance refresh', () => {
  const app = createApp();
  const sampleRow = {
    _recordId: 'rec1', serialName: 'LOT001', partNumber: 'RM001', partDescription: 'Sugar',
    balance: 50, unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme', perishable: 'Yes',
    brand: 'BrandX', family: 'Sweet', originalExpiryDate: '2026-04-01',
    newExpiryDate: '2026-04-08', daysExtended: 7, extensionDate: '2026-04-01T12:00:00Z',
  };

  it('calls refreshBalancesFromPriority with lot numbers', async () => {
    mockFetchExtendedItems.mockResolvedValue([sampleRow]);
    mockMergeBalances.mockReturnValue({ mergedRows: [sampleRow], changedRecords: [] });

    await request(app).get('/api/v1/reports/bbd/extended');

    expect(mockRefreshBalances).toHaveBeenCalledWith(['LOT001']);
  });

  it('fires batchUpdateAirtableBalances for changed records', async () => {
    const changed = [{ recordId: 'rec1', balance: 75, value: 187.5 }];
    mockFetchExtendedItems.mockResolvedValue([sampleRow]);
    mockMergeBalances.mockReturnValue({ mergedRows: [sampleRow], changedRecords: changed });

    await request(app).get('/api/v1/reports/bbd/extended');

    await new Promise((r) => setTimeout(r, 10));
    expect(mockBatchUpdate).toHaveBeenCalledWith(changed);
  });

  it('still returns data when Priority refresh fails — adds warning', async () => {
    mockFetchExtendedItems.mockResolvedValue([sampleRow]);
    mockRefreshBalances.mockRejectedValue(new Error('Priority down'));
    mockMergeBalances.mockReturnValue({ mergedRows: [sampleRow], changedRecords: [] });

    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.status).toBe(200);
    expect(res.body.warnings).toBeDefined();
    expect(res.body.warnings[0]).toContain('Balance refresh failed');
  });

  it('strips _recordId from response data', async () => {
    mockFetchExtendedItems.mockResolvedValue([sampleRow]);
    mockMergeBalances.mockReturnValue({ mergedRows: [sampleRow], changedRecords: [] });

    const res = await request(app).get('/api/v1/reports/bbd/extended');

    if (res.body.data.length > 0) {
      expect(res.body.data[0]).not.toHaveProperty('_recordId');
    }
  });
});

describe('GET /bbd/extended — Airtable failure', () => {
  const app = createApp();

  it('returns 502 when Airtable completely unreachable', async () => {
    mockFetchExtendedItems.mockRejectedValue(new Error('Airtable fetch failed: 503'));

    const res = await request(app).get('/api/v1/reports/bbd/extended');

    expect(res.status).toBe(502);
    expect(res.body.error).toContain('Failed to load extended items');
  });
});
