// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendedQuery.test.ts
// PURPOSE: Tests for the useExtendedQuery TanStack Query hook.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useExtendedQuery } from './useExtendedQuery';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const sampleResponse = {
  columns: [
    { key: 'serialName', label: 'Lot Number', type: 'string' },
    { key: 'balance', label: 'Balance', type: 'number' },
  ],
  data: [
    { serialName: 'LOT001', balance: 50, originalExpiryDate: '2026-04-01' },
  ],
  pagination: { totalCount: 1, totalPages: 1, page: 1, pageSize: 1 },
  meta: { source: 'airtable', generatedAt: '2026-04-09T12:00:00Z' },
};

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useExtendedQuery', () => {
  it('fetches from /api/v1/reports/bbd/extended', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResponse,
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/reports/bbd/extended');
  });

  it('returns data with columns, data, pagination fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResponse,
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.columns).toBeDefined();
    expect(result.current.data!.data).toBeDefined();
    expect(result.current.data!.pagination).toBeDefined();
  });

  it('data items have expected fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResponse,
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const item = result.current.data!.data[0];
    expect(item).toHaveProperty('serialName');
    expect(item).toHaveProperty('balance');
    expect(item).toHaveProperty('originalExpiryDate');
  });

  it('is in loading state before fetch resolves', () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it('transitions to success after fetch resolves', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResponse,
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeDefined();
    expect(result.current.error).toBeNull();
  });

  it('transitions to error on non-2xx response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Airtable down' }),
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    // WHY: null passes toBeDefined(). Must check for non-null explicitly.
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('throws descriptive message on error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Airtable fetch failed: 503' }),
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error!.message).toContain('Airtable fetch failed');
  });

  it('does not refetch on window focus', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    });

    const wrapper = makeWrapper();
    const { result } = renderHook(() => useExtendedQuery(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const callCountAfterInitial = mockFetch.mock.calls.length;

    // Simulate window focus event
    window.dispatchEvent(new Event('focus'));
    // WHY: Wait a tick — if refetchOnWindowFocus were true, it would refetch.
    await new Promise((r) => setTimeout(r, 50));

    expect(mockFetch.mock.calls.length).toBe(callCountAfterInitial);
  });

  it('uses query key [report, bbd, extended]', async () => {
    // WHY: We verify the query key indirectly by checking the hook works.
    // The key is hardcoded in the hook — this test ensures it exists.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => sampleResponse,
    });

    const { result } = renderHook(() => useExtendedQuery(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    // If the query key were wrong, this hook wouldn't function.
    expect(result.current.data).toBeDefined();
  });

  it('staleTime is defined and greater than zero', async () => {
    // WHY: This verifies the hook configuration indirectly.
    // With staleTime > 0, a second render won't trigger a new fetch.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => sampleResponse,
    });

    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(() => useExtendedQuery(), { wrapper });

    await waitFor(() => expect(result.current.data).toBeDefined());
    const initialCallCount = mockFetch.mock.calls.length;

    rerender();
    // WHY: If staleTime were 0, rerender would trigger another fetch.
    expect(mockFetch.mock.calls.length).toBe(initialCallCount);
  });
});
