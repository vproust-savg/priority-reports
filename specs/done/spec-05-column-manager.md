# Spec 05 — Show/Hide & Reorder Columns (Airtable-style)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users show/hide and reorder table columns via an Airtable-style dropdown panel in the toolbar. Per-widget scope, session-only (no persistence).

**Architecture:** A `useColumnManager` hook manages column visibility and order state. A `ColumnManagerPanel` component renders the dropdown panel with search, toggle switches, @dnd-kit drag handles, and bulk actions. The toolbar is renamed from `FilterToolbar` to `TableToolbar` to reflect its broader purpose.

**Tech Stack:** React 19, @dnd-kit/core + sortable + utilities (already installed), TypeScript, Tailwind CSS v4

> **Session scope:** ~30 min Claude Code work (frontend only — no backend changes needed)
> **Date:** 2026-03-22
> **Status:** Ready to build
> **Depends on:** Spec 04 (@dnd-kit already installed, FilterConditionRow drag pattern established)

---

## 1. Scope

### 1.1 What Changes

1. New hook `useColumnManager.ts` — manages column visibility, order, panel open/close state
2. New component `ColumnManagerPanel.tsx` — dropdown panel with search, toggle list, drag reorder, bulk actions
3. New component `ColumnRow.tsx` — single row in the panel: toggle switch + label + drag handle
4. New component `ColumnDragOverlay.tsx` — floating pill shown during drag
5. Rename `FilterToolbar.tsx` → `TableToolbar.tsx` — add "Columns" button with hidden count badge
6. Modify `ReportTableWidget.tsx` — wire `useColumnManager` hook, pass `visibleColumns` to `ReportTable`

### 1.2 Behavior

- **Toolbar button:** "Columns" button with `Columns3` icon, next to existing Filter button
- **Hidden count badge:** When columns are hidden, button shows "(N hidden)" badge in blue (same active style as Filter button)
- **Dropdown panel:** Opens/closes independently of the filter panel. Both can be open simultaneously.
- **Search bar:** "Find a column..." — case-insensitive substring match. Filters the list visually.
- **Toggle switches:** Blue = visible, gray = hidden. Click to toggle.
- **First column locked:** The first column (index 0 in the API response) is always visible AND always stays at index 0. Its toggle is disabled with `cursor-not-allowed` and reduced opacity. It cannot be dragged (drag is disabled for locked columns).
- **Drag handles:** 6-dot grip (`GripVertical` from lucide-react) on the right side of each row, visible on hover. Reorders columns in the panel AND in the table.
- **Drag disabled during search:** When search is active, drag handles are hidden and drag is disabled. Toggle still works.
- **Bulk actions:** "Hide all" (hides everything except first column) and "Show all" buttons at the bottom.
- **Desktop only:** Mouse drag, no touch/mobile support needed (matches Spec 04 pattern).
- **Session-only:** Column preferences reset on page reload. No localStorage, no backend persistence.

### 1.3 Interactions with Existing Features

- **Filters:** Column visibility does NOT affect filtering. Users can filter on hidden columns. The filter system uses `ColumnFilterMeta[]` which is independent of the column manager.
- **Data flow:** `ReportTable` already accepts `columns: ColumnDefinition[]`. The column manager filters and reorders this array before passing it down — no changes to `ReportTable` needed.
- **Column sync:** When the API returns different columns (e.g., different report), the hook reinitializes all columns as visible in API order.

### 1.4 Out of Scope

- Persisting column preferences (localStorage or backend)
- Column resizing
- Backend changes (data still includes all columns; filtering is frontend-only)

---

## 2. File Map

