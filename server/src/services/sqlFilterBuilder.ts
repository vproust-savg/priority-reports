// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/sqlFilterBuilder.ts
// PURPOSE: Converts a FilterGroup tree into a parameterized Postgres WHERE
//          clause for the priority_reports.grv_receiving_log view.
//          Text/enum/number semantics mirror applyServerClientFilters;
//          date semantics mirror odataFilterBuilder (inclusive day bounds).
// USED BY: GRV Supabase query path (later task)
// EXPORTS: buildSqlWhere
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup, FilterCondition, ColumnFilterMeta, FilterOperator } from '@shared/types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// WHY: Column names cannot be bound as parameters, so they are the one thing
// interpolated into SQL. They come only from server-side config (sqlColumn),
// and this allow-list makes a bad config skip the condition instead of injecting.
const SQL_IDENTIFIER_REGEX = /^[a-z_][a-z0-9_]*$/;

interface BuiltCondition {
  // Placeholders appear as `?` here and are numbered by the caller, so a
  // skipped condition never consumes a $n.
  sql: string;
  params: unknown[];
}

// WHY: Numbering happens once, at the end of each condition, so the SQL
// text here is written with `?` placeholders in parameter order.
function placeholder(): string {
  return '?';
}

// WHY: LIKE treats \, % and _ as special. Escape them in the bound value so a
// user searching for "50%_" matches that literal text (paired with ESCAPE '\').
function escapeLikeValue(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function buildTextCondition(
  quotedColumn: string, operator: FilterOperator, value: string,
): BuiltCondition | undefined {
  // WHY: NULL is treated as '' and compared case-insensitively, as the JS filter does.
  const text = `lower(coalesce(${quotedColumn}, ''))`;
  const p = placeholder();
  switch (operator) {
    case 'equals': return { sql: `${text} = lower(${p})`, params: [value] };
    case 'notEquals': return { sql: `${text} <> lower(${p})`, params: [value] };
    case 'contains':
      return { sql: `${text} LIKE '%' || lower(${p}) || '%' ESCAPE '\\'`, params: [escapeLikeValue(value)] };
    case 'notContains':
      return { sql: `${text} NOT LIKE '%' || lower(${p}) || '%' ESCAPE '\\'`, params: [escapeLikeValue(value)] };
    case 'startsWith':
      return { sql: `${text} LIKE lower(${p}) || '%' ESCAPE '\\'`, params: [escapeLikeValue(value)] };
    case 'endsWith':
      return { sql: `${text} LIKE '%' || lower(${p}) ESCAPE '\\'`, params: [escapeLikeValue(value)] };
    case 'isEmpty': return { sql: `btrim(coalesce(${quotedColumn}, '')) = ''`, params: [] };
    case 'isNotEmpty': return { sql: `btrim(coalesce(${quotedColumn}, '')) <> ''`, params: [] };
    default: return undefined;
  }
}

function buildNumberCondition(
  quotedColumn: string, operator: FilterOperator, value: string, valueTo: string | undefined,
): BuiltCondition | undefined {
  // WHY: Emptiness on a number is a NULL test. Casting to text would be a
  // Postgres type error, and the JS filter only calls null/undefined empty.
  if (operator === 'isEmpty') return { sql: `${quotedColumn} IS NULL`, params: [] };
  if (operator === 'isNotEmpty') return { sql: `${quotedColumn} IS NOT NULL`, params: [] };

  const num = parseFloat(value);
  if (isNaN(num)) return undefined;
  // WHY: NULL counts as 0, matching the JS filter's `cellValue ?? '0'`.
  const n = `coalesce(${quotedColumn}, 0)`;
  const p = placeholder();
  switch (operator) {
    case 'equals': return { sql: `${n} = ${p}`, params: [num] };
    case 'notEquals': return { sql: `${n} <> ${p}`, params: [num] };
    case 'greaterThan': return { sql: `${n} > ${p}`, params: [num] };
    case 'lessThan': return { sql: `${n} < ${p}`, params: [num] };
    case 'greaterOrEqual': return { sql: `${n} >= ${p}`, params: [num] };
    case 'lessOrEqual': return { sql: `${n} <= ${p}`, params: [num] };
    case 'between': {
      const hi = valueTo ? parseFloat(valueTo) : NaN;
      if (isNaN(hi) || num > hi) return undefined;
      return { sql: `${n} BETWEEN ${p} AND ${p}`, params: [num, hi] };
    }
    default: return undefined;
  }
}

function buildDateCondition(
  quotedColumn: string, operator: FilterOperator, value: string, valueTo: string | undefined,
): BuiltCondition | undefined {
  if (operator === 'isEmpty') return { sql: `${quotedColumn} IS NULL`, params: [] };
  if (operator === 'isNotEmpty') return { sql: `${quotedColumn} IS NOT NULL`, params: [] };

  if (!DATE_REGEX.test(value)) return undefined;
  const p = `${placeholder()}::date`;
  const comparators: Partial<Record<FilterOperator, string>> = {
    equals: '=', notEquals: '<>', isBefore: '<', isAfter: '>', isOnOrBefore: '<=', isOnOrAfter: '>=',
  };
  const comparator = comparators[operator];
  if (comparator) return { sql: `${quotedColumn} ${comparator} ${p}`, params: [value] };

  if (operator === 'isBetween' || operator === 'isInWeek') {
    if (!valueTo || !DATE_REGEX.test(valueTo)) return undefined;
    // WHY: Same rule as odataFilterBuilder: an inverted range matches nothing, so skip it.
    if (value > valueTo) return undefined;
    // WHY: The column is a Postgres `date`, so BETWEEN is already inclusive of both days.
    return { sql: `${quotedColumn} BETWEEN ${p} AND ${p}`, params: [value, valueTo] };
  }
  return undefined;
}

function buildCondition(
  c: FilterCondition, colMap: Map<string, ColumnFilterMeta>,
): BuiltCondition | undefined {
  if (!c.field) return undefined;
  const col = colMap.get(c.field);
  if (!col || !col.sqlColumn || !SQL_IDENTIFIER_REGEX.test(col.sqlColumn)) return undefined;
  // WHY: Same skip rule as applyServerClientFilters: an empty value means "no filter yet".
  if (c.operator !== 'isEmpty' && c.operator !== 'isNotEmpty' && !c.value) return undefined;

  const quotedColumn = `"${col.sqlColumn}"`;
  switch (col.filterType) {
    case 'text':
    case 'enum':
      return buildTextCondition(quotedColumn, c.operator, c.value);
    case 'number':
    case 'currency':
      return buildNumberCondition(quotedColumn, c.operator, c.value, c.valueTo);
    case 'date':
      return buildDateCondition(quotedColumn, c.operator, c.value, c.valueTo);
    default: return undefined;
  }
}

// WHY: Numbering is assigned here, after a condition is known to be kept,
// so skipped conditions leave no gaps in $n.
function numberPlaceholders(sql: string, startIndex: number): string {
  let index = startIndex;
  return sql.replace(/\?/g, () => `$${index++}`);
}

function buildGroup(
  group: FilterGroup, colMap: Map<string, ColumnFilterMeta>, state: { nextIndex: number; params: unknown[] },
): string | undefined {
  const parts: string[] = [];

  for (const c of group.conditions) {
    const built = buildCondition(c, colMap);
    if (!built) continue;
    parts.push(numberPlaceholders(built.sql, state.nextIndex));
    state.nextIndex += built.params.length;
    state.params.push(...built.params);
  }

  for (const sub of group.groups) {
    const subSql = buildGroup(sub, colMap, state);
    if (subSql) parts.push(`(${subSql})`);
  }

  if (parts.length === 0) return undefined;
  return parts.join(group.conjunction === 'and' ? ' AND ' : ' OR ');
}

export function buildSqlWhere(
  group: FilterGroup,
  filterColumns: ColumnFilterMeta[],
  firstParamIndex = 1,
): { clause: string | undefined; params: unknown[] } {
  const colMap = new Map(filterColumns.map((c) => [c.key, c]));
  const state = { nextIndex: firstParamIndex, params: [] as unknown[] };
  const clause = buildGroup(group, colMap, state);
  return { clause, params: state.params };
}
