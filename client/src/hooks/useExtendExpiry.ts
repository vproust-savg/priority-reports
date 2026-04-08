// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendExpiry.ts
// PURPOSE: TanStack Query v5 mutation hook for extending expiry
//          dates via POST /api/v1/reports/bbd/extend. Invalidates
//          the BBD report cache on success.
// USED BY: ExtendExpiryModal, BulkExtendModal (via useBBDExtend)
// EXPORTS: useExtendExpiry, ExtendRequest, ExtendResponse, ExtendResult
// ═══════════════════════════════════════════════════════════════

import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface ExtendRequest {
  items: Array<{ serialName: string; days: number }>;
}

export interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

export interface ExtendResponse {
  results: ExtendResult[];
}

export function useExtendExpiry() {
  const queryClient = useQueryClient();

  const mutation = useMutation<ExtendResponse, Error, ExtendRequest>({
    mutationFn: async (request) => {
      const res = await fetch('/api/v1/reports/bbd/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? `Request failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // WHY: Prefix-based invalidation refreshes all BBD query variants
      // (any filter/pagination combo). Same pattern as handleRefresh.
      queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] });
    },
  });

  return {
    extend: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
