# Sort Panel — Design Spec

## 1. Context & Goal

The dashboard has Filter and Columns toolbar controls but **no way to sort table rows**. Data renders in whatever order the API returns it. Users need to sort by one or more columns to find relevant data faster.

**Goal:** Add a reusable Sort button + panel to the toolbar, visually and structurally consistent with Filter and Columns. Supports multi-column sort with drag-to-reorder priority. Client-side only — no API changes.

## 2. Toolbar Button

A **Sort** button appears in `TableToolbar` between the Columns button and the right-side action group (Refresh/Export).

**Visual design** — identical to Filter and Columns buttons:
- Icon: `ArrowUpDown` (lucide-react, 16px)
- Text: `Sort`
- Badge: `(N)` showing count of active sort rules when > 0
- Chevron toggle (`ChevronDown`, rotates 180° when open)
- Active state (has sort rules): `text-primary bg-primary/5 hover:bg-primary/10`
- Inactive state: `text-slate-500 hover:text-slate-700 hover:bg-slate-50`
- Uses the shared `baseClass` already defined in `TableToolbar.tsx:33`

**Panel mutual exclusivity:** Opening Sort closes Filter and Columns panels, and vice versa. `ReportTableWidget` coordinates this — when any panel opens, the other two close.

**File:** `client/src/components/TableToolbar.tsx`

## 3. Sort Panel

Renders below the toolbar in the same position as Filter and Columns panels, inside an `AnimatePresence` block with `FADE_IN` / `EASE_FAST` animation (same as the existing panels).

**Panel container:**
- Background: `bg-white`, padding `px-5 py-4`, bottom border `border-b border-slate-200`
- Matches `ColumnManagerPanel` layout

**Panel contents:**
- Ordered list of `SortRuleRow` components inside a `@dnd-kit` `DndContext` + `SortableContext`
- "Add sort" button below the rules
- "Clear all" button when rules exist (secondary text button style)

**File:** `client/src/components/sort/SortPanel.tsx`

## 4. Sort Rule Row

Each sort rule is a horizontal row with four elements:

| Element | Details |
|---------|---------|
| Drag handle | `GripVertical` (14px), appears on hover via `opacity-0 group-hover/row:opacity-100`. Same pattern as `FilterConditionRow` and `ColumnRow`. |
| Column picker | `<select>` dropdown listing available columns. Uses `FILTER_INPUT_CLASS` from `filterConstants.ts`. Only columns not already used in another sort rule appear (prevents duplicate sorts). |
| Direction toggle | Button toggling between `ArrowUp` + "Asc" and `ArrowDown` + "Desc". Styled: `px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-600`. |
| Delete button | `X` icon (14px), appears on hover (`opacity-0 group-hover/row:opacity-100`), removes the rule. Same pattern as `FilterConditionRow` delete. |

**Sort priority** is determined by visual order — first rule = primary sort, second = secondary, etc.

**Drag-and-drop:**
- `@dnd-kit` with `closestCenter` collision detection and `verticalListSortingStrategy`
- `PointerSensor` with `distance: 5` activation constraint (prevents accidental drags when clicking controls)
- `useSortable` hook per row, same pattern as `ColumnRow.tsx`
- No custom drag overlay — default opacity approach (simpler than column drag overlay since rows are short)

