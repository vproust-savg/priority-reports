// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget orchestrator. Manages filter state, column
//          visibility/order, data fetching, client-side filtering,
//          export, and renders TableToolbar, FilterBuilder,
//          ColumnManagerPanel, ReportTable, Pagination, and Toast.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups } from '../../utils/clientFilter';
import { AlertTriangle } from 'lucide-react';
import { countActiveFilters } from '../../config/filterConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useExport } from '../../hooks/useExport';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  // WHY: Fetch more rows when client-side filters are active — the
  // backend can't filter HTML-parsed columns, so we filter locally
  const hasClientFilters = hasAnyClientConditions(debouncedGroup, filterColumns);
  const hasSkippedOr = hasSkippedOrGroups(debouncedGroup, filterColumns);
  const fetchPageSize = hasClientFilters ? 500 : 50;

  const { data, isLoading, error, refetch } = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page: hasClientFilters ? 1 : page,
    pageSize: fetchPageSize,
  });

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(data?.columns);

  const { isExporting, toast, clearToast, triggerExport } = useExport(reportId, debouncedGroup);

  if (filtersQuery.error) console.warn('Failed to load filter options:', filtersQuery.error);

  // Client-side filtering
  const allRows = data?.data ?? [];
  const filteredRows = hasClientFilters
    ? applyClientFilters(allRows, debouncedGroup, filterColumns)
    : allRows;
  const displayData = hasClientFilters
    ? filteredRows.slice((page - 1) * 50, page * 50)
    : filteredRows;
  const totalCount = hasClientFilters
    ? filteredRows.length
    : data?.pagination.totalCount ?? 0;
  const totalPages = hasClientFilters
    ? Math.ceil(filteredRows.length / 50)
    : data?.pagination.totalPages ?? 0;

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

      {hasSkippedOr && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>Some OR-group filters can't be fully applied. Results may include extra rows.</span>
        </div>
      )}

      {isLoading && (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="h-4 bg-slate-100 rounded w-1/6" />
              <div className="h-4 bg-slate-100 rounded w-1/4" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-1/6" />
            </div>
          ))}
        </div>
      )}

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

      {data && displayData.length > 0 && (
        <>
          <ReportTable columns={visibleColumns.length > 0 ? visibleColumns : data.columns} data={displayData} />
          <Pagination
            page={page}
            pageSize={50}
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
