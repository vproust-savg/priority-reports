// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendedQuery.ts
// PURPOSE: TanStack Query v5 hook for fetching extended BBD items
//          from GET /api/v1/reports/bbd/extended. Returns Airtable
//          data with live Priority balances.
// USED BY: BBDExtendedView
// EXPORTS: useExtendedQuery, ExtendedResponse
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ColumnDefinition, PaginationMeta } from '@shared/types';

export interface ExtendedResponse {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  pagination: PaginationMeta;
  meta: { source: string; generatedAt: string };
  warnings?: string[];
}

export function useExtendedQuery() {
  return useQuery<ExtendedResponse>({
    queryKey: ['report', 'bbd', 'extended'],
    queryFn: async () => {
      const response = await fetch('/api/v1/reports/bbd/extended');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? `Extended items fetch failed: ${response.status}`);
      }
      return response.json();
    },
    // WHY: 5-minute stale time. Extended data changes only on extension
    // (which triggers invalidation via prefix matching). Window refocus
    // would trigger unnecessary Priority balance refresh calls.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
