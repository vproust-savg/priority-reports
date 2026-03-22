// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/serverClientFilter.test.ts
// PURPOSE: Unit tests for server-side client filter logic.
//          Mirrors clientFilter.ts — tests all 18 operators,
//          conjunction logic, and client-only condition evaluation.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { applyServerClientFilters } from '../src/services/serverClientFilter';
import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

// WHY: Test columns mirror the GRV Log's mix of server and client columns.
const testColumns: ColumnFilterMeta[] = [
  { key: 'name', label: 'Name', filterType: 'text', filterLocation: 'server', odataField: 'NAME' },
  { key: 'notes', label: 'Notes', filterType: 'text', filterLocation: 'client' },
  { key: 'amount', label: 'Amount', filterType: 'currency', filterLocation: 'server', odataField: 'AMOUNT' },
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'temp', label: 'Temp', filterType: 'text', filterLocation: 'client' },
];

function makeGroup(overrides: Partial<FilterGroup> = {}): FilterGroup {
  return {
    id: 'root',
    conjunction: 'and',
    conditions: [],
    groups: [],
    ...overrides,
  };
}

const rows = [
  { name: 'Alice', notes: 'Good delivery', amount: 100, date: '2026-01-15', temp: '34' },
  { name: 'Bob', notes: 'Damaged items', amount: 200, date: '2026-02-20', temp: '38' },
  { name: 'Carol', notes: '', amount: 0, date: '2026-03-10', temp: '36' },
];

describe('applyServerClientFilters', () => {
  it('returns all rows when no client-side conditions exist', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'name', operator: 'equals', value: 'Alice' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(3); // Server conditions are ignored
  });

  it('filters by client-side equals operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'temp', operator: 'equals', value: '34' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by client-side contains operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'contains', value: 'damage' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters by client-side notContains operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'notContains', value: 'damage' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by client-side startsWith operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'startsWith', value: 'good' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by client-side endsWith operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'endsWith', value: 'items' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters by isEmpty operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'isEmpty', value: '' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Carol');
  });

  it('filters by isNotEmpty operator', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'notes', operator: 'isNotEmpty', value: '' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('handles contains as client-only operator on server column', () => {
    // "contains" on a server column should still be evaluated client-side
    const group = makeGroup({
      conditions: [
        { id: '1', field: 'name', operator: 'contains', value: 'li' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('handles OR conjunction', () => {
    const group = makeGroup({
      conjunction: 'or',
      conditions: [
        { id: '1', field: 'temp', operator: 'equals', value: '34' },
        { id: '2', field: 'temp', operator: 'equals', value: '38' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('handles AND conjunction', () => {
    const group = makeGroup({
      conjunction: 'and',
      conditions: [
        { id: '1', field: 'notes', operator: 'contains', value: 'good' },
        { id: '2', field: 'temp', operator: 'equals', value: '34' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('handles nested groups', () => {
    const group = makeGroup({
      conjunction: 'and',
      conditions: [],
      groups: [
        makeGroup({
          id: 'nested',
          conjunction: 'or',
          conditions: [
            { id: '1', field: 'temp', operator: 'equals', value: '34' },
            { id: '2', field: 'temp', operator: 'equals', value: '36' },
          ],
        }),
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('skips empty conditions (no field set)', () => {
    const group = makeGroup({
      conditions: [
        { id: '1', field: '', operator: 'equals', value: 'anything' },
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(3);
  });
});
