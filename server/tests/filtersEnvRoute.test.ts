// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/filtersEnvRoute.test.ts
// PURPOSE: GET /:reportId/filters validates ?environment, honors it
//          only for opted-in reports, and env-scopes its cache key.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { getRequestPriorityEnv } from '../src/config/priorityEnvContext';
import { env } from '../src/config/environment';

vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn(),
}));
import { createFiltersRouter } from '../src/routes/filters';

function makeStubCache(): CacheProvider & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  const stub = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
  const _typecheck: CacheProvider = stub;
  void _typecheck;
  return stub;
}

function registerFakeReport(id: string, opts: Partial<ReportConfig> = {}): void {
  reportRegistry.set(id, {
    id, name: `Fake ${id}`, entity: 'FAKE',
    columns: [], filterColumns: [],
    buildQuery: () => ({}),
    transformRow: (raw) => raw,
    ...opts,
  });
}

function makeApp(cache: CacheProvider) {
  const app = express();
  app.use('/api/v1/reports', createFiltersRouter(cache));
  return app;
}

describe('GET /:reportId/filters — environment override', () => {
  afterEach(() => {
    reportRegistry.delete('fake-env');
    vi.clearAllMocks();
  });

  it('rejects invalid environment values with 400', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    const res = await request(makeApp(makeStubCache()))
      .get('/api/v1/reports/fake-env/filters?environment=staging');
    expect(res.status).toBe(400);
  });

  it('runs fetchFilters in the UAT scope and env-scopes the cache key', async () => {
    let seenEnv: string | undefined = 'not-called';
    registerFakeReport('fake-env', {
      allowEnvOverride: true,
      fetchFilters: async () => {
        seenEnv = getRequestPriorityEnv();
        return { vendors: [] };
      },
    });
    const cache = makeStubCache();
    const res = await request(makeApp(cache))
      .get('/api/v1/reports/fake-env/filters?environment=uat');

    expect(res.status).toBe(200);
    expect(seenEnv).toBe('uat');
    // Both the read and the write must use the env-scoped key.
    expect(cache.get.mock.calls[0][0]).toBe('filters:fake-env:uat');
    expect(cache.set.mock.calls[0][0]).toBe('filters:fake-env:uat');
  });

  it('ignores the parameter without allowEnvOverride (boot-env key)', async () => {
    let seenEnv: string | undefined = 'not-called';
    registerFakeReport('fake-env', {
      fetchFilters: async () => {
        seenEnv = getRequestPriorityEnv();
        return { vendors: [] };
      },
    });
    const cache = makeStubCache();
    const res = await request(makeApp(cache))
      .get('/api/v1/reports/fake-env/filters?environment=uat');

    expect(res.status).toBe(200);
    // WHY: seenEnv undefined is the real proof the override was ignored
    // (no ALS scope). The key assertion uses the boot env because locally
    // server/.env boots as 'uat' — same VALUE as the ignored parameter,
    // so only the scope check distinguishes them.
    expect(seenEnv).toBeUndefined();
    expect(cache.get.mock.calls[0][0]).toBe(`filters:fake-env:${env.PRIORITY_ENV}`);
  });
});