| File | Action | What Changes |
|------|--------|-------------|
| `client/src/hooks/useColumnManager.ts` | Create | Column visibility + order state hook (~65 lines) |
| `client/src/components/columns/ColumnManagerPanel.tsx` | Create | Dropdown panel: search, column list, bulk actions (~135 lines) |
| `client/src/components/columns/ColumnRow.tsx` | Create | Single row: toggle + label + drag handle (~70 lines) |
| `client/src/components/columns/ColumnDragOverlay.tsx` | Create | DragOverlay pill component (~20 lines) |
| `client/src/components/FilterToolbar.tsx` | Rename → `TableToolbar.tsx` + Modify | Add Columns button with badge (~75 lines total) |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modify | Wire useColumnManager, pass visibleColumns to ReportTable (~145 lines total) |

---

## 3. Types

### 3.1 ManagedColumn

Used internally by `useColumnManager`. Does not need to be in `shared/types/` since it's frontend-only.

```typescript
// Defined in useColumnManager.ts
interface ManagedColumn {
  key: string;      // matches ColumnDefinition.key
  label: string;    // display name for the panel
  visible: boolean; // toggle state
}
```

Array position = display order. Reordering is `arrayMove` on this array.

---

## 4. Tasks

### Task 1: Create useColumnManager hook

**Files:**
- Create: `client/src/hooks/useColumnManager.ts`

- [ ] **Step 1: Create the file**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useColumnManager.ts
// PURPOSE: Manages column visibility and display order for a
//          single table widget. Session-only state — resets on
//          page reload. Reinitializes when API columns change.
// USED BY: ReportTableWidget
// EXPORTS: useColumnManager, ManagedColumn (type)
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnDefinition } from '@shared/types';

export interface ManagedColumn {
  key: string;
  label: string;
  visible: boolean;
}

