# SG Interface Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Apple blue/slate visual identity with SG Interface warm gold/cream across all client components.

**Architecture:** Token-first approach — replace the CSS `@theme` block first (instant 80% transformation for any component already using `var(--)`), then sweep every component file to replace hardcoded Tailwind slate/blue classes with SG Interface CSS variable references. One structural change: toolbar redesign from labeled pills to icon-based buttons.

**Tech Stack:** React 19 + Tailwind CSS v4 (`@theme` in CSS) + Framer Motion + Lucide icons

**Spec:** `docs/superpowers/specs/2026-04-09-sg-interface-redesign.md`

**Reference implementation:** `/Users/victorproust/Documents/Work/SG Interface/Sales Dashboard v1/`

---

## File Structure

No new files created. One file fully rewritten (`index.css`). One file structurally redesigned (`TableToolbar.tsx`). All others receive Tailwind class replacements.

| File | Action | Responsibility |
|------|--------|---------------|
| `client/src/index.css` | Rewrite | SG Interface `@theme` tokens + global styles |
| `client/src/config/filterConstants.ts` | Modify | Shared CSS class constants (3 constants) |
| `client/src/components/DepartmentLayout.tsx` | Modify | Page bg, header text/border |
| `client/src/components/WidgetShell.tsx` | Modify | Card border removal, title colors |
| `client/src/components/NavTabs.tsx` | Modify | Active tab → dark pill |
| `client/src/components/TableToolbar.tsx` | Redesign | Icon-based toolbar |
| `client/src/components/ReportTable.tsx` | Modify | Row colors, hover, headers |
| `client/src/components/Pagination.tsx` | Modify | Button colors |
| `client/src/components/Toast.tsx` | Modify | Border, icon colors |
| `client/src/components/EmptyState.tsx` | Modify | Text colors |
| `client/src/components/ErrorState.tsx` | Modify | Text/icon colors |
| `client/src/components/LoadingToast.tsx` | Modify | Card border, spinner colors |
| `client/src/components/TableSkeleton.tsx` | Modify | Use `.skeleton` class |
| `client/src/components/cells/CopyableCell.tsx` | Modify | Hover/handle colors |
| `client/src/components/cells/ExpiryDateCell.tsx` | Modify | Link color |
| `client/src/components/details/BbdDetailPanel.tsx` | Modify | Border, text colors |
| `client/src/components/filter/FilterBuilder.tsx` | Modify | Panel bg, link colors |
| `client/src/components/filter/FilterConditionRow.tsx` | Modify | Handle, delete colors |
| `client/src/components/filter/FilterGroupPanel.tsx` | Modify | Border, text colors |
| `client/src/components/filter/FilterValueInput.tsx` | Modify | Text colors |
| `client/src/components/filter/WeekPicker.tsx` | Modify | Text colors |
| `client/src/components/filter/WeekPickerDropdown.tsx` | Modify | Full color overhaul |
| `client/src/components/columns/ColumnManagerPanel.tsx` | Modify | Panel bg, input focus |
| `client/src/components/columns/ColumnRow.tsx` | Modify | Toggle, text colors |
| `client/src/components/columns/ColumnDragOverlay.tsx` | Modify | Card border |
| `client/src/components/sort/SortPanel.tsx` | Modify | Panel bg, link colors |
| `client/src/components/sort/SortRuleRow.tsx` | Modify | Border, text colors |
| `client/src/components/modals/Modal.tsx` | Modify | Border, close button |
| `client/src/components/modals/ExtendExpiryModal.tsx` | Modify | Full color overhaul |
| `client/src/components/modals/BulkExtendModal.tsx` | Modify | Full color overhaul |
| `client/src/components/modals/BulkExtendRowTable.tsx` | Modify | Header, text colors |

---

## Color Mapping Reference

Use this table for all class replacements in Tasks 2–10:

