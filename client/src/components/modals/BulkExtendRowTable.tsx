// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendRowTable.tsx
// PURPOSE: Scrollable table with sort, selection, and status
//          colors for the bulk extend modal. Extracted to keep
//          BulkExtendModal under 200 lines.
// USED BY: BulkExtendModal
// EXPORTS: BulkExtendRowTable
// ═══════════════════════════════════════════════════════════════

import { ChevronUp, ChevronDown } from 'lucide-react';
import { formatCellValue } from '../../utils/formatters';

// WHY: Same map as ReportTable ROW_STYLE_MAP — duplicated here because
// importing from ReportTable would create a circular dependency.
const STATUS_BG: Record<string, string> = {
  'expired': 'bg-[var(--color-red)]/5',
  'expiring-perishable': 'bg-[var(--color-yellow)]/10',
  'expiring-non-perishable': 'bg-[var(--color-yellow)]/5',
};

function computeNewDate(currentDate: string, days: number): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

interface BulkExtendRowTableProps {
  rows: Array<Record<string, unknown>>;
  selected: Set<string>;
  days: number;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onHeaderClick: (key: string) => void;
  onToggleRow: (serialName: string) => void;
  isSubmitting: boolean;
}

export default function BulkExtendRowTable({
  rows, selected, days, sortKey, sortDir, onHeaderClick, onToggleRow, isSubmitting,
}: BulkExtendRowTableProps) {
  return (
    <div className="max-h-96 overflow-y-auto border border-[var(--color-gold-subtle)] rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-gold-hover)] sticky top-0">
          <tr className="text-left text-xs text-[var(--color-text-secondary)] uppercase tracking-wider">
            <th className="px-3 py-2 w-8"></th>
            {[
              { key: 'serialName', label: 'Lot Number' },
              { key: 'partNumber', label: 'Part Number' },
              { key: 'partDescription', label: 'Description' },
              { key: 'expiryDate', label: 'Current Expiry' },
            ].map((col) => (
              <th key={col.key} className="px-3 py-2">
                <button
                  onClick={() => onHeaderClick(col.key)}
                  className="flex items-center gap-1 hover:text-[var(--color-text-primary)] transition-colors"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === 'asc'
                    ? <ChevronUp size={12} />
                    : <ChevronDown size={12} />)}
                </button>
              </th>
            ))}
            <th className="px-3 py-2">New Expiry</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sn = row.serialName as string;
            const status = row.status as string;
            const { formatted: currentFmt } = formatCellValue(row.expiryDate, 'date');
            const newDate = computeNewDate(row.expiryDate as string, days);
            const { formatted: newFmt } = formatCellValue(newDate, 'date');
            const bgClass = STATUS_BG[status] ?? '';

            return (
              <tr key={sn} className={`border-b border-[var(--color-gold-subtle)] ${bgClass}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(sn)}
                    onChange={() => onToggleRow(sn)}
                    disabled={isSubmitting}
                    className="rounded border-[var(--color-gold-muted)]"
                  />
                </td>
                <td className="px-3 py-2 font-medium">{sn}</td>
                <td className="px-3 py-2">{row.partNumber as string}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{row.partDescription as string}</td>
                <td className="px-3 py-2">{currentFmt}</td>
                <td className="px-3 py-2 font-medium text-[var(--color-gold-primary)]">{newFmt}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
