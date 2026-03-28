// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortPanel.tsx
// PURPOSE: Panel container for managing sort rules. Shows
//          drag-reorderable sort rules with add/clear actions.
// USED BY: ReportTableWidget
// EXPORTS: SortPanel
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { SortRule } from '../../hooks/useSortManager';
import type { ColumnDefinition } from '@shared/types';
import SortRuleRow from './SortRuleRow';

interface SortPanelProps {
  sortRules: SortRule[];
  columns: ColumnDefinition[];
  onAddSort: () => void;
  onRemoveSort: (id: string) => void;
  onUpdateSort: (id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => void;
  onReorderSorts: (fromIndex: number, toIndex: number) => void;
  onClearAll: () => void;
}

export default function SortPanel({
  sortRules, columns, onAddSort, onRemoveSort, onUpdateSort, onReorderSorts, onClearAll,
}: SortPanelProps) {
  // WHY: distance: 5 prevents accidental drags when clicking controls
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const usedColumnKeys = useMemo(() => new Set(sortRules.map((r) => r.columnKey)), [sortRules]);
  const allColumnsUsed = usedColumnKeys.size >= columns.length;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = sortRules.findIndex((r) => r.id === active.id);
    const toIndex = sortRules.findIndex((r) => r.id === over.id);
    onReorderSorts(fromIndex, toIndex);
  }

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortRules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {sortRules.map((rule) => (
            <SortRuleRow
              key={rule.id}
              rule={rule}
              availableColumns={columns}
              usedColumnKeys={usedColumnKeys}
              onUpdate={onUpdateSort}
              onRemove={onRemoveSort}
            />
          ))}
        </SortableContext>
      </DndContext>

      <button
        onClick={onAddSort}
        disabled={allColumnsUsed}
        className="text-xs font-medium text-primary hover:text-primary/70 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        + Add sort
      </button>

      {sortRules.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={onClearAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
