// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortRuleRow.tsx
// PURPOSE: Single sort rule row — drag handle, column picker,
//          direction toggle, and delete button.
// USED BY: SortPanel
// EXPORTS: SortRuleRow
// ═══════════════════════════════════════════════════════════════

import { GripVertical, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DRAG_HANDLE_CLASS, FILTER_INPUT_CLASS } from '../../config/filterConstants';
import type { SortRule } from '../../hooks/useSortManager';
import type { ColumnDefinition } from '@shared/types';

interface SortRuleRowProps {
  rule: SortRule;
  availableColumns: ColumnDefinition[];
  usedColumnKeys: Set<string>;
  onUpdate: (id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => void;
  onRemove: (id: string) => void;
}

export default function SortRuleRow({
  rule, availableColumns, usedColumnKeys, onUpdate, onRemove,
}: SortRuleRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // WHY: Show this rule's own column + any column not used by other rules
  const selectableColumns = availableColumns.filter(
    (c) => c.key === rule.columnKey || !usedColumnKeys.has(c.key),
  );

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1.5 group/row">
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className={DRAG_HANDLE_CLASS}
      >
        <GripVertical size={14} />
      </button>

      <select
        role="combobox"
        value={rule.columnKey}
        onChange={(e) => onUpdate(rule.id, { columnKey: e.target.value })}
        className={`${FILTER_INPUT_CLASS} min-w-[140px]`}
      >
        {selectableColumns.map((col) => (
          <option key={col.key} value={col.key}>{col.label}</option>
        ))}
      </select>

      <button
        onClick={() => onUpdate(rule.id, { direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[var(--color-gold-subtle)]
          hover:bg-[var(--color-gold-hover)] text-sm text-[var(--color-text-secondary)] transition-colors flex-shrink-0"
      >
        {rule.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        <span>{rule.direction === 'asc' ? 'Asc' : 'Desc'}</span>
      </button>

      <button
        onClick={() => onRemove(rule.id)}
        aria-label="Remove sort rule"
        className="ml-1 p-1 text-[var(--color-text-faint)] hover:text-[var(--color-red)] rounded transition-colors flex-shrink-0
          opacity-0 group-hover/row:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
