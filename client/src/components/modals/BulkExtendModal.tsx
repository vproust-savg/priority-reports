// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendModal.tsx
// PURPOSE: Modal for extending multiple lots at once. Selectable
//          list of all BBD rows with shared days input; submits in
//          chunks via useBulkExtendRunner (progress/cancel/resume).
// USED BY: ReportTableWidget (via useBBDExtend)
// EXPORTS: BulkExtendModal
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBulkExtendRunner, BULK_MAX_ITEMS } from '../../hooks/useBulkExtendRunner';
import Modal from './Modal';
import BulkExtendRowTable from './BulkExtendRowTable';
import BulkExtendProgress from './BulkExtendProgress';
import type { BulkExtendItem } from '../../hooks/useBulkExtendRunner';
import type { RowData } from '../../hooks/useExtendExpiry';

interface BulkExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: Array<Record<string, unknown>>;
  onSuccess: () => void;
}

// WHY: ~1.04 Priority calls per lot (50-lot chunks: 2 batched lookups +
// 50 POSTs) against the 95-calls/min limiter shared with the whole org.
function estimateMinutes(count: number): number {
  return Math.max(1, Math.ceil((count * 1.04) / 95));
}

export default function BulkExtendModal({
  isOpen, onClose, rows, onSuccess,
}: BulkExtendModalProps) {
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const queryClient = useQueryClient();
  const runner = useBulkExtendRunner();
  const { reset: resetRunner } = runner;

  // WHY: Reset state when modal opens.
  useEffect(() => {
    if (isOpen) {
      setDays(7);
      setSelected(new Set());
      setConfirming(false);
      setSortKey(null);
      setSortDir('asc');
      resetRunner();
    }
  }, [isOpen, resetRunner]);

  const handleHeaderClick = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      let cmp: number;
      if (sortKey === 'expiryDate') {
        cmp = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const allSerialNames = useMemo(
    () => rows.map((r) => r.serialName as string),
    [rows],
  );

  const isAllSelected = selected.size === rows.length && rows.length > 0;
  const overLimit = selected.size > BULK_MAX_ITEMS;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSerialNames));
    }
  };

  const toggleRow = (serialName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(serialName) ? next.delete(serialName) : next.add(serialName);
      return next;
    });
  };

  const buildItems = (): BulkExtendItem[] =>
    Array.from(selected).map((serialName) => {
      const row = rows.find((r) => r.serialName === serialName);
      return {
        serialName,
        days,
        rowData: row ? {
          partNumber: row.partNumber as string,
          partDescription: row.partDescription as string,
          balance: row.balance as number,
          unit: row.unit as string,
          value: row.value as number,
          purchasePrice: row.purchasePrice as number,
          vendor: row.vendor as string,
          perishable: row.perishable as string,
          brand: row.brand as string,
          family: row.family as string,
          expiryDate: row.expiryDate as string,
        } as RowData : undefined,
      };
    });

  // WHY: Invalidate exactly once after the run settles (done or paused) —
  // per-chunk invalidation is off (invalidateOnSuccess:false in the runner).
  const invalidateIfExtended = (settled: Array<{ success: boolean }>) => {
    if (settled.some((r) => r.success)) {
      queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] });
    }
  };

  const handleRun = async () => {
    setConfirming(false);
    invalidateIfExtended(await runner.start(buildItems()));
  };

  const handleResume = async () => {
    invalidateIfExtended(await runner.resume());
  };

  const runnerActive = runner.state !== 'idle';
  const isRunning = runner.state === 'running';

  return (
    <Modal
      isOpen={isOpen}
      onClose={runnerActive ? () => { onSuccess(); } : onClose}
      title="Extend Expiration Dates"
      maxWidth="max-w-3xl"
      preventClose={isRunning}
    >
      <div className="px-6 py-4 space-y-4">
        {runnerActive ? (
          <BulkExtendProgress
            state={runner.state as 'running' | 'paused' | 'done'}
            progress={runner.progress}
            runError={runner.runError}
            results={runner.results}
            onCancel={runner.cancel}
            onResume={handleResume}
            onClose={() => { onSuccess(); }}
          />
        ) : (
          <>
            {/* Days input */}
            <div className="flex items-center gap-3">
              <label htmlFor="bulk-extend-days" className="text-sm text-[var(--color-text-secondary)]">Extend by</label>
              <input
                id="bulk-extend-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="w-20 px-3 py-1.5 text-sm border border-[var(--color-gold-subtle)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-primary)]/30 focus:border-[var(--color-gold-primary)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">days</span>
            </div>

            {/* Select all */}
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                disabled={rows.length === 0}
                className="rounded border-[var(--color-gold-muted)]"
              />
              Select all ({rows.length} items)
            </label>

            <BulkExtendRowTable
              rows={sortedRows}
              selected={selected}
              days={days}
              sortKey={sortKey}
              sortDir={sortDir}
              onHeaderClick={handleHeaderClick}
              onToggleRow={toggleRow}
              isSubmitting={false}
            />

            {/* Over-limit notice */}
            {overLimit && (
              <div className="px-3 py-2 text-sm text-[var(--color-red)] bg-[var(--color-red)]/5 border border-[var(--color-red)]/20 rounded-lg">
                Selection exceeds {BULK_MAX_ITEMS.toLocaleString()} lots — run extends in batches of up to {BULK_MAX_ITEMS.toLocaleString()}.
              </div>
            )}

            {/* Confirmation */}
            {confirming && !overLimit && (
              <div className="px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-blue)]/10 border border-[var(--color-blue)]/20 rounded-lg space-y-1">
                <div>
                  Extend <span className="font-semibold">{selected.size}</span> lots by <span className="font-semibold">{days}</span> days?
                </div>
                <div className="text-xs text-[var(--color-text-secondary)]">
                  ≈{estimateMinutes(selected.size)} min · uses {selected.size.toLocaleString()} of 10,000 monthly Priority writes · keep this tab open
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-gold-subtle)]">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] rounded-lg transition-colors"
              >
                Cancel
              </button>
              {confirming ? (
                <>
                  <button
                    onClick={() => setConfirming(false)}
                    className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleRun}
                    className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)] rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={selected.size === 0 || overLimit}
                  className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)] rounded-lg transition-colors disabled:opacity-50"
                >
                  Extend {selected.size} items
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
