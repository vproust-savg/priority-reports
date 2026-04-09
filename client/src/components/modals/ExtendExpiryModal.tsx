// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/ExtendExpiryModal.tsx
// PURPOSE: Modal for extending a single lot's expiration date.
//          Shows lot info, days input, computed new date,
//          confirmation step, and submit/error states.
// USED BY: ReportTableWidget (via useBBDExtend)
// EXPORTS: ExtendExpiryModal
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { useExtendExpiry } from '../../hooks/useExtendExpiry';
import { formatCellValue } from '../../utils/formatters';

type ModalState = 'idle' | 'confirming' | 'submitting' | 'success' | 'error';

interface ExtendExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  serialName: string;
  partName: string;
  partDescription: string;
  currentExpiryDate: string;
  onSuccess: () => void;
  row?: Record<string, unknown>;
}

function computeNewDate(currentDate: string, days: number): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export default function ExtendExpiryModal({
  isOpen, onClose, serialName, partName,
  partDescription, currentExpiryDate, onSuccess, row,
}: ExtendExpiryModalProps) {
  const [days, setDays] = useState(7);
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { extend, reset } = useExtendExpiry();

  const newExpiryDate = computeNewDate(currentExpiryDate, days);
  const { formatted: currentFormatted } = formatCellValue(currentExpiryDate, 'date');
  const { formatted: newFormatted } = formatCellValue(newExpiryDate, 'date');

  // WHY: Reset state when modal opens with new data.
  useEffect(() => {
    if (isOpen) {
      setDays(7);
      setState('idle');
      setErrorMessage('');
      reset();
    }
  }, [isOpen, reset]);

  // WHY: Auto-close after success with brief delay for user to see confirmation.
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => {
        onSuccess();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, onSuccess]);

  const handleSubmit = async () => {
    setState('submitting');
    try {
      const response = await extend({ items: [{ serialName, days, rowData: row ? {
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
      } : undefined }] });
      const result = response.results[0];
      if (result?.success) {
        setState('success');
      } else {
        setErrorMessage(result?.error ?? 'Extension failed');
        setState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  };

  const isSubmitting = state === 'submitting';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Extend Expiration Date"
      preventClose={isSubmitting}
    >
      <div className="px-6 py-4 space-y-4">
        {state === 'success' ? (
          <div className="text-center py-6">
            <p className="text-lg font-medium text-green-600">Extended successfully</p>
            <p className="text-sm text-slate-500 mt-1">
              {serialName}: {currentFormatted} &rarr; {newFormatted}
            </p>
          </div>
        ) : state === 'confirming' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Extend lot <span className="font-semibold">{serialName}</span> from{' '}
              <span className="font-semibold">{currentFormatted}</span> to{' '}
              <span className="font-semibold">{newFormatted}</span> ({days} days)?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setState('idle')}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Read-only info */}
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="w-32 text-slate-500">Lot Number</span>
                <span className="font-medium text-slate-900">{serialName}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Part Number</span>
                <span className="font-medium text-slate-900">{partName}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Description</span>
                <span className="font-medium text-slate-900">{partDescription}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Current Expiry</span>
                <span className="font-medium text-slate-900">{currentFormatted}</span>
              </div>
            </div>

            {/* Days input */}
            <div className="flex items-center gap-3 pt-2">
              <label htmlFor="extend-days" className="text-sm text-slate-600">Extend by</label>
              <input
                id="extend-days"
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

            {/* New expiry */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">New expiry:</span>
              <span className="font-semibold text-slate-900">{newFormatted}</span>
            </div>

            {/* Error message */}
            {state === 'error' && (
              <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {errorMessage}
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
              <button
                onClick={() => setState('confirming')}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {state === 'error' ? 'Retry' : 'Extend'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
