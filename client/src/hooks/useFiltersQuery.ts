// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFiltersQuery.ts
// PURPOSE: Fetches filter options and column metadata for a report.
//          Response includes enum dropdown values (vendors, statuses,
//          warehouses, users) and column filter configuration.
// USED BY: ReportTableWidget
// EXPORTS: useFiltersQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { FiltersResponse, PriorityEnvironment } from '@shared/types';

export function useFiltersQuery(reportId: string, environment?: PriorityEnvironment) {
  return useQuery<FiltersResponse>({
    // WHY: env in the key — UAT vendor options must never render while
    // the toggle says Live (and vice versa).
    queryKey: ['filters', reportId, environment],
    queryFn: async ({ signal }) => {
      const url = environment
        ? `/api/v1/reports/${reportId}/filters?environment=${environment}`
        : `/api/v1/reports/${reportId}/filters`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
