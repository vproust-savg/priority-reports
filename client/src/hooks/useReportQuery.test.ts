// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.test.ts
// PURPOSE: Tests for the useReportQuery hook — specifically that
//          the disableCache option bypasses TanStack's staleTime
//          so re-mounts trigger fresh fetches.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReportQuery } from './useReportQuery';
import type { FilterGroup } from '@shared/types';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const fakeResponse = {
  meta: { reportId: 'grv-log', reportName: 'GRV Log', generatedAt: '', cache: 'miss', executionTimeMs: 1, source: 'priority-odata' },
  data: [],
  pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
  columns: [],
};

const emptyGroup: FilterGroup = { id: 'r', conjunction: 'and', conditions: [], groups: [] };

let mockFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => fakeResponse,
  });
  vi.stubGlobal('fetch', mockFetch);
});

describe('useReportQuery', () => {
  it('re-mounts re-fetch when disableCache is true', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const first = renderHook(() => useReportQuery('grv-log', params, { disableCache: true }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useReportQuery('grv-log', params, { disableCache: true }), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('re-mounts use cached data when disableCache is omitted', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const first = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('useReportQuery environment + abort', () => {
  it('sends environment in the POST body and passes an AbortSignal', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50, environment: 'uat' as const };

    const hook = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).environment).toBe('uat');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits environment from the body when not provided', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const hook = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    // WHY: JSON.stringify drops undefined — non-toggle widgets send
    // byte-identical bodies to the pre-feature shape.
    expect('environment' in JSON.parse(init.body as string)).toBe(false);
  });
});
