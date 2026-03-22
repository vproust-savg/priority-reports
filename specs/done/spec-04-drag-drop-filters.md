# Spec 04 — Drag & Drop Filter Condition Reordering

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag & drop filter conditions to reorder them within and across filter groups (root and nested), matching Airtable's drag handle UX.

**Architecture:** @dnd-kit provides the drag & drop engine. Each filter group (root + nested) is a `SortableContext` container with a `useDroppable` fallback for empty state. Individual conditions use `useSortable`. A custom hook (`useFilterDrag`) encapsulates all drag state and handlers. A utility file (`filterDragUtils`) contains pure tree-manipulation functions. Cross-container moves happen in real-time during `onDragOver` for immediate visual feedback.

**Tech Stack:** React 19, @dnd-kit/core + sortable + utilities, TypeScript, Tailwind CSS v4

> **Session scope:** ~30 min Claude Code work (frontend only — no backend changes needed)
> **Date:** 2026-03-21
> **Status:** Ready to build
> **Depends on:** Spec 03b (FilterBuilder, FilterGroupPanel, FilterConditionRow already built)

---

## 1. Scope

### 1.1 What Changes

1. Install `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
2. New utility file `filterDragUtils.ts` — pure functions to find/move conditions in the FilterGroup tree
3. New hook `useFilterDrag.ts` — drag state, sensors, event handlers
4. `FilterConditionRow.tsx` — add `useSortable` + grip handle (6-dot icon, visible on hover)
5. `FilterGroupPanel.tsx` — add `SortableContext` + `useDroppable` + empty group placeholder
6. `FilterBuilder.tsx` — wrap with `DndContext`, add root `SortableContext` + `DragOverlay`

### 1.2 Behavior

- **Drag handle:** 6-dot grip icon (`GripVertical` from lucide-react) appears on hover, left side of each condition row
- **Within-group reorder:** Drag a condition up/down within the same group
- **Cross-group move:** Drag a condition from root to nested group, nested to root, or between nested groups
- **Empty groups persist:** When the last condition is dragged out, the group stays with a "Drag a condition here" placeholder (remains a valid drop target)
- **Delete button unchanged:** Clicking X on the last condition in a nested group still auto-deletes the group (existing behavior)
- **Desktop only:** Mouse drag, no touch/mobile support needed
- **Real-time feedback:** Conditions shift to make space during drag (via @dnd-kit sortable animations)
- **DragOverlay:** A floating pill showing the field label follows the cursor during drag

### 1.3 Out of Scope

- Dragging entire groups (only individual conditions)
- Touch/mobile drag support
- Backend changes (condition order doesn't affect OData filter logic — AND/OR is commutative)

---

## 2. File Map

| File | Action | What Changes |
|------|--------|-------------|
| `client/package.json` | Modify | Add @dnd-kit dependencies |
| `client/src/utils/filterDragUtils.ts` | Create | `findConditionContainer()` + `moveConditionInTree()` (~80 lines) |
| `client/src/hooks/useFilterDrag.ts` | Create | Drag state hook: sensors, onDragStart/Over/End handlers (~95 lines) |
| `client/src/components/filter/FilterConditionRow.tsx` | Modify | Add `useSortable`, grip handle, drag styles (~108 lines total) |
| `client/src/components/filter/FilterGroupPanel.tsx` | Modify | Add `SortableContext`, `useDroppable`, empty placeholder (~105 lines total) |
| `client/src/components/filter/FilterBuilder.tsx` | Modify | Add `DndContext`, root `SortableContext`, `DragOverlay` (~149 lines total). If over 150, extract DragOverlay into a small component. |

---

## 3. Tasks

### Task 1: Install @dnd-kit dependencies

**Files:**
- Modify: `client/package.json`

- [ ] **Step 1: Install packages**

```bash
cd client && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: install @dnd-kit for filter drag & drop"
```

---

### Task 2: Create filterDragUtils.ts

**Files:**
- Create: `client/src/utils/filterDragUtils.ts`

- [ ] **Step 1: Create utility file**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/utils/filterDragUtils.ts
git commit -m "feat: add filterDragUtils for condition tree manipulation"
```

---

### Task 3: Create useFilterDrag hook

**Files:**
- Create: `client/src/hooks/useFilterDrag.ts`

- [ ] **Step 1: Create hook file**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useFilterDrag.ts
git commit -m "feat: add useFilterDrag hook for drag state management"
```

---

### Task 4: Add sortable + grip handle to FilterConditionRow

**Files:**
- Modify: `client/src/components/filter/FilterConditionRow.tsx:9,44-45`

- [ ] **Step 1: Add imports**

Update the lucide-react import (line 9) to include `GripVertical`:
```typescript
import { GripVertical, X } from 'lucide-react';
```

Add after line 12 (after the FilterValueInput import):
```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
```

- [ ] **Step 2: Add useSortable hook**

Add at the start of the component function (after the destructured props on line 25, before `selectedColumn` on line 26):
```typescript
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: condition.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
```

- [ ] **Step 3: Update outer div and add grip handle**

Replace the outer div on line 44-45:
```typescript
    <div className="flex items-center gap-2 flex-wrap">
```

With:
```typescript
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
```

WHY: `group/row` is a named Tailwind group — avoids conflict with any parent `group` class. `touch-none` prevents browser touch defaults. The grip handle only appears on hover to keep the UI clean.

The existing content (field selector, operator selector, value input, delete button) stays unchanged. The closing `</div>` stays at the same position.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filter/FilterConditionRow.tsx
git commit -m "feat: add sortable drag handle to FilterConditionRow"
```

