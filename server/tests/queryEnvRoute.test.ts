// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryEnvRoute.test.ts
// PURPOSE: POST /:reportId/query honors `environment` ONLY for reports
//          with allowEnvOverride; sets meta.priorityEnv; passes an
//          AbortSignal to enrichRows; rejects invalid values.
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
import { queryPriority } from '../src/services/priorityClient';
import { createQueryRouter } from '../src/routes/query';

function makeStubCache(): CacheProvider {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createQueryRouter(makeStubCache()));
  return app;
}

const emptyBody = {
  filterGroup: { id: 'root', conjunction: 'and' as const, conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('POST /:reportId/query — environment override', () => {
  afterEach(() => {
    reportRegistry.delete('fake-env');
    reportRegistry.delete('fake-plain');
    vi.clearAllMocks();
  });

  it('runs Priority calls in the UAT scope when the report opts in', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    let seenEnv: string | undefined = 'not-called';
    vi.mocked(queryPriority).mockImplementation(async () => {
      seenEnv = getRequestPriorityEnv();
      return { value: [{ DOCNO: 'X' }] };
    });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send({ ...emptyBody, environment: 'uat' });

    expect(res.status).toBe(200);
    expect(seenEnv).toBe('uat');
    expect(res.body.meta.priorityEnv).toBe('uat');
  });

  it('ignores the field for reports without allowEnvOverride', async () => {
    registerFakeReport('fake-plain');
    let seenEnv: string | undefined = 'not-called';
    vi.mocked(queryPriority).mockImplementation(async () => {
      seenEnv = getRequestPriorityEnv();
      return { value: [{ DOCNO: 'X' }] };
    });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-plain/query')
      .send({ ...emptyBody, environment: 'uat' });

    expect(res.status).toBe(200);
    expect(seenEnv).toBeUndefined(); // no scope → boot env
    // WHY: meta reports the BOOT env (server/.env → uat locally), never
    // the ignored request value — seenEnv above is the real proof.
    expect(res.body.meta.priorityEnv).toBe(env.PRIORITY_ENV);
  });

  it('rejects invalid environment values with 400', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send({ ...emptyBody, environment: 'staging' });
    expect(res.status).toBe(400);
  });

  // NOTE on coverage: the mid-request client-disconnect path (res 'close'
  // → abort → skip cache/send) is not integration-tested here — supertest
  // can't abort a socket deterministically. It is covered by (a) the
  // grvLogReport abort test (batches stop), (b) this signal-passing test,
  // and (c) the query_aborted log event verified in Railway logs post-
  // deploy. Do not add a flaky socket-destruction test.
  it('passes an AbortSignal to enrichRows', async () => {
    let receivedSignal: unknown = 'nothing';
    registerFakeReport('fake-env', {
      allowEnvOverride: true,
      enrichRows: async (rows, signal) => {
        receivedSignal = signal;
        return rows;
      },
    });
    vi.mocked(queryPriority).mockResolvedValue({ value: [{ DOCNO: 'X' }] });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
