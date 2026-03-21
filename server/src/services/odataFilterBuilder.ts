// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/odataFilterBuilder.ts
// PURPOSE: Converts a FilterGroup tree into an OData $filter string.
//          Only translates server-side columns with OData-compatible
//          operators. Client-side conditions are silently skipped.
// USED BY: routes/query.ts
// EXPORTS: buildODataFilter, escapeODataString
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

// WHY: OData string literals use single quotes. Doubling escapes them.
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CLIENT_ONLY_OPS = new Set(['contains', 'notContains', 'startsWith', 'endsWith']);

function formatValue(
  field: string, op: string, value: string, filterType: string,
): string | undefined {
  if (filterType === 'date') {
    if (!DATE_REGEX.test(value)) return undefined;
    const suffix = op === 'le' ? 'T23:59:59Z' : 'T00:00:00Z';
    return `${field} ${op} ${value}${suffix}`;
  }
  if (filterType === 'number' || filterType === 'currency') {
    const num = parseFloat(value);
    if (isNaN(num)) return undefined;
    return `${field} ${op} ${num}`;
  }
  return `${field} ${op} '${escapeODataString(value)}'`;
}

function buildCondition(
  c: FilterCondition, colMap: Map<string, ColumnFilterMeta>,
): string | undefined {
  const col = colMap.get(c.field);
  if (!col || col.filterLocation !== 'server' || !col.odataField) return undefined;
  if (CLIENT_ONLY_OPS.has(c.operator)) return undefined;

  const f = col.odataField;

  switch (c.operator) {
    case 'equals': return formatValue(f, 'eq', c.value, col.filterType);
    case 'notEquals': return formatValue(f, 'ne', c.value, col.filterType);
    // WHY: isEmpty/isNotEmpty only make sense for text/enum — dates and numbers
    // have no meaningful "empty string" in OData. Skip for other types.
    case 'isEmpty': return col.filterType === 'text' || col.filterType === 'enum' ? `${f} eq ''` : undefined;
    case 'isNotEmpty': return col.filterType === 'text' || col.filterType === 'enum' ? `${f} ne ''` : undefined;
    case 'isBefore': case 'isAfter': case 'isOnOrBefore': case 'isOnOrAfter': {
      if (!DATE_REGEX.test(c.value)) return undefined;
      const dateOps: Record<string, { op: string; suffix: string }> = {
        isBefore: { op: 'lt', suffix: 'T00:00:00Z' },
        isAfter: { op: 'gt', suffix: 'T00:00:00Z' },
        isOnOrBefore: { op: 'le', suffix: 'T23:59:59Z' },
        isOnOrAfter: { op: 'ge', suffix: 'T00:00:00Z' },
      };
      const d = dateOps[c.operator];
      return `${f} ${d.op} ${c.value}${d.suffix}`;
    }
    case 'isBetween': {
      if (!DATE_REGEX.test(c.value) || !c.valueTo || !DATE_REGEX.test(c.valueTo)) return undefined;
      return `${f} ge ${c.value}T00:00:00Z and ${f} le ${c.valueTo}T23:59:59Z`;
    }
    case 'greaterThan': case 'lessThan': case 'greaterOrEqual': case 'lessOrEqual': {
      const num = parseFloat(c.value);
      if (isNaN(num)) return undefined;
      const numOps: Record<string, string> = {
        greaterThan: 'gt', lessThan: 'lt', greaterOrEqual: 'ge', lessOrEqual: 'le',
      };
      return `${f} ${numOps[c.operator]} ${num}`;
    }
    case 'between': {
      const lo = parseFloat(c.value);
      const hi = c.valueTo ? parseFloat(c.valueTo) : NaN;
      if (isNaN(lo) || isNaN(hi)) return undefined;
      return `${f} ge ${lo} and ${f} le ${hi}`;
    }
    default: return undefined;
  }
}

// WHY: In an OR group, if ANY condition is client-side or uses a client-only
// operator, we skip the ENTIRE group. Skipping one branch of an OR means
// we'd miss rows that match it — that's data loss, not over-fetching.
function isFullyServerSide(
  group: FilterGroup, colMap: Map<string, ColumnFilterMeta>,
): boolean {
  for (const c of group.conditions) {
    const col = colMap.get(c.field);
    if (!col || col.filterLocation !== 'server' || !col.odataField) return false;
    if (CLIENT_ONLY_OPS.has(c.operator)) return false;
  }
  return group.groups.every((sub) => isFullyServerSide(sub, colMap));
}

function buildGroup(
  group: FilterGroup, colMap: Map<string, ColumnFilterMeta>,
): string | undefined {
  // WHY: If THIS group is OR and has any client-side conditions/operators,
  // skip the ENTIRE group — partial OR = data loss (missing matching rows).
  if (group.conjunction === 'or' && !isFullyServerSide(group, colMap)) return undefined;

  const parts: string[] = [];

  for (const c of group.conditions) {
    const odata = buildCondition(c, colMap);
    if (odata) parts.push(odata);
  }

  for (const sub of group.groups) {
    // WHY: Child OR groups with mixed conditions must also be skipped.
    if (sub.conjunction === 'or' && !isFullyServerSide(sub, colMap)) continue;
    const subOdata = buildGroup(sub, colMap);
    if (subOdata) parts.push(`(${subOdata})`);
  }

  if (parts.length === 0) return undefined;
  return parts.join(group.conjunction === 'and' ? ' and ' : ' or ');
}

export function buildODataFilter(
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): string | undefined {
  const colMap = new Map(filterColumns.map((c) => [c.key, c]));
  return buildGroup(filterGroup, colMap);
}
