// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSubformQuery.ts
// PURPOSE: TanStack Query hook for lazy-loading sub-form data.
//          Used by expandable row detail panels.
// USED BY: BbdDetailPanel (and future detail panels)
// EXPORTS: useSubformQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';

interface SubformResponse {
  data: Record<string, unknown>[];
}

export function useSubformQuery(reportId: string, rowKey: string) {
  return useQuery<SubformResponse>({
    queryKey: ['subform', reportId, rowKey],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/reports/${encodeURIComponent(reportId)}/subform/${encodeURIComponent(rowKey)}`,
      );
      if (!response.ok) throw new Error(`Subform fetch failed: ${response.status}`);
      return response.json();
    },
    // WHY: Subform data rarely changes mid-session. 5-min stale time
    // prevents re-fetching when the user collapses and re-expands a row.
    staleTime: 5 * 60 * 1000,
    enabled: !!rowKey,
  });
}
