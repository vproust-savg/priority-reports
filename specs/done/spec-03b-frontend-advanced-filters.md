# Spec 03b — Frontend: Advanced Filter Builder + Page Rename

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simple FilterBar (4 fixed controls) with an Airtable-style advanced filter builder supporting AND/OR groups, one level of nesting, and all 14 columns with type-appropriate inputs.

**Architecture:** Filter state is a tree (`FilterGroup` with nested `FilterGroup[]`). Server-side columns translate to OData via POST `/query`. Client-side columns (HTML-parsed subform data) are filtered in-browser after fetch. State management uses a custom hook with 400ms debounce.

**Tech Stack:** React 19, TanStack Query v5, Tailwind CSS v4, Zod, Lucide icons, native HTML inputs

> **Session scope:** ~1 hour Claude Code work (frontend session only)
> **Date:** 2026-03-21
> **Parallel with:** spec-03a-backend-advanced-filters.md (backend session)
> **Depends on:** Spec 02b (frontend already built — ReportTableWidget, FilterBar, Pagination)

---

## 1. Scope

### 1.1 What Changes

1. Rename page: "Quality Control" → "Receiving Log" (id, name, path, redirect)
2. Delete `FilterBar.tsx` — replaced by filter builder component suite
3. New components: FilterToolbar, FilterBuilder, FilterConditionRow, FilterValueInput
4. New utilities: client-side filter engine, filter constants
5. New hooks: useFilterState (filter state + debounce)
6. Modified hooks: useReportQuery (GET → POST), useFiltersQuery (expanded response type)
7. Refactored: ReportTableWidget (extract table rendering, integrate filter system)

### 1.2 Out of Scope

- Backend changes (Spec 03a)
- Additional reports beyond GRV Log
- Saved/named filter presets
- Drag-and-drop reordering of conditions
- External UI libraries (native HTML inputs only)

---

## 2. Contract with Backend (Spec 03a)

### 2.1 Query Endpoint

```
POST /api/v1/reports/:reportId/query
Content-Type: application/json
```

**Request body:**
```typescript
{
  filterGroup: FilterGroup,    // Filter tree (shared types)
  page: number,                // Default: 1
  pageSize: number,            // Default: 50
}
```

**Response:** Same `ApiResponse<T>` envelope — no changes to `shared/types/api.ts`.

### 2.2 Filters Endpoint (Expanded)

```
GET /api/v1/reports/:reportId/filters
```

**Response:**
```typescript
{
  meta: { reportId: string; generatedAt: string },
  filters: {
    vendors: FilterOption[],
    statuses: FilterOption[],
    warehouses: FilterOption[],    // NEW — from WAREHOUSES entity
    users: FilterOption[]          // NEW — from USERLIST entity
  },
  columns: ColumnFilterMeta[]     // NEW — filter metadata per column
}
```

### 2.3 Existing GET Endpoint

`GET /api/v1/reports/:reportId` with `from`, `to`, `vendor`, `status` query params **stays unchanged** for backward compatibility. The frontend stops using it — switches to POST.

---

## 3. Shared Types

**Backend session owns `shared/types/filters.ts`.** The frontend session must:
1. Check if the backend already created the new types
2. If yes → verify they match and skip
3. If no → create the file with this exact content

The old `FilterValues` type is removed from the file. This is safe because:
- `FilterBar.tsx` is being deleted (this session)
- `ReportTableWidget.tsx` is being rewritten (this session)
- Backend routes use Zod schemas directly, not `FilterValues`

**New `shared/types/filters.ts`:**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for the advanced filter engine. FilterGroup is a
//          tree structure with AND/OR groups, one level of nesting.
//          Used by both backend (OData translation) and frontend (UI state).
// USED BY: routes/query.ts, odataFilterBuilder.ts, FilterBuilder.tsx,
//          ReportTableWidget.tsx, routes/filters.ts
// EXPORTS: FilterOperator, FilterCondition, FilterGroup,
//          ColumnFilterType, ColumnFilterMeta, FilterOption,
//          FiltersResponse, QueryRequest
// ═══════════════════════════════════════════════════════════════

// --- Operators ---

// WHY: Grouped by type. The frontend shows different operator sets
// per column type. The backend only translates a subset to OData
// (contains/startsWith/endsWith are NOT supported by Priority OData).
export type FilterOperator =
  // Universal — available for all column types
  | 'equals' | 'notEquals' | 'isEmpty' | 'isNotEmpty'
  // Text — client-side only (Priority OData does not support these)
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  // Date
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter' | 'isBetween'
  // Number / Currency
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' | 'between';

// --- Filter Tree ---

export interface FilterCondition {
  id: string;               // UUID for React key
  field: string;             // Column key (e.g., 'vendor', 'date', 'truckTemp')
  operator: FilterOperator;
  value: string;             // Primary value (ISO date, text, number as string)
  valueTo?: string;          // Second value for 'between' / 'isBetween' operators
}

export interface FilterGroup {
  id: string;
  conjunction: 'and' | 'or';
  conditions: FilterCondition[];
  groups: FilterGroup[];     // One level of nesting max (UI enforces this)
}

// --- Column Metadata ---

export type ColumnFilterType = 'text' | 'date' | 'number' | 'currency' | 'enum';

export interface ColumnFilterMeta {
  key: string;                    // Column key, matches ColumnDefinition.key
  label: string;                  // Display label
  filterType: ColumnFilterType;
  filterLocation: 'server' | 'client';
  odataField?: string;            // Priority field name (server-side columns only)
  enumKey?: string;               // Key in FiltersResponse.filters (enum columns only)
}

// --- Filter Options (unchanged from Spec 02) ---

export interface FilterOption {
  value: string;
  label: string;
}

// --- API Shapes ---

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
    warehouses: FilterOption[];
    users: FilterOption[];
  };
  columns: ColumnFilterMeta[];
}

