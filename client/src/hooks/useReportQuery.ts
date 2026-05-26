// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Fetches report data via POST /query endpoint. Accepts a
//          FilterGroup tree instead of flat query params.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}

// WHY: When disableCache:true, the hook flips TanStack to "always stale,
// always refetch on mount, no GC retention" so the user never sees stale
// data after re-mount or identical re-renders. Used by grv-log.
interface ReportQueryOptions {
  disableCache?: boolean;
}

export function useReportQuery(
  reportId: string,
  params: ReportQueryParams,
  options: ReportQueryOptions = {},
) {
  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, params],
    queryFn: async () => {
      const body: QueryRequest = {
        filterGroup: params.filterGroup,
        page: params.page,
        pageSize: params.pageSize,
      };
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Report query failed: ${response.status}`);
      return response.json();
    },
    // WHY: disableCache reports skip both stale-time caching AND retention
    // across unmounts. Standard reports keep the 15-min staleTime to match
    // server Redis TTL.
    staleTime: options.disableCache ? 0 : 15 * 60 * 1000,
    gcTime: options.disableCache ? 0 : undefined,
    refetchOnMount: options.disableCache ? 'always' : true,
    // WHY: No keepPreviousData — show skeleton on every data change.
    // Old data showing silently made the app feel broken.
    refetchOnWindowFocus: false,
  });
}
