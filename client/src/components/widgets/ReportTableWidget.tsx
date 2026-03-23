// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget orchestrator. Two-phase loading: shows
//          quick results via useReportQuery, then switches to
//          base dataset for instant client-side filtering.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useBaseDataset } from '../../hooks/useBaseDataset';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import TableSkeleton from '../TableSkeleton';
import { applyAllFilters, applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups } from '../../utils/clientFilter';
import { countActiveFilters } from '../../config/filterConstants';

const CLIENT_PAGE_SIZE = 50;

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
  // WHY: Once the base dataset loads, ALL non-date filter changes become
  // instant (client-side). Until then, Phase 1 handles display.
  // WHY: enabled only after quick query loads — both share the Priority
  // rate limiter, so running them simultaneously makes both slow.
  const baseQuery = useBaseDataset(reportId, debouncedGroup, filterColumns, !!quickQuery.data);
  // WHY: isPlaceholderData is true when keepPreviousData is showing stale rows
  // from a different date range. Fall back to quick query during transitions
  // so users see correct data faster (50-row fetch) instead of waiting 15-20s
  // for the full 1000-row base query to resolve.
  const isBaseReady = !!baseQuery.data && !baseQuery.isError && !baseQuery.isPlaceholderData;

  // WHY: Use base dataset when available for instant filtering,
  // fall back to quick query for immediate display
  const activeData = isBaseReady ? baseQuery.data : quickQuery.data;
  const isLoading = !isBaseReady && quickQuery.isLoading;
  const isFetching = isBaseReady ? baseQuery.isFetching : quickQuery.isFetching;
  const error = isBaseReady ? baseQuery.error : quickQuery.error;
  const refetch = isBaseReady ? baseQuery.refetch : quickQuery.refetch;

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(activeData?.columns);

  const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup);

  // WHY: Filter endpoint failure cascades — empty filterColumns breaks
  // extractDateConditions in useBaseDataset and shows a blank filter panel.
  // Surface the error so the user knows why filters aren't working.
  const filterLoadError = filtersQuery.error;

  // --- Row filtering and pagination ---
  const allRows = activeData?.data ?? [];

  const { displayData, totalCount, totalPages } = useMemo(() => {
    let filtered: Record<string, unknown>[];
    let display: Record<string, unknown>[];
    let count: number;
    let pages: number;

    if (isBaseReady || hasClientFilters) {
      // WHY: Base dataset has ALL rows — apply ALL non-date filters client-side.
      // Phase 1 with client filters uses the same client-side path.
      filtered = isBaseReady
        ? applyAllFilters(allRows, debouncedGroup, filterColumns)
        : applyClientFilters(allRows, debouncedGroup, filterColumns);
      display = filtered.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE);
      count = filtered.length;
      pages = Math.ceil(filtered.length / CLIENT_PAGE_SIZE);
    } else {
      // Phase 1 without client-side filters — server handles pagination
      filtered = allRows;
      display = allRows;
      count = quickQuery.data?.pagination.totalCount ?? 0;
      pages = quickQuery.data?.pagination.totalPages ?? 0;
    }

    return { displayData: display, totalCount: count, totalPages: pages };
  }, [allRows, debouncedGroup, filterColumns, page, isBaseReady, hasClientFilters, quickQuery.data?.pagination]);

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
      />

      {isFilterOpen && (
        <FilterBuilder
          filterGroup={filterGroup}
          onChange={handleFilterChange}
          columns={filterColumns}
          filterOptions={filtersQuery.data?.filters}
          filterOptionsLoading={filtersQuery.isLoading}
        />
      )}

      {isColumnPanelOpen && (
        <ColumnManagerPanel
          managedColumns={managedColumns}
          onToggle={toggleColumn}
          onReorder={reorderColumns}
          onShowAll={showAll}
          onHideAll={hideAll}
        />
      )}

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

      {/* WHY: Subtle loading bar during background refetches.
          keepPreviousData means old data stays visible — no skeleton flash. */}
      {isFetching && !isLoading && (
        <div className="mx-5 mt-2 h-0.5 bg-primary/20 rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full animate-pulse w-2/3" />
        </div>
      )}

      {isLoading && <TableSkeleton />}

      {error && (
        <div className="p-6 text-center">
          <p className="text-red-500 text-sm mb-3">Failed to load data</p>
          <button onClick={() => refetch()} className="text-sm text-primary font-medium hover:underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && displayData.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-slate-500 text-sm font-medium">No results found</p>
          <p className="text-slate-400 text-xs mt-1">Try adjusting your filters</p>
        </div>
      )}

      {activeData && displayData.length > 0 && (
        <>
          <ReportTable columns={visibleColumns.length > 0 ? visibleColumns : activeData.columns} data={displayData} />
          <Pagination
            page={page}
            pageSize={CLIENT_PAGE_SIZE}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
      )}
    </>
  );
}
