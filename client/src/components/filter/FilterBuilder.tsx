// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterBuilder.tsx
// PURPOSE: Main filter panel. Renders the root FilterGroup with
//          conditions, conjunction toggles, and nested groups.
//          Manages add/delete/update operations on the filter tree.
// USED BY: ReportTableWidget (rendered when filter panel is open)
// EXPORTS: FilterBuilder
// ═══════════════════════════════════════════════════════════════

import { AnimatePresence, motion } from 'framer-motion';
import { SPRING_STIFF } from '../../config/animationConstants';
import { DndContext, DragOverlay, useDroppable, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useFilterDrag } from '../../hooks/useFilterDrag';
import FilterConditionRow from './FilterConditionRow';
import FilterGroupPanel from './FilterGroupPanel';
import { createEmptyCondition, createEmptyGroup, FILTER_LABEL_CLASS } from '../../config/filterConstants';
import type { FilterCondition, FilterGroup, ColumnFilterMeta, FiltersResponse } from '@shared/types';

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

  const { activeId, sensors, handleDragStart, handleDragOver, handleDragEnd } =
    useFilterDrag(filterGroup, onChange);
  const { setNodeRef: setRootDroppable } = useDroppable({ id: filterGroup.id });
  const activeCondition = activeId
    ? [...filterGroup.conditions, ...filterGroup.groups.flatMap((g) => g.conditions)]
        .find((c) => c.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="bg-white border-b border-slate-200 px-5 py-4">
        {/* Root conditions — sortable + droppable container */}
        <div ref={setRootDroppable}>
          <SortableContext items={filterGroup.conditions.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <AnimatePresence initial={false}>
            {filterGroup.conditions.map((condition, idx) => (
              <motion.div
                key={condition.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ opacity: { duration: 0.15 }, height: { duration: 0.2 } }}
                style={{ overflow: 'hidden' }}
              >
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
              </motion.div>
            ))}
            </AnimatePresence>
          </SortableContext>
        </div>

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
          <motion.button onClick={addCondition}
            whileTap={{ scale: 0.97 }} transition={SPRING_STIFF}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
            + Add condition
          </motion.button>
          <motion.button onClick={addGroup}
            whileTap={{ scale: 0.97 }} transition={SPRING_STIFF}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
            + Add group
          </motion.button>
        </div>
      </div>

      <DragOverlay>
        {activeCondition ? (
          <div className="bg-white shadow-lg rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200">
            {columns.find((c) => c.key === activeCondition.field)?.label ?? 'New condition'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
