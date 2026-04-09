// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendModal.tsx
// PURPOSE: Modal for extending multiple lots at once. Shows
//          a selectable list of all BBD rows with shared days
//          input and confirmation flow.
// USED BY: ReportTableWidget (via useBBDExtend)
// EXPORTS: BulkExtendModal
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import BulkExtendRowTable from './BulkExtendRowTable';
import { useExtendExpiry } from '../../hooks/useExtendExpiry';

type ModalState = 'idle' | 'confirming' | 'submitting' | 'done';

interface BulkExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: Array<Record<string, unknown>>;
  onSuccess: () => void;
}

export default function BulkExtendModal({
  isOpen, onClose, rows, onSuccess,
}: BulkExtendModalProps) {
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<ModalState>('idle');
  const [resultSummary, setResultSummary] = useState('');
  const [failedItems, setFailedItems] = useState<Array<{ serialName: string; error: string }>>([]);
  const { extend, reset } = useExtendExpiry();

  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // WHY: Reset state when modal opens.
  useEffect(() => {
    if (isOpen) {
      setDays(7);
      setSelected(new Set());
      setState('idle');
      setResultSummary('');
      setFailedItems([]);
      setSortKey(null);
      setSortDir('asc');
      reset();
    }
  }, [isOpen, reset]);

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

  const handleSubmit = async () => {
    setState('submitting');
    try {
      const items = Array.from(selected).map((serialName) => {
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
          } : undefined,
        };
      });
      const response = await extend({ items });
      const successCount = response.results.filter((r) => r.success).length;
      const failed = response.results
        .filter((r) => !r.success)
        .map((r) => ({ serialName: r.serialName, error: r.error ?? 'Unknown error' }));

      setFailedItems(failed);
      if (failed.length === 0) {
        setResultSummary(`Extended ${successCount}/${response.results.length} successfully`);
      } else {
        setResultSummary(`Extended ${successCount}/${response.results.length} — ${failed.length} failed`);
      }
      setState('done');
    } catch (err) {
      setResultSummary(err instanceof Error ? err.message : 'Network error');
      setFailedItems([]);
      setState('done');
    }
  };

  const isSubmitting = state === 'submitting';

  return (
    <Modal
      isOpen={isOpen}
      onClose={state === 'done' ? () => { onSuccess(); } : onClose}
      title="Extend Expiration Dates"
      maxWidth="max-w-3xl"
      preventClose={isSubmitting}
    >
      <div className="px-6 py-4 space-y-4">
        {state === 'done' ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-900">{resultSummary}</p>
            {failedItems.length > 0 && (
              <div className="space-y-1">
                {failedItems.map((item) => (
                  <div key={item.serialName} className="text-xs text-red-700 bg-red-50 px-3 py-1.5 rounded">
                    <span className="font-medium">{item.serialName}:</span> {item.error}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => { onSuccess(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Days input */}
            <div className="flex items-center gap-3">
              <label htmlFor="bulk-extend-days" className="text-sm text-slate-600">Extend by</label>
              <input
                id="bulk-extend-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                disabled={isSubmitting}
                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
              />
              <span className="text-sm text-slate-600">days</span>
            </div>

            {/* Select all */}
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                disabled={isSubmitting || rows.length === 0}
                className="rounded border-slate-300"
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
              isSubmitting={isSubmitting}
            />

            {/* Confirmation */}
            {state === 'confirming' && (
              <div className="px-3 py-2 text-sm text-slate-700 bg-blue-50 border border-blue-200 rounded-lg">
                Extend <span className="font-semibold">{selected.size}</span> lots by <span className="font-semibold">{days}</span> days?
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              {state === 'confirming' ? (
                <>
                  <button
                    onClick={() => setState('idle')}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setState('confirming')}
                  disabled={selected.size === 0 || isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
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
