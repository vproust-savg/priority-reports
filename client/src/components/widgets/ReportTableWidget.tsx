// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget orchestrator. Manages filter state, data
//          fetching, client-side filtering, and renders FilterToolbar,
//          FilterBuilder, ReportTable, and Pagination.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { applyClientFilters, hasAnyClientConditions } from '../../utils/clientFilter';
import { countActiveFilters } from '../../config/filterConstants';
import FilterToolbar from '../FilterToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';

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
  const fetchPageSize = hasClientFilters ? 500 : 50;

  const { data, isLoading, error, refetch } = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page: hasClientFilters ? 1 : page,
    pageSize: fetchPageSize,
  });

  // WHY: If filter options fail to load, the filter builder still works
  // for non-enum fields — enum dropdowns just show "Loading..."
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
      <FilterToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isOpen={isFilterOpen}
        onToggle={() => setIsFilterOpen(!isFilterOpen)}
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
          <ReportTable columns={data.columns} data={displayData} />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
