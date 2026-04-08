// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useBBDExtend.ts
// PURPOSE: BBD-specific extend orchestration — modal state,
//          cellRenderers, and callbacks. Extracted to keep
//          ReportTableWidget under 200 lines.
// USED BY: ReportTableWidget
// EXPORTS: useBBDExtend
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import ExpiryDateCell from '../components/cells/ExpiryDateCell';
import CopyableCell from '../components/cells/CopyableCell';

interface ExtendModalState {
  type: 'single' | 'bulk';
  row?: Record<string, unknown>;
}

export function useBBDExtend(reportId: string, onCopy?: (value: string) => void) {
  const [extendModal, setExtendModal] = useState<ExtendModalState | null>(null);

  const handleExtendClick = useCallback((row: Record<string, unknown>) => {
    setExtendModal({ type: 'single', row });
  }, []);

  const handleBulkExtend = useCallback(() => {
    setExtendModal({ type: 'bulk' });
  }, []);

  const closeModal = useCallback(() => {
    setExtendModal(null);
  }, []);

  const handleExtendSuccess = useCallback(() => {
    setExtendModal(null);
  }, []);

  const cellRenderers = useMemo(() => {
    if (reportId !== 'bbd') return undefined;
    return {
      serialName: (value: unknown): ReactNode => (
        <CopyableCell value={String(value ?? '')} onCopy={onCopy ?? (() => {})} />
      ),
      partNumber: (value: unknown): ReactNode => (
        <CopyableCell value={String(value ?? '')} onCopy={onCopy ?? (() => {})} />
      ),
      expiryDate: (value: unknown, row: Record<string, unknown>): ReactNode => (
        <ExpiryDateCell
          value={value}
          onExtend={() => handleExtendClick(row)}
        />
      ),
    };
  }, [reportId, handleExtendClick, onCopy]);

  return {
    extendModal,
    cellRenderers,
    handleExtendClick,
    handleBulkExtend,
    handleExtendSuccess,
    closeModal,
  };
}
