# Spec 03b-h — Frontend: OR-Group Filter Warning

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a warning banner when an OR group mixes server-side and client-side filter conditions, so users know their filter was partially applied.

**Architecture:** Client-side detection mirrors `odataFilterBuilder.ts`'s `isFullyServerSide` logic. A new utility function checks the FilterGroup tree, and `ReportTableWidget` renders a subtle amber warning banner when mixed OR groups are detected. No backend changes needed.

**Tech Stack:** React 19, Tailwind CSS v4, TypeScript

> **Session scope:** ~10 min Claude Code work (frontend session only)
> **Date:** 2026-03-21
> **Status:** Ready to build
> **Depends on:** Spec 03b (filter builder already built — FilterBuilder, clientFilter.ts, ReportTableWidget)

---

## 1. Scope

### 1.1 What Changes

1. New utility function `hasSkippedOrGroups()` in `clientFilter.ts`
2. Warning banner in `ReportTableWidget.tsx` when mixed OR groups are detected

### 1.2 Out of Scope

- Backend changes (see Spec 03a-h)
- Preventing users from creating mixed OR groups (they're valid — just partially applied)
- Per-condition indicators showing which conditions were skipped

---

## 2. File Map

| File | Action | What Changes |
|------|--------|-------------|
| `client/src/utils/clientFilter.ts` | Modify | Add `hasSkippedOrGroups()` export (~15 lines) |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modify | Import + call `hasSkippedOrGroups`, render warning banner (~8 lines) |

---

## 3. Tasks

### Task 1: Add `hasSkippedOrGroups` utility function

**Files:**
- Modify: `client/src/utils/clientFilter.ts` (add new exported function at bottom)

**Logic:** An OR group is "skipped" by the backend if it contains any condition where:
- The column's `filterLocation` is `'client'`, OR
- The operator is a client-only operator (`contains`, `notContains`, `startsWith`, `endsWith`)

This mirrors `odataFilterBuilder.ts`'s `isFullyServerSide` check (lines 88-97).

- [ ] **Step 1: Add `hasSkippedOrGroups` function**

Add at the bottom of `clientFilter.ts`, after `applyClientFilters`:
```typescript
// WHY: The backend's odataFilterBuilder silently skips entire OR groups
// that contain any client-side condition (correct safety behavior — partial
// OR = data loss). This function detects when that happens so the UI can
// warn the user that results may include extra rows.
export function hasSkippedOrGroups(
  group: FilterGroup,
  columns: ColumnFilterMeta[],
): boolean {
  // Check if THIS group is an OR with any client-side condition
  if (group.conjunction === 'or') {
    for (const c of group.conditions) {
      if (c.field && isClientCondition(c, columns)) return true;
    }
  }
  // Recurse into child groups
  for (const g of group.groups) {
    if (hasSkippedOrGroups(g, columns)) return true;
  }
  return false;
}
```

Note: `isClientCondition` is already defined at line 16 of `clientFilter.ts` and used by `hasAnyClientConditions`. Reuse it here.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/utils/clientFilter.ts
git commit -m "feat: add hasSkippedOrGroups utility for OR-group skip detection"
```

---

### Task 2: Render warning banner in ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx:13,31,67-75`

**Design direction:** Match the Apple/Stripe refinement of the existing UI. The warning should feel like a native system notice — subtle, informative, non-alarming. Uses amber tones for "advisory" (not red/error), a Lucide icon for visual anchoring, and the same spatial rhythm as `FilterToolbar` (`px-5` horizontal padding, `border-slate-100` weight). The banner sits inline between the filter panel and the table — no floating toasts or modals.

- [ ] **Step 1: Import `hasSkippedOrGroups` and Lucide icon**

Update the import at line 13:
```typescript
import { applyClientFilters, hasAnyClientConditions, hasSkippedOrGroups } from '../../utils/clientFilter';
```

Add Lucide import at the top (after other imports):
```typescript
import { AlertTriangle } from 'lucide-react';
```

- [ ] **Step 2: Add detection call**

After the `hasClientFilters` line (line 31), add:
```typescript
const hasSkippedOr = hasSkippedOrGroups(debouncedGroup, filterColumns);
```

- [ ] **Step 3: Render warning banner**

After the `{isFilterOpen && (...)}` block (after line 75), add:
```tsx
{hasSkippedOr && (
  <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
    <AlertTriangle size={14} className="shrink-0 text-amber-500" />
    <span>Some OR-group filters can't be fully applied. Results may include extra rows.</span>
  </div>
)}
```

Design notes:
- `mx-5` matches `FilterToolbar`'s `px-5` horizontal rhythm
- `bg-amber-50/80` and `border-amber-200/60` — translucent, not solid. Feels lighter.
- `AlertTriangle` at 14px matches `ChevronDown` size in FilterToolbar
- `shrink-0` prevents icon from collapsing on narrow viewports
- `gap-2` aligns with the `gap-1.5` / `gap-2` spacing in surrounding components

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Visual verification**

1. Start dev server: `cd client && npm run dev`
2. Open filter builder, create an OR group with a Date condition (server) AND a Driver ID condition (client)
3. Verify amber warning banner appears below the filter builder
4. Switch to AND conjunction → verify warning disappears
5. Create an OR group with only server-side conditions → verify no warning

- [ ] **Step 6: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: show warning banner when OR groups mix server and client conditions"
```

---

## 4. Verification

```bash
cd client && npx tsc --noEmit          # TypeScript compiles
```

Manual checks:
- AND group with mixed server+client conditions → NO warning (AND works fine with partial server-side)
- OR group with only server-side conditions → NO warning
- OR group with at least one client-side condition → amber warning appears
- Warning text: "Some OR-group filters can't be applied server-side. Results may include extra rows."
