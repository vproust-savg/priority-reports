// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/details/BbdDetailPanel.tsx
// PURPOSE: Detail panel for BBD expandable rows. Shows warehouse/bin
//          breakdown from RAWSERIALBAL_SUBFORM with computed values.
// USED BY: detailRegistry.ts (registered for 'bbd' report)
// EXPORTS: BbdDetailPanel
// ═══════════════════════════════════════════════════════════════

import { Loader2 } from 'lucide-react';
import type { DetailPanelProps } from './types';
import { useSubformQuery } from '../../hooks/useSubformQuery';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export default function BbdDetailPanel({ row, reportId }: DetailPanelProps) {
  const serialName = String(row.serialName ?? '');
  const purchasePrice = Number(row.purchasePrice ?? 0);

  const { data, isLoading, error } = useSubformQuery(reportId, serialName);
  const subformRows = data?.data ?? [];

  return (
    <div className="bg-slate-50/50 border-l-2 border-l-primary/20 border-b border-slate-100 py-4 pl-14 pr-6">
      {isLoading && (
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-slate-400" />
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      )}

      {error && (
        <span className="text-xs text-red-500">Failed to load details</span>
      )}

      {!isLoading && !error && subformRows.length === 0 && (
        <span className="text-xs text-slate-400 italic">No warehouse data</span>
      )}

      {!isLoading && !error && subformRows.length > 0 && (
        <table className="text-xs text-slate-600">
          <thead>
            <tr>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Warehouse</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Bin</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-400 uppercase tracking-wider">Qty</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-slate-400 uppercase tracking-wider">Unit</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-slate-400 uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody>
            {subformRows.map((sfRow, idx) => {
              const balance = Number(sfRow.BALANCE ?? 0);
              const value = balance * purchasePrice;
              return (
                <tr key={idx} className="hover:bg-slate-100/50 transition-colors duration-100">
                  <td className="px-3 py-1.5">{String(sfRow.WARHSNAME ?? '')}</td>
                  <td className="px-3 py-1.5">{String(sfRow.LOCNAME ?? '')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(balance)}</td>
                  <td className="px-3 py-1.5">{String(sfRow.UNITNAME ?? '')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
