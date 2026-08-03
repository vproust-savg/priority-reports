// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryCacheKey.test.ts
// PURPOSE: Query cache keys must be environment-scoped so UAT and
//          Live responses can never cross-contaminate (spec §5).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildQueryCacheKey } from '../src/services/cache';
import type { QueryRequest } from '@shared/types';

const body: QueryRequest = {
  filterGroup: { id: 'r', conjunction: 'and', conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('buildQueryCacheKey environment scoping', () => {
  it('same request, different env → different keys', () => {
    const live = buildQueryCacheKey('grv-log', body, 'production');
    const uat = buildQueryCacheKey('grv-log', body, 'uat');
    expect(live).not.toBe(uat);
    expect(live).toContain('envproduction');
    expect(uat).toContain('envuat');
  });
});
