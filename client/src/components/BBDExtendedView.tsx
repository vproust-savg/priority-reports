// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/BBDExtendedView.tsx
// PURPOSE: Extended tab view for the BBD report. Fetches from
//          Airtable via useExtendedQuery, renders ReportTable
//          with no filter/sort/column management (browse-only).
// USED BY: ReportTableWidget (rendered when activeSubTab === 'extended')
// EXPORTS: BBDExtendedView (default)
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useExtendedQuery } from '../hooks/useExtendedQuery';
import ReportTable from './ReportTable';
import Pagination from './Pagination';
import LoadingToast from './LoadingToast';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';

const PAGE_SIZE = 50;

export default function BBDExtendedView() {
  const query = useExtendedQuery();
  const [page, setPage] = useState(1);

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
    </>
  );
}