| Old Class | New Class |
|-----------|-----------|
| `bg-slate-50` | `bg-[var(--color-bg-page)]` |
| `bg-white` | `bg-[var(--color-bg-card)]` |
| `border-slate-200/60` | `border-[var(--color-gold-subtle)]` |
| `border-slate-200` | `border-[var(--color-gold-subtle)]` |
| `border-slate-100` | `border-[var(--color-gold-subtle)]` |
| `border-slate-300` | `border-[var(--color-gold-muted)]` |
| `text-slate-900` | `text-[var(--color-text-primary)]` |
| `text-slate-800` | `text-[var(--color-text-primary)]` |
| `text-slate-700` | `text-[var(--color-text-primary)]` |
| `text-slate-600` | `text-[var(--color-text-secondary)]` |
| `text-slate-500` | `text-[var(--color-text-secondary)]` |
| `text-slate-400` | `text-[var(--color-text-muted)]` |
| `text-slate-300` | `text-[var(--color-text-faint)]` |
| `bg-slate-100` | `bg-[var(--color-gold-subtle)]` |
| `bg-slate-50/30` | _(remove — no alternating rows)_ |
| `bg-slate-50/50` | `bg-[var(--color-gold-hover)]` |
| `bg-slate-50/80` | `bg-[var(--color-gold-hover)]` |
| `bg-slate-100/50` | `bg-[var(--color-gold-hover)]` |
| `hover:bg-slate-50` | `hover:bg-[var(--color-gold-hover)]` |
| `hover:bg-slate-100` | `hover:bg-[var(--color-gold-hover)]` |
| `hover:bg-slate-200` | `hover:bg-[var(--color-gold-subtle)]` |
| `hover:text-slate-600` | `hover:text-[var(--color-text-secondary)]` |
| `hover:text-slate-700` | `hover:text-[var(--color-text-primary)]` |
| `hover:text-slate-800` | `hover:text-[var(--color-text-primary)]` |
| `bg-blue-50/30` | `bg-[var(--color-gold-hover)]` |
| `bg-blue-50/60` | `bg-[var(--color-gold-hover)]` |
| `hover:bg-blue-50/60` | `hover:bg-[var(--color-gold-hover)]` |
| `bg-blue-50` | `bg-[var(--color-blue)]/10` |
| `border-blue-200` | `border-[var(--color-blue)]/20` |
| `text-primary` | `text-[var(--color-gold-primary)]` |
| `bg-primary` | `bg-[var(--color-gold-primary)]` |
| `bg-primary/5` | `bg-[var(--color-gold-hover)]` |
| `bg-primary/10` | `bg-[var(--color-gold-primary)]/10` |
| `bg-primary/15` | `bg-[var(--color-gold-primary)]/15` |
| `hover:bg-primary/10` | `hover:bg-[var(--color-gold-hover)]` |
| `hover:bg-primary/90` | `hover:bg-[var(--color-dark-hover)]` |
| `hover:text-primary` | `hover:text-[var(--color-gold-primary)]` |
| `hover:text-primary/70` | `hover:text-[var(--color-gold-primary)]/70` |
| `text-primary hover:text-primary/80` | `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/80` |
| `text-white bg-primary` | `text-white bg-[var(--color-dark)]` |
| `focus:ring-primary/20` | `focus:ring-[var(--color-gold-primary)]/20` |
| `focus:ring-primary/30` | `focus:ring-[var(--color-gold-primary)]/30` |
| `focus:border-primary` | `focus:border-[var(--color-gold-primary)]` |
| `focus:border-primary/40` | `focus:border-[var(--color-gold-primary)]/40` |
| `ring-primary/30` | `ring-[var(--color-gold-primary)]/30` |
| `border-primary/20` | `border-[var(--color-gold-primary)]/20` |
| `border-l-primary/20` | `border-l-[var(--color-gold-primary)]/20` |
| `border-t-primary` | `border-t-[var(--color-gold-primary)]` |
| `text-emerald-500` | `text-[var(--color-green)]` |
| `text-green-600` | `text-[var(--color-green)]` |
| `text-red-500` | `text-[var(--color-red)]` |
| `text-red-300` | `text-[var(--color-red)]/50` |
| `text-red-700` | `text-[var(--color-red)]` |
| `bg-red-50` | `bg-[var(--color-red)]/5` |
| `border-red-200` | `border-[var(--color-red)]/20` |
| `hover:text-red-400` | `hover:text-[var(--color-red)]` |
| `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` | `shadow-[var(--shadow-card)]` |
| `shadow-[0_4px_12px_rgba(0,0,0,0.08)]` | `shadow-[var(--shadow-dropdown)]` |
| `shadow-[0_1px_3px_rgba(0,0,0,0.08)]` | `shadow-[var(--shadow-active)]` |
| `shadow-lg` | `shadow-[var(--shadow-dropdown)]` |
| `shadow-xl` | `shadow-[var(--shadow-dropdown)]` |

---

## Task 1: Replace CSS Token Layer

**Files:**
- Rewrite: `client/src/index.css`

- [ ] **Step 1: Replace index.css with SG Interface tokens**

Replace the entire file with the SG Interface `@theme` block and global styles. Reference: `/Users/victorproust/.claude/skills/design-sg-interface/references/sg-tokens.css`

