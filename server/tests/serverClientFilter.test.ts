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
  { key: 'received', label: 'Received', filterType: 'date', filterLocation: 'client' },
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
  { name: 'Alice', notes: 'Good delivery', amount: 100, date: '2026-01-15', temp: '34', received: '2026-01-15' },
  { name: 'Bob', notes: 'Damaged items', amount: 200, date: '2026-02-20', temp: '38', received: '2026-02-20' },
  { name: 'Carol', notes: '', amount: 0, date: '2026-03-10', temp: '36', received: '2026-03-10' },
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

  // --- Numeric operators (temp: '34', '38', '36') ---

  it('filters by greaterThan operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'greaterThan', value: '36' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Bob');
  });

  it('filters by lessThan operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'lessThan', value: '36' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by greaterOrEqual operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'greaterOrEqual', value: '36' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by lessOrEqual operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'lessOrEqual', value: '36' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by between operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'between', value: '35', valueTo: '37' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Carol');
  });

  // --- Date operators (received: '2026-01-15', '2026-02-20', '2026-03-10') ---

  it('filters by isBefore operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isBefore', value: '2026-02-01' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('filters by isAfter operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isAfter', value: '2026-02-28' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Carol');
  });

  it('filters by isOnOrBefore operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isOnOrBefore', value: '2026-02-20' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by isOnOrAfter operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isOnOrAfter', value: '2026-02-20' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by isBetween operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isBetween', value: '2026-01-01', valueTo: '2026-02-28' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
  });

  it('filters by client-side notEquals operator', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'temp', operator: 'notEquals', value: '34' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.name)).toEqual(['Bob', 'Carol']);
  });

  it('filters by isInWeek operator (date range)', () => {
    const group = makeGroup({
      conditions: [{ id: '1', field: 'received', operator: 'isInWeek', value: '2026-01-13', valueTo: '2026-01-19' }],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice');
  });

  it('equals is case-insensitive', () => {
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'equals', value: 'GOOD DELIVERY' }] });
    expect(applyServerClientFilters(rows, group, testColumns)).toHaveLength(1);
  });

  it('startsWith is case-insensitive', () => {
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'startsWith', value: 'GOOD' }] });
    expect(applyServerClientFilters(rows, group, testColumns)[0].name).toBe('Alice');
  });

  it('endsWith is case-insensitive', () => {
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'endsWith', value: 'ITEMS' }] });
    expect(applyServerClientFilters(rows, group, testColumns)[0].name).toBe('Bob');
  });

  it('handles null cell value in contains without crashing', () => {
    const nullRow = [{ name: 'Dan', notes: null, amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'contains', value: 'test' }] });
    expect(applyServerClientFilters(nullRow, group, testColumns)).toHaveLength(0);
  });

  it('handles undefined cell value in equals without crashing', () => {
    const undefRow = [{ name: 'Eve', amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'equals', value: 'test' }] });
    expect(applyServerClientFilters(undefRow, group, testColumns)).toHaveLength(0);
  });

  it('isEmpty returns true for null cell value', () => {
    const nullRow = [{ name: 'Dan', notes: null, amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'isEmpty', value: '' }] });
    expect(applyServerClientFilters(nullRow, group, testColumns)).toHaveLength(1);
  });

  it('isEmpty returns true for undefined cell value', () => {
    const undefRow = [{ name: 'Eve', amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'isEmpty', value: '' }] });
    expect(applyServerClientFilters(undefRow, group, testColumns)).toHaveLength(1);
  });

  it('isEmpty returns true for whitespace-only cell', () => {
    const wsRow = [{ name: 'Frank', notes: '   ', amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'isEmpty', value: '' }] });
    expect(applyServerClientFilters(wsRow, group, testColumns)).toHaveLength(1);
  });

  it('isNotEmpty returns false for whitespace-only cell', () => {
    const wsRow = [{ name: 'Frank', notes: '   ', amount: 50, date: '2026-04-01', temp: '30', received: '2026-04-01' }];
    const group = makeGroup({ conditions: [{ id: '1', field: 'notes', operator: 'isNotEmpty', value: '' }] });
    expect(applyServerClientFilters(wsRow, group, testColumns)).toHaveLength(0);
  });

  it('handles nested AND inside OR group', () => {
    const group = makeGroup({
      conjunction: 'or',
      conditions: [],
      groups: [
        makeGroup({
          id: 'nested-and-1',
          conjunction: 'and',
          conditions: [
            { id: '1', field: 'temp', operator: 'equals', value: '34' },
            { id: '2', field: 'notes', operator: 'contains', value: 'good' },
          ],
        }),
        makeGroup({
          id: 'nested-and-2',
          conjunction: 'and',
          conditions: [
            { id: '3', field: 'temp', operator: 'equals', value: '38' },
            { id: '4', field: 'notes', operator: 'contains', value: 'damage' },
          ],
        }),
      ],
    });
    const result = applyServerClientFilters(rows, group, testColumns);
    expect(result).toHaveLength(2); // Alice and Bob
  });

  it('empty group with no conditions returns all rows', () => {
    expect(applyServerClientFilters(rows, makeGroup({ conditions: [], groups: [] }), testColumns)).toHaveLength(3);
  });

  it('skips conditions with empty value (except isEmpty/isNotEmpty)', () => {
    const group = makeGroup({ conditions: [{ id: '1', field: 'temp', operator: 'equals', value: '' }] });
    expect(applyServerClientFilters(rows, group, testColumns)).toHaveLength(3);
  });

  it('unknown operator returns true (matches all)', () => {
    const group = makeGroup({ conditions: [{ id: '1', field: 'temp', operator: 'unknownOp' as any, value: 'whatever' }] });
    expect(applyServerClientFilters(rows, group, testColumns)).toHaveLength(3);
  });
});
