// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFiltersQuery.ts
// PURPOSE: TanStack Query hook for fetching report filter options.
//          Returns vendor and status lists for dropdown population.
//          Cached for 5 minutes — filter options change infrequently.
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
    // WHY: 5 minutes — filter options (vendor list, status list) change infrequently
    staleTime: 5 * 60 * 1000,
  });
}
