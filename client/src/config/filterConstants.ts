// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.ts
// PURPOSE: Operator definitions, factory functions, and shared CSS
//          classes for the filter builder system. Extracted to keep
//          component files under 150 lines.
// USED BY: FilterConditionRow.tsx, FilterBuilder.tsx, ReportTableWidget.tsx
// EXPORTS: OPERATORS_BY_TYPE, FILTER_INPUT_CLASS, FILTER_LABEL_CLASS,
//          createEmptyCondition, createEmptyGroup, createDefaultFilterGroup,
//          countActiveFilters
// ═══════════════════════════════════════════════════════════════

import type { ColumnFilterType, FilterCondition, FilterGroup, FilterOperator } from '@shared/types';
import { getMonday, getSunday, toISODate } from '../utils/weekUtils';

// --- Shared CSS classes ---

export const FILTER_INPUT_CLASS =
  'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white ' +
  'focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors';

export const FILTER_LABEL_CLASS =
  'text-xs font-medium text-slate-400 uppercase tracking-wider';

// --- Operator sets by column type ---

// WHY: Extracted here (not inline in FilterConditionRow) to keep
// that component under 150 lines. Also reusable by clientFilter.ts.
export const OPERATORS_BY_TYPE: Record<ColumnFilterType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'isBefore', label: 'is before' },
    { value: 'isAfter', label: 'is after' },
    { value: 'isOnOrBefore', label: 'is on or before' },
    { value: 'isOnOrAfter', label: 'is on or after' },
    { value: 'isBetween', label: 'is between' },
    { value: 'isInWeek', label: 'is in week' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'notEquals', label: '≠' },
    { value: 'greaterThan', label: '>' },
    { value: 'lessThan', label: '<' },
    { value: 'greaterOrEqual', label: '≥' },
    { value: 'lessOrEqual', label: '≤' },
    { value: 'between', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  currency: [
    { value: 'equals', label: '=' },
    { value: 'notEquals', label: '≠' },
    { value: 'greaterThan', label: '>' },
    { value: 'lessThan', label: '<' },
    { value: 'greaterOrEqual', label: '≥' },
    { value: 'lessOrEqual', label: '≤' },
    { value: 'between', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  enum: [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
};

// WHY: `between` for numbers, `isBetween` for dates. Both produce
// "X ge Y and X le Z" in OData. Names differ because the backend
// FilterOperator type groups them by category. The filter engine
// treats them identically.

// --- Factory functions ---

export function createEmptyCondition(): FilterCondition {
  return {
    id: crypto.randomUUID(),
    field: '',
    operator: 'equals',
    value: '',
  };
}

export function createEmptyGroup(): FilterGroup {
  return {
    id: crypto.randomUUID(),
    // WHY: Nested groups default to OR — most common use case is
    // "status is A OR status is B"
    conjunction: 'or',
    conditions: [createEmptyCondition()],
    groups: [],
  };
}

// WHY: Default to "Date is in week [current week]" — a single condition
// instead of two date-range conditions. Matches the most common use case.
export function createDefaultFilterGroup(): FilterGroup {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);

  return {
    id: 'root',
    conjunction: 'and',
    conditions: [
      {
        id: crypto.randomUUID(),
        field: 'date',
        operator: 'isInWeek',
        value: toISODate(monday),
        valueTo: toISODate(sunday),
      },
    ],
    groups: [],
  };
}

// --- Active filter counting ---

export function countActiveFilters(group: FilterGroup): number {
  let count = 0;
  for (const c of group.conditions) {
    if (!c.field) continue;
    if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') { count++; continue; }
    if (c.value) count++;
  }
  for (const g of group.groups) {
    count += countActiveFilters(g);
  }
  return count;
}
