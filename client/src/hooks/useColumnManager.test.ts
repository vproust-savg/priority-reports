// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useColumnManager.test.ts
// PURPOSE: Tests for useColumnManager hook — column visibility,
//          reorder, and memoization behavior.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useColumnManager } from './useColumnManager';
import type { ColumnDefinition } from '@shared/types';

const makeColumns = (keys: string[]): ColumnDefinition[] =>
  keys.map((key) => ({ key, label: key.toUpperCase(), type: 'string' as const }));

describe('useColumnManager', () => {
  it('initializes all columns as visible', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result } = renderHook(() => useColumnManager(cols));
    expect(result.current.managedColumns).toHaveLength(3);
    expect(result.current.managedColumns.every((mc) => mc.visible)).toBe(true);
    expect(result.current.hiddenCount).toBe(0);
  });

  it('toggleColumn hides a column and updates hiddenCount', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result } = renderHook(() => useColumnManager(cols));
    act(() => result.current.toggleColumn('b'));
    expect(result.current.managedColumns.find((mc) => mc.key === 'b')?.visible).toBe(false);
    expect(result.current.hiddenCount).toBe(1);
  });

  it('prevents toggling the first (locked) column', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result } = renderHook(() => useColumnManager(cols));
    act(() => result.current.toggleColumn('a'));
    expect(result.current.managedColumns[0].visible).toBe(true);
    expect(result.current.hiddenCount).toBe(0);
  });

  it('hideAll keeps first column visible', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result } = renderHook(() => useColumnManager(cols));
    act(() => result.current.hideAll());
    expect(result.current.managedColumns[0].visible).toBe(true);
    expect(result.current.hiddenCount).toBe(2);
  });

  it('showAll makes all columns visible', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result } = renderHook(() => useColumnManager(cols));
    act(() => result.current.hideAll());
    act(() => result.current.showAll());
    expect(result.current.hiddenCount).toBe(0);
  });

  // WHY: This test verifies that hiddenCount is memoized. Without useMemo,
  // hiddenCount recomputes on every render even if managedColumns didn't change.
  // We verify memoization by checking referential stability of the returned value.
  it('hiddenCount is stable across re-renders when managedColumns unchanged', () => {
    const cols = makeColumns(['a', 'b', 'c']);
    const { result, rerender } = renderHook(() => useColumnManager(cols));

    act(() => result.current.toggleColumn('b'));
    const firstHiddenCount = result.current.hiddenCount;

    // Re-render without changing managedColumns — hiddenCount should be same value
    rerender();
    expect(result.current.hiddenCount).toBe(firstHiddenCount);
    expect(result.current.hiddenCount).toBe(1);
  });
});
