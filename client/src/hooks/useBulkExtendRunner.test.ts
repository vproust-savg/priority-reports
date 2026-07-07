// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useBulkExtendRunner.test.ts
// PURPOSE: Tests for the bulk extend chunk runner — chunk math,
//          sequential submission, pause/resume, cancel, and
//          per-item failure accumulation.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('./useExtendExpiry', () => ({
  useExtendExpiry: vi.fn(),
}));

import { useExtendExpiry } from './useExtendExpiry';
import { chunkBulkItems, useBulkExtendRunner, BULK_CHUNK_SIZE } from './useBulkExtendRunner';
import type { BulkExtendItem } from './useBulkExtendRunner';

const mockUseExtendExpiry = vi.mocked(useExtendExpiry);
const mockExtend = vi.fn();

function makeItems(count: number): BulkExtendItem[] {
  return Array.from({ length: count }, (_, i) => ({
    serialName: `LOT${String(i).padStart(4, '0')}`,
    days: 7,
  }));
}

function successResponse(items: Array<{ serialName: string }>) {
  return {
    results: items.map(({ serialName }) => ({
      serialName, success: true, newExpiryDate: '2026-04-08T00:00:00Z',
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExtend.mockImplementation(async ({ items }: { items: Array<{ serialName: string }> }) =>
    successResponse(items));
  mockUseExtendExpiry.mockReturnValue({
    extend: mockExtend,
    isPending: false,
    error: null,
    reset: vi.fn(),
  } as unknown as ReturnType<typeof useExtendExpiry>);
});

describe('chunkBulkItems', () => {
  it('splits 1000 items into 20 chunks of 50', () => {
    const chunks = chunkBulkItems(makeItems(1000));
    expect(chunks).toHaveLength(20);
    expect(chunks.every((c) => c.length === BULK_CHUNK_SIZE)).toBe(true);
  });

  it('splits 106 items into 50/50/6', () => {
    const chunks = chunkBulkItems(makeItems(106));
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 6]);
  });

  it('returns no chunks for an empty list', () => {
    expect(chunkBulkItems([])).toEqual([]);
  });
});

describe('useBulkExtendRunner', () => {
  it('submits chunks sequentially and finishes done with all results', async () => {
    const { result } = renderHook(() => useBulkExtendRunner());

    await act(async () => {
      await result.current.start(makeItems(120));
    });

    expect(mockExtend).toHaveBeenCalledTimes(3);
    expect(mockExtend.mock.calls.map((c) => c[0].items.length)).toEqual([50, 50, 20]);
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(result.current.results).toHaveLength(120);
    expect(result.current.progress.processed).toBe(120);
    expect(result.current.progress.total).toBe(120);
  });

  it('pauses on a thrown chunk error and resumes with only unprocessed-or-failed items', async () => {
    mockExtend
      .mockImplementationOnce(async ({ items }: { items: Array<{ serialName: string }> }) =>
        successResponse(items))
      .mockRejectedValueOnce(new Error('Invalid request — network hiccup'));

    const { result } = renderHook(() => useBulkExtendRunner());

    await act(async () => {
      await result.current.start(makeItems(120));
    });

    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(result.current.runError).toContain('network hiccup');
    // WHY: Chunk 1 (50 lots) committed before the failure — kept, not retried.
    expect(result.current.results).toHaveLength(50);

    mockExtend.mockImplementation(async ({ items }: { items: Array<{ serialName: string }> }) =>
      successResponse(items));

    await act(async () => {
      await result.current.resume();
    });

    await waitFor(() => expect(result.current.state).toBe('done'));
    // Resume submits the remaining 70 as 50 + 20.
    const resumeCalls = mockExtend.mock.calls.slice(2);
    expect(resumeCalls.map((c) => c[0].items.length)).toEqual([50, 20]);
    // WHY: Already-succeeded serials must never be re-extended (double write).
    const resumedSerials = resumeCalls.flatMap((c) => c[0].items.map((i: { serialName: string }) => i.serialName));
    expect(resumedSerials).not.toContain('LOT0000');
    expect(result.current.results).toHaveLength(120);
  });

  it('accumulates per-item failures without pausing the run', async () => {
    mockExtend.mockImplementation(async ({ items }: { items: Array<{ serialName: string }> }) => ({
      results: items.map(({ serialName }, i) => ({
        serialName,
        success: i !== 0,
        ...(i === 0 ? { error: 'Lot not found in expiration tracking system' } : { newExpiryDate: '2026-04-08T00:00:00Z' }),
      })),
    }));

    const { result } = renderHook(() => useBulkExtendRunner());

    await act(async () => {
      await result.current.start(makeItems(60));
    });

    await waitFor(() => expect(result.current.state).toBe('done'));
    const failed = result.current.results.filter((r) => !r.success);
    expect(failed).toHaveLength(2); // one per chunk (50 + 10)
    expect(failed[0].error).toContain('not found');
  });

  it('cancel stops between chunks and leaves completed results in place', async () => {
    const { result } = renderHook(() => useBulkExtendRunner());

    mockExtend.mockImplementation(async ({ items }: { items: Array<{ serialName: string }> }) => {
      // WHY: Cancel mid-run — flag is honored at the next chunk boundary.
      result.current.cancel();
      return successResponse(items);
    });

    await act(async () => {
      await result.current.start(makeItems(120));
    });

    await waitFor(() => expect(result.current.state).toBe('paused'));
    expect(mockExtend).toHaveBeenCalledTimes(1);
    expect(result.current.results).toHaveLength(50);
  });

  it('reset returns the runner to idle with no results', async () => {
    const { result } = renderHook(() => useBulkExtendRunner());

    await act(async () => {
      await result.current.start(makeItems(10));
    });
    await waitFor(() => expect(result.current.state).toBe('done'));

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.results).toHaveLength(0);
    expect(result.current.progress.total).toBe(0);
  });
});
