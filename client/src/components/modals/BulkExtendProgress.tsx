// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendProgress.tsx
// PURPOSE: Run view for bulk extends — progress bar with ETA while
//          running, pause/resume on error or stop, and the final
//          per-item summary with failed-lot details.
// USED BY: BulkExtendModal
// EXPORTS: BulkExtendProgress (default)
// ═══════════════════════════════════════════════════════════════

import { Loader2 } from 'lucide-react';
import type { ExtendResult } from '../../hooks/useExtendExpiry';
import type { BulkProgress, BulkRunnerState } from '../../hooks/useBulkExtendRunner';

interface BulkExtendProgressProps {
  state: Exclude<BulkRunnerState, 'idle'>;
  progress: BulkProgress;
  runError: string;
  results: ExtendResult[];
  onCancel: () => void;
  onResume: () => void;
  onClose: () => void;
}

export default function BulkExtendProgress({
  state, progress, runError, results, onCancel, onResume, onClose,
}: BulkExtendProgressProps) {
  const failed = results.filter((r) => !r.success);
  const successCount = results.length - failed.length;
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const etaLabel = progress.etaSeconds != null && progress.etaSeconds > 0
    ? ` · ~${Math.max(1, Math.round(progress.etaSeconds / 60))} min left`
    : '';

  if (state === 'running') {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[var(--color-text-primary)] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Extending… {progress.processed}/{progress.total}
          </span>
          <span className="text-[var(--color-text-secondary)]">{pct}%{etaLabel}</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-gold-subtle)] overflow-hidden">
          <div
            className="h-2 rounded-full bg-[var(--color-dark)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-[var(--color-text-secondary)]">
          Keep this tab open until the run finishes. Stopping keeps everything already extended.
        </p>
        <div className="flex justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] rounded-lg transition-colors"
          >
            Stop after this batch
          </button>
        </div>
      </div>
    );
  }

  const summary = state === 'paused'
    ? `Stopped — extended ${successCount} of ${progress.total}`
    : failed.length === 0
      ? `Extended ${successCount}/${progress.total} successfully`
      : `Extended ${successCount}/${progress.total} — ${failed.length} failed`;

  return (
    <div className="space-y-3 py-2">
      <p className="text-sm font-medium text-[var(--color-text-primary)]">{summary}</p>
      {runError && (
        <div className="px-3 py-2 text-sm text-[var(--color-red)] bg-[var(--color-red)]/5 border border-[var(--color-red)]/20 rounded-lg">
          {runError}
        </div>
      )}
      {failed.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {failed.map((item) => (
            <div key={item.serialName} className="text-xs text-[var(--color-red)] bg-[var(--color-red)]/5 px-3 py-1.5 rounded">
              <span className="font-medium">{item.serialName}:</span> {item.error ?? 'Unknown error'}
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        {state === 'paused' && (
          <button
            onClick={onResume}
            className="px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] rounded-lg transition-colors"
          >
            Resume remaining
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)] rounded-lg transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
