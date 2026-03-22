// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Fetches report data via POST /query endpoint. Accepts a
//          FilterGroup tree instead of flat query params.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}

export function useReportQuery(reportId: string, params: ReportQueryParams) {
  return useQuery<ApiResponse>({
    // WHY: queryKey includes stringified filterGroup so TanStack Query
    // caches each filter combination separately
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
    staleTime: 5 * 60 * 1000,
    // WHY: Shows previous results while new data loads instead of flashing
    // a skeleton on every filter change. Makes filter changes feel instant.
    placeholderData: keepPreviousData,
    // WHY: Prevents unnecessary refetches when user switches browser tabs
    refetchOnWindowFocus: false,
  });
}
