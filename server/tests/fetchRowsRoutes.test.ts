// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/fetchRowsRoutes.test.ts
// PURPOSE: Verify the optional fetchRows / refreshSource / queryWarnings
//          report hooks in the query, export, filters and refresh routes.
//          Fake reports only — the real Supabase report arrives later.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { createQueryRouter } from '../src/routes/query';
import { createExportRouter } from '../src/routes/export';
import { createFiltersRouter } from '../src/routes/filters';
import { createQueryRefreshRouter } from '../src/routes/queryRefresh';
import { queryPriority } from '../src/services/priorityClient';
import { applyServerClientFilters } from '../src/services/serverClientFilter';
import { getTemplate } from '../src/services/templateService';
import { generateFallbackExcel } from '../src/services/excelExporter';
import { SupabaseNotConfiguredError } from '../src/services/supabaseDb';

// WHY: Hermetic — a fetchRows report must never reach Priority.
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn().mockResolvedValue({ value: [{ DOCNO: 'P1' }] }),
  querySubform: vi.fn(),
}));
vi.mock('../src/services/templateService', () => ({
  getTemplate: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/services/excelExporter', () => ({
  generateTemplateExcel: vi.fn(),
  generateFallbackExcel: vi.fn().mockResolvedValue(Buffer.from('xlsx')),
}));
// WHY: Spy-through so the test can prove the export fetchRows path skips it.
vi.mock('../src/services/serverClientFilter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/serverClientFilter')>();
  return { ...actual, applyServerClientFilters: vi.fn(actual.applyServerClientFilters) };
});

function makeStubCache(): CacheProvider & { invalidateByPrefix: ReturnType<typeof vi.fn> } {
  const stub = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(3),
    isConnected: vi.fn().mockResolvedValue(true),
  };
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
    buildQuery: () => ({ $select: 'DOCNO', $top: 50, $skip: 0 }),
    transformRow: (raw) => ({ docNo: raw.DOCNO }),
    ...opts,
  });
}

function makeApp(cache: CacheProvider) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createQueryRouter(cache));
  app.use('/api/v1/reports', createExportRouter(cache));
  app.use('/api/v1/reports', createFiltersRouter(cache));
  app.use('/api/v1/reports', createQueryRefreshRouter(cache));
  return app;
}

const emptyFilterGroup = { id: 'root', conjunction: 'and' as const, conditions: [], groups: [] };
const queryBody = { filterGroup: emptyFilterGroup, page: 1, pageSize: 50 };
const exportBody = { filterGroup: emptyFilterGroup };

const IDS = ['fr-a', 'fr-b', 'fr-plain'];

afterEach(() => {
  IDS.forEach((id) => reportRegistry.delete(id));
  vi.clearAllMocks();
});

describe('POST /query — fetchRows branch', () => {
  it('bypasses Priority, stamps supabase provenance and transforms rows', async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ DOCNO: 'S1' }, { DOCNO: 'S2' }]);
    registerFakeReport('fr-a', { fetchRows, disableCache: true });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/query').send(queryBody);

    expect(res.status).toBe(200);
    expect(queryPriority).not.toHaveBeenCalled();
    expect(res.body.meta.source).toBe('supabase');
    expect(res.body.meta.priorityEnv).toBe('production');
    expect(res.body.data).toEqual([{ docNo: 'S1' }, { docNo: 'S2' }]);
    expect(fetchRows).toHaveBeenCalledTimes(1);
    expect(fetchRows.mock.calls[0][0]).toEqual(emptyFilterGroup);
    expect(fetchRows.mock.calls[0][1]).toMatchObject({ limit: 5001 });
  });

  it('caps at 5,000 rows and adds the generic warning', async () => {
    const many = Array.from({ length: 5001 }, (_, i) => ({ DOCNO: `S${i}` }));
    registerFakeReport('fr-a', { fetchRows: vi.fn().mockResolvedValue(many), disableCache: true });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/query').send({ ...queryBody, pageSize: 100 });

    expect(res.status).toBe(200);
    expect(res.body.pagination.totalCount).toBe(5000);
    expect(res.body.data).toHaveLength(100);
    expect(res.body.warnings).toContain('Showing the first 5,000 rows; narrow the filter');
  });

  it('paginates the fetched rows in memory', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ DOCNO: `S${i}` }));
    registerFakeReport('fr-a', { fetchRows: vi.fn().mockResolvedValue(rows), disableCache: true });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/query').send({ ...queryBody, page: 2, pageSize: 2 });

    expect(res.body.data).toEqual([{ docNo: 'S2' }, { docNo: 'S3' }]);
    expect(res.body.pagination).toMatchObject({ totalCount: 5, totalPages: 3 });
  });

  it('includes queryWarnings output in warnings', async () => {
    registerFakeReport('fr-a', {
      fetchRows: vi.fn().mockResolvedValue([{ DOCNO: 'S1' }]),
      queryWarnings: () => ['W'],
      disableCache: true,
    });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/query').send(queryBody);

    expect(res.body.warnings).toContain('W');
  });

  it('maps SupabaseNotConfiguredError to 503 and other errors to 502, leaving plain reports at 200', async () => {
    registerFakeReport('fr-a', {
      fetchRows: vi.fn().mockRejectedValue(new SupabaseNotConfiguredError()),
      disableCache: true,
    });
    registerFakeReport('fr-b', {
      fetchRows: vi.fn().mockRejectedValue(new Error('boom')),
      disableCache: true,
    });
    registerFakeReport('fr-plain');
    const app = makeApp(makeStubCache());

    const a = await request(app).post('/api/v1/reports/fr-a/query').send(queryBody);
    expect(a.status).toBe(503);
    expect(a.body.error).toBe('Supabase is not configured for this report');

    const b = await request(app).post('/api/v1/reports/fr-b/query').send(queryBody);
    expect(b.status).toBe(502);
    expect(b.body.error).toBe('Failed to fetch from Supabase: boom');

    const plain = await request(app).post('/api/v1/reports/fr-plain/query').send(queryBody);
    expect(plain.status).toBe(200);
    expect(plain.body.meta.source).toBe('priority-odata');
  });
});