export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}
```

**Also verify `shared/types/index.ts`** re-exports all new types. No changes needed if backend already updated it.

---

## 4. File Structure

### 4.1 New Files

| File | Responsibility | Est. Lines |
|------|---------------|-----------|
| `client/src/config/filterConstants.ts` | Operator maps, factory functions, column helper | ~50 |
| `client/src/components/FilterToolbar.tsx` | "Filter" button with active count badge, toggles panel | ~40 |
| `client/src/components/filter/FilterBuilder.tsx` | Main filter panel — renders root group with conditions and nested groups | ~130 |
| `client/src/components/filter/FilterConditionRow.tsx` | Single condition: field, operator, value, delete button | ~85 |
| `client/src/components/filter/FilterValueInput.tsx` | Smart value input per column type (date, dropdown, text, number) | ~90 |
| `client/src/utils/clientFilter.ts` | Applies filter conditions to data rows client-side | ~85 |
| `client/src/hooks/useFilterState.ts` | Filter state management + 400ms debounce | ~40 |
| `client/src/components/ReportTable.tsx` | Extracted table rendering (thead + tbody) | ~55 |

### 4.2 Modified Files

| File | Change |
|------|--------|
| `client/src/config/pages.ts` | Rename: `id: 'receiving-log'`, `name: 'Receiving Log'`, `path: '/receiving-log'` |
| `client/src/App.tsx` | Default redirect: `/qc` → `/receiving-log` |
| `client/src/hooks/useReportQuery.ts` | Switch from GET with params to POST with JSON body |
| `client/src/hooks/useFiltersQuery.ts` | Update return type for expanded FiltersResponse |
| `client/src/components/widgets/ReportTableWidget.tsx` | Replace FilterBar with filter system, use extracted components |
| `shared/types/filters.ts` | Replace entire file if backend hasn't done it yet |
| `shared/types/index.ts` | Verify re-exports |

### 4.3 Deleted Files

| File | Reason |
|------|--------|
| `client/src/components/FilterBar.tsx` | Replaced by FilterBuilder component suite |

---

## 5. Design Specification

### 5.1 Design System (Existing — DO NOT CHANGE)

- **Fonts:** System stack (`-apple-system`, SF Pro on Mac). No Google Fonts.
- **Primary:** `#007AFF` via `--color-primary` CSS variable. Use `text-primary`, `bg-primary/5`.
- **Cards:** `rounded-2xl`, `shadow-[0_1px_3px_rgba(0,0,0,0.04)]`. Applied by `WidgetShell` — widgets render bare.
- **Icons:** Lucide React (already installed: `lucide-react`)
- **Inputs:** Native HTML `<input>`, `<select>`. No external UI libraries.
- **Tailwind:** v4 with CSS-native `@theme`. No `tailwind.config.js`.

### 5.2 Shared CSS Classes

Define these once and reuse across all filter components:

```typescript
// In filterConstants.ts
export const FILTER_INPUT_CLASS =
  'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white ' +
  'focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors';

export const FILTER_LABEL_CLASS =
  'text-xs font-medium text-slate-400 uppercase tracking-wider';
```

### 5.3 FilterToolbar Design

```
┌────────────────────────────────────────────────────────────┐
│  ⚙ Filter (3)                                              │
└────────────────────────────────────────────────────────────┘
```

- **Location:** Renders inside the widget card, where the old FilterBar was
- **Icon:** Lucide `SlidersHorizontal` (16px, matches text color)
- **Button base:** `flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors`
- **Active state** (filters > 0): `text-primary bg-primary/5 hover:bg-primary/10 hover:text-primary`
- **Count badge:** Inline parenthesized number `(3)`. Only shown when count > 0.
- **Chevron:** Lucide `ChevronDown` (14px). Rotates 180° when open: `transition-transform duration-200`
- **Container:** `px-5 py-2 border-b border-slate-100`
- **NO emoji** in the button label

### 5.4 FilterBuilder Panel Design

```
┌──────────────────────────────────────────────────────────────┐
│  Where                                                       │
│  ┌─ Date ─────┐ ┌─ is on or after ─┐ ┌─ 2026-02-19 ─┐  ×   │
│  └────────────┘ └──────────────────┘ └───────────────┘       │
│  ╭─ and ─╮                                                   │
│  ┌─ Date ─────┐ ┌─ is on or before ─┐ ┌─ 2026-03-21 ┐  ×   │
│  └────────────┘ └──────────────────┘ └───────────────┘       │
│                                                              │
│  ┌── Or group ──────────────────────────────────────── × ───┐│
│  │  ┌─ Status ──┐ ┌─ is ──────────┐ ┌─ Received ────┐  ×  ││
│  │  └───────────┘ └───────────────┘ └───────────────┘      ││
│  │  ╭─ or ──╮                                               ││
│  │  ┌─ Status ──┐ ┌─ is ──────────┐ ┌─ Cancelled ───┐  ×  ││
│  │  └───────────┘ └───────────────┘ └───────────────┘      ││
│  │  + Add condition                                         ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  + Add condition   + Add group                               │
└──────────────────────────────────────────────────────────────┘
```

**Panel container:**
- `bg-white border-b border-slate-200`
- `px-5 py-4`
- **Animation:** Use CSS grid trick for smooth height. Container uses `grid transition-[grid-template-rows] duration-200`. Closed: `grid-rows-[0fr]`. Open: `grid-rows-[1fr]`. Inner div: `overflow-hidden`.

**"Where" label:**
- Shown before the FIRST condition only: `text-xs font-medium text-slate-400 uppercase tracking-wider mb-1`
- Subsequent conditions show the conjunction toggle instead

**Conjunction toggle** (`╭─ and ─╮`):
- Clickable chip that toggles between "and" / "or"
- `text-xs font-medium px-2 py-0.5 rounded cursor-pointer select-none transition-colors`
- Default (and): `text-slate-400 bg-slate-100 hover:bg-slate-200`
- WHY: Clicking toggles conjunction for the entire group. Simple toggle — no dropdown.
- `my-1` vertical margin for breathing room

**Nested group:**
- `border-l-2 border-primary/20 rounded-r-lg bg-slate-50/50 px-4 py-3 mt-2 ml-2`
- WHY: Left border accent (not full border) creates visual nesting without heaviness. Matches refined Apple aesthetic.
- Group header: `text-xs text-slate-400 font-medium mb-2` — shows conjunction label: "Or group" or "And group"
- Delete button on group header: `ml-auto text-slate-300 hover:text-red-400 transition-colors`

**Add buttons:**
- `+ Add condition`: `text-xs font-medium text-primary hover:text-primary/70 transition-colors mt-2`
- `+ Add group`: same style. Only shown at ROOT level (nested groups cannot add sub-groups).
- Use `+` text character, not a Lucide icon (keeps it lightweight)

**Condition spacing:** `space-y-0` between conjunction and condition rows — they're visually grouped. `mt-2` between the last condition and the "Add" buttons.

### 5.5 FilterConditionRow Design

```
┌─ Date ─────┐ ┌─ is on or after ─┐ ┌─ 2026-02-19 ─┐  ×
└────────────┘ └──────────────────┘ └───────────────┘
```

