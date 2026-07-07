// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendExpiry.ts
// PURPOSE: TanStack Query v5 mutation hook for extending expiry
//          dates via POST /api/v1/reports/bbd/extend. Invalidates
//          the BBD report cache on success.
// USED BY: ExtendExpiryModal, BulkExtendModal (via useBBDExtend)
// EXPORTS: useExtendExpiry, ExtendRequest, ExtendResponse, ExtendResult
// ═══════════════════════════════════════════════════════════════

import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface RowData {
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  expiryDate: string;
}

export interface ExtendRequest {
  items: Array<{ serialName: string; days: number; rowData?: RowData }>;
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

// WHY: Bulk runs pass invalidateOnSuccess:false — 20 chunk mutations would
// otherwise trigger 20 mid-run refetches; the bulk modal invalidates once at end.
export function useExtendExpiry(options: { invalidateOnSuccess?: boolean } = {}) {
  const { invalidateOnSuccess = true } = options;
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
        // WHY: Validation 400s carry field-level Zod issues in `details`.
        // Surface the first one so the modal says WHICH field failed and why
        // (a bare "Invalid request" hid the vendor:null root cause for months).
        const issue = Array.isArray(errorData.details) ? errorData.details[0] : undefined;
        const detail = issue?.message
          ? ` — ${Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') + ': ' : ''}${issue.message}`
          : '';
        throw new Error((errorData.error ?? `Request failed: ${res.status}`) + detail);
      }
      return res.json();
    },
    onSuccess: () => {
      // WHY: Prefix-based invalidation refreshes all BBD query variants
      // (any filter/pagination combo). Same pattern as handleRefresh.
      if (invalidateOnSuccess) {
        queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] });
      }
    },
  });

  return {
    extend: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