export function useColumnManager(apiColumns: ColumnDefinition[] | undefined) {
  const [managedColumns, setManagedColumns] = useState<ManagedColumn[]>([]);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);

  // WHY: Track the previous API columns to avoid resetting user preferences
  // when the same columns array is returned with a new reference identity.
  const prevColumnsKey = useRef('');

  useEffect(() => {
    if (!apiColumns?.length) return;
    const columnsKey = apiColumns.map((c) => c.key).join(',');
    if (columnsKey === prevColumnsKey.current) return;
    prevColumnsKey.current = columnsKey;
    setManagedColumns(
      apiColumns.map((col) => ({ key: col.key, label: col.label, visible: true })),
    );
  }, [apiColumns]);

  const visibleColumns = useMemo(() => {
    if (!apiColumns) return [];
    return managedColumns
      .filter((mc) => mc.visible)
      .map((mc) => apiColumns.find((c) => c.key === mc.key))
      .filter((col): col is ColumnDefinition => col !== undefined);
  }, [managedColumns, apiColumns]);

  const hiddenCount = managedColumns.filter((mc) => !mc.visible).length;

  const toggleColumn = (key: string) => {
    setManagedColumns((prev) => {
      // WHY: First column (index 0) is locked visible — it's the primary identifier
      if (prev[0]?.key === key) return prev;
      return prev.map((mc) => (mc.key === key ? { ...mc, visible: !mc.visible } : mc));
    });
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    // WHY: First column (index 0) is locked — prevent moves to/from index 0
    if (fromIndex === 0 || toIndex === 0) return;
    setManagedColumns((prev) => arrayMove(prev, fromIndex, toIndex));
  };

  const showAll = () => {
    setManagedColumns((prev) => prev.map((mc) => ({ ...mc, visible: true })));
  };

  const hideAll = () => {
    // WHY: First column stays visible — prevent empty table
    setManagedColumns((prev) =>
      prev.map((mc, i) => ({ ...mc, visible: i === 0 })),
    );
  };

  return {
    managedColumns,
    visibleColumns,
    hiddenCount,
    isColumnPanelOpen,
    setIsColumnPanelOpen,
    toggleColumn,
    reorderColumns,
    showAll,
    hideAll,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat: add useColumnManager hook for column visibility and order
```

---

### Task 2: Create ColumnRow component

**Files:**
- Create: `client/src/components/columns/ColumnRow.tsx`

- [ ] **Step 1: Create the component**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat: add ColumnRow component with toggle and drag handle
```

---

### Task 3: Create ColumnDragOverlay component

**Files:**
- Create: `client/src/components/columns/ColumnDragOverlay.tsx`

- [ ] **Step 1: Create the component**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/columns/ColumnDragOverlay.tsx
// PURPOSE: Floating pill shown during column drag, displaying
//          the column label. Same pattern as filter DragOverlay.
// USED BY: ColumnManagerPanel
// EXPORTS: ColumnDragOverlay
// ═══════════════════════════════════════════════════════════════

interface ColumnDragOverlayProps {
  label: string;
}

export default function ColumnDragOverlay({ label }: ColumnDragOverlayProps) {
  return (
    <div className="bg-white shadow-lg rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200">
      {label}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat: add ColumnDragOverlay component
```

---

### Task 4: Create ColumnManagerPanel component

**Files:**
- Create: `client/src/components/columns/ColumnManagerPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```
feat: add ColumnManagerPanel with search, toggles, and drag reorder
```

---

### Task 5: Rename FilterToolbar → TableToolbar, add Columns button, update ReportTableWidget import + JSX

**Files:**
- Rename + Modify: `client/src/components/FilterToolbar.tsx` → `client/src/components/TableToolbar.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx` (update import + JSX to match new props)

- [ ] **Step 1: Rename the file**

```bash
cd client && git mv src/components/FilterToolbar.tsx src/components/TableToolbar.tsx
```

- [ ] **Step 2: Rewrite the component**

Replace the entire content of `TableToolbar.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Toolbar row with "Filter" and "Columns" toggle buttons.
//          Shows active filter count and hidden column count badges.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, Columns3, ChevronDown } from 'lucide-react';

interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
}: TableToolbarProps) {
  const hasFilters = activeFilterCount > 0;
  const hasHiddenColumns = hiddenColumnCount > 0;

  const baseClass = 'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors';
  const activeClass = 'text-primary bg-primary/5 hover:bg-primary/10';
  const inactiveClass = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

  return (
    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1">
      {/* Filter button */}
      <button
        onClick={onFilterToggle}
        className={`${baseClass} ${hasFilters ? activeClass : inactiveClass}`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Columns button */}
      <button
        onClick={onColumnToggle}
        className={`${baseClass} ${hasHiddenColumns ? activeClass : inactiveClass}`}
      >
        <Columns3 size={16} />
        <span>Columns</span>
        {hasHiddenColumns && <span>({hiddenColumnCount} hidden)</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isColumnPanelOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Update ReportTableWidget import and JSX**

WHY: The import rename AND JSX update happen together in this task so the codebase compiles after every commit. No intermediate broken state.

Change the import:
```typescript
// Before:
import FilterToolbar from '../FilterToolbar';
// After:
import TableToolbar from '../TableToolbar';
```

Replace the JSX usage. Change:
```typescript
<FilterToolbar
  activeFilterCount={countActiveFilters(filterGroup)}
  isOpen={isFilterOpen}
  onToggle={() => setIsFilterOpen(!isFilterOpen)}
/>
```
To:
```typescript
<TableToolbar
  activeFilterCount={countActiveFilters(filterGroup)}
  isFilterOpen={isFilterOpen}
  onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
  hiddenColumnCount={0}
  isColumnPanelOpen={false}
  onColumnToggle={() => {}}
/>
```

WHY: `hiddenColumnCount={0}` and `onColumnToggle={() => {}}` are temporary pass-throughs so the component compiles. Task 6 wires these to the real column manager state.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```
refactor: rename FilterToolbar to TableToolbar, add Columns button
```

---

### Task 6: Wire column manager into ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Update the intent block**

Update the PURPOSE comment at the top of the file to reflect the new dependencies:

```typescript
// PURPOSE: Report widget orchestrator. Manages filter state, column
//          visibility/order, data fetching, client-side filtering,
//          and renders TableToolbar, FilterBuilder, ColumnManagerPanel,
//          ReportTable, and Pagination.
```

- [ ] **Step 2: Add imports**

Add at the top, after existing imports:

```typescript
import { useColumnManager } from '../../hooks/useColumnManager';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
```

- [ ] **Step 3: Add useColumnManager hook**

After the existing `const filtersQuery = ...` block (around line 28), add:

```typescript
const {
  managedColumns, visibleColumns, hiddenCount,
  isColumnPanelOpen, setIsColumnPanelOpen,
  toggleColumn, reorderColumns, showAll, hideAll,
} = useColumnManager(data?.columns);
```

- [ ] **Step 4: Update TableToolbar props to use real column manager state**

Replace the temporary pass-throughs from Task 5:
```typescript
hiddenColumnCount={0}
isColumnPanelOpen={false}
onColumnToggle={() => {}}
```
With:
```typescript
hiddenColumnCount={hiddenCount}
isColumnPanelOpen={isColumnPanelOpen}
onColumnToggle={() => setIsColumnPanelOpen(!isColumnPanelOpen)}
```

- [ ] **Step 5: Add ColumnManagerPanel below FilterBuilder**

After the `{isFilterOpen && (...)}` block, add:

```typescript
{isColumnPanelOpen && (
  <ColumnManagerPanel
    managedColumns={managedColumns}
    onToggle={toggleColumn}
    onReorder={reorderColumns}
    onShowAll={showAll}
    onHideAll={hideAll}
  />
)}
```

- [ ] **Step 6: Pass visibleColumns to ReportTable**

Change line:
```typescript
<ReportTable columns={data.columns} data={displayData} />
```
To:
```typescript
<ReportTable columns={visibleColumns.length > 0 ? visibleColumns : data.columns} data={displayData} />
```

WHY: `visibleColumns` may be empty before the hook initializes from the API response. Fall back to `data.columns` during the first render.

- [ ] **Step 7: Verify file stays under 150 lines**

The file should be ~148 lines after these changes. If it exceeds 150, extract the ColumnManagerPanel JSX block into a small wrapper.

- [ ] **Step 8: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```
feat: wire column manager into ReportTableWidget
```

---

### Task 7: Visual Verification

- [ ] **Step 1: Start dev servers**

```bash
cd server && npm run dev &
cd client && npm run dev
```

- [ ] **Step 2: Test toolbar button**

1. Open http://localhost:5173 in browser
2. Navigate to the GRV Log report
3. Verify "Columns" button appears next to "Filter" button
4. Verify no badge when all columns are visible

- [ ] **Step 3: Test toggle visibility**

1. Click "Columns" button — panel opens below toolbar
2. Verify all columns are listed with blue toggle switches
3. Click a toggle to hide a column — verify:
   - Column disappears from the table
   - Button badge updates ("1 hidden")
   - Toggle turns gray in the panel
4. Click toggle again — column reappears

- [ ] **Step 4: Test first column lock**

1. Verify the first column's toggle is grayed out / cursor-not-allowed
2. Click it — nothing happens, column stays visible
3. Click "Hide all" — first column stays visible, all others hidden
4. Click "Show all" — all columns return

- [ ] **Step 5: Test drag reorder**

1. Hover over a column row — grip handle appears
2. Drag a column to a different position
3. Verify the table column order updates immediately
4. Verify the DragOverlay pill shows the column label during drag

- [ ] **Step 6: Test search**

1. Type in the search bar — list filters by column label
2. Verify drag handles disappear during search
3. Verify toggles still work during search
4. Clear search — full list returns in current order
5. Type a query with no matches — "No matching columns" placeholder shown

- [ ] **Step 7: Test both panels open**

1. Open both Filter and Columns panels
2. Verify they stack vertically without interference
3. Verify filter changes and column visibility changes are independent

- [ ] **Step 8: Test column sync on data change**

1. Hide some columns and reorder
2. If possible, switch to a different report or trigger a data refresh
3. Verify column preferences reset to defaults (all visible, API order)

- [ ] **Step 9: Commit**

```
test: verify column manager visual behavior
```
