// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useBaseDataset.ts
// PURPOSE: Fetches the full enriched dataset for a date range via
//          POST /query with baseMode=true. Non-date filters are
//          applied client-side for instant filter responses.
// USED BY: ReportTableWidget
// EXPORTS: useBaseDataset, extractDateConditions
// ═══════════════════════════════════════════════════════════════

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { ApiResponse, FilterGroup, ColumnFilterMeta } from '@shared/types';

const DATE_OPERATORS = new Set([
  'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isInWeek',
]);

function isDateCondition(field: string, operator: string, columns: ColumnFilterMeta[]): boolean {
  const col = columns.find((c) => c.key === field);
  if (!col) return false;
  if (col.filterType === 'date') return true;
  // WHY: Date operators on any field count as date conditions
  return DATE_OPERATORS.has(operator);
}

// WHY: Extracts only date conditions from the full filter tree.
// The resulting group is used as the base query — it only changes
// when the user changes the date range, not when they change vendor/status.
export function extractDateConditions(
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): FilterGroup {
  const dateConditions = group.conditions.filter(
    (c) => c.field && isDateCondition(c.field, c.operator, columns),
  );

  // WHY: Recurse into nested groups to pick up date conditions there too
  const dateGroups = group.groups
    .map((g) => extractDateConditions(g, columns))
    .filter((g) => g.conditions.length > 0 || g.groups.length > 0);

  return {
    id: group.id,
    conjunction: group.conjunction,
    conditions: dateConditions,
    groups: dateGroups,
  };
}

export function useBaseDataset(
  reportId: string,
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
  // WHY: Only start the expensive base query AFTER the quick query completes.
  // Both queries share the Priority rate limiter — running them simultaneously
  // makes the quick query slow too (they compete for rate limit slots).
  enabled: boolean,
) {
  // WHY: useMemo ensures the date-only group is stable across renders.
  // Only recomputes when filterGroup or filterColumns change.
  const dateOnlyGroup = useMemo(
    () => extractDateConditions(filterGroup, filterColumns),
    [filterGroup, filterColumns],
  );

  // WHY: Stringify for a stable query key — object identity changes on
  // every render but the serialized form only changes when dates change.
  const dateGroupKey = useMemo(
    () => JSON.stringify(dateOnlyGroup),
    [dateOnlyGroup],
  );

  return useQuery<ApiResponse>({
    // WHY: Query key only includes date conditions, so changing vendor/status
    // doesn't trigger a refetch — only date range changes do.
    queryKey: ['base', reportId, dateGroupKey],
    enabled,
    queryFn: async () => {
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroup: dateOnlyGroup,
          page: 1,
          pageSize: 1000,
          baseMode: true,
        }),
      });
      if (!response.ok) throw new Error(`Base query failed: ${response.status}`);
      return response.json();
    },
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    // WHY: Shows previous data while new date range loads instead of
    // flashing a skeleton — makes the app feel much more responsive.
    placeholderData: keepPreviousData,
  });
}