**Add sort button:**
- Text: `+ Add sort`
- Style: `text-xs font-medium text-primary hover:text-primary/70` (matches FilterBuilder's add buttons)
- Disabled when all visible columns are already used in sort rules
- When clicked, adds a rule defaulting to the first available column, ascending

**Clear all button:**
- Text: `Clear all`
- Style: `text-xs font-medium text-slate-500 hover:text-slate-700` (matches ColumnManagerPanel's bulk action buttons)
- Only visible when at least one sort rule exists
- Bottom section with `mt-3 pt-3 border-t border-slate-100` separator (same as ColumnManagerPanel bulk actions)

**File:** `client/src/components/sort/SortRuleRow.tsx`

## 5. State Management — `useSortManager` Hook

### Interface

```ts
interface SortRule {
  id: string;        // unique ID for dnd-kit (crypto.randomUUID())
  columnKey: string;  // matches ColumnDefinition.key
  direction: 'asc' | 'desc';
}
```

### Hook Signature

```ts
function useSortManager(columns: ColumnDefinition[]): {
  sortRules: SortRule[];
  sortedData: (data: Record<string, unknown>[]) => Record<string, unknown>[];
  addSort: (columnKey?: string) => void;
  removeSort: (id: string) => void;
  updateSort: (id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => void;
  reorderSorts: (fromIndex: number, toIndex: number) => void;
  clearAll: () => void;
  isSortPanelOpen: boolean;
  setIsSortPanelOpen: (open: boolean) => void;
  sortCount: number;
}
```

### Sorting Logic (`sortedData`)

- Returns a **new array** — never mutates the input
- Applies rules in priority order (index 0 = primary sort)
- Type-aware comparison using `ColumnDefinition.type`:
  - `currency` / `number` / `percent`: `Number()` comparison
  - `date`: `new Date().getTime()` comparison
  - `string` (and fallback): `String.localeCompare()`
- **Null handling:** null/undefined values sort **last** regardless of direction
- **Fallback:** If type comparison fails (e.g., non-numeric string in a number column), falls back to `String()` coercion and `localeCompare()`

### Column Cleanup

When visible columns change (user hides a column via Column Manager), `useSortManager` automatically removes any sort rules referencing columns no longer in the `columns` array. Implemented via `useEffect` watching the columns list, same defensive pattern as `useColumnManager` reinitializing on column changes.

### State Properties

- Session-only state (resets on page reload), matching column visibility behavior
- `sortCount` derived from `sortRules.length` for the toolbar badge
- Uses `arrayMove` from `@dnd-kit/sortable` for reordering (already in the project)

**File:** `client/src/hooks/useSortManager.ts`

## 6. Integration in ReportTableWidget

### Hook Wiring

```
useFilterState()          → filter state + debouncedGroup
useReportQuery()          → raw data from API
useColumnManager()        → visible columns
useSortManager(visibleColumns)  → sort rules + sortedData()
```

`useSortManager` is called **after** `useColumnManager` because it takes `visibleColumns` as input — sort rules should only reference currently visible columns.

### Data Pipeline

Raw API data → `sortedData(displayData)` → `ReportTable`

The sorted data replaces `displayData` in the render path:
```
// Before:
<ReportTable data={displayData} ... />

// After:
<ReportTable data={sortedData(displayData)} ... />
```

### Panel Mutual Exclusivity

`ReportTableWidget` currently manages `isFilterOpen` and `isColumnPanelOpen` independently. Adding `isSortPanelOpen` — the toggle handlers ensure only one panel is open at a time:

- `onFilterToggle`: closes sort and column panels
- `onColumnToggle`: closes sort and filter panels
- `onSortToggle`: closes filter and column panels

### Pagination Interaction

Sort applies to the **full in-memory dataset** before pagination slices it. Changing sort does NOT reset pagination to page 1 (unlike filter changes which re-fetch from the API). The user stays on their current page but sees rows in the new order.

**File:** `client/src/components/widgets/ReportTableWidget.tsx`

## 7. Testing Strategy (TDD)

Every new file gets a co-located test file. Tests are written **before** implementation (red-green-refactor). Framework: Vitest + React Testing Library, matching existing project patterns.

### 7.1 `useSortManager.test.ts` — Hook Logic

Tests use `renderHook` + `act()` from `@testing-library/react`, same pattern as `useColumnManager.test.ts`.

**CRUD operations:**
- `addSort()` adds a rule with default ascending direction and first available column
- `addSort('price')` adds a rule for a specific column
- `removeSort(id)` removes the rule and decrements `sortCount`
- `updateSort(id, { direction: 'desc' })` flips direction
- `updateSort(id, { columnKey: 'name' })` changes column
- `reorderSorts(0, 1)` swaps priority order
- `clearAll()` removes all rules, `sortCount` returns 0

**Sorting comparators:**
- Sorts numbers ascending: `[3, 1, 2]` → `[1, 2, 3]`
- Sorts numbers descending: `[3, 1, 2]` → `[3, 2, 1]`
- Sorts strings with `localeCompare`: `['banana', 'apple']` → `['apple', 'banana']`
- Sorts dates chronologically: `['2026-03-28', '2026-01-15']` → `['2026-01-15', '2026-03-28']`
- Sorts currency same as number (numeric comparison)
- Sorts percent same as number (numeric comparison)

**Multi-column sort:**
- Primary sort by category ascending, secondary by price descending — rows within same category sorted by price desc

**Null handling:**
- Null values sort last when ascending
- Null values sort last when descending
- Mixed null/non-null sorts correctly with nulls at end

**Immutability:**
- `sortedData()` returns a new array — original data array unchanged (serialize before/after, same pattern as `filterDragUtils.test.ts`)

**Column cleanup:**
- Removing a column from the `columns` input auto-removes sort rules referencing that column
- Sort rules for remaining columns are preserved

**Edge cases:**
- `sortedData([])` returns `[]`
- `sortedData(data)` with no sort rules returns data in original order
- Adding sort when all columns are used returns unchanged rules (no-op)

### 7.2 `SortRuleRow.test.tsx` — Component Rendering

Tests use `render` + `screen` from `@testing-library/react`. Mock `@dnd-kit/sortable` with `vi.mock()`, same pattern as `ColumnRow.test.tsx`.

- Renders column picker `<select>` with available columns
- Column picker excludes columns already used by other sort rules
- Direction toggle shows "Asc" by default
- Clicking direction toggle calls `onUpdate` with `direction: 'desc'`
- Delete button calls `onRemove` when clicked
- Drag handle has correct aria-label

### 7.3 `SortPanel.test.tsx` — Panel Container

Mock `@dnd-kit/core` and `@dnd-kit/sortable`. Test panel-level behavior:

- Renders "Add sort" button when no rules exist
- Renders sort rule rows when rules exist
- "Add sort" button calls `onAddSort`
- "Clear all" button visible only when rules exist
- "Clear all" button calls `onClearAll`
- "Add sort" button disabled when `availableColumns` is empty

### 7.4 `TableToolbar` — Sort Button (extend existing)

No separate test file — extend `TableToolbar` tests if they exist, or add a co-located test:

- Sort button renders with "Sort" text
- Badge shows `(2)` when `sortCount` is 2
- No badge when `sortCount` is 0
- Chevron rotates when `isSortPanelOpen` is true
- Active styling when `sortCount > 0`
- `onSortToggle` called on click

### 7.5 Test File Locations

| Test File | Tests |
|-----------|-------|
| `client/src/hooks/useSortManager.test.ts` | Hook CRUD, sorting logic, null handling, immutability, column cleanup |
| `client/src/components/sort/SortRuleRow.test.tsx` | Row rendering, interactions |
| `client/src/components/sort/SortPanel.test.tsx` | Panel container, add/clear buttons |
| `client/src/components/TableToolbar.test.tsx` | Sort button rendering, badge, toggle |

## 8. File Summary

### New Files (7)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `client/src/hooks/useSortManager.ts` | State + sorting logic — rules CRUD, `sortedData()` comparator, column cleanup | ~120 |
| `client/src/hooks/useSortManager.test.ts` | Hook tests — CRUD, comparators, nulls, immutability, column cleanup | ~180 |
| `client/src/components/sort/SortPanel.tsx` | Panel container with dnd-kit context, rule list, add/clear buttons | ~100 |
| `client/src/components/sort/SortPanel.test.tsx` | Panel tests — add/clear buttons, rule rendering | ~60 |
| `client/src/components/sort/SortRuleRow.tsx` | Single sort rule — drag handle, column picker, direction toggle, delete | ~80 |
| `client/src/components/sort/SortRuleRow.test.tsx` | Row tests — rendering, interactions, column exclusion | ~70 |
| `client/src/components/TableToolbar.test.tsx` | Toolbar tests — sort button, badge, toggle, active state | ~60 |

### Modified Files (2)

| File | Change |
|------|--------|
| `client/src/components/TableToolbar.tsx` | Add Sort button + props (`sortCount`, `isSortPanelOpen`, `onSortToggle`) |
| `client/src/components/widgets/ReportTableWidget.tsx` | Wire `useSortManager`, pipe data through `sortedData()`, add sort panel render block, panel mutual exclusivity |

## 9. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Column hidden while it has an active sort rule | Sort rule auto-removed by `useSortManager` column cleanup |
| All visible columns already used in sort rules | "Add sort" button disabled |
| Empty data array | `sortedData([])` returns `[]` — no-op |
| Null/undefined values in sorted column | Sort last regardless of asc/desc direction |
| Mixed types in a column (e.g., string in number column) | Falls back to `String()` coercion + `localeCompare()` |
| Sort + expandable rows | Sort applies to parent rows; expanded detail panels stay attached to their parent row |
| Page reload | Sort state resets (session-only, same as column visibility) |

## 10. Performance

`Array.prototype.sort()` on up to 50k rows with multi-key comparison. JavaScript's sort handles this in <50ms on modern hardware. No memoization needed initially — can add `useMemo` keyed on `[data, sortRules]` if profiling shows re-renders are expensive.

## 11. Verification Plan

### Automated
```bash
cd client && npx vitest run                    # All tests pass (new + existing)
cd client && npx tsc -b --noEmit               # No TypeScript errors
```

### Manual (dev server)
1. Open any report page — Sort button visible in toolbar between Columns and Refresh
2. Click Sort — panel opens, Filter/Columns panels close
3. Click "Add sort" — rule appears with first column, ascending
4. Toggle direction — switches to descending, table rows reorder immediately
5. Add second sort rule — only unused columns appear in the dropdown
6. Drag to reorder rules — sort priority changes, table reflects new order
7. Hide a column that has an active sort rule — sort rule auto-removed
8. Click "Clear all" — all rules removed, badge disappears, table returns to original order
9. Verify null values sort to the bottom regardless of direction

## 12. What This Spec Does NOT Cover

- Server-side `$orderby` API sorting
- Column header click-to-sort shortcuts
- Persisting sort preferences across sessions
- Default sort rules per report

These are intentionally excluded. Can be added later without changing the architecture.
