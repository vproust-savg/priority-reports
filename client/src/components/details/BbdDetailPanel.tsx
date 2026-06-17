// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/details/BbdDetailPanel.tsx
// PURPOSE: Detail panel for BBD expandable rows. Shows warehouse/bin
//          breakdown from RAWSERIALBAL_SUBFORM with computed values.
//          The Bin (LOCNAME) cell is click-to-copy.
// USED BY: detailRegistry.ts (registered for 'bbd' report)
// EXPORTS: BbdDetailPanel
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { DetailPanelProps } from './types';
import { useSubformQuery } from '../../hooks/useSubformQuery';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import CopyableCell from '../cells/CopyableCell';
import Toast from '../Toast';

export default function BbdDetailPanel({ row, reportId }: DetailPanelProps) {
  const serialName = String(row.serialName ?? '');
  const purchasePrice = Number(row.purchasePrice ?? 0);

  const { data, isLoading, error } = useSubformQuery(reportId, serialName);
  const subformRows = data?.data ?? [];

  // WHY: Anchored copy feedback — same pattern as the Active tab (ReportTableWidget
  // line 89). Toast is position:fixed, so mounting it here renders correctly.
  const [copyToast, setCopyToast] = useState<{ message: string; anchor: DOMRect } | null>(null);
  const handleCopy = useCallback((value: string, anchor: DOMRect) => {
    setCopyToast({ message: `Copied "${value}"`, anchor });
  }, []);

  return (
    <div className="bg-[var(--color-gold-hover)] border-l-2 border-l-[var(--color-gold-primary)]/20 border-b border-[var(--color-gold-subtle)] py-4 pl-14 pr-6">
      {isLoading && (
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-[var(--color-text-muted)]" />
          <span className="text-xs text-[var(--color-text-muted)]">Loading...</span>
        </div>
      )}

      {error && (
        <span className="text-xs text-[var(--color-red)]">Failed to load details</span>
      )}

      {!isLoading && !error && subformRows.length === 0 && (
        <span className="text-xs text-[var(--color-text-muted)] italic">No warehouse data</span>
      )}

      {!isLoading && !error && subformRows.length > 0 && (
        <table className="text-xs text-[var(--color-text-secondary)]">
          <thead>
            <tr>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Warehouse</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Bin</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Qty</th>
              <th className="px-3 py-1.5 text-left text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Unit</th>
              <th className="px-3 py-1.5 text-right text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Value</th>
            </tr>
          </thead>
          <tbody>
            {subformRows.map((sfRow, idx) => {
              const balance = Number(sfRow.BALANCE ?? 0);
              const value = balance * purchasePrice;
              return (
                <tr key={idx} className="hover:bg-[var(--color-gold-hover)] transition-colors duration-100">
                  <td className="px-3 py-1.5">{String(sfRow.WARHSNAME ?? '')}</td>
                  <td className="px-3 py-1.5">
                    {sfRow.LOCNAME
                      ? <CopyableCell value={String(sfRow.LOCNAME)} onCopy={handleCopy} />
                      : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(balance)}</td>
                  <td className="px-3 py-1.5">{String(sfRow.UNITNAME ?? '')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(value)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AnimatePresence>
        {copyToast && (
          <Toast
            message={copyToast.message}
            variant="success"
            anchor={copyToast.anchor}
            onDismiss={() => setCopyToast(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
