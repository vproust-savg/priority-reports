// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/health.test.ts
// PURPOSE: Smoke test for the health endpoint. Verifies the server
//          starts and returns expected response shape.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createTestClient } from './helpers/createTestClient';
import { app } from '../src/index';

describe('GET /api/v1/health', () => {
  it('returns 200 with expected fields', async () => {
    const client = await createTestClient(app);
    const res = await client.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('environment');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('cacheStatus');
    expect(res.body).toHaveProperty('version');
  });
});
