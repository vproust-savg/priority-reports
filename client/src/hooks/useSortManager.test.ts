// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSortManager.test.ts
// PURPOSE: Tests for useSortManager hook — sort rules CRUD,
//          multi-column sorting, null handling, immutability.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortManager } from './useSortManager';
import type { ColumnDefinition } from '@shared/types';

const makeColumns = (keys: string[], types?: Record<string, ColumnDefinition['type']>): ColumnDefinition[] =>
  keys.map((key) => ({ key, label: key.toUpperCase(), type: types?.[key] ?? 'string' }));

describe('useSortManager', () => {
  // --- CRUD ---

  it('starts with no sort rules', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    expect(result.current.sortRules).toHaveLength(0);
    expect(result.current.sortCount).toBe(0);
  });

  it('addSort() adds a rule with first column and ascending', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(1);
    expect(result.current.sortRules[0].columnKey).toBe('name');
    expect(result.current.sortRules[0].direction).toBe('asc');
    expect(result.current.sortCount).toBe(1);
  });

  it('addSort(columnKey) adds a rule for the specified column', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    expect(result.current.sortRules[0].columnKey).toBe('price');
  });

  it('addSort skips columns already in use', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(2);
    expect(result.current.sortRules[1].columnKey).toBe('price');
  });

  it('addSort is a no-op when all columns are used', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(2);
  });

  it('removeSort removes a rule by id', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.removeSort(id));
    expect(result.current.sortRules).toHaveLength(0);
  });

  it('updateSort changes direction', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    expect(result.current.sortRules[0].direction).toBe('desc');
  });

  it('updateSort changes columnKey', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { columnKey: 'price' }));
    expect(result.current.sortRules[0].columnKey).toBe('price');
  });

  it('reorderSorts swaps rule priority', () => {
    const cols = makeColumns(['name', 'price', 'date']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.reorderSorts(0, 1));
    expect(result.current.sortRules[0].columnKey).toBe('price');
    expect(result.current.sortRules[1].columnKey).toBe('name');
  });

  it('clearAll removes all rules', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.clearAll());
    expect(result.current.sortRules).toHaveLength(0);
    expect(result.current.sortCount).toBe(0);
  });

  // --- Sorting ---

  it('sorts strings ascending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('sorts strings descending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['cherry', 'banana', 'apple']);
  });

  it('sorts numbers ascending', () => {
    const cols = makeColumns(['price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.price)).toEqual([10, 20, 30]);
  });

  it('sorts numbers descending', () => {
    const cols = makeColumns(['price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.price)).toEqual([30, 20, 10]);
  });

  it('sorts currency as numbers', () => {
    const cols = makeColumns(['amount'], { amount: 'currency' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('amount'));
    const data = [{ amount: 99.99 }, { amount: 5.50 }, { amount: 42.00 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.amount)).toEqual([5.50, 42.00, 99.99]);
  });

  it('sorts percent as numbers', () => {
    const cols = makeColumns(['rate'], { rate: 'percent' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('rate'));
    const data = [{ rate: 75 }, { rate: 25 }, { rate: 50 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.rate)).toEqual([25, 50, 75]);
  });

  it('sorts dates chronologically', () => {
    const cols = makeColumns(['date'], { date: 'date' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('date'));
    const data = [{ date: '2026-03-28' }, { date: '2026-01-15' }, { date: '2026-06-01' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.date)).toEqual(['2026-01-15', '2026-03-28', '2026-06-01']);
  });

  it('multi-column sort: primary asc, secondary desc', () => {
    const cols = makeColumns(['category', 'price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('category'));
    act(() => result.current.addSort('price'));
    // WHY: Set second rule to desc to test multi-column
    const priceId = result.current.sortRules[1].id;
    act(() => result.current.updateSort(priceId, { direction: 'desc' }));
    const data = [
      { category: 'B', price: 10 },
      { category: 'A', price: 5 },
      { category: 'A', price: 20 },
      { category: 'B', price: 30 },
    ];
    const sorted = result.current.sortedData(data);
    expect(sorted).toEqual([
      { category: 'A', price: 20 },
      { category: 'A', price: 5 },
      { category: 'B', price: 30 },
      { category: 'B', price: 10 },
    ]);
  });

  // --- Null handling ---

  it('null values sort last when ascending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: null }, { name: 'apple' }, { name: 'banana' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', 'banana', null]);
  });

  it('null values sort last when descending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ name: null }, { name: 'apple' }, { name: 'banana' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['banana', 'apple', null]);
  });

  it('undefined values sort last', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: undefined }, { name: 'apple' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', undefined]);
  });

  // --- Immutability ---

  it('sortedData does not mutate the input array', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: 'banana' }, { name: 'apple' }];
    const original = JSON.stringify(data);
    result.current.sortedData(data);
    expect(JSON.stringify(data)).toBe(original);
  });

  // --- Edge cases ---

  it('sortedData with no rules returns original order', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    const data = [{ name: 'banana' }, { name: 'apple' }];
    const sorted = result.current.sortedData(data);
    expect(sorted).toEqual(data);
  });

  it('sortedData with empty array returns empty array', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    expect(result.current.sortedData([])).toEqual([]);
  });

  // --- Column cleanup ---

  it('removes sort rules when their column disappears', () => {
    const cols = makeColumns(['name', 'price']);
    const { result, rerender } = renderHook(
      ({ columns }) => useSortManager(columns),
      { initialProps: { columns: cols } },
    );
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    expect(result.current.sortRules).toHaveLength(2);

    // WHY: Simulate hiding the "price" column — only "name" remains
    rerender({ columns: makeColumns(['name']) });
    expect(result.current.sortRules).toHaveLength(1);
    expect(result.current.sortRules[0].columnKey).toBe('name');
  });
});
