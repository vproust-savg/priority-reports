// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/columns/ColumnManagerPanel.tsx
// PURPOSE: Dropdown panel for managing column visibility and
//          order. Shows search bar, toggle list with drag handles,
//          and bulk Hide all / Show all actions.
// USED BY: ReportTableWidget
// EXPORTS: ColumnManagerPanel
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import { Search } from 'lucide-react';
import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ManagedColumn } from '../../hooks/useColumnManager';
import ColumnRow from './ColumnRow';
import ColumnDragOverlay from './ColumnDragOverlay';

interface ColumnManagerPanelProps {
  managedColumns: ManagedColumn[];
  onToggle: (key: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}

export default function ColumnManagerPanel({
  managedColumns, onToggle, onReorder, onShowAll, onHideAll,
}: ColumnManagerPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);

  // WHY: distance: 5 prevents accidental drags when clicking toggles
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // WHY: closestCenter (not closestCorners) because this is a single-container
  // vertical list. closestCorners is for multi-container setups like FilterBuilder.

  const isSearching = searchTerm.length > 0;
  const firstColumnKey = managedColumns[0]?.key;

  const filteredColumns = isSearching
    ? managedColumns.filter((c) =>
        c.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : managedColumns;

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // WHY: Use indices from the FULL array (not filtered), since
    // reorderColumns calls arrayMove on the complete managedColumns.
    const fromIndex = managedColumns.findIndex((c) => c.key === active.id);
    const toIndex = managedColumns.findIndex((c) => c.key === over.id);
    onReorder(fromIndex, toIndex);
  }

  const activeColumn = activeId
    ? managedColumns.find((c) => c.key === activeId)
    : null;

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-4">
      {/* Search bar */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Find a column..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg py-1.5 pl-8 pr-3
            focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40
            placeholder:text-slate-400"
        />
      </div>

      {/* Column list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(e.active.id as string)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext
          items={filteredColumns.map((c) => c.key)}
          strategy={verticalListSortingStrategy}
        >
          {filteredColumns.map((col) => (
            <ColumnRow
              key={col.key}
              column={col}
              isLocked={col.key === firstColumnKey}
              isDragDisabled={isSearching}
              onToggle={() => onToggle(col.key)}
            />
          ))}
        </SortableContext>

        <DragOverlay>
          {activeColumn ? <ColumnDragOverlay label={activeColumn.label} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Empty search state */}
      {filteredColumns.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-3">No matching columns</p>
      )}

      {/* Bulk actions — hidden during search */}
      {!isSearching && (
        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={onHideAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Hide all
          </button>
          <button
            onClick={onShowAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Show all
          </button>
        </div>
      )}
    </div>
  );
}
