// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterGroupPanel.tsx
// PURPOSE: Renders a nested filter group with conjunction toggle,
//          conditions, add/delete controls. Extracted from FilterBuilder
//          to keep both files under 150 lines.
// USED BY: FilterBuilder.tsx
// EXPORTS: FilterGroupPanel
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup, ColumnFilterMeta, FiltersResponse } from '@shared/types';
import { createEmptyCondition } from '../../config/filterConstants';
import FilterConditionRow from './FilterConditionRow';

interface FilterGroupPanelProps {
  group: FilterGroup;
  onUpdate: (updated: FilterGroup) => void;
  onDelete: () => void;
  columns: ColumnFilterMeta[];
  filterOptions: FiltersResponse['filters'] | undefined;
  filterOptionsLoading: boolean;
}

export default function FilterGroupPanel({
  group, onUpdate, onDelete, columns, filterOptions, filterOptionsLoading,
}: FilterGroupPanelProps) {
  const toggleConjunction = () => {
    onUpdate({ ...group, conjunction: group.conjunction === 'and' ? 'or' : 'and' });
  };

  const sharedRowProps = { columns, filterOptions, filterOptionsLoading };

  return (
    <div className="border-l-2 border-primary/20 rounded-r-lg bg-slate-50/50 px-4 py-3 mt-2 ml-2">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={toggleConjunction}
          className="text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-600 transition-colors"
        >
          {group.conjunction === 'or' ? 'Or' : 'And'} group
        </button>
        <button
          onClick={onDelete}
          className="text-xs text-slate-300 hover:text-red-400 transition-colors"
        >
          Remove
        </button>
      </div>

      {group.conditions.map((condition, idx) => (
        <div key={condition.id}>
          {idx > 0 && (
            <button
              onClick={toggleConjunction}
              className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer select-none
                text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors my-1 block"
            >
              {group.conjunction}
            </button>
          )}
          <FilterConditionRow
            condition={condition}
            onChange={(updated) => onUpdate({
              ...group,
              conditions: group.conditions.map((c) => (c.id === condition.id ? updated : c)),
            })}
            onDelete={() => {
              const remaining = group.conditions.filter((c) => c.id !== condition.id);
              if (remaining.length === 0) onDelete();
              else onUpdate({ ...group, conditions: remaining });
            }}
            {...sharedRowProps}
          />
        </div>
      ))}

      <button
        onClick={() => onUpdate({
          ...group,
          conditions: [...group.conditions, createEmptyCondition()],
        })}
        className="text-xs font-medium text-primary hover:text-primary/70 transition-colors mt-2"
      >
        + Add condition
      </button>
    </div>
  );
}
