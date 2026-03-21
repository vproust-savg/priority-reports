// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/clientFilter.ts
// PURPOSE: Applies filter conditions to data rows that the backend
//          could not handle: client-side columns (HTML-parsed fields)
//          and text-search operators (contains, startsWith, endsWith).
// USED BY: ReportTableWidget.tsx
// EXPORTS: applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups
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

export function hasAnyClientConditions(group: FilterGroup, columns: ColumnFilterMeta[]): boolean {
  for (const c of group.conditions) {
    if (c.field && isClientCondition(c, columns)) return true;
  }
  for (const g of group.groups) {
    if (hasAnyClientConditions(g, columns)) return true;
  }
  return false;
}

function evaluateCondition(row: Record<string, unknown>, condition: FilterCondition): boolean {
  if (!condition.field) return true; // Empty condition — skip
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
  // Only evaluate client-side conditions — server already handled the rest
  const clientConditions = group.conditions.filter(
    (c) => c.field && isClientCondition(c, columns) && (
      c.operator === 'isEmpty' || c.operator === 'isNotEmpty' || c.value
    ),
  );

  const conditionResults = clientConditions.map((c) => evaluateCondition(row, c));
  const groupResults = group.groups.map((g) => evaluateGroup(row, g, columns));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) return true; // No client-side conditions — row passes

  return group.conjunction === 'and'
    ? allResults.every(Boolean)
    : allResults.some(Boolean);
}

export function applyClientFilters(
  rows: Record<string, unknown>[],
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): Record<string, unknown>[] {
  if (!hasAnyClientConditions(filterGroup, filterColumns)) return rows;
  return rows.filter((row) => evaluateGroup(row, filterGroup, filterColumns));
}

// WHY: The backend's odataFilterBuilder silently skips entire OR groups
// that contain any client-side condition (correct safety behavior — partial
// OR = data loss). This function detects when that happens so the UI can
// warn the user that results may include extra rows.
export function hasSkippedOrGroups(
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): boolean {
  // Check if THIS group is an OR with any client-side condition
  if (group.conjunction === 'or') {
    for (const c of group.conditions) {
      if (c.field && isClientCondition(c, columns)) return true;
    }
  }
  // Recurse into child groups
  for (const g of group.groups) {
    if (hasSkippedOrGroups(g, columns)) return true;
  }
  return false;
}
