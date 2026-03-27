// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget — single-phase server-side filtering.
//          Shows LoadingToast during fetch, data table when ready.
//          Refresh button clears server cache for fresh data.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE_FAST } from '../../config/animationConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import LoadingToast from '../LoadingToast';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import { countActiveFilters } from '../../config/filterConstants';
import { getDetailComponent } from '../../config/detailRegistry';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  const query = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page,
    pageSize: 50,
  });

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(query.data?.columns);

  // WHY: Stable reference for useExport dependency — only changes when
  // the actual set of visible column keys changes, not on every render.
  const visibleColumnKeys = useMemo(
    () => visibleColumns.map((c) => c.key),
    [visibleColumns],
  );

  const { isExporting, toast, clearToast, triggerExport } = useExport(
    reportId, debouncedGroup, visibleColumnKeys,
  );
  const filterLoadError = filtersQuery.error;

  // --- Refresh logic ---
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/v1/reports/${reportId}/refresh`, { method: 'POST' });
      if (!res.ok) console.warn(`[refresh] Server returned ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    } finally {
      setIsRefreshing(false);
    }
  };

  const data = query.data;
  const displayData = data?.data ?? [];

  // --- Expand state ---
  const expandConfig = data?.meta?.expandConfig;
  const DetailComponent = expandConfig ? getDetailComponent(reportId) : null;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const toggleExpand = useCallback((rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  }, []);

  return (
    <>
      <TableToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isFilterOpen={isFilterOpen}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        hiddenColumnCount={hiddenCount}
        isColumnPanelOpen={isColumnPanelOpen}
        onColumnToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
        isExporting={isExporting}
        onExport={triggerExport}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <FilterBuilder
              filterGroup={filterGroup}
              onChange={handleFilterChange}
              columns={filterColumns}
              filterOptions={filtersQuery.data?.filters}
              filterOptionsLoading={filtersQuery.isLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isColumnPanelOpen && (
          <motion.div
            key="column-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <ColumnManagerPanel
              managedColumns={managedColumns}
              onToggle={toggleColumn}
              onReorder={reorderColumns}
              onShowAll={showAll}
              onHideAll={hideAll}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}

      {data?.warnings && data.warnings.length > 0 && data.warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}

      {query.isLoading && <LoadingToast />}

      {query.error && <ErrorState onRetry={() => query.refetch()} />}

      {!query.isLoading && !query.error && displayData.length === 0 && <EmptyState />}

      {!query.isLoading && displayData.length > 0 && (
        <>
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={displayData}
            rowStyleField={data?.meta?.rowStyleField}
            reportId={reportId}
            expandConfig={expandConfig && DetailComponent ? {
              rowKeyField: expandConfig.rowKeyField,
              DetailComponent,
            } : undefined}
            expandedRows={expandedRows}
            onToggleExpand={toggleExpand}
          />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={data!.pagination.totalCount}
            totalPages={data!.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        )}
      </AnimatePresence>
    </>
  );
}
