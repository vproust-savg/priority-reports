// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/serverClientFilter.ts
// PURPOSE: Server-side replica of client/src/utils/clientFilter.ts.
//          Applies client-only filter conditions to rows so exported
//          data matches what the user sees in the dashboard.
// WHY NOT SHARED: The shared/ directory is types-only per project
//          convention. This is intentional duplication (~70 lines).
// USED BY: routes/export.ts, routes/query.ts
// EXPORTS: applyServerClientFilters
// ═══════════════════════════════════════════════════════════════

import type { FilterCondition, FilterGroup, ColumnFilterMeta } from '@shared/types';

const CLIENT_ONLY_OPERATORS = new Set([
  'contains', 'notContains', 'startsWith', 'endsWith',
]);

function isClientCondition(condition: FilterCondition, columns: ColumnFilterMeta[]): boolean {
  const col = columns.find((c) => c.key === condition.field);
  if (!col) return false;
  return col.filterLocation === 'client' || CLIENT_ONLY_OPERATORS.has(condition.operator);
}

function evaluateCondition(row: Record<string, unknown>, condition: FilterCondition): boolean {
  if (!condition.field) return true;
  const cellValue = row[condition.field];
  const str = String(cellValue ?? '').toLowerCase();
  const val = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'equals': return str === val;
    case 'notEquals': return str !== val;
    case 'contains': return str.includes(val);
    case 'notContains': return !str.includes(val);
    case 'startsWith': return str.startsWith(val);
    case 'endsWith': return str.endsWith(val);
    case 'isEmpty': return cellValue == null || String(cellValue).trim() === '';
    case 'isNotEmpty': return cellValue != null && String(cellValue).trim() !== '';
    case 'greaterThan': return parseFloat(String(cellValue ?? '0')) > parseFloat(condition.value);
    case 'lessThan': return parseFloat(String(cellValue ?? '0')) < parseFloat(condition.value);
    case 'greaterOrEqual': return parseFloat(String(cellValue ?? '0')) >= parseFloat(condition.value);
    case 'lessOrEqual': return parseFloat(String(cellValue ?? '0')) <= parseFloat(condition.value);
    case 'between': {
      const num = parseFloat(String(cellValue ?? '0'));
      return num >= parseFloat(condition.value) && num <= parseFloat(condition.valueTo ?? condition.value);
    }
    case 'isBefore': return new Date(String(cellValue)) < new Date(condition.value);
    case 'isAfter': return new Date(String(cellValue)) > new Date(condition.value);
    case 'isOnOrBefore': return new Date(String(cellValue)) <= new Date(condition.value);
    case 'isOnOrAfter': return new Date(String(cellValue)) >= new Date(condition.value);
    case 'isInWeek': // Falls through — same date range check as isBetween
    case 'isBetween': {
      const d = new Date(String(cellValue));
      return d >= new Date(condition.value) && d <= new Date(condition.valueTo ?? condition.value);
    }
    default: return true;
  }
}

function evaluateGroup(
  row: Record<string, unknown>,
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): boolean {
  const clientConditions = group.conditions.filter(
    (c) => c.field && isClientCondition(c, columns) && (
      c.operator === 'isEmpty' || c.operator === 'isNotEmpty' || c.value
    ),
  );

  const conditionResults = clientConditions.map((c) => evaluateCondition(row, c));
  const groupResults = group.groups.map((g) => evaluateGroup(row, g, columns));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) return true;

  return group.conjunction === 'and'
    ? allResults.every(Boolean)
    : allResults.some(Boolean);
}

export function applyServerClientFilters(
  rows: Record<string, unknown>[],
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): Record<string, unknown>[] {
  return rows.filter((row) => evaluateGroup(row, filterGroup, filterColumns));
}
