// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/priorityEnvOverride.test.ts
// PURPOSE: getPriorityConfig() must use the request-scoped override
//          when present and the boot PRIORITY_ENV otherwise.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

// WHY: Mock the environment module so the test controls both credential
// sets without touching real .env values. Boot default = production.
vi.mock('../src/config/environment', () => ({
  env: {
    NODE_ENV: 'test',
    PRIORITY_ENV: 'production',
    PRIORITY_PROD_BASE_URL: 'https://prod.example.com/odata/',
    PRIORITY_PROD_USERNAME: 'prod-user',
    PRIORITY_PROD_PASSWORD: 'prod-pass',
    PRIORITY_UAT_BASE_URL: 'https://uat.example.com/odata/',
    PRIORITY_UAT_USERNAME: 'uat-user',
    PRIORITY_UAT_PASSWORD: 'uat-pass',
  },
}));

import { getPriorityConfig } from '../src/config/priority';
import { runWithPriorityEnv } from '../src/config/priorityEnvContext';

describe('getPriorityConfig env override', () => {
  it('uses boot PRIORITY_ENV outside any scope', () => {
    const config = getPriorityConfig();
    expect(config.env).toBe('production');
    expect(config.username).toBe('prod-user');
    expect(config.baseUrl).toBe('https://prod.example.com/odata/');
  });

  it('uses the request-scoped env inside runWithPriorityEnv', () => {
    const config = runWithPriorityEnv('uat', () => getPriorityConfig());
    expect(config.env).toBe('uat');
    expect(config.username).toBe('uat-user');
    expect(config.baseUrl).toBe('https://uat.example.com/odata/');
  });

  it('falls back to boot env after the scope ends', () => {
    runWithPriorityEnv('uat', () => getPriorityConfig());
    expect(getPriorityConfig().env).toBe('production');
  });
});
