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

export function useReportQuery(reportId: string, params: ReportQueryParams) {
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
    // WHY: Match server cache TTL (15 min). Within this window,
    // TanStack serves from its local cache — no network request at all.
    staleTime: 15 * 60 * 1000,
    // WHY: No keepPreviousData — show skeleton on every data change.
    // Old data showing silently made the app feel broken. With 15-min
    // cache, most loads are instant (0ms) so skeleton barely flashes.
    refetchOnWindowFocus: false,
  });
}
