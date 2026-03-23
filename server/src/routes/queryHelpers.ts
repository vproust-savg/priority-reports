// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/queryHelpers.ts
// PURPOSE: Helper functions for the POST /query endpoint.
//          Extracted to keep query.ts under 200 lines.
// USED BY: routes/query.ts
// EXPORTS: CLIENT_FILTER_MAX_FETCH, hasClientOnlyConditions
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

// WHY: When request has client-only filter conditions, the server can't
// rely on OData $top for accurate pagination because post-enrichment
// filtering reduces the row count. Fetch up to this many rows, filter,
// then paginate server-side.
export const CLIENT_FILTER_MAX_FETCH = 500;

const CLIENT_ONLY_OPS = new Set(['contains', 'notContains', 'startsWith', 'endsWith']);

// WHY: Recursively checks nested groups — a client-only condition
// inside a nested OR group must still trigger post-enrichment filtering.
export function hasClientOnlyConditions(
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): boolean {
  for (const c of filterGroup.conditions) {
    if (!c.field) continue;
    const col = filterColumns.find((fc) => fc.key === c.field);
    if (col?.filterLocation === 'client' || CLIENT_ONLY_OPS.has(c.operator)) return true;
  }
  for (const g of filterGroup.groups) {
    if (hasClientOnlyConditions(g, filterColumns)) return true;
  }
  return false;
}
