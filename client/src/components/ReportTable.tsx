// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Supports
//          optional row-level styling via rowStyleField.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import { formatCellValue } from '../utils/formatters';

// WHY: Maps status values to row CSS classes. Used when rowStyleField
// is present (e.g., BBD report colors rows by expiration urgency).
// Generic — any report can define status values that map to these classes.
const ROW_STYLE_MAP: Record<string, string> = {
  'expired': 'bg-red-50 border-l-2 border-l-red-400',
  'expiring-perishable': 'bg-orange-50 border-l-2 border-l-orange-400',
  'expiring-non-perishable': 'bg-amber-50 border-l-2 border-l-amber-400',
};

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  rowStyleField?: string;
}

export default function ReportTable({ columns, data, rowStyleField }: ReportTableProps) {
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
          {data.map((row, rowIdx) => {
            // WHY: When rowStyleField is set, look up the row's status value
            // in ROW_STYLE_MAP for per-row color coding. Falls back to
            // standard zebra striping when no match or no rowStyleField.
            const styleValue = rowStyleField ? String(row[rowStyleField] ?? '') : '';
            const rowStyle = ROW_STYLE_MAP[styleValue] ?? '';
            const zebraClass = !rowStyle && rowIdx % 2 === 1 ? 'bg-slate-50/30' : '';

            return (
              <tr
                key={rowIdx}
                className={`border-b border-slate-100 hover:bg-blue-50/60 transition-colors duration-150 ${
                  rowStyle || zebraClass
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
