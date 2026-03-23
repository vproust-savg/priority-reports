// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget orchestrator. Two-phase loading: shows
//          quick results via useReportQuery, then switches to
//          base dataset for instant client-side filtering.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useBaseDataset } from '../../hooks/useBaseDataset';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useFilteredData } from '../../hooks/useFilteredData';
import { AnimatePresence, motion } from 'framer-motion';
import { SPRING_SNAPPY, REDUCED_FADE, REDUCED_TRANSITION } from '../../config/animationConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import TableSkeleton from '../TableSkeleton';
import LoadingBar from '../LoadingBar';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import { hasAnyClientConditions, hasSkippedOrGroups } from '../../utils/clientFilter';
import { countActiveFilters } from '../../config/filterConstants';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  // --- Phase 1: Quick display (50 rows, fast) ---
  const hasClientFilters = hasAnyClientConditions(debouncedGroup, filterColumns);
  const hasSkippedOr = hasSkippedOrGroups(debouncedGroup, filterColumns);
  const fetchPageSize = hasClientFilters ? 500 : 50;

  const quickQuery = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page: hasClientFilters ? 1 : page,
    pageSize: fetchPageSize,
  });

  // --- Phase 2: Base dataset (all rows for date range, background) ---
  const baseQuery = useBaseDataset(reportId, debouncedGroup, filterColumns, !!quickQuery.data);
  const isBaseReady = !!baseQuery.data && !baseQuery.isError && !baseQuery.isPlaceholderData;

  const activeData = isBaseReady ? baseQuery.data : quickQuery.data;
  const isLoading = !isBaseReady && quickQuery.isLoading;
  const isFetching = isBaseReady ? baseQuery.isFetching : quickQuery.isFetching;
  const error = isBaseReady ? baseQuery.error : quickQuery.error;
  const refetch = isBaseReady ? baseQuery.refetch : quickQuery.refetch;

  const loadingPhase = isLoading ? 'quick' as const
    : isFetching ? 'base' as const
    : 'idle' as const;

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(activeData?.columns);

  const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup);
  const reduced = useReducedMotion();
  const filterLoadError = filtersQuery.error;

  const allRows = activeData?.data ?? [];
  const { displayData, totalCount, totalPages } = useFilteredData({
    allRows, debouncedGroup, filterColumns, page,
    isBaseReady, hasClientFilters,
    serverPagination: quickQuery.data?.pagination,
  });

  return (
    <>
      <LoadingBar phase={loadingPhase} />
      <TableToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isFilterOpen={isFilterOpen}
        onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
        hiddenColumnCount={hiddenCount}
        isColumnPanelOpen={isColumnPanelOpen}
        onColumnToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
        isExporting={isExporting}
        onExport={triggerExport}
      />

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            key="filter-panel"
            initial={reduced ? REDUCED_FADE.initial : { height: 0, opacity: 0 }}
            animate={reduced ? REDUCED_FADE.animate : { height: 'auto', opacity: 1 }}
            exit={reduced ? REDUCED_FADE.exit : { height: 0, opacity: 0 }}
            transition={reduced ? REDUCED_TRANSITION : { height: SPRING_SNAPPY, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
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
            initial={reduced ? REDUCED_FADE.initial : { height: 0, opacity: 0 }}
            animate={reduced ? REDUCED_FADE.animate : { height: 'auto', opacity: 1 }}
            exit={reduced ? REDUCED_FADE.exit : { height: 0, opacity: 0 }}
            transition={reduced ? REDUCED_TRANSITION : { height: SPRING_SNAPPY, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
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

      {/* WHY: OR-group warning only needed in Phase 1 — the backend skips mixed OR
          groups, causing over-fetching. In Phase 2 (isBaseReady), applyAllFilters
          handles all conditions client-side with full OR support, so no data is lost. */}
      {!isBaseReady && hasSkippedOr && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>Some OR-group filters can't be fully applied. Results may include extra rows.</span>
        </div>
      )}

      {activeData?.warnings && activeData.warnings.length > 0 && activeData.warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}

      {isLoading && <TableSkeleton />}

      {error && <ErrorState onRetry={() => refetch()} />}

      {!isLoading && !error && displayData.length === 0 && <EmptyState />}

      {activeData && displayData.length > 0 && (
        <>
          <ReportTable columns={visibleColumns.length > 0 ? visibleColumns : activeData.columns} data={displayData} disableAnimation={reduced} />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={totalCount}
            totalPages={totalPages}
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
