// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/filterDragUtils.ts
// PURPOSE: Pure functions for drag & drop tree manipulation.
//          Finds which group owns a condition, and moves conditions
//          between groups immutably.
// USED BY: hooks/useFilterDrag.ts
// EXPORTS: findConditionContainer, moveConditionInTree
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup } from '@shared/types';

// WHY: During drag, we need to know which group (root or nested)
// currently contains the dragged condition, so we can remove it
// from the source before inserting into the target.
export function findConditionContainer(
  root: FilterGroup,
  conditionId: string,
): string | null {
  if (root.conditions.some((c) => c.id === conditionId)) return root.id;
  for (const g of root.groups) {
    if (g.conditions.some((c) => c.id === conditionId)) return g.id;
  }
  return null;
}

// WHY: Immutable tree update — removes condition from wherever it
// currently lives and inserts it at targetIndex in the target group.
// Used by both onDragOver (cross-container) and onDragEnd (reorder).
export function moveConditionInTree(
  root: FilterGroup,
  conditionId: string,
  targetContainerId: string,
  targetIndex: number,
): FilterGroup {
  // 1. Find and remove the condition from its current location
  let condition = root.conditions.find((c) => c.id === conditionId);
  let newRoot: FilterGroup = condition
    ? { ...root, conditions: root.conditions.filter((c) => c.id !== conditionId) }
    : root;

  if (!condition) {
    for (const g of root.groups) {
      const found = g.conditions.find((c) => c.id === conditionId);
      if (found) {
        condition = found;
        newRoot = {
          ...newRoot,
          groups: newRoot.groups.map((gr) =>
            gr.id === g.id
              ? { ...gr, conditions: gr.conditions.filter((c) => c.id !== conditionId) }
              : gr,
          ),
        };
        break;
      }
    }
  }

  if (!condition) return root;

  // 2. Insert at target position
  if (targetContainerId === newRoot.id) {
    const updated = [...newRoot.conditions];
    updated.splice(targetIndex, 0, condition);
    return { ...newRoot, conditions: updated };
  }

  return {
    ...newRoot,
    groups: newRoot.groups.map((g) => {
      if (g.id === targetContainerId) {
        const updated = [...g.conditions];
        updated.splice(targetIndex, 0, condition!);
        return { ...g, conditions: updated };
      }
      return g;
    }),
  };
}
