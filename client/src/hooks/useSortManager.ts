// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSortManager.ts
// PURPOSE: Manages multi-column sort state and provides a
//          sortedData() function for client-side sorting.
//          Session-only state — resets on page reload.
// USED BY: ReportTableWidget
// EXPORTS: useSortManager, SortRule (type)
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnDefinition } from '@shared/types';

export interface SortRule {
  id: string;
  columnKey: string;
  direction: 'asc' | 'desc';
}

export function useSortManager(columns: ColumnDefinition[]) {
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [isSortPanelOpen, setIsSortPanelOpen] = useState(false);

  // --- Column cleanup ---
  // WHY: When visible columns change (user hides a column), remove sort rules
  // referencing columns that no longer exist. Same defensive pattern as
  // useColumnManager reinitializing on column changes.
  const prevColumnsKey = useRef('');

  useEffect(() => {
    const columnsKey = columns.map((c) => c.key).join(',');
    if (columnsKey === prevColumnsKey.current) return;
    prevColumnsKey.current = columnsKey;
    const validKeys = new Set(columns.map((c) => c.key));
    setSortRules((prev) => {
      const filtered = prev.filter((r) => validKeys.has(r.columnKey));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [columns]);

  // --- CRUD ---

  const addSort = useCallback((columnKey?: string) => {
    setSortRules((prev) => {
      const usedKeys = new Set(prev.map((r) => r.columnKey));
      const targetKey = columnKey && !usedKeys.has(columnKey)
        ? columnKey
        : columns.find((c) => !usedKeys.has(c.key))?.key;
      if (!targetKey) return prev;
      return [...prev, { id: crypto.randomUUID(), columnKey: targetKey, direction: 'asc' }];
    });
  }, [columns]);

  const removeSort = useCallback((id: string) => {
    setSortRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateSort = useCallback((id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => {
    setSortRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  }, []);

  const reorderSorts = useCallback((fromIndex: number, toIndex: number) => {
    setSortRules((prev) => arrayMove(prev, fromIndex, toIndex));
  }, []);

  const clearAll = useCallback(() => {
    setSortRules([]);
  }, []);

  // --- Sorting ---

  const sortedData = useCallback((data: Record<string, unknown>[]): Record<string, unknown>[] => {
    if (sortRules.length === 0 || data.length === 0) return data;

    // WHY: Build a column type lookup once, not per comparison
    const typeMap = new Map(columns.map((c) => [c.key, c.type]));

    return [...data].sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = a[rule.columnKey];
        const bVal = b[rule.columnKey];

        // WHY: Null/undefined sort last regardless of direction
        const aNull = aVal == null;
        const bNull = bVal == null;
        if (aNull && bNull) continue;
        if (aNull) return 1;
        if (bNull) return -1;

        const type = typeMap.get(rule.columnKey) ?? 'string';
        let cmp = 0;

        if (type === 'number' || type === 'currency' || type === 'percent') {
          cmp = Number(aVal) - Number(bVal);
        } else if (type === 'date') {
          cmp = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }

        if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [sortRules, columns]);

  return {
    sortRules,
    sortedData,
    addSort,
    removeSort,
    updateSort,
    reorderSorts,
    clearAll,
    isSortPanelOpen,
    setIsSortPanelOpen,
    sortCount: sortRules.length,
  };
}