```css
@import "tailwindcss";

@theme {
  /* ─── Spacing scale ─── */
  --spacing-2xs: 2px;
  --spacing-xs: 4px;
  --spacing-sm: 6px;
  --spacing-md: 8px;
  --spacing-base: 10px;
  --spacing-lg: 12px;
  --spacing-xl: 14px;
  --spacing-2xl: 16px;
  --spacing-3xl: 20px;
  --spacing-4xl: 24px;

  /* ─── Backgrounds ─── */
  --color-bg-page: #f5f1eb;
  --color-bg-card: #ffffff;

  /* ─── Gold accent scale (lightest → most saturated) ─── */
  --color-gold-hover: #faf8f4;
  --color-gold-subtle: #f0ece5;
  --color-gold-muted: #e8e0d0;
  --color-gold-light: #d4c5a9;
  --color-gold-primary: #b8a88a;

  /* ─── Dark pair ─── */
  --color-dark: #2c2a26;
  --color-dark-hover: #3d3a35;

  /* ─── Text scale ─── */
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #555555;
  --color-text-muted: #999999;
  --color-text-faint: #bbbbbb;

  /* ─── Semantic ─── */
  --color-green: #22c55e;
  --color-red: #ef4444;
  --color-yellow: #eab308;
  --color-blue: #3b82f6;

  /* ─── Border radius ─── */
  --radius-xs: 2px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-base: 8px;
  --radius-lg: 10px;
  --radius-xl: 12px;
  --radius-2xl: 14px;
  --radius-3xl: 16px;

  /* ─── Shadows ─── */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.04);
  --shadow-active: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-dropdown: 0 4px 16px rgba(0, 0, 0, 0.12);
  --shadow-glow: -2px 0 8px rgba(184, 168, 138, 0.3);

  /* ─── Font ─── */
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
}

/* ─── Global styles ─── */
html, body, #root {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: var(--font-sans);
  background: var(--color-bg-page);
  color: var(--color-text-primary);
  -webkit-font-smoothing: antialiased;
}

/* WHY: Gold focus ring — SG Interface uses gold-primary for all focus indicators */
*:focus-visible {
  outline: 2px solid var(--color-gold-primary);
  outline-offset: 2px;
}

/* WHY: Custom scrollbar — 4px thin, gold-themed to match SG Interface */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: var(--color-gold-subtle); }
::-webkit-scrollbar-thumb { background: var(--color-gold-light); border-radius: var(--radius-xs); }

/* WHY: Tabular numbers ensure financial columns align vertically */
.tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }

/* WHY: Gold-tinted shimmer for skeleton loading — matches SG Interface palette */
@keyframes shimmer {
  0% { background-position: -200px 0; }
  100% { background-position: 200px 0; }
}
.skeleton {
  background: linear-gradient(90deg, var(--color-gold-subtle) 0%, var(--color-gold-hover) 50%, var(--color-gold-subtle) 100%);
  background-size: 400px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* WHY: Screen reader utility — visually hidden, accessible */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}

/* WHY: Respect OS reduced-motion preference for CSS animations */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Verify TypeScript build still passes**

Run: `cd client && npx tsc -b --noEmit`
Expected: Clean pass (CSS changes don't affect TS compilation)

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style: replace CSS tokens with SG Interface design system"
```

---

## Task 2: Update Shared CSS Constants

**Files:**
- Modify: `client/src/config/filterConstants.ts`

- [ ] **Step 1: Replace the 3 shared CSS class constants**

Replace `DRAG_HANDLE_CLASS`:
```
OLD: 'cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-400 opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0'
NEW: 'cursor-grab active:cursor-grabbing p-0.5 text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0'
```

Replace `FILTER_INPUT_CLASS`:
```
OLD: 'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors'
NEW: 'text-sm border border-[var(--color-gold-subtle)] rounded-lg px-3 py-2 bg-[var(--color-bg-card)] focus:ring-2 focus:ring-[var(--color-gold-primary)]/20 focus:border-[var(--color-gold-primary)] outline-none transition-colors'
```

Replace `FILTER_LABEL_CLASS`:
```
OLD: 'text-xs font-medium text-slate-400 uppercase tracking-wider'
NEW: 'text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider'
```

- [ ] **Step 2: Commit**

```bash
git add client/src/config/filterConstants.ts
git commit -m "style: update shared filter constants to SG Interface tokens"
```

---

## Task 3: Retheme Layout Shell

**Files:**
- Modify: `client/src/components/DepartmentLayout.tsx`
- Modify: `client/src/components/WidgetShell.tsx`

- [ ] **Step 1: Update DepartmentLayout.tsx**

Apply these replacements:
- Line 29: `bg-slate-50` → `bg-[var(--color-bg-page)]`
- Line 31: `bg-white border-b border-slate-200/60` → `bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]`
- Line 34: `text-slate-900` → `text-[var(--color-text-primary)]`
- Line 38: `text-slate-400 bg-slate-100` → `text-[var(--color-text-muted)] bg-[var(--color-gold-subtle)]`

- [ ] **Step 2: Update WidgetShell.tsx**

