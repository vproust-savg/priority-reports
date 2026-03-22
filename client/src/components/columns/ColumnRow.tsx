// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/columns/ColumnRow.tsx
// PURPOSE: Single row in the column manager panel. Shows a toggle
//          switch, column label, and drag handle for reordering.
// USED BY: ColumnManagerPanel
// EXPORTS: ColumnRow
// ═══════════════════════════════════════════════════════════════

import { GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ManagedColumn } from '../../hooks/useColumnManager';

interface ColumnRowProps {
  column: ManagedColumn;
  isLocked: boolean;
  isDragDisabled: boolean;
  onToggle: () => void;
}

export default function ColumnRow({
  column, isLocked, isDragDisabled, onToggle,
}: ColumnRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  // WHY: Disable drag for locked first column AND during search
  } = useSortable({ id: column.key, disabled: isDragDisabled || isLocked });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2.5 py-1.5 px-1 group/row">
      {/* Toggle switch */}
      <button
        onClick={isLocked ? undefined : onToggle}
        aria-label={`${column.visible ? 'Hide' : 'Show'} ${column.label} column`}
        className={`relative w-8 h-[18px] rounded-full transition-colors flex-shrink-0 ${
          column.visible ? 'bg-primary' : 'bg-slate-200'
        } ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
            column.visible ? 'translate-x-[15px]' : 'translate-x-[3px]'
          }`}
        />
      </button>

      {/* Column label */}
      <span className={`text-sm flex-1 ${column.visible ? 'text-slate-700' : 'text-slate-400'}`}>
        {column.label}
      </span>

      {/* Drag handle — hidden during search and for locked first column */}
      {!isDragDisabled && !isLocked && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-400
            opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0"
        >
          <GripVertical size={14} />
        </button>
      )}
    </div>
  );
}
