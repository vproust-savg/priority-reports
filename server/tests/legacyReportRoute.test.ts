// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/legacyReportRoute.test.ts
// PURPOSE: The legacy GET /:reportId data route is retired (env-toggle
//          spec §7): explicit 404 JSON (the production SPA catch-all
//          would otherwise serve index.html), /list still works, and
//          reports.ts keeps registering customer-returns.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { getReport } from '../src/config/reportRegistry';
import { fetchWithRetry } from '../src/services/priorityHttp';

const cache = vi.hoisted(() => ({
  get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), invalidateByPrefix: vi.fn(), isConnected: vi.fn(),
}));
vi.mock('../src/services/cache', () => ({ createCacheProvider: () => cache }));
vi.mock('../src/services/priorityHttp', () => ({
  fetchWithRetry: vi.fn(), extractErrorMessage: vi.fn(),
}));

describe('legacy GET /:reportId retirement', () => {
  it('returns 404 JSON for the retired data route', async () => {
    const res = await request(app).get('/api/v1/reports/grv-log');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/retired/i);
  });

  it('keeps GET /list working', async () => {
    const res = await request(app).get('/api/v1/reports/list');
    expect(res.status).toBe(200);
    const ids = res.body.reports.map((report: { id: string }) => report.id);
    expect(ids).toEqual(expect.arrayContaining([
      'grv-log', 'grv-log-supabase', 'customer-returns', 'customer-returns-supabase',
    ]));
    expect(ids).not.toContain('bbd');
  });

  it.each(['grv-log', 'grv-log-supabase', 'customer-returns', 'customer-returns-supabase'])(
    'dispatches %s to query validation', async (id) => {
      const res = await request(app).post(`/api/v1/reports/${id}/query`).send({ filterGroup: null });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid request body');
    },
  );

  it('still registers customer-returns via side-effect import', () => {
    expect(getReport('customer-returns')).toBeDefined();
  });
});

describe('retired BBD endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([
    ['get', 'extended'],
    ['get', 'filters'],
    ['get', 'subform/example-lot'],
    ['post', 'query'],
    ['post', 'export'],
    ['post', 'refresh'],
    ['post', 'extend'],
  ] as const)('returns a JSON 404 for %s /bbd/%s', async (method, path) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await request(app)[method](`/api/v1/reports/bbd/${path}`);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Report not found: bbd' });
    expect(cache.invalidateByPrefix).not.toHaveBeenCalled();
    expect(fetchWithRetry).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
