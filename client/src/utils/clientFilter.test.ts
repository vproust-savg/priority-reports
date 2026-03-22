// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/clientFilter.test.ts
// PURPOSE: Tests for client-side filter logic — condition evaluation,
//          group conjunctions, client-only detection, date stripping,
//          and OR-group skip detection.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import {
  applyClientFilters,
  hasAnyClientConditions,
  hasSkippedOrGroups,
  applyAllFilters,
} from './clientFilter';
import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

const COLUMNS: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME' },
  { key: 'notes', label: 'Notes', filterType: 'text', filterLocation: 'client' },
  { key: 'temp', label: 'Temp', filterType: 'text', filterLocation: 'client' },
];

const ROWS = [
  { date: '2026-01-15', vendor: 'ACME', notes: 'Good delivery', temp: '34' },
  { date: '2026-02-20', vendor: 'Beta', notes: 'Damaged items', temp: '38' },
  { date: '2026-03-10', vendor: 'ACME', notes: '', temp: '36' },
];

function makeGroup(conditions: FilterCondition[], conjunction: 'and' | 'or' = 'and', groups: FilterGroup[] = []): FilterGroup {
  return { id: 'root', conjunction, conditions, groups };
}

function makeCond(field: string, operator: string, value = '', valueTo?: string): FilterCondition {
  return { id: `c-${field}-${operator}`, field, operator: operator as FilterCondition['operator'], value, valueTo };
}

describe('hasAnyClientConditions', () => {
  it('returns false when all conditions are server-side', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'ACME')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(false);
  });

  it('returns true for client-side column', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'good')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });

  it('returns true for client-only operator on server column', () => {
    const group = makeGroup([makeCond('vendor', 'contains', 'ACM')]);
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });

  it('detects client conditions in nested groups', () => {
    const group = makeGroup([], 'and', [
      makeGroup([makeCond('notes', 'equals', 'test')]),
    ]);
    group.groups[0].id = 'nested';
    expect(hasAnyClientConditions(group, COLUMNS)).toBe(true);
  });
});

describe('applyClientFilters', () => {
  it('returns all rows when no client conditions', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'ACME')]);
    expect(applyClientFilters(ROWS, group, COLUMNS)).toHaveLength(3);
  });

  it('filters by client-side contains', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'damage')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('Beta');
  });

  it('filters by client-side equals', () => {
    const group = makeGroup([makeCond('temp', 'equals', '34')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
  });

  it('handles OR conjunction', () => {
    const group = makeGroup([
      makeCond('temp', 'equals', '34'),
      makeCond('temp', 'equals', '38'),
    ], 'or');
    expect(applyClientFilters(ROWS, group, COLUMNS)).toHaveLength(2);
  });

  it('handles AND conjunction', () => {
    const group = makeGroup([
      makeCond('notes', 'contains', 'good'),
      makeCond('temp', 'equals', '34'),
    ], 'and');
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
  });

  it('filters by isEmpty', () => {
    const group = makeGroup([makeCond('notes', 'isEmpty')]);
    const result = applyClientFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(1);
    expect(result[0].vendor).toBe('ACME');
    expect(result[0].date).toBe('2026-03-10');
  });
});

describe('applyAllFilters', () => {
  it('applies non-date server conditions too', () => {
    const group = makeGroup([makeCond('vendor', 'equals', 'acme')]);
    const result = applyAllFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(2);
  });

  it('strips date conditions (handled by server)', () => {
    const group = makeGroup([
      makeCond('date', 'isBefore', '2026-02-01'),
      makeCond('vendor', 'equals', 'acme'),
    ]);
    // date condition stripped — only vendor filter applied
    const result = applyAllFilters(ROWS, group, COLUMNS);
    expect(result).toHaveLength(2);
  });

  it('returns all rows when only date conditions exist', () => {
    const group = makeGroup([makeCond('date', 'isBefore', '2026-02-01')]);
    expect(applyAllFilters(ROWS, group, COLUMNS)).toHaveLength(3);
  });
});

describe('hasSkippedOrGroups', () => {
  it('returns false for AND group with client conditions', () => {
    const group = makeGroup([makeCond('notes', 'contains', 'test')], 'and');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(false);
  });

  it('returns true for OR group with client condition', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('notes', 'contains', 'test'),
    ], 'or');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(true);
  });

  it('returns false for OR group with only server conditions', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('vendor', 'equals', 'Beta'),
    ], 'or');
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(false);
  });

  it('detects skipped OR in nested groups', () => {
    const group = makeGroup([], 'and', [
      makeGroup([
        makeCond('vendor', 'equals', 'ACME'),
        makeCond('notes', 'contains', 'test'),
      ], 'or'),
    ]);
    group.groups[0].id = 'nested';
    expect(hasSkippedOrGroups(group, COLUMNS)).toBe(true);
  });
});
