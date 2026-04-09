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
  snapshotExtendedItem: vi.fn().mockResolvedValue(undefined),
  fetchExtendedItems: vi.fn().mockResolvedValue([]),
  refreshBalancesFromPriority: vi.fn().mockResolvedValue(new Map()),
  mergeBalances: vi.fn().mockReturnValue({ mergedRows: [], changedRecords: [] }),
  batchUpdateAirtableBalances: vi.fn().mockResolvedValue(undefined),
}));

const { fetchWithRetry, postWithRetry } = await import('../services/priorityHttp');
const {
  snapshotExtendedItem,
  fetchExtendedItems,
  refreshBalancesFromPriority,
  mergeBalances,
  batchUpdateAirtableBalances,
} = await import('../services/airtableShortDated');

const mockFetchWithRetry = vi.mocked(fetchWithRetry);
const mockPostWithRetry = vi.mocked(postWithRetry);
const mockSnapshotExtendedItem = vi.mocked(snapshotExtendedItem);
const mockFetchExtendedItems = vi.mocked(fetchExtendedItems);
const mockRefreshBalances = vi.mocked(refreshBalancesFromPriority);
const mockMergeBalances = vi.mocked(mergeBalances);
const mockBatchUpdate = vi.mocked(batchUpdateAirtableBalances);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createExtendRouter());
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// --- ExtendRequestSchema ---

describe('ExtendRequestSchema', () => {
  const app = createApp();

  it('accepts valid request with rowData', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: JSON.stringify({ EXPIRYDATE: '2026-04-01T00:00:00Z' }) });
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
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: JSON.stringify({ EXPIRYDATE: '2026-04-01T00:00:00Z' }) });
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
});

// --- POST /bbd/extend — rowData ---

describe('POST /bbd/extend — rowData', () => {
  const app = createApp();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithRetry.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ EXPIRYDATE: '2026-04-01T00:00:00Z' }),
    });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });
    mockSnapshotExtendedItem.mockResolvedValue(undefined);
  });

  it('passes rowData to snapshotExtendedItem after successful extension', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    // WHY: Fire-and-forget — give a tick for the promise to be called
    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotExtendedItem).toHaveBeenCalledWith(
      'LOT001',
      expect.objectContaining({ partNumber: 'RM001' }),
      expect.any(String),
      7,
    );
  });

  it('still succeeds when rowData omitted — backward compatible', async () => {
    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
  });

  it('does not call snapshotExtendedItem when rowData omitted', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7 }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotExtendedItem).not.toHaveBeenCalled();
  });

  it('does not call snapshotExtendedItem for failed items', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 404, body: 'Not Found' });

    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'BADLOT', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotExtendedItem).not.toHaveBeenCalled();
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