Apply these replacements:
- Line 18: `bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]` → `bg-[var(--color-bg-card)] rounded-[var(--radius-3xl)] shadow-[var(--shadow-card)]` (remove the `border border-slate-200/60` — SG Interface cards are borderless)
- Line 19: `border-b border-slate-100` → `border-b border-[var(--color-gold-subtle)]`
- Line 20: `text-slate-600` → `text-[var(--color-text-muted)]`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/DepartmentLayout.tsx client/src/components/WidgetShell.tsx
git commit -m "style: retheme layout shell to SG Interface"
```

---

## Task 4: Retheme Navigation Tabs

**Files:**
- Modify: `client/src/components/NavTabs.tsx`

- [ ] **Step 1: Update NavTabs.tsx**

Apply these replacements:
- Line 35 (active tab text): `text-slate-900` → `text-white`
- Line 35 (inactive tab text): `text-slate-500 hover:text-slate-700` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]`
- Line 41 (sliding pill indicator): `bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]` → `bg-[var(--color-dark)] rounded-[var(--radius-base)]` (remove border and shadow — dark pill doesn't need them)

- [ ] **Step 2: Commit**

```bash
git add client/src/components/NavTabs.tsx
git commit -m "style: retheme nav tabs with dark active pill"
```

---

## Task 5: Redesign Toolbar

**Files:**
- Rewrite: `client/src/components/TableToolbar.tsx`

This is the only structural change. Replace the labeled pill buttons with an icon-based toolbar matching the Sales Dashboard v1 `ItemsToolbar.tsx` pattern.

- [ ] **Step 1: Rewrite TableToolbar.tsx**

The new toolbar uses:
- 28px round icon buttons (`ToolbarIcon` inner component) with three visual states
- `ExpandableSearch` inner component (28px → 180px animated)
- Inline expanding panels via AnimatePresence (height animation)
- Click-outside handler via `useRef` + `useEffect`
- Right-aligned section with count display, refresh, extend, export icons

Keep the **same props interface** (`TableToolbarProps`) so `ReportTableWidget` doesn't need changes. The toolbar still receives `isFilterOpen`, `onFilterToggle`, etc. — it just renders them differently.

Reference the Sales Dashboard v1 implementation at `/Users/victorproust/Documents/Work/SG Interface/Sales Dashboard v1/client/src/components/right-panel/ItemsToolbar.tsx` for the `ToolbarIcon` and `ExpandableSearch` patterns.

Key differences from Sales Dashboard v1:
- Keep all 6 buttons: filter, columns, sort, refresh, extend, export
- Keep `isExporting` spinner state on export icon
- Keep `isRefreshing` spinner state on refresh icon
- Add `onBulkExtend` icon (CalendarClock icon from Lucide)
- Panel content is rendered by the parent (`ReportTableWidget`) — the toolbar only manages open/close state via existing callbacks

Icon choices (Lucide React):
- Filter: `SlidersHorizontal` (already imported)
- Columns: `Columns3` (already imported)
- Sort: `ArrowUpDown` (already imported)
- Refresh: `RefreshCw` (already imported)
- Extend: `CalendarClock` (already imported)
- Export: `Download` (already imported)
- Search: custom SVG (magnifying glass, matching Sales Dashboard)

The new component structure:

```tsx
// Top-level: sticky bar with ref for click-outside
<div ref={barRef} className="sticky top-0 z-10 bg-[var(--color-bg-card)]">
  {/* Icon bar */}
  <div className="flex items-center gap-2 px-[var(--spacing-3xl)] py-[var(--spacing-base)] border-b border-[var(--color-gold-subtle)]">
    <ExpandableSearch ... />
    <ToolbarIcon panel="filter" badge={activeFilterCount || null} icon={<SlidersHorizontal size={14} />} />
    <ToolbarIcon panel="columns" badge={hiddenColumnCount || null} icon={<Columns3 size={14} />} />
    <ToolbarIcon panel="sort" badge={sortCount || null} icon={<ArrowUpDown size={14} />} />
    <div className="flex-1" />
    {/* Right group */}
    <ToolbarIcon panel={null} onClick={onRefresh} spinning={isRefreshing} icon={<RefreshCw size={14} />} />
    {onBulkExtend && <ToolbarIcon panel={null} onClick={onBulkExtend} icon={<CalendarClock size={14} />} />}
    <ToolbarIcon panel={null} onClick={onExport} spinning={isExporting} icon={<Download size={14} />} />
  </div>
</div>

// ToolbarIcon: 28px round button with three states
function ToolbarIcon({ isOpen, isActive, badge, icon, spinning, onClick }) {
  const cls = isOpen
    ? 'bg-[var(--color-gold-primary)] text-white'
    : isActive
    ? 'border border-[var(--color-gold-primary)] text-[var(--color-gold-primary)]'
    : 'border border-[var(--color-gold-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-gold-primary)] hover:text-[var(--color-text-secondary)]';

  return (
    <button className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ${cls}`}>
      {spinning ? <Loader2 size={14} className="animate-spin" /> : icon}
      {badge && !isOpen && (
        <span className="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--color-gold-primary)] px-0.5 text-[8px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

// ExpandableSearch: 28px collapsed → 180px expanded
function ExpandableSearch({ searchTerm, onSearch }) {
  // Animated width via Framer Motion
  // Gold-subtle border, muted text, gold-primary focus
  // Same debounce pattern as Sales Dashboard v1
}
```

Note: The toolbar no longer renders the panels inline — the panels (FilterBuilder, ColumnManagerPanel, SortPanel) are rendered by `ReportTableWidget` below the toolbar. The toolbar only signals open/close state via callbacks. **Check that ReportTableWidget already handles the AnimatePresence panel rendering** — if the panels are currently rendered inside the toolbar, move them to ReportTableWidget.

- [ ] **Step 2: Verify the toolbar renders with no TS errors**

Run: `cd client && npx tsc -b --noEmit`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/TableToolbar.tsx
git commit -m "style: redesign toolbar to icon-based SG Interface pattern"
```

---

## Task 6: Retheme Data Table

**Files:**
- Modify: `client/src/components/ReportTable.tsx`

- [ ] **Step 1: Update ReportTable.tsx**

Apply these replacements (use the Color Mapping Reference table above):
- Line 58: `bg-slate-50/80` → `bg-[var(--color-gold-hover)]`
- Line 65: `text-slate-500` → `text-[var(--color-text-secondary)]`
- Line 78: `bg-slate-50/30` → remove entirely (no alternating rows in SG Interface)
- Line 87: `bg-blue-50/30` → `bg-[var(--color-gold-hover)]` (expanded row highlight)
- Line 142: `border-b border-slate-100 hover:bg-blue-50/60` → `border-b border-[var(--color-bg-page)] hover:bg-[var(--color-gold-hover)]`
- Line 161: `text-slate-400 group-hover:text-slate-600` → `text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]`
- Line 172: `text-slate-700` → `text-[var(--color-text-primary)]`
- Line 181: `text-slate-700` → `text-[var(--color-text-primary)]`
- Line 183: `text-red-500` → `text-[var(--color-red)]`

**Keep these unchanged** (status row colors):
- Line 25: `bg-red-50 border-l-2 border-l-red-400` — keep
- Line 26: `bg-orange-50 border-l-2 border-l-orange-400` — keep
- Line 27: `bg-amber-50 border-l-2 border-l-amber-400` — keep

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ReportTable.tsx
git commit -m "style: retheme data table to SG Interface"
```

---

## Task 7: Retheme Pagination + Feedback Components

**Files:**
- Modify: `client/src/components/Pagination.tsx`
- Modify: `client/src/components/Toast.tsx`
- Modify: `client/src/components/EmptyState.tsx`
- Modify: `client/src/components/ErrorState.tsx`
- Modify: `client/src/components/LoadingToast.tsx`
- Modify: `client/src/components/TableSkeleton.tsx`

- [ ] **Step 1: Update Pagination.tsx**

- Line 20: `text-slate-500` → `text-[var(--color-text-muted)]`
- Line 27: `text-primary bg-primary/5 hover:bg-primary/10` → `text-[var(--color-text-primary)] border border-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-hover)]`
- Line 27: `disabled:text-slate-300 disabled:bg-transparent` → `disabled:text-[var(--color-text-faint)] disabled:bg-transparent`
- Line 34: same replacements as line 27

- [ ] **Step 2: Update Toast.tsx**

- Line 37: `bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)] border border-slate-200/60` → `bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] shadow-[var(--shadow-dropdown)] border border-[var(--color-gold-subtle)]`
- Line 41: `text-emerald-500` → `text-[var(--color-green)]`
- Line 42: `text-red-500` → `text-[var(--color-red)]`
- Line 43: `text-slate-700` → `text-[var(--color-text-primary)]`
- Line 46: `text-slate-400 hover:text-slate-600` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]`

