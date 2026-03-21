// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFilterDrag.ts
// PURPOSE: Encapsulates @dnd-kit drag state and event handlers
//          for filter condition reordering. Handles both
//          within-group reorder and cross-group moves.
// USED BY: FilterBuilder.tsx
// EXPORTS: useFilterDrag
// ═══════════════════════════════════════════════════════════════

import { useState } from 'react';
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { FilterGroup } from '@shared/types';
import { findConditionContainer, moveConditionInTree } from '../utils/filterDragUtils';

export function useFilterDrag(
  filterGroup: FilterGroup,
  onChange: (group: FilterGroup) => void,
) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // WHY: distance: 5 prevents accidental drags when clicking inputs
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  // WHY: onDragOver handles cross-container moves in real-time,
  // giving immediate visual feedback as the user drags between groups.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findConditionContainer(filterGroup, active.id as string);
    // WHY: over.id could be a condition (inside a container) or a container itself (empty group)
    const overContainer =
      findConditionContainer(filterGroup, over.id as string) ?? (over.id as string);

    if (!activeContainer || activeContainer === overContainer) return;

    // Find target index: if over is a condition, insert at its index; if container, append
    const targetGroup =
      overContainer === filterGroup.id
        ? filterGroup
        : filterGroup.groups.find((g) => g.id === overContainer);
    const overIndex = targetGroup
      ? targetGroup.conditions.findIndex((c) => c.id === (over.id as string))
      : -1;
    const insertIndex = overIndex >= 0 ? overIndex : (targetGroup?.conditions.length ?? 0);

    onChange(moveConditionInTree(filterGroup, active.id as string, overContainer, insertIndex));
  }

  // WHY: onDragEnd handles within-container reorder only. Cross-container
  // moves were already applied to state during onDragOver, so by the time
  // onDragEnd fires, the dragged condition is already in the target container.
  // The early return for activeContainer !== overContainer is a no-op guard.
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const activeContainer = findConditionContainer(filterGroup, active.id as string);
    const overContainer = findConditionContainer(filterGroup, over.id as string);
    if (!activeContainer || !overContainer || activeContainer !== overContainer) return;

    const getConditions = (containerId: string) =>
      containerId === filterGroup.id
        ? filterGroup.conditions
        : filterGroup.groups.find((g) => g.id === containerId)?.conditions ?? [];

    const conditions = getConditions(activeContainer);
    const oldIndex = conditions.findIndex((c) => c.id === active.id);
    const newIndex = conditions.findIndex((c) => c.id === over.id);
    if (oldIndex === newIndex) return;

    const reordered = arrayMove(conditions, oldIndex, newIndex);

    if (activeContainer === filterGroup.id) {
      onChange({ ...filterGroup, conditions: reordered });
    } else {
      onChange({
        ...filterGroup,
        groups: filterGroup.groups.map((g) =>
          g.id === activeContainer ? { ...g, conditions: reordered } : g,
        ),
      });
    }
  }

  return { activeId, sensors, handleDragStart, handleDragOver, handleDragEnd };
}
