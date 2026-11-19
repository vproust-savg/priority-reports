// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryRefresh.test.ts
// PURPOSE: Verify request validation, forwarding, and cache side effects.
// USED BY: Vitest
// EXPORTS: none
// ═══════════════════════════════════════════════════════════════

import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportRegistry } from '../src/config/reportRegistry';
import { createQueryRefreshRouter } from '../src/routes/queryRefresh';
import type { CacheProvider } from '../src/services/cache';

const reportId = 'test-refresh';
const range = { from: '2026-10-01', to: '2026-10-31' };

function setup(hasSourceRefresh: boolean) {
  const refreshSource = vi.fn().mockResolvedValue({ status: 'done' });
  const clearMemoryCache = vi.fn();
  const cache = {
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    invalidateByPrefix: vi.fn().mockResolvedValue(2),
    isConnected: vi.fn(),
  } satisfies CacheProvider;
  reportRegistry.set(reportId, {
    id: reportId,
    name: 'Test Refresh',
    entity: 'TEST',
    columns: [],
    filterColumns: [],
    buildQuery: () => ({}),
    transformRow: (row) => row,
    clearMemoryCache,
    refreshSource: hasSourceRefresh ? refreshSource : undefined,
  });
  const router = createQueryRefreshRouter(cache);
  // WHY: Dispatch through the real router with a parsed body, without binding a port.
  const post = (body?: unknown) => new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const req = { method: 'POST', url: `/${reportId}/refresh`, body } as Request;
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) { resolve({ status: this.statusCode, body: payload }); },
    });
    router(req, res as unknown as Response, (error?: unknown) => reject(error ?? new Error('Route did not respond')));
  });
  return { post, refreshSource, clearMemoryCache, cache };
}

afterEach(() => {
  reportRegistry.delete(reportId);
});

describe('POST /:reportId/refresh', () => {
  it('forwards a 31-day range and disconnect signal after invalidating the cache', async () => {
    const { post, refreshSource, clearMemoryCache, cache } = setup(true);

    expect(await post(range)).toEqual({
      status: 200,
      body: { message: `Cache refreshed for ${reportId}`, keysDeleted: 2, status: 'done' },
    });
    expect(clearMemoryCache).toHaveBeenCalledOnce();
    expect(cache.invalidateByPrefix).toHaveBeenCalledWith(`query:${reportId}:`);
    expect(refreshSource).toHaveBeenCalledWith(range, expect.any(AbortSignal));
    expect(cache.invalidateByPrefix.mock.invocationCallOrder[0]).toBeLessThan(refreshSource.mock.invocationCallOrder[0]);
  });

  it.each([
    { body: undefined, message: /YYYY-MM-DD/ },
    { body: { from: range.from }, message: /YYYY-MM-DD/ },
    { body: { from: 20261001, to: range.to }, message: /YYYY-MM-DD/ },
    { body: { from: '2026-10-01T00:00:00Z', to: range.to }, message: /YYYY-MM-DD/ },
    { body: { from: '2026-02-29', to: '2026-03-01' }, message: /YYYY-MM-DD/ },
    { body: { from: '0000-01-01', to: '0000-01-01' }, message: /YYYY-MM-DD/ },
    { body: { from: range.to, to: range.from }, message: /on or after/ },
    { body: { from: range.from, to: '2026-11-01' }, message: /at most 31 days/ },
  ])('rejects $body before clearing cache or refreshing the source', async ({ body, message }) => {
    const { post, refreshSource, clearMemoryCache, cache } = setup(true);

    expect(await post(body)).toEqual({ status: 400, body: { error: expect.stringMatching(message) } });
    expect(clearMemoryCache).not.toHaveBeenCalled();
    expect(cache.invalidateByPrefix).not.toHaveBeenCalled();
    expect(refreshSource).not.toHaveBeenCalled();
  });

  it.each([undefined, { from: 'ignored' }])('keeps cache-only refresh working with body %j', async (body) => {
    const { post, refreshSource, clearMemoryCache, cache } = setup(false);

    expect(await post(body)).toEqual({
      status: 200,
      body: { message: `Cache refreshed for ${reportId}`, keysDeleted: 2 },
    });
    expect(clearMemoryCache).toHaveBeenCalledOnce();
    expect(cache.invalidateByPrefix).toHaveBeenCalledWith(`query:${reportId}:`);
    expect(refreshSource).not.toHaveBeenCalled();
  });
});