- [ ] **Step 3: Update EmptyState.tsx**

- Line 31: `text-slate-300` → `text-[var(--color-text-faint)]`
- Line 32: `text-slate-500` → `text-[var(--color-text-secondary)]`
- Line 33: `text-slate-400` → `text-[var(--color-text-muted)]`

- [ ] **Step 4: Update ErrorState.tsx**

- Line 27: `text-red-300` → `text-[var(--color-red)]/50`
- Line 28: `text-red-500` → `text-[var(--color-red)]`
- Line 31: `text-primary` → `text-[var(--color-gold-primary)]`

- [ ] **Step 5: Update LoadingToast.tsx**

- Lines 42-43: `bg-white rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-slate-200/60` → `bg-[var(--color-bg-card)] rounded-[var(--radius-3xl)] shadow-[var(--shadow-card)] border border-[var(--color-gold-subtle)]`
- Lines 46-47: `border-2 border-slate-200 border-t-primary` → `border-2 border-[var(--color-gold-subtle)] border-t-[var(--color-gold-primary)]`
- Line 50: `text-slate-500` → `text-[var(--color-text-secondary)]`

- [ ] **Step 6: Update TableSkeleton.tsx**

Replace the hardcoded `bg-slate-100 rounded` shimmer bars with the `.skeleton` CSS class:
- Lines 26-29: `bg-slate-100 rounded` → `skeleton rounded`
- Line 34: `bg-slate-100 rounded` → `skeleton rounded`

- [ ] **Step 7: Commit**

```bash
git add client/src/components/Pagination.tsx client/src/components/Toast.tsx client/src/components/EmptyState.tsx client/src/components/ErrorState.tsx client/src/components/LoadingToast.tsx client/src/components/TableSkeleton.tsx
git commit -m "style: retheme pagination and feedback components"
```

---

## Task 8: Retheme Filter Components

**Files:**
- Modify: `client/src/components/filter/FilterBuilder.tsx`
- Modify: `client/src/components/filter/FilterConditionRow.tsx`
- Modify: `client/src/components/filter/FilterGroupPanel.tsx`
- Modify: `client/src/components/filter/FilterValueInput.tsx`
- Modify: `client/src/components/filter/WeekPicker.tsx`
- Modify: `client/src/components/filter/WeekPickerDropdown.tsx`

- [ ] **Step 1: Update FilterBuilder.tsx**

