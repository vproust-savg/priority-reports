// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFiltersQuery.ts
// PURPOSE: Fetches filter options and column metadata for a report.
//          Response includes enum dropdown values (vendors, statuses,
//          warehouses, users) and column filter configuration.
// USED BY: ReportTableWidget
// EXPORTS: useFiltersQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { FiltersResponse } from '@shared/types';

export function useFiltersQuery(reportId: string) {
  return useQuery<FiltersResponse>({
    queryKey: ['filters', reportId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/reports/${reportId}/filters`);
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
