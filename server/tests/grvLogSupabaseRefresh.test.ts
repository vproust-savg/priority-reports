// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvLogSupabaseRefresh.test.ts
// PURPOSE: Verify the grv-log-supabase history-floor warning and the 30-day
//          refresh (request, then poll). Query, sleep and clock are injected,
//          so no database is reached and nothing really sleeps.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import type { FilterCondition, FilterGroup } from '@shared/types';

vi.mock('../src/services/supabaseDb', () => ({
  querySupabase: vi.fn().mockResolvedValue([]),
  SupabaseNotConfiguredError: class SupabaseNotConfiguredError extends Error {},
}));

import {
  buildHistoryFloorWarnings,
  refreshGrvSource,
  GRV_SUPABASE_HISTORY_FLOOR,
} from '../src/reports/grvLogSupabase';
import { reportRegistry } from '../src/config/reportRegistry';

const WARNING = 'This page holds GRVs from 2026-06-28 on. For earlier dates, use the Receiving Log page.';

function group(conjunction: 'and' | 'or', conditions: Omit<FilterCondition, 'id'>[]): FilterGroup {
  return {
    id: 'root',
    conjunction,
    conditions: conditions.map((c, i) => ({ id: `c${i}`, ...c })),
    groups: [],
  };
}

describe('buildHistoryFloorWarnings', () => {
  it('exports the floor date', () => {
    expect(GRV_SUPABASE_HISTORY_FLOOR).toBe('2026-06-28');
  });

  it('warns for an empty group', () => {
    expect(buildHistoryFloorWarnings(group('and', []))).toEqual([WARNING]);
  });

  it('does not warn for isInWeek after the floor', () => {
    const g = group('and', [
      { field: 'date', operator: 'isInWeek', value: '2026-10-26', valueTo: '2026-11-01' },
    ]);
    expect(buildHistoryFloorWarnings(g)).toEqual([]);
  });

  it('warns for isOnOrAfter before the floor', () => {
    const g = group('and', [{ field: 'date', operator: 'isOnOrAfter', value: '2026-06-01' }]);
    expect(buildHistoryFloorWarnings(g)).toEqual([WARNING]);
  });

  it('does not warn for isOnOrAfter / isAfter / isBetween / equals at or after the floor', () => {
    for (const operator of ['isOnOrAfter', 'isAfter', 'isBetween', 'equals'] as const) {
      const g = group('and', [{ field: 'date', operator, value: '2026-06-28', valueTo: '2026-07-05' }]);
      expect(buildHistoryFloorWarnings(g)).toEqual([]);
    }
  });

  it('warns for an or root even with a good date condition', () => {
    const g = group('or', [
      { field: 'date', operator: 'isInWeek', value: '2026-10-26', valueTo: '2026-11-01' },
      { field: 'vendor', operator: 'equals', value: 'Acme' },
    ]);
    expect(buildHistoryFloorWarnings(g)).toEqual([WARNING]);
  });

  it('warns for an upper-bound-only date operator (isBefore)', () => {
    const g = group('and', [{ field: 'date', operator: 'isBefore', value: '2026-10-01' }]);
    expect(buildHistoryFloorWarnings(g)).toEqual([WARNING]);
  });

  it('is registered as the report queryWarnings hook', () => {
    expect(reportRegistry.get('grv-log-supabase')!.queryWarnings).toBe(buildHistoryFloorWarnings);
  });
});

describe('refreshGrvSource', () => {
  // Fake clock: sleep advances it, so "90 s later" costs no real time.
  function makeDeps(responses: Record<string, unknown>[][]) {
    let clock = 0;
    const query = vi.fn();
    for (const rows of responses) query.mockResolvedValueOnce(rows);
    query.mockResolvedValue([]);
    const sleep = vi.fn(async (ms: number) => { clock += ms; });
    return { deps: { query, sleep, now: () => clock }, query, sleep, advanced: () => clock };
  }
  const requestRow = (status: string, requestId: string | null = '42', reused = false) => ({
    request_id: requestId, status, reused,
  });
  const statusRow = (status: string) => ({ request_id: '42', status });

  it('polls pending -> running -> done and returns done after 2 polls', async () => {
    const { deps, query, sleep } = makeDeps([
      [requestRow('pending')], [statusRow('running')], [statusRow('done')],
    ]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'done' });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][0]).toContain('priority_reports.request_grv_refresh()');
    expect(query.mock.calls[1][0]).toContain('priority_reports.grv_refresh_status($1)');
    // WHY: bigint arrives as a string and must be passed back unchanged.
    expect(query.mock.calls[1][1]).toEqual(['42']);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it('returns error when the refresh errors', async () => {
    const { deps } = makeDeps([[requestRow('running')], [statusRow('error')]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'error' });
  });

  it('returns timeout after 90 s of always running', async () => {
    const { deps, advanced } = makeDeps([[requestRow('running')]]);
    deps.query.mockResolvedValue([statusRow('running')]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'timeout' });
    expect(advanced()).toBe(90_000);
  });

  it('keeps polling through an empty status result until the timeout', async () => {
    const { deps, advanced } = makeDeps([[requestRow('pending')]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'timeout' });
    expect(advanced()).toBe(90_000);
  });

  it('returns busy without a status query', async () => {
    const { deps, query } = makeDeps([[requestRow('busy', null)]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'busy' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns busy when request_id is null even if status is not busy', async () => {
    const { deps, query } = makeDeps([[requestRow('pending', null)]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'busy' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('throws when the request function returns no row, so the route reports error', async () => {
    const { deps } = makeDeps([[]]);
    await expect(refreshGrvSource(undefined, deps)).rejects.toThrow('no row');
  });

  it('returns a reused finished done request with no poll', async () => {
    const { deps, query, sleep } = makeDeps([[requestRow('done', '42', true)]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'done' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('returns a reused finished error request with no poll', async () => {
    const { deps, query } = makeDeps([[requestRow('error', '42', true)]]);
    await expect(refreshGrvSource(undefined, deps)).resolves.toEqual({ status: 'error' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('returns timeout after at most one poll when the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, query } = makeDeps([[requestRow('pending')], [statusRow('running')]]);
    await expect(refreshGrvSource(controller.signal, deps)).resolves.toEqual({ status: 'timeout' });
    expect(query.mock.calls.length).toBeLessThanOrEqual(2); // request + at most one poll
  });

  it('stops polling when the signal aborts mid-poll', async () => {
    const controller = new AbortController();
    const { deps, query } = makeDeps([[requestRow('pending')], [statusRow('running')]]);
    deps.sleep.mockImplementation(async () => { controller.abort(); });
    await expect(refreshGrvSource(controller.signal, deps)).resolves.toEqual({ status: 'timeout' });
    expect(query.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('is registered as the report refreshSource hook', () => {
    expect(reportRegistry.get('grv-log-supabase')!.refreshSource).toBeTypeOf('function');
  });
});