- Line 98: `bg-white border-b border-slate-200` → `bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]`
- Line 117: `text-slate-400 bg-slate-100 hover:bg-slate-200` → `text-[var(--color-text-muted)] bg-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-muted)]`
- Line 148: `text-primary hover:text-primary/70` → `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/70`
- Line 152: `text-primary hover:text-primary/70` → `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/70`
- Line 160: `bg-white shadow-lg rounded-lg border border-slate-200` → `bg-[var(--color-bg-card)] shadow-[var(--shadow-dropdown)] rounded-[var(--radius-lg)] border border-[var(--color-gold-subtle)]`
- Line 161: `text-slate-600` → `text-[var(--color-text-secondary)]`

- [ ] **Step 2: Update FilterConditionRow.tsx**

- Lines 64-65: `text-slate-300 hover:text-slate-400` (drag handle) — already handled by `DRAG_HANDLE_CLASS` in filterConstants. Verify this line uses the constant. If hardcoded, replace with `text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]`.
- Line 121: `text-slate-300 hover:text-red-400` → `text-[var(--color-text-faint)] hover:text-[var(--color-red)]`

- [ ] **Step 3: Update FilterGroupPanel.tsx**

- Line 38: `border-l-2 border-primary/20 rounded-r-lg bg-slate-50/50` → `border-l-2 border-[var(--color-gold-primary)]/20 rounded-r-lg bg-[var(--color-gold-hover)]`
- Line 42: `text-slate-400 hover:text-slate-600` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]`
- Line 48: `text-slate-300 hover:text-red-400` → `text-[var(--color-text-faint)] hover:text-[var(--color-red)]`
- Line 62: `text-slate-400 bg-slate-100 hover:bg-slate-200` → `text-[var(--color-text-muted)] bg-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-muted)]`
- Line 85: `border border-dashed border-slate-200` → `border border-dashed border-[var(--color-gold-subtle)]`
- Line 85: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 95: `text-primary hover:text-primary/70` → `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/70`

- [ ] **Step 4: Update FilterValueInput.tsx**

- Lines 67, 87: `text-slate-400` → `text-[var(--color-text-muted)]`
- All `FILTER_INPUT_CLASS` references — already handled by Task 2. No changes needed here.

- [ ] **Step 5: Update WeekPicker.tsx**

- Line 75: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 76: `text-slate-400` (placeholder) → `text-[var(--color-text-muted)]`
- Line 81: `text-slate-400` → `text-[var(--color-text-muted)]`

- [ ] **Step 6: Update WeekPickerDropdown.tsx**

This file has the most color references in the filter group:
- Lines 49-50: `bg-white rounded-xl border border-slate-200 shadow-lg` → `bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] border border-[var(--color-gold-subtle)] shadow-[var(--shadow-dropdown)]`
- Lines 64-65: `bg-primary/10 text-primary` → `bg-[var(--color-gold-primary)]/10 text-[var(--color-gold-primary)]`
- Line 65: `bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary` → `bg-[var(--color-gold-subtle)] text-[var(--color-text-secondary)] hover:bg-[var(--color-gold-primary)]/10 hover:text-[var(--color-gold-primary)]`
- Line 76: `text-slate-400 hover:text-slate-700 hover:bg-slate-50` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)]`
- Line 79: `text-slate-800` → `text-[var(--color-text-primary)]`
- Line 83: `text-slate-400 hover:text-slate-700 hover:bg-slate-50` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)]`
- Line 91: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 112: `bg-primary/10` → `bg-[var(--color-gold-primary)]/10`, `bg-primary/5` → `bg-[var(--color-gold-primary)]/5`
- Line 126: `bg-primary text-white rounded-l-full / rounded-r-full` → `bg-[var(--color-dark)] text-white rounded-l-full / rounded-r-full`
- Line 128: `bg-primary/15 text-primary` → `bg-[var(--color-gold-primary)]/15 text-[var(--color-gold-primary)]`
- Line 130: `text-slate-600` → `text-[var(--color-text-secondary)]`
- Line 131: `text-slate-300` → `text-[var(--color-text-faint)]`
- Line 133: `ring-1 ring-primary/30 rounded-full` → `ring-1 ring-[var(--color-gold-primary)]/30 rounded-full`

- [ ] **Step 7: Commit**

```bash
git add client/src/components/filter/
git commit -m "style: retheme filter components to SG Interface"
```

---

## Task 9: Retheme Column + Sort Components

**Files:**
- Modify: `client/src/components/columns/ColumnManagerPanel.tsx`
- Modify: `client/src/components/columns/ColumnRow.tsx`
- Modify: `client/src/components/columns/ColumnDragOverlay.tsx`
- Modify: `client/src/components/sort/SortPanel.tsx`
- Modify: `client/src/components/sort/SortRuleRow.tsx`

- [ ] **Step 1: Update ColumnManagerPanel.tsx**

- Line 67: `bg-white border-b border-slate-200` → `bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]`
- Line 70: `text-slate-400` → `text-[var(--color-text-muted)]`
- Lines 76-78: `border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-slate-400` → `border border-[var(--color-gold-subtle)] rounded-lg focus:ring-2 focus:ring-[var(--color-gold-primary)]/20 focus:border-[var(--color-gold-primary)]/40 placeholder:text-[var(--color-text-muted)]`
- Line 112: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 117: `border-t border-slate-100` → `border-t border-[var(--color-gold-subtle)]`
- Line 120: `text-slate-500 hover:text-slate-700` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`
- Line 126: `text-slate-500 hover:text-slate-700` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`

- [ ] **Step 2: Update ColumnRow.tsx**

- Line 45: `bg-primary` (visible toggle) → `bg-[var(--color-gold-primary)]`
- Line 45: `bg-slate-200` (hidden toggle) → `bg-[var(--color-gold-subtle)]`
- Line 56: `text-slate-700` (visible label) → `text-[var(--color-text-primary)]`
- Line 56: `text-slate-400` (hidden label) → `text-[var(--color-text-muted)]`
- Line 66: `text-slate-300 hover:text-slate-400` (drag handle) — verify uses `DRAG_HANDLE_CLASS`. If hardcoded, replace with `text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]`

- [ ] **Step 3: Update ColumnDragOverlay.tsx**

- Line 15: `bg-white shadow-lg rounded-lg border border-slate-200` → `bg-[var(--color-bg-card)] shadow-[var(--shadow-dropdown)] rounded-[var(--radius-lg)] border border-[var(--color-gold-subtle)]`
- Line 15: `text-slate-600` → `text-[var(--color-text-secondary)]`

- [ ] **Step 4: Update SortPanel.tsx**

- Line 47: `bg-white border-b border-slate-200` → `bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]`
- Line 66: `text-primary hover:text-primary/70 disabled:opacity-50` → `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/70 disabled:opacity-50`
- Line 73: `border-t border-slate-100` → `border-t border-[var(--color-gold-subtle)]`
- Line 76: `text-slate-500 hover:text-slate-700` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]`

