// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterBuilder.tsx
// PURPOSE: Main filter panel. Renders the root FilterGroup with
//          conditions, conjunction toggles, and nested groups.
//          Manages add/delete/update operations on the filter tree.
// USED BY: ReportTableWidget (rendered when filter panel is open)
// EXPORTS: FilterBuilder
// ═══════════════════════════════════════════════════════════════

import type { FilterCondition, FilterGroup, ColumnFilterMeta, FiltersResponse } from '@shared/types';
import { createEmptyCondition, createEmptyGroup, FILTER_LABEL_CLASS } from '../../config/filterConstants';
import FilterConditionRow from './FilterConditionRow';
import FilterGroupPanel from './FilterGroupPanel';

interface FilterBuilderProps {
  filterGroup: FilterGroup;
  onChange: (group: FilterGroup) => void;
  columns: ColumnFilterMeta[];
  filterOptions: FiltersResponse['filters'] | undefined;
  filterOptionsLoading: boolean;
}

export default function FilterBuilder({
  filterGroup, onChange, columns, filterOptions, filterOptionsLoading,
}: FilterBuilderProps) {
  const updateCondition = (conditionId: string, updated: FilterCondition) => {
    onChange({
      ...filterGroup,
      conditions: filterGroup.conditions.map((c) => (c.id === conditionId ? updated : c)),
    });
  };

  const deleteCondition = (conditionId: string) => {
    onChange({
      ...filterGroup,
      conditions: filterGroup.conditions.filter((c) => c.id !== conditionId),
    });
  };

  const toggleConjunction = () => {
    onChange({
      ...filterGroup,
      conjunction: filterGroup.conjunction === 'and' ? 'or' : 'and',
    });
  };

  const addCondition = () => {
    onChange({
      ...filterGroup,
      conditions: [...filterGroup.conditions, createEmptyCondition()],
    });
  };

  const addGroup = () => {
    onChange({
      ...filterGroup,
      groups: [...filterGroup.groups, createEmptyGroup()],
    });
  };

  const updateNestedGroup = (groupId: string, updated: FilterGroup) => {
    onChange({
      ...filterGroup,
      groups: filterGroup.groups.map((g) => (g.id === groupId ? updated : g)),
    });
  };

  const deleteNestedGroup = (groupId: string) => {
    onChange({
      ...filterGroup,
      groups: filterGroup.groups.filter((g) => g.id !== groupId),
    });
  };

  const sharedRowProps = { columns, filterOptions, filterOptionsLoading };

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-4">
      {/* Root conditions */}
      {filterGroup.conditions.map((condition, idx) => (
        <div key={condition.id}>
          {idx === 0 ? (
            <span className={`${FILTER_LABEL_CLASS} block mb-1`}>Where</span>
          ) : (
            <button
              onClick={toggleConjunction}
              className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer select-none
                text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors my-1 block"
            >
              {filterGroup.conjunction}
            </button>
          )}
          <FilterConditionRow
            condition={condition}
            onChange={(updated) => updateCondition(condition.id, updated)}
            onDelete={() => deleteCondition(condition.id)}
            {...sharedRowProps}
          />
        </div>
      ))}

      {/* Nested groups */}
      {filterGroup.groups.map((group) => (
        <FilterGroupPanel
          key={group.id}
          group={group}
          onUpdate={(updated) => updateNestedGroup(group.id, updated)}
          onDelete={() => deleteNestedGroup(group.id)}
          {...sharedRowProps}
        />
      ))}

      {/* Add buttons */}
      <div className="flex gap-4 mt-3">
        <button onClick={addCondition}
          className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
          + Add condition
        </button>
        <button onClick={addGroup}
          className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
          + Add group
        </button>
      </div>
    </div>
  );
}
