// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/refreshDateRange.test.ts
// PURPOSE: Verify date range derivation for a source refresh.
// USED BY: Vitest
// EXPORTS: none
// ═══════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import type { FilterCondition, FilterGroup, FilterOperator } from '@shared/types';
import { getRefreshDateRange } from './refreshDateRange';

function root(...conditions: FilterCondition[]): FilterGroup {
  return { id: 'root', conjunction: 'and', conditions, groups: [] };
}

function date(operator: FilterOperator, value: string, valueTo?: string): FilterCondition {
  return { id: 'date', field: 'date', operator, value, valueTo };
}

const today = '2026-11-02';

describe('getRefreshDateRange', () => {
  it.each([
    { operator: 'isBetween', value: '2026-10-04', valueTo: '2026-11-03', from: '2026-10-04', to: '2026-11-03' },
    { operator: 'isInWeek', value: '2026-11-02', valueTo: '2026-11-08', from: '2026-11-02', to: '2026-11-08' },
    { operator: 'equals', value: '2026-11-01', from: '2026-11-01', to: '2026-11-01' },
    { operator: 'isOnOrAfter', value: '2026-10-03', from: '2026-10-03', to: today },
    { operator: 'isAfter', value: '2026-10-31', from: '2026-11-01', to: today },
  ] satisfies Array<{ operator: FilterOperator; value: string; valueTo?: string; from: string; to: string }>)(
    'derives the inclusive range for $operator',
    ({ operator, value, valueTo, from, to }) => {
      const vendor: FilterCondition = { id: 'vendor', field: 'vendor', operator: 'equals', value: 'Acme' };
      expect(getRefreshDateRange(root(vendor, date(operator, value, valueTo)), today)).toEqual({ range: { from, to } });
    },
  );

  it.each(['isBefore', 'isOnOrBefore', 'notEquals', 'isEmpty', 'isNotEmpty'] as const)(
    'rejects %s',
    (operator) => {
      expect(getRefreshDateRange(root(date(operator, today)), today)).toEqual({ reason: 'invalidDates' });
    },
  );

  it('requires a Date condition in a root AND group', () => {
    const datedGroup = root(date('equals', today));
    for (const group of [root(), { ...datedGroup, conjunction: 'or' } as const, {
      ...root(), groups: [{ ...datedGroup, id: 'nested' }],
    }]) {
      expect(getRefreshDateRange(group, today)).toEqual({ reason: 'invalidDates' });
    }
  });

  it.each([
    { condition: date('isBetween', today), reason: 'invalidDates' },
    { condition: date('isAfter', '2026-02-29'), reason: 'invalidDates' },
    { condition: date('isAfter', today), reason: 'reversed' },
    { condition: date('isBetween', '2026-11-03', today), reason: 'reversed' },
    { condition: date('isBetween', '2026-10-02', today), reason: 'tooLong' },
  ])('rejects a range with reason $reason', ({ condition, reason }) => {
    expect(getRefreshDateRange(root(condition), today)).toEqual({ reason });
  });
});