- [ ] **Step 5: Update SortRuleRow.tsx**

- Lines 66-67: `border border-slate-200 hover:bg-slate-50 text-slate-600` → `border border-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-hover)] text-[var(--color-text-secondary)]`
- Line 76: `text-slate-300 hover:text-red-400` → `text-[var(--color-text-faint)] hover:text-[var(--color-red)]`

- [ ] **Step 6: Commit**

```bash
git add client/src/components/columns/ client/src/components/sort/
git commit -m "style: retheme column and sort components to SG Interface"
```

---

## Task 10: Retheme Modals

**Files:**
- Modify: `client/src/components/modals/Modal.tsx`
- Modify: `client/src/components/modals/ExtendExpiryModal.tsx`
- Modify: `client/src/components/modals/BulkExtendModal.tsx`
- Modify: `client/src/components/modals/BulkExtendRowTable.tsx`

- [ ] **Step 1: Update Modal.tsx**

- Line 71: `bg-white rounded-2xl shadow-xl` → `bg-[var(--color-bg-card)] rounded-[var(--radius-3xl)] shadow-[var(--shadow-dropdown)]`
- Line 78: `border-b border-slate-100` → `border-b border-[var(--color-gold-subtle)]`
- Line 79: `text-slate-900` → `text-[var(--color-text-primary)]`
- Line 83: `text-slate-400 hover:text-slate-600 hover:bg-slate-100` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-gold-hover)]`

- [ ] **Step 2: Update ExtendExpiryModal.tsx**

- Line 109: `text-green-600` → `text-[var(--color-green)]`
- Line 110: `text-slate-500` → `text-[var(--color-text-secondary)]`
- Line 116: `text-slate-700` → `text-[var(--color-text-primary)]`
- Line 124: `hover:text-slate-800 hover:bg-slate-100 text-slate-600` → `hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] text-[var(--color-text-secondary)]`
- Line 130: `text-white bg-primary hover:bg-primary/90` → `text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)]`
- Line 141: `text-slate-500` → `text-[var(--color-text-secondary)]`
- Line 142: `text-slate-900` → `text-[var(--color-text-primary)]`
- Line 154: `text-slate-900` → `text-[var(--color-text-primary)]`
- Line 169: `border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary` → `border border-[var(--color-gold-subtle)] rounded-lg focus:ring-2 focus:ring-[var(--color-gold-primary)]/30 focus:border-[var(--color-gold-primary)]`
- Line 182: `text-red-700 bg-red-50 border border-red-200` → `text-[var(--color-red)] bg-[var(--color-red)]/5 border border-[var(--color-red)]/20`
- Line 192: `text-slate-600 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-50` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)] disabled:opacity-50`
- Line 199: `text-white bg-primary hover:bg-primary/90 disabled:opacity-50` → `text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)] disabled:opacity-50`

- [ ] **Step 3: Update BulkExtendModal.tsx**

