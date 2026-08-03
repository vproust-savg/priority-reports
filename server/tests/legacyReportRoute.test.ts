// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/legacyReportRoute.test.ts
// PURPOSE: The legacy GET /:reportId data route is retired (env-toggle
//          spec §7): explicit 404 JSON (the production SPA catch-all
//          would otherwise serve index.html), /list still works, and
//          reports.ts keeps registering customer-returns.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createReportsRouter } from '../src/routes/reports';
import { getReport } from '../src/config/reportRegistry';

function makeApp() {
  const app = express();
  app.use('/api/v1/reports', createReportsRouter());
  return app;
}

describe('legacy GET /:reportId retirement', () => {
  it('returns 404 JSON for the retired data route', async () => {
    const res = await request(makeApp()).get('/api/v1/reports/grv-log');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/retired/i);
  });

  it('keeps GET /list working', async () => {
    const res = await request(makeApp()).get('/api/v1/reports/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('still registers customer-returns via side-effect import', () => {
    expect(getReport('customer-returns')).toBeDefined();
  });
});
