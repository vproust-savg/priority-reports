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
import { nowInLA } from '@shared/utils/timezone';

// --- Shared CSS classes ---

export const DRAG_HANDLE_CLASS =
  'cursor-grab active:cursor-grabbing p-0.5 text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] ' +
  'opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0';

export const FILTER_INPUT_CLASS =
  'text-sm border border-[var(--color-gold-subtle)] rounded-lg px-3 py-2 bg-[var(--color-bg-card)] ' +
  'focus:ring-2 focus:ring-[var(--color-gold-primary)]/20 focus:border-[var(--color-gold-primary)] outline-none transition-colors';

export const FILTER_LABEL_CLASS =
  'text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider';

// --- Operator sets by column type ---

// WHY: Extracted here (not inline in FilterConditionRow) to keep
// that component under 150 lines.
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

// WHY: Default to "Date is in week [current week]" for most reports.
// customer-returns uses "current calendar month" instead — returns span
// months and a full-month view is more useful than a single-week slice.
export function createDefaultFilterGroup(reportId?: string): FilterGroup {
  // WHY: Use LA-now so defaults reflect the Savory Gourmet business
  // calendar, not the browser's or Railway's wall-clock TZ.
  const today = nowInLA();

  if (reportId === 'customer-returns') {
    const fromStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const toStr = toISODate(today);
    return {
      id: 'root',
      conjunction: 'and',
      conditions: [
        {
          id: crypto.randomUUID(),
          field: 'date',
          operator: 'isBetween',
          value: fromStr,
          valueTo: toStr,
        },
      ],
      groups: [],
    };
  }

  const monday = getMonday(today);
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