- Line 158: `text-slate-900` → `text-[var(--color-text-primary)]`
- Line 162: `text-red-700 bg-red-50` → `text-[var(--color-red)] bg-[var(--color-red)]/5`
- Line 171: `text-white bg-primary hover:bg-primary/90` → `text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)]`
- Line 190: `border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-primary` → `border border-[var(--color-gold-subtle)] rounded-lg focus:ring-2 focus:ring-[var(--color-gold-primary)]/30 focus:border-[var(--color-gold-primary)]`
- Line 196: `text-slate-600` → `text-[var(--color-text-secondary)]`
- Line 202: `border-slate-300` → `border-[var(--color-gold-muted)]`
- Line 204: `text-slate-600` → `text-[var(--color-text-secondary)]`
- Line 220: `text-slate-700 bg-blue-50 border border-blue-200` → `text-[var(--color-text-primary)] bg-[var(--color-blue)]/10 border border-[var(--color-blue)]/20`
- Line 230: `text-slate-600 hover:text-slate-800 hover:bg-slate-100` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)]`
- Line 238: `text-slate-600 hover:text-slate-800 hover:bg-slate-100` → `text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-gold-hover)]`
- Line 244: `text-white bg-primary hover:bg-primary/90` → `text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)]`
- Line 254: `text-white bg-primary hover:bg-primary/90 disabled:opacity-50` → `text-white bg-[var(--color-dark)] hover:bg-[var(--color-dark-hover)] disabled:opacity-50`

- [ ] **Step 4: Update BulkExtendRowTable.tsx**

- Line 16: `bg-red-50` → `bg-[var(--color-red)]/5` (status — keep for row highlight)
- Line 18: `bg-orange-50` → `bg-[var(--color-yellow)]/10`
- Line 19: `bg-amber-50` → `bg-[var(--color-yellow)]/5`
- Line 44: `bg-slate-50 sticky top-0` → `bg-[var(--color-gold-hover)] sticky top-0`
- Line 45: `text-slate-500` → `text-[var(--color-text-secondary)]`
- Line 56: `hover:text-slate-700` → `hover:text-[var(--color-text-primary)]`
- Line 78: `border-b border-slate-100` → `border-b border-[var(--color-gold-subtle)]`
- Line 92: `font-medium text-primary` → `font-medium text-[var(--color-gold-primary)]`

- [ ] **Step 5: Commit**

```bash
git add client/src/components/modals/
git commit -m "style: retheme modals to SG Interface"
```

---

## Task 11: Retheme Cell + Detail Components

**Files:**
- Modify: `client/src/components/cells/CopyableCell.tsx`
- Modify: `client/src/components/cells/ExpiryDateCell.tsx`
- Modify: `client/src/components/details/BbdDetailPanel.tsx`

- [ ] **Step 1: Update CopyableCell.tsx**

- Line 55: `hover:text-primary` → `hover:text-[var(--color-gold-primary)]`
- Line 61: `text-slate-300 opacity-0 group-hover/copy:opacity-100` → `text-[var(--color-text-faint)] opacity-0 group-hover/copy:opacity-100`

- [ ] **Step 2: Update ExpiryDateCell.tsx**

- Line 27: `text-primary hover:text-primary/80` → `text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/80`

- [ ] **Step 3: Update BbdDetailPanel.tsx**

- Line 22: `bg-slate-50/50 border-l-2 border-l-primary/20 border-b border-slate-100` → `bg-[var(--color-gold-hover)] border-l-2 border-l-[var(--color-gold-primary)]/20 border-b border-[var(--color-gold-subtle)]`
- Line 25: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 31: `text-red-500` → `text-[var(--color-red)]`
- Line 35: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 39: `text-slate-600` → `text-[var(--color-text-secondary)]`
- Lines 42-46: `text-slate-400` → `text-[var(--color-text-muted)]`
- Line 54: `hover:bg-slate-100/50` → `hover:bg-[var(--color-gold-hover)]`

- [ ] **Step 4: Commit**

```bash
git add client/src/components/cells/ client/src/components/details/
git commit -m "style: retheme cell and detail components to SG Interface"
```

---

## Task 12: Verification

- [ ] **Step 1: Run TypeScript build**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
```

Expected: Both pass cleanly.

- [ ] **Step 2: Run automated color audit**

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports"

# Should return 0 results (no hardcoded hex outside var(--))
grep -rn '#[0-9a-fA-F]\{6\}' client/src/ --include='*.tsx' --include='*.ts' | grep -v 'var(--' | grep -v node_modules

# Should return 0 results (no old palette classes)
grep -rn 'slate-\|text-primary\b\|bg-primary\b' client/src/ --include='*.tsx' --include='*.ts' | grep -v 'color-text-primary' | grep -v node_modules
```

If any results appear, fix them inline and re-run.

- [ ] **Step 3: Visual verification in browser**

Start the dev servers (`npm run dev` in both `server/` and `client/`). Open `http://localhost:5173` and verify:

1. Page background is warm cream (`#f5f1eb`)
2. Cards have no visible border — shadow only
3. Active nav tab is dark (`#2c2a26`) with white text
4. Toolbar uses round icon buttons, not labeled pills
5. Focus rings are gold (`#b8a88a`)
6. Scrollbar is gold-tinted (4px thin)
7. Table row hover is warm gold-hover, not blue
8. Status rows (expired/expiring) still show red/orange/amber
9. Skeleton loading uses gold shimmer
10. Filter/Column/Sort panels open with gold-themed inputs

Use preview tools to take screenshots and verify.

- [ ] **Step 4: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address visual verification issues"
```
