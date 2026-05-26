// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/warmCache.test.ts
// PURPOSE: Verify cache warming short-circuits when its target report has
//          disableCache:true (the grv-log case post-Task-7).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock priority client BEFORE importing grvLog (which uses it on registration
// is fine — only enrichRows uses it).
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn(),
}));

import '../src/reports/grvLog'; // side-effect: registers grv-log with disableCache:true
import { warmCache } from '../src/index';

describe('warmCache', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ meta: { cache: 'miss', executionTimeMs: 1 }, data: [] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not POST a query when the target report has disableCache:true', async () => {
    await warmCache();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
