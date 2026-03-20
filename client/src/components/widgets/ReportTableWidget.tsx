// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Full report widget with filter bar, data table, and
//          pagination. Replaces DemoTableWidget. Manages filter
//          state locally and passes filters to useReportQuery.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// PROPS: reportId (string) — which report to fetch
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════
import { useState } from 'react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { formatCellValue } from '../../utils/formatters';
import FilterBar from '../FilterBar';
import Pagination from '../Pagination';
import type { FilterValues } from '@shared/types';

function getDefaultFilters(): FilterValues {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);
  return {
    from: thirtyDaysAgo.toISOString().split('T')[0],
    to: today.toISOString().split('T')[0],
    vendor: '',
    status: '',
  };
}

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const [filters, setFilters] = useState<FilterValues>(getDefaultFilters());
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtersQuery = useFiltersQuery(reportId);

  // WHY: If filter options fail to load, dropdowns still show "All" default — report is still usable
  if (filtersQuery.error) console.warn('Failed to load filter options:', filtersQuery.error);

  const { data, isLoading, error, refetch } = useReportQuery(reportId, {
    from: filters.from,
    to: filters.to,
    vendor: filters.vendor || undefined, // WHY: Don't send empty string to API
    status: filters.status || undefined,
    page,
    pageSize,
  });

  // WHY: Reset to page 1 when any filter changes — current page may not exist in new result set
  const handleFilterChange = (newFilters: FilterValues) => {
    setFilters(newFilters);
    setPage(1);
  };

  return (
    <>
      <FilterBar
        filters={filtersQuery.data?.filters}
        filtersLoading={filtersQuery.isLoading}
        values={filters}
        onChange={handleFilterChange}
      />

      {isLoading && (
        <div className="p-6 space-y-4">
          {/* WHY: Pulse skeleton conveys "data is coming" — more polished than bare text */}
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

      {!isLoading && !error && (!data || data.data.length === 0) && (
        <div className="p-8 text-center">
          <p className="text-slate-500 text-sm font-medium">No results found</p>
          <p className="text-slate-400 text-xs mt-1">Try adjusting your date range or filters</p>
        </div>
      )}

      {data && data.data.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50/80">
                  {data.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider ${
                        col.type === 'currency' || col.type === 'number' ? 'text-right' : ''
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors duration-150 ${
                      rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
                    }`}
                  >
                    {data.columns.map((col) => {
                      const { formatted, isNegative } = formatCellValue(row[col.key], col.type);
                      return (
                        <td
                          key={col.key}
                          className={`px-5 py-3 text-slate-700 whitespace-nowrap ${
                            col.type === 'currency' || col.type === 'number' ? 'text-right tabular-nums' : ''
                          } ${isNegative ? 'text-red-500' : ''}`}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            totalCount={data.pagination.totalCount}
            totalPages={data.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
