# Spec 07 — Week Filter Operator

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `isInWeek` date filter operator with a custom dropdown week picker, so users can filter any date column to a specific Monday–Sunday week.

**Architecture:** New `isInWeek` operator added to the shared `FilterOperator` type. Stores Monday in `value` and Sunday in `valueTo` — identical shape to `isBetween`, so all three filter engines (OData, client, server-client) reuse existing range logic with a one-line case addition. The only substantial new code is a `WeekPicker` React component with a mini calendar dropdown.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript, Zod

> **Session scope:** ~30 min Claude Code work (frontend-heavy, minor backend/shared touches)
> **Date:** 2026-03-22
> **Status:** Ready to build
> **Depends on:** Spec 03b (filter builder), Spec 04 (drag-drop filters)

---

## 1. Scope

### 1.1 What Changes

1. New `isInWeek` operator in shared FilterOperator type and Zod schema
2. `isInWeek` case in OData filter builder, client filter, and server client filter (all fall through to `isBetween` logic)
3. New `WeekPicker` dropdown component with mini calendar, week-row hover, month navigation, and "This week" / "Last week" shortcuts
4. `FilterValueInput` renders `WeekPicker` when operator is `isInWeek`
5. `filterConstants` adds `isInWeek` to the date operator list

### 1.2 Out of Scope

- Multi-week selection (single week only)
- Changes to default filter (stays as 30-day range)
- New API endpoints or backend routes
- Report definition changes
- Week number display (user chose date range format: "Mar 17–23, 2026")

---

## 2. File Map

| File | Action | What Changes |
|------|--------|-------------|
| `shared/types/filters.ts` | Modify | Add `'isInWeek'` to `FilterOperator` union |
| `server/src/routes/querySchemas.ts` | Modify | Add `'isInWeek'` to Zod operator enum |
| `server/src/services/odataFilterBuilder.ts` | Modify | Add `case 'isInWeek':` falling through to `isBetween` |
| `server/src/services/serverClientFilter.ts` | Modify | Add `case 'isInWeek':` falling through to `isBetween` |
| `client/src/config/filterConstants.ts` | Modify | Add `{ value: 'isInWeek', label: 'is in week' }` to `OPERATORS_BY_TYPE.date` |
| `client/src/components/filter/FilterConditionRow.tsx` | Modify | Pre-populate current week dates when operator changes to `isInWeek` |
| `client/src/components/filter/FilterValueInput.tsx` | Modify | Render `WeekPicker` when operator is `isInWeek` |
| `client/src/components/filter/WeekPicker.tsx` | **Create** | Dropdown week picker component (~120 lines) |
| `client/src/utils/weekUtils.ts` | **Create** | Pure date helpers: getMonday, getSunday, formatWeekRange, getCalendarWeeks (~60 lines) |
| `client/src/utils/clientFilter.ts` | Modify | Add `case 'isInWeek':` falling through to `isBetween` |
| `client/tests/weekUtils.test.ts` | **Create** | Unit tests for week utility functions |

---

## 3. Design

### 3.1 Data Model

The `isInWeek` operator reuses the existing `FilterCondition` shape:

- `value`: Monday ISO date string (e.g., `"2026-03-17"`)
- `valueTo`: Sunday ISO date string (e.g., `"2026-03-23"`)

This is intentionally identical to `isBetween`. The filter engines treat them the same way — `isInWeek` is a range filter with a specialized UI.

**Note:** Update the `valueTo` comment in `shared/types/filters.ts` (line 35) to include `isInWeek` alongside `between` / `isBetween`.

**Week definition:** Monday through Sunday (ISO 8601 week convention).

### 3.2 Operator Placement

Added to `OPERATORS_BY_TYPE.date` after `isBetween`, before `isEmpty`:

```
is, is not, is before, is after, is on or before, is on or after, is between, is in week, is empty, is not empty
```

### 3.3 Default Behavior

When the user changes the operator to `isInWeek`, the filter condition is pre-populated with the current week. This happens in `FilterConditionRow.tsx`'s operator change handler — when the new operator is `isInWeek`, it sets `value` to the Monday of the current week and `valueTo` to the corresponding Sunday, instead of resetting to empty strings.

This means:
- The WeekPicker trigger immediately shows "Mar 17–23, 2026" (no "Select week..." empty state on initial selection)
- Results filter immediately (via the existing 400ms debounce)
- The WeekPicker still handles an empty `value` gracefully (shows "Select week...") in case the condition is loaded from a saved state with missing data

**Why in FilterConditionRow, not WeekPicker:** Pre-populating at the operator-change site is explicit and avoids mount-time side effects in the WeekPicker component. The WeekPicker is a pure controlled component — it renders what it's given.

