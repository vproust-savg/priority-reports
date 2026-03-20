// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Thin wrapper around TanStack Query for fetching report data.
//          ALL widgets use this hook. No direct API calls in components.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse } from '@shared/types';

interface ReportQueryParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
}

export function useReportQuery(reportId: string, params: ReportQueryParams = {}) {
  return useQuery<ApiResponse>({
    // WHY: queryKey includes all params so TanStack Query caches
    // each page/filter combination separately.
    queryKey: ['report', reportId, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', String(params.page));
      if (params.pageSize) searchParams.set('pageSize', String(params.pageSize));
      if (params.from) searchParams.set('from', params.from);
      if (params.to) searchParams.set('to', params.to);
      if (params.vendor) searchParams.set('vendor', params.vendor);
      if (params.status) searchParams.set('status', params.status);

      const url = `/api/v1/reports/${reportId}?${searchParams}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Report fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // WHY: 5 minutes before refetch — matches server-side cache TTL
  });
}