- Layout: `flex items-center gap-2`
- All three controls use `FILTER_INPUT_CLASS`
- Field dropdown: `min-w-[140px]` — shows all 14 column labels
- Operator dropdown: `min-w-[140px]` — shows operators for the selected field's type
- Value input: rendered by `FilterValueInput` (varies by type)
- Delete button: `ml-1 p-1 text-slate-300 hover:text-red-400 rounded transition-colors`
  - Uses Lucide `X` icon (14px)
  - `flex-shrink-0` so it doesn't collapse
- Mobile (< md): `flex-wrap` — controls stack naturally
- Value input HIDDEN when operator is `isEmpty` or `isNotEmpty` (these don't need a value)

**Field change behavior:**
- When field changes → reset operator to first available for the new type → clear value and valueTo
- WHY: The old operator may not be valid for the new field type

### 5.6 FilterValueInput Design

| filterType | Widget | Notes |
|---|---|---|
| `text` | `<input type="text" placeholder="Enter text...">` | Standard text input |
| `date` | `<input type="date">` | Native picker. For `isBetween`: TWO inputs with "and" between |
| `number` | `<input type="number">` | For `between`: TWO inputs |
| `currency` | `<input type="number" step="0.01">` | Same as number with decimal step. For `between`: TWO inputs |
| `enum` | `<select>` | Options from `filterOptions[column.enumKey]`. "Select..." placeholder. Disabled while loading. |

**Between/isBetween layout:**
```
┌── value ──┐  and  ┌── valueTo ──┐
└───────────┘       └─────────────┘
```
- Each input: `w-32`
- "and" text: `text-xs text-slate-400 px-1`

### 5.7 Active Filter Count Logic

Count all conditions across all groups where:
- `field` is non-empty, AND
- operator IS `isEmpty`/`isNotEmpty` (these don't need a value), OR
- `value` is non-empty

---

## 6. Filter Constants (`client/src/config/filterConstants.ts`)

This file extracts constants and factory functions to keep component files under 150 lines.

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.ts
// PURPOSE: Operator definitions, factory functions, and shared CSS
//          classes for the filter builder system. Extracted to keep
//          component files under 150 lines.
// USED BY: FilterConditionRow.tsx, FilterBuilder.tsx, ReportTableWidget.tsx
// EXPORTS: OPERATORS_BY_TYPE, FILTER_INPUT_CLASS, FILTER_LABEL_CLASS,
//          createEmptyCondition, createEmptyGroup, createDefaultFilterGroup,
//          countActiveFilters
// ═══════════════════════════════════════════════════════════════

import type { ColumnFilterType, FilterCondition, FilterGroup, FilterOperator } from '@shared/types';

// --- Shared CSS classes ---

export const FILTER_INPUT_CLASS =
  'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white ' +
  'focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors';

export const FILTER_LABEL_CLASS =
  'text-xs font-medium text-slate-400 uppercase tracking-wider';

// --- Operator sets by column type ---

// WHY: Extracted here (not inline in FilterConditionRow) to keep
// that component under 150 lines. Also reusable by clientFilter.ts.
export const OPERATORS_BY_TYPE: Record<ColumnFilterType, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'notContains', label: 'does not contain' },
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'isBefore', label: 'is before' },
    { value: 'isAfter', label: 'is after' },
    { value: 'isOnOrBefore', label: 'is on or before' },
    { value: 'isOnOrAfter', label: 'is on or after' },
    { value: 'isBetween', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'notEquals', label: '≠' },
    { value: 'greaterThan', label: '>' },
    { value: 'lessThan', label: '<' },
    { value: 'greaterOrEqual', label: '≥' },
    { value: 'lessOrEqual', label: '≤' },
    { value: 'between', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  currency: [
    { value: 'equals', label: '=' },
    { value: 'notEquals', label: '≠' },
    { value: 'greaterThan', label: '>' },
    { value: 'lessThan', label: '<' },
    { value: 'greaterOrEqual', label: '≥' },
    { value: 'lessOrEqual', label: '≤' },
    { value: 'between', label: 'is between' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
  enum: [
    { value: 'equals', label: 'is' },
    { value: 'notEquals', label: 'is not' },
    { value: 'isEmpty', label: 'is empty' },
    { value: 'isNotEmpty', label: 'is not empty' },
  ],
};

// WHY: `between` for numbers, `isBetween` for dates. Both produce
// "X ge Y and X le Z" in OData. Names differ because the backend
// FilterOperator type groups them by category. The filter engine
// treats them identically.

// --- Factory functions ---

export function createEmptyCondition(): FilterCondition {
  return {
    id: crypto.randomUUID(),
    field: '',
    operator: 'equals',
    value: '',
  };
}

export function createEmptyGroup(): FilterGroup {
  return {
    id: crypto.randomUUID(),
    // WHY: Nested groups default to OR — most common use case is
    // "status is A OR status is B"
    conjunction: 'or',
    conditions: [createEmptyCondition()],
    groups: [],
  };
}

export function createDefaultFilterGroup(): FilterGroup {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

  return {
    id: 'root',
    conjunction: 'and',
    conditions: [
      {
        id: crypto.randomUUID(),
        field: 'date',
        operator: 'isOnOrAfter',
        value: fromDate,
      },
      {
        id: crypto.randomUUID(),
        field: 'date',
        operator: 'isOnOrBefore',
        value: today,
      },
    ],
    groups: [],
  };
}

// --- Active filter counting ---

export function countActiveFilters(group: FilterGroup): number {
  let count = 0;
  for (const c of group.conditions) {
    if (!c.field) continue;
    if (c.operator === 'isEmpty' || c.operator === 'isNotEmpty') { count++; continue; }
    if (c.value) count++;
  }
  for (const g of group.groups) {
    count += countActiveFilters(g);
  }
  return count;
}
```

---

## 7. Client-Side Filter Engine (`client/src/utils/clientFilter.ts`)

### 7.1 Purpose

After the backend returns data (server-side OData filters already applied), the client-side engine applies the remaining conditions:
- Columns with `filterLocation === 'client'` (HTML-parsed subform fields)
- Text operators `contains`, `notContains`, `startsWith`, `endsWith` on ANY column (OData doesn't support these)

### 7.2 Implementation

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/clientFilter.ts
// PURPOSE: Applies filter conditions to data rows that the backend
//          could not handle: client-side columns (HTML-parsed fields)
//          and text-search operators (contains, startsWith, endsWith).
// USED BY: ReportTableWidget.tsx
// EXPORTS: applyClientFilters, hasAnyClientConditions
// ═══════════════════════════════════════════════════════════════

import type { FilterCondition, FilterGroup, ColumnFilterMeta } from '@shared/types';

const CLIENT_ONLY_OPERATORS = new Set([
  'contains', 'notContains', 'startsWith', 'endsWith',
]);

function isClientCondition(condition: FilterCondition, columns: ColumnFilterMeta[]): boolean {
  const col = columns.find((c) => c.key === condition.field);
  if (!col) return false;
  return col.filterLocation === 'client' || CLIENT_ONLY_OPERATORS.has(condition.operator);
}

export function hasAnyClientConditions(group: FilterGroup, columns: ColumnFilterMeta[]): boolean {
  for (const c of group.conditions) {
    if (c.field && isClientCondition(c, columns)) return true;
  }
  for (const g of group.groups) {
    if (hasAnyClientConditions(g, columns)) return true;
  }
  return false;
}

function evaluateCondition(row: Record<string, unknown>, condition: FilterCondition): boolean {
  if (!condition.field) return true; // Empty condition — skip
  const cellValue = row[condition.field];
  const str = String(cellValue ?? '').toLowerCase();
  const val = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'equals': return str === val;
    case 'notEquals': return str !== val;
    case 'contains': return str.includes(val);
    case 'notContains': return !str.includes(val);
    case 'startsWith': return str.startsWith(val);
    case 'endsWith': return str.endsWith(val);
    case 'isEmpty': return cellValue == null || String(cellValue).trim() === '';
    case 'isNotEmpty': return cellValue != null && String(cellValue).trim() !== '';
    case 'greaterThan': return parseFloat(String(cellValue ?? '0')) > parseFloat(condition.value);
    case 'lessThan': return parseFloat(String(cellValue ?? '0')) < parseFloat(condition.value);
    case 'greaterOrEqual': return parseFloat(String(cellValue ?? '0')) >= parseFloat(condition.value);
    case 'lessOrEqual': return parseFloat(String(cellValue ?? '0')) <= parseFloat(condition.value);
    case 'between': {
      const num = parseFloat(String(cellValue ?? '0'));
      return num >= parseFloat(condition.value) && num <= parseFloat(condition.valueTo ?? condition.value);
    }
    case 'isBefore': return new Date(String(cellValue)) < new Date(condition.value);
    case 'isAfter': return new Date(String(cellValue)) > new Date(condition.value);
    case 'isOnOrBefore': return new Date(String(cellValue)) <= new Date(condition.value);
    case 'isOnOrAfter': return new Date(String(cellValue)) >= new Date(condition.value);
    case 'isBetween': {
      const d = new Date(String(cellValue));
      return d >= new Date(condition.value) && d <= new Date(condition.valueTo ?? condition.value);
    }
    default: return true;
  }
}

function evaluateGroup(
  row: Record<string, unknown>,
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): boolean {
  // Only evaluate client-side conditions — server already handled the rest
  const clientConditions = group.conditions.filter(
    (c) => c.field && isClientCondition(c, columns) && (
      c.operator === 'isEmpty' || c.operator === 'isNotEmpty' || c.value
    ),
  );

  const conditionResults = clientConditions.map((c) => evaluateCondition(row, c));
  const groupResults = group.groups.map((g) => evaluateGroup(row, g, columns));
  const allResults = [...conditionResults, ...groupResults];

  if (allResults.length === 0) return true; // No client-side conditions — row passes

  return group.conjunction === 'and'
    ? allResults.every(Boolean)
    : allResults.some(Boolean);
}

export function applyClientFilters(
  rows: Record<string, unknown>[],
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): Record<string, unknown>[] {
  if (!hasAnyClientConditions(filterGroup, filterColumns)) return rows;
  return rows.filter((row) => evaluateGroup(row, filterGroup, filterColumns));
}
```

### 7.3 Pagination with Client-Side Filtering

When client-side filters are active, the backend returns unfiltered rows for columns it can't handle. The frontend must fetch more rows and paginate locally:

```typescript
const hasClientFilters = hasAnyClientConditions(debouncedGroup, filterColumns);
const fetchPageSize = hasClientFilters ? 500 : 50;
```

- Fetch 500 rows from backend (page 1)
- Apply client-side filters → get filtered result set
- Paginate filtered results locally (50 per page)
- Display accurate count from filtered results
- If filtered results < 500 original rows, count is exact. If = 500, show "500+"

---

## 8. Component Specifications

### 8.1 FilterToolbar — Complete Code (`client/src/components/FilterToolbar.tsx`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/FilterToolbar.tsx
// PURPOSE: Compact toolbar row with "Filter" toggle button and
//          active filter count badge. Opens/closes the filter panel.
// USED BY: ReportTableWidget
// EXPORTS: FilterToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, ChevronDown } from 'lucide-react';

interface FilterToolbarProps {
  activeFilterCount: number;
  isOpen: boolean;
  onToggle: () => void;
}

export default function FilterToolbar({ activeFilterCount, isOpen, onToggle }: FilterToolbarProps) {
  const hasFilters = activeFilterCount > 0;

  return (
    <div className="px-5 py-2 border-b border-slate-100">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          hasFilters
            ? 'text-primary bg-primary/5 hover:bg-primary/10'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}
```

### 8.2 FilterBuilder — Complete Code (`client/src/components/filter/FilterBuilder.tsx`)

```typescript
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

  // --- Nested group helpers ---

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
        <div
          key={group.id}
          className="border-l-2 border-primary/20 rounded-r-lg bg-slate-50/50 px-4 py-3 mt-2 ml-2"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => updateNestedGroup(group.id, {
                ...group,
                conjunction: group.conjunction === 'and' ? 'or' : 'and',
              })}
              className="text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-600 transition-colors"
            >
              {group.conjunction === 'or' ? 'Or' : 'And'} group
            </button>
            <button
              onClick={() => deleteNestedGroup(group.id)}
              className="text-xs text-slate-300 hover:text-red-400 transition-colors"
            >
              Remove
            </button>
          </div>

          {group.conditions.map((condition, idx) => (
            <div key={condition.id}>
              {idx > 0 && (
                <button
                  onClick={() => updateNestedGroup(group.id, {
                    ...group,
                    conjunction: group.conjunction === 'and' ? 'or' : 'and',
                  })}
                  className="text-xs font-medium px-2 py-0.5 rounded cursor-pointer select-none
                    text-slate-400 bg-slate-100 hover:bg-slate-200 transition-colors my-1 block"
                >
                  {group.conjunction}
                </button>
              )}
              <FilterConditionRow
                condition={condition}
                onChange={(updated) => updateNestedGroup(group.id, {
                  ...group,
                  conditions: group.conditions.map((c) => (c.id === condition.id ? updated : c)),
                })}
                onDelete={() => {
                  const remaining = group.conditions.filter((c) => c.id !== condition.id);
                  if (remaining.length === 0) deleteNestedGroup(group.id);
                  else updateNestedGroup(group.id, { ...group, conditions: remaining });
                }}
                {...sharedRowProps}
              />
            </div>
          ))}

          <button
            onClick={() => updateNestedGroup(group.id, {
              ...group,
              conditions: [...group.conditions, createEmptyCondition()],
            })}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors mt-2"
          >
            + Add condition
          </button>
        </div>
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
```

**WARNING:** This component is the most complex (~140 lines). If it exceeds 150 after adjustments, extract nested group rendering into `FilterGroupPanel.tsx`.

### 8.3 FilterConditionRow — Complete Code (`client/src/components/filter/FilterConditionRow.tsx`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterConditionRow.tsx
// PURPOSE: Single filter condition row with field, operator, and
//          value controls. Delegates value rendering to FilterValueInput.
// USED BY: FilterBuilder.tsx
// EXPORTS: FilterConditionRow
// ═══════════════════════════════════════════════════════════════

import { X } from 'lucide-react';
import type { FilterCondition, ColumnFilterMeta, FiltersResponse } from '@shared/types';
import { OPERATORS_BY_TYPE, FILTER_INPUT_CLASS } from '../../config/filterConstants';
import FilterValueInput from './FilterValueInput';

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
    <div className="flex items-center gap-2 flex-wrap">
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
```

### 8.4 FilterValueInput — Complete Code (`client/src/components/filter/FilterValueInput.tsx`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterValueInput.tsx
// PURPOSE: Renders the appropriate input widget based on the column's
//          filterType. Handles between/isBetween dual-input layout.
// USED BY: FilterConditionRow.tsx
// EXPORTS: FilterValueInput
// ═══════════════════════════════════════════════════════════════

import type { ColumnFilterMeta, FilterOperator, FilterOption, FiltersResponse } from '@shared/types';
import { FILTER_INPUT_CLASS } from '../../config/filterConstants';

interface FilterValueInputProps {
  column: ColumnFilterMeta;
  operator: FilterOperator;
  value: string;
  valueTo?: string;
  onChange: (value: string, valueTo?: string) => void;
  filterOptions: FiltersResponse['filters'] | undefined;
  filterOptionsLoading: boolean;
}

export default function FilterValueInput({
  column, operator, value, valueTo, onChange, filterOptions, filterOptionsLoading,
}: FilterValueInputProps) {
  const isBetweenOp = operator === 'between' || operator === 'isBetween';

  // WHY: Cast to generic record — column.enumKey is a string key
  // into the filters object (e.g., 'vendors', 'warehouses')
  const enumOptions: FilterOption[] = column.enumKey && filterOptions
    ? (filterOptions as Record<string, FilterOption[]>)[column.enumKey] ?? []
    : [];

  if (column.filterType === 'enum') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={filterOptionsLoading}
        className={`${FILTER_INPUT_CLASS} min-w-[140px] ${
          filterOptionsLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <option value="">{filterOptionsLoading ? 'Loading...' : 'Select...'}</option>
        {enumOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (column.filterType === 'date') {
    if (isBetweenOp) {
      return (
        <div className="flex items-center gap-1">
          <input type="date" value={value} onChange={(e) => onChange(e.target.value, valueTo)}
            className={`${FILTER_INPUT_CLASS} w-36`} />
          <span className="text-xs text-slate-400 px-1">and</span>
          <input type="date" value={valueTo ?? ''} onChange={(e) => onChange(value, e.target.value)}
            className={`${FILTER_INPUT_CLASS} w-36`} />
        </div>
      );
    }
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className={`${FILTER_INPUT_CLASS} w-36`} />
    );
  }

  if (column.filterType === 'number' || column.filterType === 'currency') {
    const step = column.filterType === 'currency' ? '0.01' : '1';
    if (isBetweenOp) {
      return (
        <div className="flex items-center gap-1">
          <input type="number" step={step} value={value}
            onChange={(e) => onChange(e.target.value, valueTo)}
            placeholder="Min" className={`${FILTER_INPUT_CLASS} w-28`} />
          <span className="text-xs text-slate-400 px-1">and</span>
          <input type="number" step={step} value={valueTo ?? ''}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder="Max" className={`${FILTER_INPUT_CLASS} w-28`} />
        </div>
      );
    }
    return (
      <input type="number" step={step} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..." className={`${FILTER_INPUT_CLASS} w-32`} />
    );
  }

  // Default: text
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder="Enter text..." className={`${FILTER_INPUT_CLASS} min-w-[140px]`} />
  );
}
```

---

## 9. Hook Updates

### 9.1 useReportQuery — Switch to POST

**Current (GET with params):**
```typescript
const params = new URLSearchParams();
params.set('page', String(page));
// ... flat params
const response = await fetch(`/api/v1/reports/${reportId}?${params}`);
```

**New (POST with JSON body):**
```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Fetches report data via POST /query endpoint. Accepts a
//          FilterGroup tree instead of flat query params.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}

export function useReportQuery(reportId: string, params: ReportQueryParams) {
  return useQuery<ApiResponse>({
    // WHY: queryKey includes stringified filterGroup so TanStack Query
    // caches each filter combination separately
    queryKey: ['report', reportId, params],
    queryFn: async () => {
      const body: QueryRequest = {
        filterGroup: params.filterGroup,
        page: params.page,
        pageSize: params.pageSize,
      };
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Report query failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

### 9.2 useFiltersQuery — Updated Return Type

The hook code barely changes — just the type annotation. The response now includes `warehouses`, `users`, and `columns`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFiltersQuery.ts
// PURPOSE: Fetches filter options and column metadata for a report.
//          Response includes enum dropdown values (vendors, statuses,
//          warehouses, users) and column filter configuration.
// USED BY: ReportTableWidget
// EXPORTS: useFiltersQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { FiltersResponse } from '@shared/types';

export function useFiltersQuery(reportId: string) {
  return useQuery<FiltersResponse>({
    queryKey: ['filters', reportId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/reports/${reportId}/filters`);
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

### 9.3 useFilterState — New Hook

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFilterState.ts
// PURPOSE: Manages filter group state with 400ms debounce for API
//          calls. Separates immediate UI state from debounced query
//          state to prevent API spam on every keystroke.
// USED BY: ReportTableWidget
// EXPORTS: useFilterState
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import type { FilterGroup } from '@shared/types';
import { createDefaultFilterGroup } from '../config/filterConstants';

export function useFilterState() {
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(createDefaultFilterGroup);
  const [debouncedGroup, setDebouncedGroup] = useState<FilterGroup>(filterGroup);
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // WHY: useEffect is acceptable here — this is a timer/side-effect, not
  // data fetching. TanStack Query handles the actual data fetching.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGroup(filterGroup), 400);
    return () => clearTimeout(timer);
  }, [filterGroup]);

  const handleFilterChange = (newGroup: FilterGroup) => {
    setFilterGroup(newGroup);
    setPage(1); // WHY: Reset page — current page may not exist in new result set
  };

  return {
    filterGroup,
    debouncedGroup,
    page,
    setPage,
    isFilterOpen,
    setIsFilterOpen,
    handleFilterChange,
  };
}
```

---

## 10. ReportTableWidget Refactor

### 10.1 ReportTable — Complete Code (`client/src/components/ReportTable.tsx`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportTable.tsx
// PURPOSE: Pure presentational table component. Renders thead and
//          tbody from column definitions and row data. Extracted
//          from ReportTableWidget to keep it under 150 lines.
// USED BY: ReportTableWidget
// EXPORTS: ReportTable
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import { formatCellValue } from '../utils/formatters';

interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
}

export default function ReportTable({ columns, data }: ReportTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-slate-50/80">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-5 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider ${
                  col.type === 'currency' || col.type === 'number' ? 'text-right' : ''
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors duration-150 ${
                rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
              }`}
            >
              {columns.map((col) => {
                const { formatted, isNegative } = formatCellValue(row[col.key], col.type);
                return (
                  <td
                    key={col.key}
                    className={`px-5 py-3 text-slate-700 whitespace-nowrap ${
                      col.type === 'currency' || col.type === 'number' ? 'text-right tabular-nums' : ''
                    } ${isNegative ? 'text-red-500' : ''}`}
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### 10.2 ReportTableWidget — Complete Code (`client/src/components/widgets/ReportTableWidget.tsx`)

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget orchestrator. Manages filter state, data
//          fetching, client-side filtering, and renders FilterToolbar,
//          FilterBuilder, ReportTable, and Pagination.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { applyClientFilters, hasAnyClientConditions } from '../../utils/clientFilter';
import { countActiveFilters } from '../../config/filterConstants';
import FilterToolbar from '../FilterToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  // WHY: Fetch more rows when client-side filters are active — the
  // backend can't filter HTML-parsed columns, so we filter locally
  const hasClientFilters = hasAnyClientConditions(debouncedGroup, filterColumns);
  const fetchPageSize = hasClientFilters ? 500 : 50;

  const { data, isLoading, error, refetch } = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page: hasClientFilters ? 1 : page,
    pageSize: fetchPageSize,
  });

  // WHY: If filter options fail to load, the filter builder still works
  // for non-enum fields — enum dropdowns just show "Loading..."
  if (filtersQuery.error) console.warn('Failed to load filter options:', filtersQuery.error);

  // Client-side filtering
  const allRows = data?.data ?? [];
  const filteredRows = hasClientFilters
    ? applyClientFilters(allRows, debouncedGroup, filterColumns)
    : allRows;
  const displayData = hasClientFilters
    ? filteredRows.slice((page - 1) * 50, page * 50)
    : filteredRows;
  const totalCount = hasClientFilters
    ? filteredRows.length
    : data?.pagination.totalCount ?? 0;
  const totalPages = hasClientFilters
    ? Math.ceil(filteredRows.length / 50)
    : data?.pagination.totalPages ?? 0;

  return (
    <>
      <FilterToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isOpen={isFilterOpen}
        onToggle={() => setIsFilterOpen(!isFilterOpen)}
      />

      {isFilterOpen && (
        <FilterBuilder
          filterGroup={filterGroup}
          onChange={handleFilterChange}
          columns={filterColumns}
          filterOptions={filtersQuery.data?.filters}
          filterOptionsLoading={filtersQuery.isLoading}
        />
      )}

      {isLoading && (
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-4">
              <div className="h-4 bg-slate-100 rounded w-1/6" />
              <div className="h-4 bg-slate-100 rounded w-1/4" />
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-4 bg-slate-100 rounded w-1/6" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="p-6 text-center">
          <p className="text-red-500 text-sm mb-3">Failed to load data</p>
          <button onClick={() => refetch()} className="text-sm text-primary font-medium hover:underline">
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && displayData.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-slate-500 text-sm font-medium">No results found</p>
          <p className="text-slate-400 text-xs mt-1">Try adjusting your filters</p>
        </div>
      )}

      {data && displayData.length > 0 && (
        <>
          <ReportTable columns={data.columns} data={displayData} />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </>
  );
}
```

**Note:** This file is ~110 lines — well under the 150-line limit thanks to extracting ReportTable, useFilterState, and filter constants.

---

## 11. Page Rename

### 11.1 `client/src/config/pages.ts`

Change three values:
- `id: 'qc'` → `id: 'receiving-log'`
- `name: 'Quality Control'` → `name: 'Receiving Log'`
- `path: '/qc'` → `path: '/receiving-log'`

Widget entry stays identical.

### 11.2 `client/src/App.tsx`

Change default redirect:
- `<Navigate to="/qc" replace />` → `<Navigate to="/receiving-log" replace />`

---

## 12. Testing Without Backend

If the backend (Spec 03a) hasn't been deployed yet, the frontend will show loading/error states when fetching from the POST `/query` endpoint or the expanded GET `/filters` endpoint.

**Options (pick one):**

**Option A — Mock Service Worker (recommended if msw is easy to set up):**
Add a temporary mock in the Vite dev server proxy config.

**Option B — Temporary inline mock in useReportQuery:**
```typescript
// TEMPORARY — remove when backend is ready
const MOCK_ENABLED = false; // Set to true for testing without backend
```

**Option C — Just run both servers:**
Start the backend with `cd server && npm run dev` — the Vite proxy forwards `/api` to Express.

**The frontend code should be written WITHOUT mocks.** If the backend isn't ready, the loading/error states handle it gracefully. Do not commit mock code.

---

## 13. Acceptance Criteria

### Must Pass

- [ ] Page renamed: "Receiving Log" at `/receiving-log`
- [ ] Default route redirects to `/receiving-log`
- [ ] Old FilterBar is deleted, replaced by FilterToolbar + FilterBuilder
- [ ] "Filter" button shows in toolbar with Lucide icon and active count badge
- [ ] Clicking "Filter" opens/closes the filter panel with smooth transition
- [ ] Default filters: two date conditions (last 30 days range)
- [ ] Adding a condition: new row with field/operator/value controls
- [ ] Field dropdown lists all 14 columns
- [ ] Operator dropdown changes based on selected field type
- [ ] Date fields show native date picker
- [ ] Enum fields show `<select>` with options from API
- [ ] Number/currency fields show number input
- [ ] Text fields show text input
- [ ] `isBetween` / `between` show two input fields
- [ ] `isEmpty` / `isNotEmpty` hide the value input
- [ ] Conditions can be deleted
- [ ] Nested groups can be added (OR by default)
- [ ] Nested groups show left border accent
- [ ] Conjunction toggles (and ↔ or) work at root and group level
- [ ] Nested groups can be deleted
- [ ] Nested groups CANNOT add sub-groups (one level max)
- [ ] Filter changes debounce 400ms before triggering API call
- [ ] API uses POST to `/query` endpoint
- [ ] Client-side filtering works for parsed HTML columns
- [ ] Client-side filtering works for `contains`, `startsWith`, `endsWith`
- [ ] Pagination works with and without client-side filters
- [ ] Loading, error, and empty states still work
- [ ] `cd client && npx tsc --noEmit` passes

### File Size

- [ ] Every new file under 150 lines
- [ ] Intent blocks on all new files
- [ ] WHY comments on non-obvious decisions

### Design

- [ ] System font stack only (no Google Fonts)
- [ ] `--color-primary` (#007AFF) for interactive elements
- [ ] Native HTML inputs only (no external UI libraries)
- [ ] Lucide icons for filter button (SlidersHorizontal, ChevronDown, X)
- [ ] Consistent with existing dashboard aesthetic

---

## 14. Common Mistakes to Avoid

- **Using `useEffect` for data fetching** — use TanStack Query. The debounce `useEffect` in `useFilterState` is the ONE acceptable use.
- **Dynamic Tailwind classes** like `` `col-span-${n}` `` — use the `COL_SPAN_CLASSES` map.
- **Files > 150 lines** — extract components/hooks. The plan already handles this.
- **Forgetting intent blocks** on new files.
- **Importing Google Fonts** — system font stack only.
- **Using `rounded-xl` on panels** — use `rounded-lg` for inline panels, `rounded-2xl` for cards.
- **Not resetting page to 1** on filter change.
- **Not debouncing filter changes** — each keystroke triggers an API call without debounce.
- **Not handling `between`/`isBetween`** — they need TWO value inputs.
- **Not resetting operator/value when field changes** — old operator may be invalid.
- **Treating client-side columns as server-side** — check `filterLocation` before building query.
- **Modifying `shared/types/api.ts`** — the `ApiResponse` envelope is shared and stable.
- **Using Tailwind v3 patterns** — v4 uses CSS-native `@theme` in `index.css`.
- **Adding a card wrapper in the widget** — `WidgetShell` is applied by `WidgetRenderer`.

---

## 15. Implementation Plan

### Task 1: Shared types + page rename

**Files:**
- Verify/create: `shared/types/filters.ts`
- Verify: `shared/types/index.ts`
- Modify: `client/src/config/pages.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1:** Check if `shared/types/filters.ts` has the new types (`FilterGroup`, `FilterCondition`, `ColumnFilterMeta`, etc.). If yes, verify content matches Section 3 and skip to Step 3. If no, replace the file with the content from Section 3.

- [ ] **Step 2:** Verify `shared/types/index.ts` re-exports from `./filters`. (It already does — `export * from './filters'` — just confirm the new types are accessible.)

- [ ] **Step 3:** In `client/src/config/pages.ts`, change three values:
  ```typescript
  id: 'receiving-log',           // WAS: 'qc'
  name: 'Receiving Log',          // WAS: 'Quality Control'
  path: '/receiving-log',         // WAS: '/qc'
  ```

- [ ] **Step 4:** In `client/src/App.tsx`, change the default redirect:
  ```typescript
  <Navigate to="/receiving-log" replace />   // WAS: "/qc"
  ```

- [ ] **Step 5:** Run `cd client && npx tsc --noEmit` — verify TypeScript still compiles. If it fails on `FilterValues` imports, that's expected and will be fixed in later tasks.

### Task 2: Filter constants

**Files:**
- Create: `client/src/config/filterConstants.ts`

- [ ] **Step 1:** Create `client/src/config/filterConstants.ts` with the COMPLETE content from Section 6. All exports: `OPERATORS_BY_TYPE`, `FILTER_INPUT_CLASS`, `FILTER_LABEL_CLASS`, `createEmptyCondition`, `createEmptyGroup`, `createDefaultFilterGroup`, `countActiveFilters`.

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit` — verify the file compiles. It only imports from `@shared/types`, which should exist from Task 1.

### Task 3: Client-side filter engine

**Files:**
- Create: `client/src/utils/clientFilter.ts`

- [ ] **Step 1:** Create `client/src/utils/clientFilter.ts` with the COMPLETE content from Section 7.2. All exports: `applyClientFilters`, `hasAnyClientConditions`.

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit` — verify the file compiles.

### Task 4: FilterValueInput component

**Files:**
- Create: `client/src/components/filter/FilterValueInput.tsx`

- [ ] **Step 1:** Create the `filter/` directory: `mkdir -p client/src/components/filter`

- [ ] **Step 2:** Create `client/src/components/filter/FilterValueInput.tsx` with:
  - Intent block (Section 8.4)
  - Props interface (Section 8.4)
  - Switch statement rendering per `filterType` (Section 8.4)
  - Between/isBetween dual-input layout (Section 5.6)
  - Uses `FILTER_INPUT_CLASS` from filterConstants
  - Enum dropdown populated from `filterOptions[column.enumKey]`
  - Disabled state when `filterOptionsLoading`

- [ ] **Step 3:** Run `cd client && npx tsc --noEmit`.

### Task 5: FilterConditionRow component

**Files:**
- Create: `client/src/components/filter/FilterConditionRow.tsx`

- [ ] **Step 1:** Create `client/src/components/filter/FilterConditionRow.tsx` with:
  - Intent block (Section 8.3)
  - Props interface (Section 8.3)
  - Field dropdown (all 14 columns)
  - Operator dropdown (from `OPERATORS_BY_TYPE[column.filterType]`)
  - `FilterValueInput` for the value (hidden for isEmpty/isNotEmpty)
  - Delete button with Lucide `X` icon
  - Field change handler that resets operator/value (Section 8.3)
  - `flex items-center gap-2` layout

- [ ] **Step 2:** Verify file is under 150 lines. If approaching limit, check that `OPERATORS_BY_TYPE` is imported from filterConstants (not defined inline).

- [ ] **Step 3:** Run `cd client && npx tsc --noEmit`.

### Task 6: FilterBuilder component

**Files:**
- Create: `client/src/components/filter/FilterBuilder.tsx`

- [ ] **Step 1:** Create `client/src/components/filter/FilterBuilder.tsx` with:
  - Intent block (Section 8.2)
  - Props interface (Section 8.2)
  - "Where" label on first condition
  - Conjunction toggle chips (clickable, toggles and/or)
  - `FilterConditionRow` for each condition
  - Nested group rendering with left border accent styling
  - "Add condition" and "Add group" buttons (add group only at root)
  - Immutable state update functions (Section 8.2)
  - Import `createEmptyCondition`, `createEmptyGroup` from filterConstants

- [ ] **Step 2:** Verify file is under 150 lines. If approaching 150, extract nested group rendering into `FilterGroupPanel.tsx`.

- [ ] **Step 3:** Run `cd client && npx tsc --noEmit`.

### Task 7: FilterToolbar component

**Files:**
- Create: `client/src/components/FilterToolbar.tsx`

- [ ] **Step 1:** Create `client/src/components/FilterToolbar.tsx` with:
  - Intent block (Section 8.1)
  - Props interface (Section 8.1)
  - Lucide `SlidersHorizontal` icon (16px)
  - "Filter" text label
  - Count badge shown when > 0
  - Lucide `ChevronDown` with rotate-180 transition
  - Active state styling when filters applied

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit`.

### Task 8: Update useReportQuery hook

**Files:**
- Modify: `client/src/hooks/useReportQuery.ts`

- [ ] **Step 1:** Replace the entire file with the content from Section 9.1. Key changes:
  - `ReportQueryParams` now has `filterGroup`, `page`, `pageSize` (not flat params)
  - `queryFn` uses `fetch` with POST method and JSON body
  - URL changes to `/api/v1/reports/${reportId}/query`

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit`. This WILL fail because ReportTableWidget still uses the old API — that's expected and fixed in Task 12.

### Task 9: Update useFiltersQuery hook

**Files:**
- Modify: `client/src/hooks/useFiltersQuery.ts`

- [ ] **Step 1:** Replace the entire file with the content from Section 9.2. The type annotation `FiltersResponse` now covers the expanded response shape.

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit`.

### Task 10: Create useFilterState hook

**Files:**
- Create: `client/src/hooks/useFilterState.ts`

- [ ] **Step 1:** Create `client/src/hooks/useFilterState.ts` with the COMPLETE content from Section 9.3.

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit`.

### Task 11: Extract ReportTable component

**Files:**
- Create: `client/src/components/ReportTable.tsx`

- [ ] **Step 1:** Create `client/src/components/ReportTable.tsx` with:
  - Intent block (Section 10.1)
  - Props: `columns: ColumnDefinition[]`, `data: Record<string, unknown>[]`
  - Copy the `<table>` JSX from current ReportTableWidget (lines 96–137)
  - Import `formatCellValue` from `../utils/formatters`

- [ ] **Step 2:** Run `cd client && npx tsc --noEmit`.

### Task 12: Rewrite ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1:** Replace the entire file with the orchestrator pattern from Section 10.2. Key changes:
  - Remove `FilterBar` import → add `FilterToolbar`, `FilterBuilder`, `ReportTable` imports
  - Remove `FilterValues` import → use `FilterGroup` from `useFilterState`
  - Remove `getDefaultFilters()` → use `useFilterState` hook
  - Add `useFilterState` hook call
  - Add client-side filtering logic
  - Update render: FilterToolbar → FilterBuilder (conditional) → loading/error/empty → ReportTable → Pagination
  - Pass `displayData` to ReportTable, `totalCount`/`totalPages` to Pagination

- [ ] **Step 2:** Verify file is under 150 lines.

- [ ] **Step 3:** Run `cd client && npx tsc --noEmit`. This should now compile successfully with all pieces in place.

### Task 13: Delete FilterBar + cleanup

**Files:**
- Delete: `client/src/components/FilterBar.tsx`

- [ ] **Step 1:** Delete `client/src/components/FilterBar.tsx`.

- [ ] **Step 2:** Search the codebase for any remaining imports of `FilterBar`:
  ```bash
  grep -r "FilterBar" client/src/
  ```
  Should return zero results (ReportTableWidget was rewritten in Task 12).

- [ ] **Step 3:** Search for any remaining imports of `FilterValues`:
  ```bash
  grep -r "FilterValues" client/src/
  ```
  Should return zero results.

- [ ] **Step 4:** Run `cd client && npx tsc --noEmit` — final type check. Must pass cleanly.

### Task 14: Visual verification

- [ ] **Step 1:** Start the dev server: `cd client && npm run dev`

- [ ] **Step 2:** Verify in browser:
  - `/` redirects to `/receiving-log`
  - Page title shows "Receiving Log" in nav
  - "Filter" button visible with SlidersHorizontal icon
  - Default: two date conditions (last 30 days) are shown
  - Filter panel opens/closes on button click
  - Can add new conditions
  - Field dropdown shows 14 columns
  - Operator dropdown changes per field type
  - Can add nested group (shows OR group with left accent)
  - Can delete conditions and groups
  - Conjunction toggle works (and ↔ or)

- [ ] **Step 3:** If backend is running, verify:
  - Data loads in table
  - Changing filters triggers POST request (check Network tab)
  - Pagination works
  - Client-side filters (e.g., "driverId contains X") filter rows locally

### Task 15: Airtable status update

- [ ] **Step 1:** Update the Airtable API Reports record for Spec 03b:
  - Record: `recJluOijRUZcZnBS`
  - Field `fldAAdwPBUQBRQet7` (Claude Status): "Complete"
  - Field `fld1cKObhpMuz3VYq` (Claude Comments): "Frontend filter builder built: FilterToolbar, FilterBuilder, FilterConditionRow, FilterValueInput, clientFilter engine, useFilterState hook. Page renamed to Receiving Log. Old FilterBar deleted."
  - Add record comment via POST
  - Use `/airtable-api` skill for patterns
