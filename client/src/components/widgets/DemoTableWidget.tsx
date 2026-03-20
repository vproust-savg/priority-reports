// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/DemoTableWidget.tsx
// PURPOSE: Renders report data as a Stripe-style table.
//          Uses useReportQuery to fetch data from the backend.
//          Formats cells based on column type (currency, date, etc.)
// USED BY: widgetRegistry.ts (registered as 'table' type)
// PROPS: reportId (string) — which report to fetch
// EXPORTS: DemoTableWidget
// ═══════════════════════════════════════════════════════════════

import { useReportQuery } from '../../hooks/useReportQuery';
import { formatCellValue } from '../../utils/formatters';

interface DemoTableWidgetProps {
  reportId: string;
}

export default function DemoTableWidget({ reportId }: DemoTableWidgetProps) {
  const { data, isLoading, error, refetch } = useReportQuery(reportId);

  if (isLoading) {
    return <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>;
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-500 text-sm mb-3">Failed to load data</p>
        <button
          onClick={() => refetch()}
          className="text-sm text-primary font-medium hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return <div className="p-8 text-center text-slate-400 text-sm">No data available</div>;
  }

  return (
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
                const { formatted, isNegative } = formatCellValue(
                  row[col.key],
                  col.type,
                );
                return (
                  <td
                    key={col.key}
                    className={`px-5 py-3 text-slate-700 ${
                      col.type === 'currency' || col.type === 'number'
                        ? 'text-right tabular-nums'
                        : ''
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
  );
}
