// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExport.ts
// PURPOSE: Manages export state: triggers POST /export, downloads
//          the blob as a file, and provides toast state for feedback.
// WHY NOT TANSTACK QUERY: Export is a one-shot action (fire-and-download),
//          not a cached query. Plain fetch + useState is appropriate.
// USED BY: ReportTableWidget.tsx
// EXPORTS: useExport
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback } from 'react';
import type { FilterGroup } from '@shared/types';

interface ToastState {
  message: string;
  variant: 'success' | 'error';
}

interface UseExportReturn {
  isExporting: boolean;
  toast: ToastState | null;
  clearToast: () => void;
  triggerExport: () => Promise<void>;
}

export function useExport(
  reportId: string,
  filterGroup: FilterGroup,
  visibleColumnKeys?: string[],
): UseExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const clearToast = useCallback(() => setToast(null), []);

  const triggerExport = useCallback(async () => {
    setIsExporting(true);
    setToast(null);

    // WHY: 2-minute timeout — enrichRows on large GRV Log exports can take
    // 50-100 seconds (500 rows × batched sub-form fetches with 200ms delay).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`/api/v1/reports/${reportId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filterGroup, visibleColumnKeys }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const message = (errorData as { error?: string })?.error ?? 'Export failed — please try again';
        setToast({ message, variant: 'error' });
        return;
      }

      const blob = await response.blob();

      // WHY: Parse filename from Content-Disposition header.
      // Format: attachment; filename="GRV-Log-2026-03-22.xlsx"
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      const filename = filenameMatch?.[1] ?? 'export.xlsx';

      // WHY: Create an invisible <a> element to trigger the browser's
      // native file download. This avoids needing a file-saver library.
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);

      setToast({ message: 'Export complete', variant: 'success' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setToast({ message: 'Export timed out — try applying more filters', variant: 'error' });
      } else {
        setToast({ message: 'Export failed — please try again', variant: 'error' });
      }
    } finally {
      clearTimeout(timeout);
      setIsExporting(false);
    }
  }, [reportId, filterGroup, visibleColumnKeys]);

  return { isExporting, toast, clearToast, triggerExport };
}