describe('POST /export — fetchRows branch', () => {
  it('fetches with limit ROW_CAP+1, skips client filters and Priority', async () => {
    const fetchRows = vi.fn().mockResolvedValue([{ DOCNO: 'S1' }]);
    registerFakeReport('fr-a', { fetchRows });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/export').send(exportBody);

    expect(res.status).toBe(200);
    expect(fetchRows.mock.calls[0][1]).toMatchObject({ limit: 100_001 });
    expect(applyServerClientFilters).not.toHaveBeenCalled();
    expect(queryPriority).not.toHaveBeenCalled();
    expect(getTemplate).not.toHaveBeenCalled(); // no exportConfig on the fake report
    expect(generateFallbackExcel).toHaveBeenCalledTimes(1);
    expect(res.headers['x-export-truncated']).toBeUndefined();
  });

  it('truncates above the row cap and flags the header', async () => {
    const many = Array.from({ length: 100_001 }, (_, i) => ({ DOCNO: `S${i}` }));
    registerFakeReport('fr-a', { fetchRows: vi.fn().mockResolvedValue(many) });

    const res = await request(makeApp(makeStubCache()))
      .post('/api/v1/reports/fr-a/export').send(exportBody);

    expect(res.status).toBe(200);
    expect(res.headers['x-export-truncated']).toBe('true');
    const rowsPassed = vi.mocked(generateFallbackExcel).mock.calls[0][0];
    expect(rowsPassed).toHaveLength(100_000);
  });

  it('maps SupabaseNotConfiguredError to 503 and other errors to 502', async () => {
    registerFakeReport('fr-a', { fetchRows: vi.fn().mockRejectedValue(new SupabaseNotConfiguredError()) });
    registerFakeReport('fr-b', { fetchRows: vi.fn().mockRejectedValue(new Error('boom')) });
    const app = makeApp(makeStubCache());

    const a = await request(app).post('/api/v1/reports/fr-a/export').send(exportBody);
    expect(a.status).toBe(503);
    expect(a.body.error).toBe('Supabase is not configured for this report');

    const b = await request(app).post('/api/v1/reports/fr-b/export').send(exportBody);
    expect(b.status).toBe(502);
    expect(b.body.error).toBe('Failed to fetch from Supabase: boom');
  });
});

describe('GET /filters — Supabase error mapping', () => {
  it('maps SupabaseNotConfiguredError from fetchFilters to 503', async () => {
    registerFakeReport('fr-a', {
      fetchFilters: vi.fn().mockRejectedValue(new SupabaseNotConfiguredError()),
    });

    const res = await request(makeApp(makeStubCache())).get('/api/v1/reports/fr-a/filters');

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Supabase is not configured for this report');
  });

  it('keeps the Priority 502 message for reports without fetchRows', async () => {
    registerFakeReport('fr-plain', { fetchFilters: vi.fn().mockRejectedValue(new Error('boom')) });

    const res = await request(makeApp(makeStubCache())).get('/api/v1/reports/fr-plain/filters');

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('Failed to fetch filters: boom');
  });
});

describe('POST /refresh — refreshSource hook', () => {
  it('answers 200 status:error when refreshSource throws', async () => {
    registerFakeReport('fr-a', { refreshSource: vi.fn().mockRejectedValue(new Error('pg down')) });

    const res = await request(makeApp(makeStubCache())).post('/api/v1/reports/fr-a/refresh');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('error');
  });

  it('merges a timeout outcome into the body and still invalidates the cache', async () => {
    registerFakeReport('fr-a', {
      refreshSource: vi.fn().mockResolvedValue({ status: 'timeout' }),
    });
    const cache = makeStubCache();

    const res = await request(makeApp(cache)).post('/api/v1/reports/fr-a/refresh');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('timeout');
    expect(cache.invalidateByPrefix).toHaveBeenCalledWith('query:fr-a:');
  });

  it('keeps the legacy body for reports without the hook', async () => {
    registerFakeReport('fr-plain');

    const res = await request(makeApp(makeStubCache())).post('/api/v1/reports/fr-plain/refresh');

    expect(res.body).toEqual({ message: 'Cache refreshed for fr-plain', keysDeleted: 3 });
  });
});