### 3.4 Filter Engine Integration

All three filter engines add a single case that falls through to `isBetween`:

**OData builder** (`odataFilterBuilder.ts`):
```typescript
case 'isInWeek':  // Falls through — same date range as isBetween
case 'isBetween': {
  // existing isBetween logic unchanged
}
```

**Client filter** (`clientFilter.ts`):
```typescript
case 'isInWeek':  // Falls through — same date range check
case 'isBetween': {
  // existing isBetween logic unchanged
}
```

**Server client filter** (`serverClientFilter.ts`):
```typescript
case 'isInWeek':  // Falls through — same date range check
case 'isBetween': {
  // existing isBetween logic unchanged
}
```

**Zod schema** (`querySchemas.ts`): Add `'isInWeek'` to the operator enum array.

**Shared types** (`filters.ts`): Add `| 'isInWeek'` to the Date group in the `FilterOperator` union.

**Note on CLIENT_ONLY_OPERATORS:** `isInWeek` is NOT added to `CLIENT_ONLY_OPERATORS` in any file. It is a server-side operator (translates to OData range query), just like `isBetween`. The `isFullyServerSide` check in `odataFilterBuilder.ts` correctly allows it through — a date column with `filterLocation: 'server'` using `isInWeek` gets full OData translation.

### 3.5 WeekPicker Component

**File:** `client/src/components/filter/WeekPicker.tsx`

A self-contained dropdown component. Renders in the filter row where `<input type="date">` normally appears.

**Props interface:**
```typescript
interface WeekPickerProps {
  value: string;             // Monday ISO date
  valueTo?: string;          // Sunday ISO date
  onChange: (monday: string, sunday: string) => void;
}
```

#### 3.5.1 Trigger Button

- Matches `FILTER_INPUT_CLASS` styling (same border, radius, padding as other filter inputs)
- Left icon: `Calendar` from lucide-react (16px)
- Text: `"Select week..."` when empty, or formatted range like `"Mar 17–23, 2026"` when selected
  - When the week spans two months: `"Mar 31 – Apr 6, 2026"`
  - When the week spans two years: `"Dec 30, 2025 – Jan 5, 2026"`
- Right icon: `ChevronDown` (14px) with `rotate-180` transition when open
- Width: `w-52` to accommodate the longest date range format

#### 3.5.2 Dropdown Panel

- Position: `absolute` below trigger, `z-50`
- Style: `bg-white rounded-xl border border-slate-200 shadow-lg`
- Width: `w-72` (fixed width for calendar grid)
- Open/close animation: CSS transition on `opacity` and `scale` (`transition-all duration-150`)
- Click outside closes (via `useEffect` + `mousedown` listener on `document`)
- Escape key closes

#### 3.5.3 Shortcut Buttons

Two pill buttons at the top of the dropdown panel:

- **"This week"** and **"Last week"**
- Style: `text-xs font-medium px-3 py-1.5 rounded-full`
- Default: `bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-colors`
- Active (when selected week matches): `bg-primary/10 text-primary font-semibold`
- Clicking a shortcut selects the week, closes the dropdown

#### 3.5.4 Month Navigation

A header row between shortcuts and the calendar grid:

- Left: `ChevronLeft` button (`text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-50`)
- Center: `"March 2026"` in `text-sm font-semibold text-slate-800`
- Right: `ChevronRight` button (same style as left)
- Clicking arrows changes the displayed month

#### 3.5.5 Calendar Grid

7-column grid (Mon–Sun):

**Column headers:**
- `Mo Tu We Th Fr Sa Su`
- Style: `text-[10px] uppercase tracking-wider text-slate-400 font-medium`
- Center-aligned in each column

**Day cells:**
- `text-xs text-slate-600`, `h-7 w-full` per cell, center-aligned text
- Days outside current month: `text-slate-300` (dimmed but functional — weeks span month boundaries)
- Today: subtle `ring-1 ring-primary/30 rounded-full` indicator

**Week row hover:**
- Entire row gets `bg-primary/5` background with `rounded-lg` shape
- Cursor becomes `pointer` on the row
- The row is the clickable unit, not individual days

**Selected week:**
- Row background: `bg-primary/10 rounded-lg`
- Monday cell: `bg-primary text-white rounded-l-full`
- Sunday cell: `bg-primary text-white rounded-r-full`
- Days between: `bg-primary/15 text-primary`

**Grid rendering logic:**
- Always show 6 rows (ensures consistent dropdown height)
- First row starts from the Monday on or before the 1st of the month
- Fill forward to complete 6 full weeks

