// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryDisableCache.test.ts
// PURPOSE: Verify the POST /:reportId/query route honors the
//          ReportConfig.disableCache flag — skips Redis read AND write.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { createQueryRouter } from '../src/routes/query';

// WHY: queryPriority hits the real Priority API by default — mock the
// priority client so the test stays hermetic.
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn().mockResolvedValue({ value: [{ DOCNO: 'X', TYPE: 'P' }] }),
  querySubform: vi.fn(),
}));

// WHY: Returns the structural CacheProvider directly (no cast) so TypeScript
// catches if the interface grows another method. The intersection type lets
// tests read .mock.calls on get/set without re-asserting.
function makeStubCache(): CacheProvider & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  const stub = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
  // Structural check — fails compilation if CacheProvider gains a method.
  const _typecheck: CacheProvider = stub;
  void _typecheck;
  return stub;
}

function registerFakeReport(id: string, opts: Partial<ReportConfig> = {}): void {
  reportRegistry.set(id, {
    id,
    name: `Fake ${id}`,
    entity: 'FAKE',
    columns: [{ key: 'docNo', label: 'GRV #', type: 'string' }],
    filterColumns: [],
    buildQuery: () => ({ $select: 'DOCNO,TYPE', $top: 50, $skip: 0 }),
    transformRow: (raw) => ({ docNo: raw.DOCNO }),
    ...opts,
  });
}

function makeApp(cache: CacheProvider) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createQueryRouter(cache));
  return app;
}

const emptyBody = {
  filterGroup: { id: 'root', conjunction: 'and' as const, conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('POST /:reportId/query — disableCache gate', () => {
  afterEach(() => {
    reportRegistry.delete('fake-disabled');
    reportRegistry.delete('fake-cached');
    vi.clearAllMocks();
  });

  it('skips cache.get and cache.set when report.disableCache is true', async () => {
    registerFakeReport('fake-disabled', { disableCache: true });
    const cache = makeStubCache();

    const res = await request(makeApp(cache))
      .post('/api/v1/reports/fake-disabled/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(cache.get).not.toHaveBeenCalled();
    // WHY: cache.set is fire-and-forget (`.catch()` on the promise). Two
    // microtask ticks drain the .catch and any downstream then-chains
    // without depending on Node-specific setImmediate.
    await Promise.resolve();
    await Promise.resolve();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('still uses cache when report.disableCache is undefined', async () => {
    registerFakeReport('fake-cached'); // no disableCache
    const cache = makeStubCache();

    const res = await request(makeApp(cache))
      .post('/api/v1/reports/fake-cached/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(cache.get).toHaveBeenCalledTimes(1);
    await new Promise((r) => setImmediate(r));
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
