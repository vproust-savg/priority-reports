// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterConditionRow.tsx
// PURPOSE: Single filter condition row with field, operator, and
//          value controls. Delegates value rendering to FilterValueInput.
// USED BY: FilterBuilder.tsx
// EXPORTS: FilterConditionRow
// ═══════════════════════════════════════════════════════════════

import { GripVertical, X } from 'lucide-react';
import type { FilterCondition, ColumnFilterMeta, FiltersResponse } from '@shared/types';
import { OPERATORS_BY_TYPE, FILTER_INPUT_CLASS } from '../../config/filterConstants';
import FilterValueInput from './FilterValueInput';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FilterConditionRowProps {
  condition: FilterCondition;
  onChange: (updated: FilterCondition) => void;
  onDelete: () => void;
  columns: ColumnFilterMeta[];
  filterOptions: FiltersResponse['filters'] | undefined;
  filterOptionsLoading: boolean;
}

export default function FilterConditionRow({
  condition, onChange, onDelete, columns, filterOptions, filterOptionsLoading,
}: FilterConditionRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: condition.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const selectedColumn = columns.find((c) => c.key === condition.field);
  const operators = selectedColumn ? OPERATORS_BY_TYPE[selectedColumn.filterType] : [];
  const hideValue = condition.operator === 'isEmpty' || condition.operator === 'isNotEmpty';

  // WHY: When field changes, the old operator may not be valid for the new type.
  // Reset to the first operator of the new type and clear values.
  const handleFieldChange = (newField: string) => {
    const col = columns.find((c) => c.key === newField);
    const newOperators = col ? OPERATORS_BY_TYPE[col.filterType] : [];
    onChange({
      ...condition,
      field: newField,
      operator: newOperators[0]?.value ?? 'equals',
      value: '',
      valueTo: undefined,
    });
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 flex-wrap group/row">
      {/* Drag handle — visible on hover */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-400
          opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0"
      >
        <GripVertical size={14} />
      </button>

      {/* Field selector */}
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        className={`${FILTER_INPUT_CLASS} min-w-[140px]`}
      >
        <option value="">Select field...</option>
        {columns.map((col) => (
          <option key={col.key} value={col.key}>{col.label}</option>
        ))}
      </select>

      {/* Operator selector — only shown when field is selected */}
      {condition.field && (
        <select
          value={condition.operator}
          onChange={(e) => onChange({ ...condition, operator: e.target.value as FilterCondition['operator'], value: '', valueTo: undefined })}
          className={`${FILTER_INPUT_CLASS} min-w-[140px]`}
        >
          {operators.map((op) => (
            <option key={op.value} value={op.value}>{op.label}</option>
          ))}
        </select>
      )}

      {/* Value input — hidden for isEmpty/isNotEmpty */}
      {condition.field && !hideValue && selectedColumn && (
        <FilterValueInput
          column={selectedColumn}
          operator={condition.operator}
          value={condition.value}
          valueTo={condition.valueTo}
          onChange={(val, valTo) => onChange({ ...condition, value: val, valueTo: valTo })}
          filterOptions={filterOptions}
          filterOptionsLoading={filterOptionsLoading}
        />
      )}

      {/* Delete button */}
      <button
        onClick={onDelete}
        className="ml-1 p-1 text-slate-300 hover:text-red-400 rounded transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
