// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/BBDExtendedView.tsx
// PURPOSE: Extended tab view for the BBD report. Fetches from
//          Airtable via useExtendedQuery, renders ReportTable
//          with copyable Lot/Part cells and a refresh button.
// USED BY: ReportTableWidget (rendered when activeSubTab === 'extended')
// EXPORTS: BBDExtendedView (default)
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useExtendedQuery } from '../hooks/useExtendedQuery';
import ReportTable from './ReportTable';
import Pagination from './Pagination';
import LoadingToast from './LoadingToast';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';
import CopyableCell from './cells/CopyableCell';
import Toast from './Toast';

const PAGE_SIZE = 50;

export default function BBDExtendedView() {
  const query = useExtendedQuery();
  const [page, setPage] = useState(1);

  // WHY: Copy feedback — same pattern as Active tab (ReportTableWidget line 76-79).
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const handleCopy = useCallback((value: string) => {
    setCopyToast(`Copied "${value}"`);
  }, []);

  // WHY: Lot Number and Part Number are copyable — matches Active tab behavior.
  // Simpler than useBBDExtend because Extended tab has no extend-modal logic.
  const cellRenderers = useMemo<Record<string, (value: unknown, row: Record<string, unknown>) => ReactNode>>(() => ({
    serialName: (value) => (
      <CopyableCell value={String(value ?? '')} onCopy={handleCopy} />
    ),
    partNumber: (value) => (
      <CopyableCell value={String(value ?? '')} onCopy={handleCopy} />
    ),
  }), [handleCopy]);

  // WHY: No POST endpoint needed — Extended tab has no Redis cache.
  // Invalidating React Query triggers a fresh GET which already fetches
  // live Airtable data + Priority balances (extend.ts line 157-206).
  // Uses refetchQueries (not invalidateQueries) so spinner covers full refetch.
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries({ queryKey: ['report', 'bbd', 'extended'] });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const data = query.data;
  const allRows = data?.data ?? [];
  const columns = data?.columns ?? [];
  const warnings = data?.warnings;

  // WHY: Client-side pagination — Airtable returns all records.
  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  const pagedRows = useMemo(
    () => allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allRows, page],
  );

  if (query.isLoading) return <LoadingToast />;
  if (query.error) return <ErrorState onRetry={() => query.refetch()} />;
  if (allRows.length === 0) {
    return (
      <EmptyState
        message="No extended items"
        hint="Items appear here after their expiry date is extended"
      />
    );
  }

  return (
    <>
      {/* WHY: Minimal toolbar — only refresh. Matches Active tab's visual weight
          (same px-5 py-2 border-b) but simpler (no Filter/Columns/Sort/Export). */}
      <div className="px-5 py-2 border-b border-slate-100 flex items-center">
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors text-slate-500 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh data"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {warnings && warnings.length > 0 && warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}

      <ReportTable
        columns={columns}
        data={pagedRows}
        reportId="bbd-extended"
        cellRenderers={cellRenderers}
      />
      {totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={allRows.length}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      <AnimatePresence>
        {copyToast && (
          <Toast message={copyToast} variant="success" onDismiss={() => setCopyToast(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
