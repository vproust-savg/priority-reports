// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/health.test.ts
// PURPOSE: Smoke test for the health endpoint. Verifies the server
//          starts and returns expected response shape.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';

describe('GET /api/v1/health', () => {
  it('returns 200 with expected fields', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('cacheStatus');
    expect(res.body).toHaveProperty('version');
  });
});