---

### Task 5: Add SortableContext + droppable to FilterGroupPanel

**Files:**
- Modify: `client/src/components/filter/FilterGroupPanel.tsx:10-12,49-74`

- [ ] **Step 1: Add imports**

Add after the existing imports (after line 12):
```typescript
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
```

- [ ] **Step 2: Add useDroppable hook**

Add after `sharedRowProps` (line 30):
```typescript
  // WHY: Makes this group a valid drop target even when it has 0 conditions.
  const { setNodeRef: setDroppableRef } = useDroppable({ id: group.id });
```

- [ ] **Step 3: Wrap conditions in SortableContext + droppable ref**

Replace the conditions map block AND the `"+ Add condition"` button (lines 49-84) with:
```tsx
      <div ref={setDroppableRef}>
        <SortableContext items={group.conditions.map((c) => c.id)} strategy={verticalListSortingStrategy}>
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
        </SortableContext>

        {group.conditions.length === 0 && (
          <div className="border border-dashed border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-400 text-center">
            Drag a condition here
          </div>
        )}

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
```

WHY: The `setDroppableRef` wraps the entire group content including the `"+ Add condition"` button. This ensures dropping below the last condition (near the add button) still registers as a drop into this group. The dashed placeholder gives visual feedback when the group has 0 conditions.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filter/FilterGroupPanel.tsx
git commit -m "feat: add SortableContext and droppable to FilterGroupPanel"
```

---

### Task 6: Wire up DndContext in FilterBuilder

**Files:**
- Modify: `client/src/components/filter/FilterBuilder.tsx:10-13,75,77-125`

- [ ] **Step 1: Add imports**

Add after the existing imports (after line 13):
```typescript
import { DndContext, DragOverlay, useDroppable, closestCorners } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useFilterDrag } from '../../hooks/useFilterDrag';
```

- [ ] **Step 2: Add hook calls**

Add after `sharedRowProps` (line 75):
```typescript
  const { activeId, sensors, handleDragStart, handleDragOver, handleDragEnd } =
    useFilterDrag(filterGroup, onChange);
  const { setNodeRef: setRootDroppable } = useDroppable({ id: filterGroup.id });
  const activeCondition = activeId
    ? [...filterGroup.conditions, ...filterGroup.groups.flatMap((g) => g.conditions)]
        .find((c) => c.id === activeId)
    : null;
```

- [ ] **Step 3: Replace the return block**

Replace the entire `return (...)` block (lines 77-125) with:
```tsx
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

      <DragOverlay>
        {activeCondition ? (
          <div className="bg-white shadow-lg rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200">
            {columns.find((c) => c.key === activeCondition.field)?.label ?? 'New condition'}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
```

WHY: `DndContext` wraps everything so both root and nested `SortableContext` containers participate in the same drag session. `DragOverlay` renders outside the main div (it's portaled) to show a floating pill with the field label during drag. `closestCorners` collision detection works well for our 1-level nesting depth.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add client/src/components/filter/FilterBuilder.tsx
git commit -m "feat: wire up DndContext for drag & drop filter reordering"
```

---

### Task 7: Visual Verification

- [ ] **Step 1: Start dev server**

Run: `cd client && npm run dev`
Open browser to `http://localhost:5173`

- [ ] **Step 2: Test grip handle + within-group reorder**

1. Open filter panel (click filter icon)
2. Hover over a condition row — verify 6-dot grip handle appears on the left
3. Drag a condition up/down within root conditions
4. Verify conditions reorder smoothly with animation
5. Verify conjunction buttons stay correctly positioned between conditions

- [ ] **Step 3: Test cross-group drag**

1. Click "+ Add group" to create a nested group
2. Drag a condition from root into the nested group
3. Verify condition moves into the group in real-time
4. Drag a condition from the nested group back to root
5. Verify condition returns to root level

- [ ] **Step 4: Test empty group persistence**

1. Create a nested group with one condition
2. Drag the condition out of the group to root
3. Verify the group stays with "Drag a condition here" dashed placeholder
4. Drag a different condition into the empty group
5. Verify the condition lands in the group

- [ ] **Step 5: Test delete button unchanged**

1. Create a nested group with one condition
2. Click X on that condition (don't drag)
3. Verify the group is auto-deleted (existing behavior preserved)

- [ ] **Step 6: Test empty root**

1. Create a nested group
2. Drag all root conditions into the nested group
3. Root area should be empty but remain a valid drop target
4. Drag a condition back from the nested group to root
5. Verify the condition returns to root level

- [ ] **Step 7: Test filter results**

1. Set up conditions with values, verify data loads correctly
2. Reorder conditions via drag — verify results update after 400ms debounce
3. Verify no console errors

---

## 4. Verification

```bash
cd client && npx tsc --noEmit          # TypeScript compiles
cd client && npm run build             # Production build succeeds
```

Manual checks:
- Grip handle (6 dots) appears on hover, left of each condition row
- Within-group drag reorders conditions with smooth animation
- Cross-group drag moves conditions between root and nested groups
- Empty nested group shows dashed "Drag a condition here" placeholder and accepts drops
- Delete button (X) on last condition in nested group still auto-deletes the group
- DragOverlay shows field label pill while dragging
- Conjunction buttons (AND/OR) stay correctly positioned after reorder
- Filter debounce works correctly — API fires 400ms after last drag
