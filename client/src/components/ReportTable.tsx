// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Extracted
//          from ReportTableWidget to keep it under 150 lines.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import { formatCellValue } from '../utils/formatters';

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
}

export default function ReportTable({ columns, data }: ReportTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50/80">
            {columns.map((col) => (
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
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors duration-150 ${
                rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
              }`}
            >
              {columns.map((col) => {
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
  );
}
