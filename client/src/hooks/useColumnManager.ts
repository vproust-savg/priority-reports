// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useColumnManager.ts
// PURPOSE: Manages column visibility and display order for a
//          single table widget. Session-only state — resets on
//          page reload. Reinitializes when API columns change.
// USED BY: ReportTableWidget, ColumnManagerPanel (ManagedColumn type), ColumnRow (ManagedColumn type)
// EXPORTS: useColumnManager, ManagedColumn (type)
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnDefinition } from '@shared/types';

export interface ManagedColumn {
  key: string;
  label: string;
  visible: boolean;
}

export function useColumnManager(apiColumns: ColumnDefinition[] | undefined) {
  const [managedColumns, setManagedColumns] = useState<ManagedColumn[]>([]);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);

  // WHY: Track the previous API columns to avoid resetting user preferences
  // when the same columns array is returned with a new reference identity.
  const prevColumnsKey = useRef('');

  useEffect(() => {
    if (!apiColumns?.length) return;
    const columnsKey = apiColumns.map((c) => c.key).join(',');
    if (columnsKey === prevColumnsKey.current) return;
    prevColumnsKey.current = columnsKey;
    setManagedColumns(
      apiColumns.map((col) => ({ key: col.key, label: col.label, visible: true })),
    );
  }, [apiColumns]);

  const visibleColumns = useMemo(() => {
    if (!apiColumns) return [];
    return managedColumns
      .filter((mc) => mc.visible)
      .map((mc) => apiColumns.find((c) => c.key === mc.key))
      .filter((col): col is ColumnDefinition => col !== undefined);
  }, [managedColumns, apiColumns]);

  const hiddenCount = useMemo(
    () => managedColumns.filter((mc) => !mc.visible).length,
    [managedColumns],
  );

  const toggleColumn = (key: string) => {
    setManagedColumns((prev) => {
      // WHY: First column (index 0) is locked visible — it's the primary identifier
      if (prev[0]?.key === key) return prev;
      return prev.map((mc) => (mc.key === key ? { ...mc, visible: !mc.visible } : mc));
    });
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    // WHY: First column (index 0) is locked — prevent moves to/from index 0
    if (fromIndex === 0 || toIndex === 0) return;
    setManagedColumns((prev) => arrayMove(prev, fromIndex, toIndex));
  };

  const showAll = () => {
    setManagedColumns((prev) => prev.map((mc) => ({ ...mc, visible: true })));
  };

  const hideAll = () => {
    // WHY: First column stays visible — prevent empty table
    setManagedColumns((prev) =>
      prev.map((mc, i) => ({ ...mc, visible: i === 0 })),
    );
  };

  return {
    managedColumns,
    visibleColumns,
    hiddenCount,
    isColumnPanelOpen,
    setIsColumnPanelOpen,
    toggleColumn,
    reorderColumns,
    showAll,
    hideAll,
  };
}