#### 3.5.6 Week Selection

When the user clicks a week row:

1. Compute Monday and Sunday of that row
2. Call `onChange(mondayISO, sundayISO)`
3. Brief 150ms highlight, then close dropdown

#### 3.5.7 Date Utility Functions

**File:** `client/src/utils/weekUtils.ts` (~60 lines)

Extracted to a separate file to keep `WeekPicker.tsx` under the 200-line limit and to make these pure functions independently testable.

- `getMonday(date: Date): Date` — returns the Monday of the week containing `date`
- `getSunday(monday: Date): Date` — returns Monday + 6 days
- `formatWeekRange(monday: Date, sunday: Date): string` — produces the display string
- `getCalendarWeeks(year: number, month: number): Date[][]` — returns 6 rows of 7 dates for the grid
- `toISODate(date: Date): string` — returns `YYYY-MM-DD` string (used by WeekPicker and FilterConditionRow)

These are also imported by `FilterConditionRow.tsx` for the operator-change pre-population (needs `getMonday`, `getSunday`, `toISODate`).

### 3.6 FilterValueInput Integration

In `FilterValueInput.tsx`, the `date` branch adds a check before the existing `isBetweenOp` logic:

```typescript
if (operator === 'isInWeek') {
  return (
    <WeekPicker
      value={value}
      valueTo={valueTo}
      onChange={(monday, sunday) => onChange(monday, sunday)}
    />
  );
}
```

This goes before the `isBetweenOp` check so `isInWeek` is handled separately from the dual date-input layout.

### 3.7 FilterConditionRow: Operator Change Pre-population

`FilterConditionRow.tsx` line 85 resets `value: ''` and `valueTo: undefined` when the operator changes. For `isInWeek`, we override this to pre-populate the current week:

```typescript
// In the operator onChange handler:
const newOp = e.target.value as FilterCondition['operator'];
if (newOp === 'isInWeek') {
  const monday = getMonday(new Date());
  onChange({
    ...condition,
    operator: newOp,
    value: toISODate(monday),
    valueTo: toISODate(getSunday(monday)),
  });
} else {
  onChange({ ...condition, operator: newOp, value: '', valueTo: undefined });
}
```

This requires importing `getMonday`, `getSunday`, `toISODate` from `../../utils/weekUtils`.

### 3.8 What Doesn't Change

These files need **no modifications**:

- `FilterBuilder.tsx` — manages the filter tree, agnostic to operator types
- `FilterGroupPanel.tsx` — same
- `useFilterState.ts` — passes filter groups through, no operator awareness
- `ReportTableWidget.tsx` — no changes
- `countActiveFilters()` — already works (`c.value` is truthy for `isInWeek`)
- Report definitions (`grvLog.ts` etc.) — filter operators are report-agnostic
- `useFilterDrag.ts` — drag-drop is condition-level, not operator-level

---

## 4. Tests

**File:** `client/tests/weekUtils.test.ts`

Unit tests for the pure utility functions in `weekUtils.ts`:

- `getMonday`: given a Wednesday, returns the preceding Monday; given a Monday, returns that Monday; given a Sunday, returns the Monday 6 days prior
- `getSunday`: given a Monday, returns the Sunday 6 days later
- `formatWeekRange`: same-month week ("Mar 17–23, 2026"), cross-month week ("Mar 31 – Apr 6, 2026"), cross-year week ("Dec 30, 2025 – Jan 5, 2026")
- `getCalendarWeeks`: returns exactly 6 rows of 7 dates; first date is always a Monday; covers the entire displayed month
- `toISODate`: returns `YYYY-MM-DD` format

Edge cases: leap year week boundaries (Feb 29), year boundary (Dec 31 / Jan 1), months starting on Monday vs Sunday.

---

## 5. Verification

```bash
cd server && npx tsc --noEmit          # Shared types + backend compile
cd client && npx tsc --noEmit          # Frontend compiles
cd server && npm test                   # Existing filter tests pass
```

Manual checks:
1. Open any report → Filter → select a date column → operator dropdown shows "is in week"
2. Selecting "is in week" → WeekPicker appears with current week pre-selected → results filter to this week
3. Click the WeekPicker → dropdown opens with shortcuts, month nav, calendar grid
4. Hover over a week row → entire row highlights
5. Click a week → dropdown closes, trigger shows "Mar 17–23, 2026", results update
6. "This week" / "Last week" shortcuts work and show active state
7. Month navigation arrows browse past/future months
8. Weeks spanning month boundaries work (e.g., Mar 31 – Apr 6)
9. All existing date operators still work unchanged
