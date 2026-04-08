// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Supports
//          optional row-level styling and expandable row details.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { ColumnDefinition } from '@shared/types';
import type { DetailComponent } from './details/types';
import { formatCellValue } from '../utils/formatters';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  EXPAND_REVEAL, EASE_EXPAND,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

// WHY: Maps status values to row CSS classes. Used when rowStyleField
// is present (e.g., BBD report colors rows by expiration urgency).
const ROW_STYLE_MAP: Record<string, string> = {
  'expired': 'bg-red-50 border-l-2 border-l-red-400',
  'expiring-perishable': 'bg-orange-50 border-l-2 border-l-orange-400',
  'expiring-non-perishable': 'bg-amber-50 border-l-2 border-l-amber-400',
};

interface ExpandConfig {
  rowKeyField: string;
  DetailComponent: DetailComponent;
}

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  rowStyleField?: string;
  reportId?: string;
  expandConfig?: ExpandConfig;
  expandedRows?: Set<string>;
  onToggleExpand?: (rowKey: string) => void;
  cellRenderers?: Record<string, (value: unknown, row: Record<string, unknown>) => ReactNode>;
}

export default function ReportTable({
  columns, data, rowStyleField,
  reportId, expandConfig, expandedRows, onToggleExpand,
  cellRenderers,
}: ReportTableProps) {
  const reduced = useReducedMotion();
  const isExpandable = !!(expandConfig && expandedRows && onToggleExpand);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50/80">
            {isExpandable && (
              <th className="w-10 px-2 py-3" aria-label="Expand" />
            )}
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
            const styleValue = rowStyleField ? String(row[rowStyleField] ?? '') : '';
            const rowStyle = ROW_STYLE_MAP[styleValue] ?? '';
            const zebraClass = !rowStyle && rowIdx % 2 === 1 ? 'bg-slate-50/30' : '';

            const rowKey = isExpandable
              ? String(row[expandConfig.rowKeyField] ?? rowIdx)
              : '';
            const isExpanded = isExpandable && expandedRows.has(rowKey);

            // WHY: Expanded rows without a status color get a subtle blue tint
            // to visually connect the parent row to the detail panel below.
            const expandedClass = isExpanded && !rowStyle ? 'bg-blue-50/30' : '';

            return (
              <ExpandableRow
                key={isExpandable ? rowKey : rowIdx}
                row={row}
                columns={columns}
                rowStyle={rowStyle}
                zebraClass={zebraClass}
                expandedClass={expandedClass}
                isExpandable={isExpandable}
                isExpanded={isExpanded}
                rowKey={rowKey}
                reportId={reportId}
                expandConfig={expandConfig}
                onToggleExpand={onToggleExpand}
                reduced={reduced}
                cellRenderers={cellRenderers}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// WHY: Extracted to keep ReportTable under 200 lines and isolate
// the expand/collapse rendering logic into a focused component.
interface ExpandableRowProps {
  row: Record<string, unknown>;
  columns: ColumnDefinition[];
  rowStyle: string;
  zebraClass: string;
  expandedClass: string;
  isExpandable: boolean;
  isExpanded: boolean;
  rowKey: string;
  reportId?: string;
  expandConfig?: ExpandConfig;
  onToggleExpand?: (rowKey: string) => void;
  reduced: boolean;
  cellRenderers?: Record<string, (value: unknown, row: Record<string, unknown>) => ReactNode>;
}

function ExpandableRow({
  row, columns, rowStyle, zebraClass, expandedClass,
  isExpandable, isExpanded, rowKey, reportId, expandConfig,
  onToggleExpand, reduced, cellRenderers,
}: ExpandableRowProps) {
  const DetailComponent = expandConfig?.DetailComponent;

  return (
    <>
      <tr
        className={`border-b border-slate-100 hover:bg-blue-50/60 transition-colors duration-150 ${
          rowStyle || expandedClass || zebraClass
        } ${isExpandable ? 'cursor-pointer group' : ''}`}
        onClick={isExpandable ? () => onToggleExpand!(rowKey) : undefined}
      >
        {isExpandable && (
          <td className="w-10 px-2 py-3 text-center">
            <button
              aria-expanded={isExpanded}
              aria-label="Expand row details"
              className="p-0.5 rounded"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand!(rowKey);
              }}
              tabIndex={0}
            >
              <ChevronRight
                size={14}
                className={`text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ease-out ${
                  isExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>
          </td>
        )}
        {columns.map((col) => {
          const customRenderer = cellRenderers?.[col.key];
          if (customRenderer) {
            return (
              <td key={col.key} className="px-5 py-3 text-slate-700 whitespace-nowrap">
                {customRenderer(row[col.key], row)}
              </td>
            );
          }
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

      <AnimatePresence>
        {isExpanded && DetailComponent && reportId && (
          <tr key={`detail-${rowKey}`}>
            <td colSpan={columns.length + 1} className="p-0">
              <motion.div
                initial={reduced ? REDUCED_FADE.initial : EXPAND_REVEAL.initial}
                animate={reduced ? REDUCED_FADE.animate : EXPAND_REVEAL.animate}
                exit={reduced ? REDUCED_FADE.exit : EXPAND_REVEAL.exit}
                transition={reduced ? REDUCED_TRANSITION : EASE_EXPAND}
              >
                <DetailComponent row={row} reportId={reportId} />
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}
