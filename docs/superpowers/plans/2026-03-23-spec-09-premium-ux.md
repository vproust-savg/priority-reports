# Spec 09 — Premium UX: Animations & Micro-interactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Framer Motion animations and micro-interactions to every surface of the dashboard: nav pill slider, page transitions, staggered table rows, shimmer skeleton, filter panel springs, button feedback, toast upgrades, hover effects, loading bar, and empty/error states.

**Architecture:** Frontend-only changes. Install Framer Motion, create shared animation constants and a reduced-motion hook, then progressively enhance each component. Each task produces a working, deployable state. No server changes needed.

**Tech Stack:** Framer Motion, CSS @keyframes, React 19, Tailwind CSS v4, TypeScript strict mode

**Spec:** `specs/spec-09-premium-ux.md`

**Mandatory code rules:** Read `CLAUDE.md` before writing any code. Every new file needs an intent block (`FILE`, `PURPOSE`, `USED BY`, `EXPORTS`). WHY comments on non-obvious decisions. Max 200 lines per file. Apple/Stripe aesthetic — use `--color-primary` (#007AFF), `rounded-2xl`, system fonts. Import order: React/libraries → hooks → components → utils → types.

**Deploy & verify workflow (run after EVERY task):**
```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit          # Must pass — TS errors kill Railway build
cd ../server && npx tsc --noEmit          # Must pass — verify no side effects
cd ../client && npm test                   # ColumnRow.test.tsx must pass
git add <changed-files>                    # Stage ONLY the files you changed
git commit -m "<message>"
git push origin main                       # Railway auto-deploys
```
After push, wait ~2 minutes for Railway deploy, then verify the feature on the deployed page using Chrome browser tools.

---

## File Structure

### New Files (7)

| File | Responsibility |
|------|---------------|
| `client/src/config/animationConstants.ts` | Named spring presets, reusable animation variants, reduced-motion variants |
| `client/src/hooks/useReducedMotion.ts` | Hook that returns `true` when user prefers reduced motion |
| `client/src/components/NavTabs.tsx` | Animated nav tabs with sliding pill indicator |
| `client/src/components/TableSkeleton.tsx` | Stripe-style shimmer skeleton loader for tables |
| `client/src/components/LoadingBar.tsx` | Thin gradient progress bar for two-phase loading |
| `client/src/components/EmptyState.tsx` | Animated "No results found" state |
| `client/src/components/ErrorState.tsx` | Animated error state with retry button |

### Modified Files (10)

| File | Current Lines | What Changes |
|------|--------------|-------------|
| `client/package.json` | 44 | Add `framer-motion` dependency |
| `client/src/index.css` | 31 | Add shimmer + loading-pulse keyframes, remove dead toast-slide-up |
| `client/src/components/Layout.tsx` | 59 | Import NavTabs, AnimatePresence around Outlet |
| `client/src/components/WidgetShell.tsx` | 27 | `motion.div` with whileHover lift |
| `client/src/components/widgets/ReportTableWidget.tsx` | 223 | Use new components, AnimatePresence on panels+toast, net line reduction |
| `client/src/components/ReportTable.tsx` | 63 | `motion.tr` stagger, enhanced hover |
| `client/src/components/TableToolbar.tsx` | 79 | `motion.button` whileTap on all buttons |
| `client/src/components/Pagination.tsx` | 41 | `motion.button` whileTap on both buttons |
| `client/src/components/filter/FilterBuilder.tsx` | 157 | AnimatePresence on conditions, `motion.button` on add buttons |
| `client/src/components/Toast.tsx` | 48 | Framer Motion spring entrance/exit, animated checkmark SVG |
| `client/src/components/columns/ColumnRow.tsx` | 72 | `motion.div` on toggle thumb |

---

### Task 1: Foundation — Install Framer Motion + Animation Infrastructure

**Files:**
- Modify: `client/package.json`
- Create: `client/src/config/animationConstants.ts`
- Create: `client/src/hooks/useReducedMotion.ts`
- Modify: `client/src/index.css`

- [ ] **Step 1: Install framer-motion**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports/client
npm install framer-motion
```

Expected: `framer-motion` added to `dependencies` in `package.json`, `package-lock.json` updated.

- [ ] **Step 2: Create animation constants**

Create `client/src/config/animationConstants.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/animationConstants.ts
// PURPOSE: Shared animation spring presets and reusable variants.
//          Every animated component imports from here — never
//          inline spring values.
// USED BY: All animated components
// EXPORTS: SPRING_*, EASE_*, FADE_*, REDUCED_*
// ═══════════════════════════════════════════════════════════════

// --- Named spring presets ---
// WHY: Centralized configs prevent drift between components.
// Each preset serves a specific interaction category.
export const SPRING_SNAPPY = { type: 'spring' as const, stiffness: 500, damping: 35 };
export const SPRING_GENTLE = { type: 'spring' as const, stiffness: 300, damping: 25 };
export const SPRING_BOUNCY = { type: 'spring' as const, stiffness: 400, damping: 15 };
export const SPRING_STIFF = { type: 'spring' as const, stiffness: 600, damping: 20 };
export const EASE_FADE = { duration: 0.2, ease: 'easeOut' as const };

// --- Reusable variant sets ---
export const FADE_SLIDE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

// --- Reduced motion versions — opacity only, no transforms ---
// WHY: REDUCED_FADE and REDUCED_TRANSITION are separate objects because
// Framer Motion requires `transition` as its own prop on motion elements.
// Spreading {...REDUCED_FADE} gives initial/animate/exit, then you pass
// transition={REDUCED_TRANSITION} separately.
export const REDUCED_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const REDUCED_TRANSITION = { duration: 0.15 };
```

- [ ] **Step 3: Create useReducedMotion hook**

Create `client/src/hooks/useReducedMotion.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReducedMotion.ts
// PURPOSE: Returns true when the user has enabled "Reduce motion"
//          in their OS settings. Every animated component checks
//          this to disable transforms and springs.
// USED BY: All animated components
// EXPORTS: useReducedMotion
// ═══════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
```

- [ ] **Step 4: Add CSS keyframes to index.css**

Add these keyframes to `client/src/index.css` after the existing `@keyframes toast-slide-up` block (after line 30):

```css
/* WHY: Stripe-style shimmer sweep for skeleton loading placeholders.
   Pure CSS — no JS animation loop needed. */
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* WHY: Indeterminate pulse for the loading bar during Phase 1 (quick query).
   Width oscillates to show "loading in progress" without a specific percentage. */
@keyframes loading-pulse {
  0%, 100% { width: 20%; }
  50%      { width: 60%; }
}
```

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/package.json client/package-lock.json client/src/config/animationConstants.ts client/src/hooks/useReducedMotion.ts client/src/index.css
git commit -m "feat: add Framer Motion + animation infrastructure

Install framer-motion, create shared spring presets in
animationConstants.ts, add useReducedMotion hook, and CSS
keyframes for shimmer and loading-pulse.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

---

### Task 2: Premium Skeleton Loading

**Files:**
- Create: `client/src/components/TableSkeleton.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx:176-187`

- [ ] **Step 1: Create TableSkeleton component**

Create `client/src/components/TableSkeleton.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableSkeleton.tsx
// PURPOSE: Stripe-style shimmer skeleton for table loading state.
//          Renders placeholder bars that match the table layout
//          with a diagonal light sweep animation.
// USED BY: ReportTableWidget (replaces inline animate-pulse skeleton)
// EXPORTS: TableSkeleton
// ═══════════════════════════════════════════════════════════════

const SHIMMER_STYLE = {
  backgroundImage:
    'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.5) 50%, transparent 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
};

// WHY: Varying widths create visual interest and hint at different
// column widths the real table will have.
const ROW_WIDTHS = ['w-full', 'w-5/6', 'w-4/5', 'w-full', 'w-5/6', 'w-11/12', 'w-4/5', 'w-full'];

export default function TableSkeleton() {
  return (
    <div className="px-5 py-6 space-y-4">
      {/* Header row placeholder */}
      <div className="flex gap-4">
        <div className="h-3 bg-slate-100 rounded w-1/6" style={SHIMMER_STYLE} />
        <div className="h-3 bg-slate-100 rounded w-1/5" style={SHIMMER_STYLE} />
        <div className="h-3 bg-slate-100 rounded w-1/4" style={SHIMMER_STYLE} />
        <div className="h-3 bg-slate-100 rounded w-1/6" style={SHIMMER_STYLE} />
      </div>
      {/* Body row placeholders */}
      {ROW_WIDTHS.map((w, i) => (
        <div key={i} className="flex gap-4">
          <div className={`h-4 bg-slate-100 rounded ${w}`} style={SHIMMER_STYLE} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Replace inline skeleton in ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`, add import at the top (after existing component imports):

```typescript
import TableSkeleton from '../TableSkeleton';
```

Then replace lines 176-187 (the `isLoading` block):

**Replace this:**
```tsx
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
```

**With this:**
```tsx
      {isLoading && <TableSkeleton />}
```

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/TableSkeleton.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: premium shimmer skeleton loading

Replace basic animate-pulse skeleton with Stripe-style shimmer
sweep. Dedicated TableSkeleton component with varying-width bars.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Verify on deployed page**

Wait ~2 minutes for Railway deploy. Open the deployed page in Chrome. Hard refresh (Cmd+Shift+R) to see the skeleton during initial load. Verify the shimmer gradient sweeps across the placeholder bars.

---

### Task 3: Animated Nav Tabs

**Files:**
- Create: `client/src/components/NavTabs.tsx`
- Modify: `client/src/components/Layout.tsx`

- [ ] **Step 1: Create NavTabs component**

Create `client/src/components/NavTabs.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NavTabs.tsx
// PURPOSE: Animated navigation tabs with a sliding pill indicator.
//          The pill glides between tabs using Framer Motion layout
//          animation (layoutId), providing visual continuity.
// USED BY: Layout.tsx
// EXPORTS: NavTabs (default)
// ═══════════════════════════════════════════════════════════════

import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_SNAPPY } from '../config/animationConstants';
import type { PageConfig } from '@shared/types';

interface NavTabsProps {
  pages: PageConfig[];
  currentPath: string;
}

export default function NavTabs({ pages, currentPath }: NavTabsProps) {
  const reduced = useReducedMotion();

  return (
    <nav className="flex gap-1 -mb-px">
      {pages.map((page) => {
        const isActive = currentPath === page.path;
        return (
          <Link
            key={page.id}
            to={page.path}
            className={`relative pb-3 px-3 text-sm font-medium transition-colors duration-150 ${
              isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="nav-indicator"
                className="absolute inset-0 bottom-1 bg-primary/10 rounded-lg"
                transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
                // WHY: layout={false} when reduced motion prevents the
                // sliding animation — pill just appears at the new position.
                layout={!reduced}
              />
            )}
            <span className="relative z-10">{page.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Update Layout.tsx to use NavTabs**

In `client/src/components/Layout.tsx`:

Add import at top (after existing imports):
```typescript
import NavTabs from './NavTabs';
```

Replace lines 32-49 (the entire `<nav>` block):

**Replace this:**
```tsx
          {/* Navigation tabs — auto-generated from pages config */}
          <nav className="flex gap-6 -mb-px">
            {pages.map((page) => {
              const isActive = location.pathname === page.path;
              return (
                <Link
                  key={page.id}
                  to={page.path}
                  className={`pb-3 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {page.name}
                </Link>
              );
            })}
          </nav>
```

**With this:**
```tsx
          {/* Navigation tabs — auto-generated from pages config */}
          <NavTabs pages={pages} currentPath={location.pathname} />
```

Also remove the `Link` import from line 9 since `Layout.tsx` no longer uses `Link` directly (NavTabs handles it). The import line should become:
```typescript
import { useLocation, Outlet } from 'react-router-dom';
```

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/NavTabs.tsx client/src/components/Layout.tsx
git commit -m "feat: animated nav tabs with sliding pill indicator

Extract nav into NavTabs component with Framer Motion layoutId
pill that slides between tabs. Respects prefers-reduced-motion.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Verify on deployed page**

Currently there is only one page (Receiving Log), so the pill won't slide. Verify the active tab has a blue pill background behind it. If you add a second page to test, verify the pill slides between tabs.

---

### Task 4: Page Content Transitions

**Files:**
- Modify: `client/src/components/Layout.tsx`

- [ ] **Step 1: Add AnimatePresence around Outlet**

In `client/src/components/Layout.tsx`, add new imports at the top:

```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_SLIDE_UP, EASE_FADE, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';
```

Add `const reduced = useReducedMotion();` inside the `Layout` function body (after `const location = useLocation();`).

Replace the `<main>` section (the part with `<Outlet />`):

**Replace this:**
```tsx
      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
```

**With this:**
```tsx
      {/* Page content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            {...(reduced ? REDUCED_FADE : FADE_SLIDE_UP)}
            transition={reduced ? REDUCED_TRANSITION : EASE_FADE}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
```

- [ ] **Step 2: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/Layout.tsx
git commit -m "feat: page content transitions with AnimatePresence

Wrap Outlet in AnimatePresence with fade+slide animation.
Pages cross-fade with subtle vertical shift on route change.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 3: Verify on deployed page**

Navigate between pages (if multiple). Content should fade out upward, then new content fades in from below. With one page, verify initial page fade-in on load.

---

### Task 5: Staggered Table Row Entrance

**Files:**
- Modify: `client/src/components/ReportTable.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add motion.tr to ReportTable**

In `client/src/components/ReportTable.tsx`:

Add import at top:
```typescript
import { motion } from 'framer-motion';
```

Add `disableAnimation` to the props interface:
```typescript
interface ReportTableProps {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  disableAnimation?: boolean;
}
```

Update the function signature:
```typescript
export default function ReportTable({ columns, data, disableAnimation }: ReportTableProps) {
```

Replace the `<tr>` in the tbody (line 38) — change the entire `<tr>` element:

**Replace this:**
```tsx
            <tr
              key={rowIdx}
              className={`border-b border-slate-100 hover:bg-blue-50/40 transition-colors duration-150 ${
                rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
              }`}
            >
```

**With this:**
```tsx
            <motion.tr
              key={rowIdx}
              initial={disableAnimation ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={disableAnimation ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ delay: Math.min(rowIdx, 10) * 0.03, duration: 0.15 }}
              className={`border-b border-slate-100 hover:bg-blue-50/60 transition-colors duration-150 ${
                rowIdx % 2 === 1 ? 'bg-slate-50/30' : ''
              }`}
            >
```

Note: also changed `hover:bg-blue-50/40` to `hover:bg-blue-50/60` for enhanced hover highlight (spec 3.8).

Change the closing `</tr>` to `</motion.tr>`.

- [ ] **Step 2: Pass disableAnimation from ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add import at top:
```typescript
import { useReducedMotion } from '../../hooks/useReducedMotion';
```

Add `const reduced = useReducedMotion();` inside the component function (after the `useExport` hook call, around line 75).

Update the `<ReportTable>` render (line 207) to pass the prop:
```tsx
          <ReportTable columns={visibleColumns.length > 0 ? visibleColumns : activeData.columns} data={displayData} disableAnimation={reduced} />
```

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/ReportTable.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: staggered table row entrance animation

Rows cascade in with 30ms stagger on data load. Max 10 rows
staggered, rest appear together. Enhanced hover highlight.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Verify on deployed page**

Refresh the page. Table rows should cascade in from top to bottom with a waterfall effect. Apply a filter to change the data — rows should re-animate.

---

### Task 6: Smooth Filter Panel Expand/Collapse

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`
- Modify: `client/src/components/filter/FilterBuilder.tsx`

- [ ] **Step 1: Add AnimatePresence to filter/column panels in ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add imports at top:
```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { SPRING_SNAPPY, REDUCED_FADE, REDUCED_TRANSITION } from '../../config/animationConstants';
```

(Note: `useReducedMotion` was already imported in Task 5. `const reduced` already exists.)

Replace the filter panel conditional render (lines 124-132):

**Replace this:**
```tsx
      {isFilterOpen && (
        <FilterBuilder
          filterGroup={filterGroup}
          onChange={handleFilterChange}
          columns={filterColumns}
          filterOptions={filtersQuery.data?.filters}
          filterOptionsLoading={filtersQuery.isLoading}
        />
      )}
```

**With this:**
```tsx
      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            key="filter-panel"
            initial={reduced ? REDUCED_FADE.initial : { height: 0, opacity: 0 }}
            animate={reduced ? REDUCED_FADE.animate : { height: 'auto', opacity: 1 }}
            exit={reduced ? REDUCED_FADE.exit : { height: 0, opacity: 0 }}
            transition={reduced ? REDUCED_TRANSITION : { height: SPRING_SNAPPY, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
          >
            <FilterBuilder
              filterGroup={filterGroup}
              onChange={handleFilterChange}
              columns={filterColumns}
              filterOptions={filtersQuery.data?.filters}
              filterOptionsLoading={filtersQuery.isLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>
```

Replace the column panel conditional render (lines 134-142):

**Replace this:**
```tsx
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

**With this:**
```tsx
      <AnimatePresence>
        {isColumnPanelOpen && (
          <motion.div
            key="column-panel"
            initial={reduced ? REDUCED_FADE.initial : { height: 0, opacity: 0 }}
            animate={reduced ? REDUCED_FADE.animate : { height: 'auto', opacity: 1 }}
            exit={reduced ? REDUCED_FADE.exit : { height: 0, opacity: 0 }}
            transition={reduced ? REDUCED_TRANSITION : { height: SPRING_SNAPPY, opacity: { duration: 0.15 } }}
            style={{ overflow: 'hidden' }}
          >
            <ColumnManagerPanel
              managedColumns={managedColumns}
              onToggle={toggleColumn}
              onReorder={reorderColumns}
              onShowAll={showAll}
              onHideAll={hideAll}
            />
          </motion.div>
        )}
      </AnimatePresence>
```

- [ ] **Step 2: Add condition add/remove animations in FilterBuilder**

In `client/src/components/filter/FilterBuilder.tsx`:

Add imports at top:
```typescript
import { AnimatePresence, motion } from 'framer-motion';
import { SPRING_STIFF } from '../../config/animationConstants';
```

In the conditions map (lines 100-121), wrap each condition's `<div key={condition.id}>` in AnimatePresence and change `<div>` to `<motion.div>`:

**Replace this block (lines 99-121):**
```tsx
          <SortableContext items={filterGroup.conditions.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {filterGroup.conditions.map((condition, idx) => (
              <div key={condition.id}>
                {idx === 0 ? (
```

**With this:**
```tsx
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
```

And change the closing `</div>` (that corresponds to the condition wrapper, before `</SortableContext>`) to `</motion.div>`, and add `</AnimatePresence>` after the map's closing `)}`:

```tsx
              </motion.div>
            ))}
            </AnimatePresence>
          </SortableContext>
```

**CRITICAL:** The `AnimatePresence` and `motion.div` wrap the outer container div, NOT the sortable elements that dnd-kit controls. The `FilterConditionRow` inside still uses `useSortable` with its own transforms — no conflict.

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/widgets/ReportTableWidget.tsx client/src/components/filter/FilterBuilder.tsx
git commit -m "feat: smooth filter panel expand/collapse animation

Filter and column panels spring open/close with AnimatePresence.
Filter conditions animate in/out when added/removed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Verify on deployed page**

Click the Filter button — panel should spring open with height animation. Click again — should spring closed. Add a filter condition — it should slide in. Remove it — should slide out. Same for Columns panel.

---

### Task 7: Button & Control Micro-interactions

**Files:**
- Modify: `client/src/components/TableToolbar.tsx`
- Modify: `client/src/components/Pagination.tsx`
- Modify: `client/src/components/filter/FilterBuilder.tsx`
- Modify: `client/src/components/columns/ColumnRow.tsx`

- [ ] **Step 1: Update TableToolbar with motion.button**

In `client/src/components/TableToolbar.tsx`:

Add import at top:
```typescript
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_STIFF } from '../config/animationConstants';
```

Add `const reduced = useReducedMotion();` inside the function (after destructuring props).

Add `const tapAnimation = reduced ? undefined : { scale: 0.97 };` after the reduced motion check.

Change all three `<button` tags to `<motion.button` and add `whileTap={tapAnimation} transition={SPRING_STIFF}`. Change all three `</button>` to `</motion.button>`.

There are 3 buttons: Filter (line 37), Columns (line 51), Export (line 65). Each one:
- `<button` → `<motion.button`
- Add `whileTap={tapAnimation}` and `transition={SPRING_STIFF}` as props
- `</button>` → `</motion.button>`

- [ ] **Step 2: Update Pagination with motion.button**

In `client/src/components/Pagination.tsx`:

Add import at top:
```typescript
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_STIFF } from '../config/animationConstants';
```

Add inside the function:
```typescript
  const reduced = useReducedMotion();
  const tapAnimation = reduced ? undefined : { scale: 0.97 };
```

Change both `<button` to `<motion.button` and both `</button>` to `</motion.button>`. Add `whileTap={tapAnimation} transition={SPRING_STIFF}` to both.

- [ ] **Step 3: Update FilterBuilder add buttons**

In `client/src/components/filter/FilterBuilder.tsx` (already has `motion` imported from Task 6):

Change the two add buttons at lines 137-145:

**Replace:**
```tsx
          <button onClick={addCondition}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
            + Add condition
          </button>
          <button onClick={addGroup}
            className="text-xs font-medium text-primary hover:text-primary/70 transition-colors">
            + Add group
          </button>
```

**With:**
```tsx
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
```

(`SPRING_STIFF` was already imported in Task 6.)

- [ ] **Step 4: Update ColumnRow toggle thumb**

In `client/src/components/columns/ColumnRow.tsx`:

Add import at top:
```typescript
import { motion } from 'framer-motion';
import { SPRING_SNAPPY } from '../../config/animationConstants';
```

Change the toggle thumb div (line 47-49):

**Replace:**
```tsx
        <div
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${
            column.visible ? 'translate-x-[15px]' : 'translate-x-[3px]'
          }`}
        />
```

**With:**
```tsx
        <motion.div
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm"
          animate={{ x: column.visible ? 15 : 3 }}
          transition={SPRING_SNAPPY}
        />
```

Note: Remove `transition-transform` and the conditional `translate-x-*` classes — Framer Motion now handles the slide.

- [ ] **Step 5: Verify tests pass**

Run `cd client && npm test`. The `ColumnRow.test.tsx` should still pass because:
- It queries by `role="button"` which targets the `<button>`, not the thumb `<motion.div>`
- Framer Motion renders `<motion.div>` as a regular `<div>` in jsdom

If the test fails with a Framer Motion error, add this mock at the top of `ColumnRow.test.tsx`:
```typescript
vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
}));
```

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/TableToolbar.tsx client/src/components/Pagination.tsx client/src/components/filter/FilterBuilder.tsx client/src/components/columns/ColumnRow.tsx
git commit -m "feat: button micro-interactions and spring toggle

All buttons scale down on press (whileTap). Column toggle thumb
slides with spring physics instead of CSS transition.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 7: Verify on deployed page**

Click any button (Filter, Columns, Export, Previous, Next). Each should scale down slightly on press and spring back. Open the column manager — toggle switches should slide smoothly with spring physics.

---

### Task 8: Enhanced Card Hover

**Files:**
- Modify: `client/src/components/WidgetShell.tsx`

- [ ] **Step 1: Add motion.div with whileHover**

In `client/src/components/WidgetShell.tsx`:

Add imports:
```typescript
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_GENTLE } from '../config/animationConstants';
```

Add inside the function:
```typescript
  const reduced = useReducedMotion();
```

Change the outer `<div>` to `<motion.div>` and update its className and props:

**Replace the entire return:**
```tsx
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      </div>
      <div className="p-0">
        {children}
      </div>
    </div>
  );
```

**With:**
```tsx
  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      whileHover={reduced ? undefined : { y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      transition={SPRING_GENTLE}
    >
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      </div>
      <div className="p-0">
        {children}
      </div>
    </motion.div>
  );
```

Note: Removed `hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200` from className — Framer Motion handles this now.

- [ ] **Step 2: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/WidgetShell.tsx
git commit -m "feat: card hover lift effect with spring animation

Widget cards lift 2px with deeper shadow on hover using Framer
Motion spring. Respects reduced motion preference.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 3: Verify on deployed page**

Hover over the widget card. It should lift slightly (2px up) with a deeper shadow. The lift should feel springy, not linear.

---

### Task 9: Phase Loading Progress Bar

**Files:**
- Create: `client/src/components/LoadingBar.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Create LoadingBar component**

Create `client/src/components/LoadingBar.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/LoadingBar.tsx
// PURPOSE: Thin gradient progress bar for two-phase data loading.
//          Shows indeterminate pulse during Phase 1 (quick query),
//          fills to 100% during Phase 2 (base dataset).
// USED BY: ReportTableWidget
// EXPORTS: LoadingBar (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SPRING_GENTLE } from '../config/animationConstants';

// WHY: Only 'idle', 'quick', and 'base' are used by ReportTableWidget.
// 'idle' = hidden, 'quick' = Phase 1 indeterminate pulse, 'base' = Phase 2 filling.
type LoadingPhase = 'idle' | 'quick' | 'base';

interface LoadingBarProps {
  phase: LoadingPhase;
}

const BAR_GRADIENT = 'linear-gradient(90deg, var(--color-primary), #5AC8FA)';

export default function LoadingBar({ phase }: LoadingBarProps) {
  if (phase === 'idle') return null;

  return (
    <div className="mx-5 mt-2 h-0.5 bg-primary/10 rounded-full overflow-hidden">
      {phase === 'quick' && (
        <div
          className="h-full rounded-full"
          style={{
            background: BAR_GRADIENT,
            animation: 'loading-pulse 1.5s ease-in-out infinite',
          }}
        />
      )}
      {phase === 'base' && (
        <motion.div
          className="h-full rounded-full"
          style={{ background: BAR_GRADIENT }}
          initial={{ width: '60%' }}
          animate={{ width: '100%' }}
          transition={SPRING_GENTLE}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace inline loading bar in ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add import:
```typescript
import LoadingBar from '../LoadingBar';
```

Add loading phase computation after the `error`/`refetch` lines (around line 68):
```typescript
  // WHY: Compute loading phase for the gradient progress bar.
  // 'quick' = initial load, 'base' = background fetching base dataset, 'idle' = done.
  const loadingPhase = isLoading ? 'quick' as const
    : isFetching ? 'base' as const
    : 'idle' as const;
```

Make TWO changes in the return JSX:

**(a) DELETE the old inline fetching bar entirely** — find and remove this block (around lines 168-174):
```tsx
      {/* WHY: Subtle loading bar during background refetches.
          keepPreviousData means old data stays visible — no skeleton flash. */}
      {isFetching && !isLoading && (
        <div className="mx-5 mt-2 h-0.5 bg-primary/20 rounded-full overflow-hidden">
          <div className="h-full bg-primary/60 rounded-full animate-pulse w-2/3" />
        </div>
      )}
```

**(b) INSERT `<LoadingBar>` as the FIRST element in the return** — right after `return (<>`, before `<TableToolbar>`:
```tsx
    return (
      <>
        <LoadingBar phase={loadingPhase} />
        <TableToolbar
```

Do NOT place `<LoadingBar>` in both locations. The old inline bar is deleted, and the new component goes at the very top of the return fragment.

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/LoadingBar.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: phase loading progress bar with gradient

Thin gradient bar shows two-phase loading: indeterminate pulse
during quick query, fills to 100% during base dataset load.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Verify on deployed page**

Refresh the page. During initial load, a thin gradient bar should pulse at the top of the widget. When the base dataset loads in background, it should fill to 100% then fade out.

---

### Task 10: Premium Toast Notifications

**Files:**
- Modify: `client/src/components/Toast.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Rewrite Toast with Framer Motion**

Replace the entire content of `client/src/components/Toast.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Premium toast notification with spring entrance/exit
//          and animated SVG checkmark. Fixed bottom-right.
// USED BY: ReportTableWidget.tsx
// EXPORTS: Toast
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { XCircle, X } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_GENTLE, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
}

// WHY: SVG checkmark that draws itself on mount — a satisfying
// micro-interaction that signals "action completed successfully."
function AnimatedCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-emerald-500 shrink-0">
      <motion.circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M8 12l3 3 5-5"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      />
    </svg>
  );
}

export default function Toast({ message, variant, onDismiss }: ToastProps) {
  const reduced = useReducedMotion();

  // WHY: Auto-dismiss after 3 seconds. The user can also manually close.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={reduced ? REDUCED_FADE.initial : { opacity: 0, y: 20, scale: 0.95 }}
      animate={reduced ? REDUCED_FADE.animate : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? REDUCED_FADE.exit : { opacity: 0, y: 10, scale: 0.95 }}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3
        bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)]
        border border-slate-200/60"
    >
      {variant === 'success' ? <AnimatedCheck /> : <XCircle size={18} className="text-red-500 shrink-0" />}
      <span className="text-sm text-slate-700 font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 ml-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
```

- [ ] **Step 2: Add AnimatePresence around Toast in ReportTableWidget**

In `client/src/components/widgets/ReportTableWidget.tsx`, replace the toast render (around line 218):

**Replace this:**
```tsx
      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
      )}
```

**With this:**
```tsx
      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        )}
      </AnimatePresence>
```

(`AnimatePresence` was already imported in Task 6.)

- [ ] **Step 3: Remove dead CSS keyframe**

In `client/src/index.css`, remove the old toast-slide-up keyframe:

**Remove these lines (25-30):**
```css
/* WHY: Slide-up animation for the Toast component.
   Subtle 200ms ease-out — matches the Apple/Stripe micro-interaction aesthetic. */
@keyframes toast-slide-up {
  from { transform: translateY(8px); opacity: 0; }
  to   { transform: translateY(0);   opacity: 1; }
}
```

Also remove the `CheckCircle2` import from Toast.tsx if the old file had it (it's replaced by the custom `AnimatedCheck` SVG).

- [ ] **Step 4: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/Toast.tsx client/src/components/widgets/ReportTableWidget.tsx client/src/index.css
git commit -m "feat: premium toast with spring animation and animated checkmark

Toast uses Framer Motion spring entrance/exit. Success variant
draws an SVG checkmark on mount. Removed dead CSS keyframe.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 5: Verify on deployed page**

Click the Export button. A toast should spring in from the bottom-right. On success, the checkmark circle and check should draw themselves. After 3 seconds, the toast should slide down and fade out smoothly (not just disappear).

---

### Task 11: Animated Empty & Error States

**Files:**
- Create: `client/src/components/EmptyState.tsx`
- Create: `client/src/components/ErrorState.tsx`
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Create EmptyState component**

Create `client/src/components/EmptyState.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/EmptyState.tsx
// PURPOSE: Animated empty state shown when filters return no data.
//          Icon bounces in, text fades up. Respects reduced motion.
// USED BY: ReportTableWidget
// EXPORTS: EmptyState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  FADE_SCALE, SPRING_GENTLE, SPRING_BOUNCY,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

export default function EmptyState() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-8 text-center"
      {...(reduced ? REDUCED_FADE : FADE_SCALE)}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
    >
      <motion.div
        initial={reduced ? undefined : { scale: 0.8, rotate: -5 }}
        animate={reduced ? undefined : { scale: 1, rotate: 0 }}
        transition={reduced ? undefined : { ...SPRING_BOUNCY, delay: 0.1 }}
        className="inline-block mb-3"
      >
        <SearchX size={32} className="text-slate-300" />
      </motion.div>
      <p className="text-slate-500 text-sm font-medium">No results found</p>
      <p className="text-slate-400 text-xs mt-1">Try adjusting your filters</p>
    </motion.div>
  );
}
```

- [ ] **Step 2: Create ErrorState component**

Create `client/src/components/ErrorState.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ErrorState.tsx
// PURPOSE: Animated error state with retry button. Icon bounces
//          in, text fades up. Retry button has tap feedback.
// USED BY: ReportTableWidget
// EXPORTS: ErrorState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  FADE_SCALE, SPRING_GENTLE, SPRING_BOUNCY, SPRING_STIFF,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

interface ErrorStateProps {
  onRetry: () => void;
}

export default function ErrorState({ onRetry }: ErrorStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-6 text-center"
      {...(reduced ? REDUCED_FADE : FADE_SCALE)}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
    >
      <motion.div
        initial={reduced ? undefined : { scale: 0.8, rotate: -5 }}
        animate={reduced ? undefined : { scale: 1, rotate: 0 }}
        transition={reduced ? undefined : { ...SPRING_BOUNCY, delay: 0.1 }}
        className="inline-block mb-3"
      >
        <AlertCircle size={32} className="text-red-300" />
      </motion.div>
      <p className="text-red-500 text-sm mb-3">Failed to load data</p>
      <motion.button
        onClick={onRetry}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        transition={SPRING_STIFF}
        className="text-sm text-primary font-medium hover:underline"
      >
        Retry
      </motion.button>
    </motion.div>
  );
}
```

- [ ] **Step 3: Update ReportTableWidget to use new components**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add imports:
```typescript
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
```

Replace lines 189-203 (error and empty state blocks):

**Replace this:**
```tsx
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
```

**With this:**
```tsx
      {error && <ErrorState onRetry={() => refetch()} />}

      {!isLoading && !error && displayData.length === 0 && <EmptyState />}
```

- [ ] **Step 4: Verify line count and extract if needed**

Run: `wc -l client/src/components/widgets/ReportTableWidget.tsx`

The file will likely be over 200 lines at this point. If so, extract the `displayData/totalCount/totalPages` useMemo block into a hook.

Create `client/src/hooks/useFilteredData.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFilteredData.ts
// PURPOSE: Computes filtered and paginated display data from the
//          active dataset. Extracted from ReportTableWidget to
//          keep it under 200 lines.
// USED BY: ReportTableWidget
// EXPORTS: useFilteredData
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { applyAllFilters, applyClientFilters } from '../utils/clientFilter';
import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

const CLIENT_PAGE_SIZE = 50;

interface FilteredDataResult {
  displayData: Record<string, unknown>[];
  totalCount: number;
  totalPages: number;
}

interface UseFilteredDataParams {
  allRows: Record<string, unknown>[];
  debouncedGroup: FilterGroup;
  filterColumns: ColumnFilterMeta[];
  page: number;
  isBaseReady: boolean;
  hasClientFilters: boolean;
  serverPagination: { totalCount: number; totalPages: number } | undefined;
}

export function useFilteredData({
  allRows, debouncedGroup, filterColumns, page,
  isBaseReady, hasClientFilters, serverPagination,
}: UseFilteredDataParams): FilteredDataResult {
  return useMemo(() => {
    if (isBaseReady || hasClientFilters) {
      // WHY: Base dataset has ALL rows — apply ALL non-date filters client-side.
      // Phase 1 with client filters uses the same client-side path.
      const filtered = isBaseReady
        ? applyAllFilters(allRows, debouncedGroup, filterColumns)
        : applyClientFilters(allRows, debouncedGroup, filterColumns);
      return {
        displayData: filtered.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE),
        totalCount: filtered.length,
        totalPages: Math.ceil(filtered.length / CLIENT_PAGE_SIZE),
      };
    }
    // Phase 1 without client-side filters — server handles pagination
    return {
      displayData: allRows,
      totalCount: serverPagination?.totalCount ?? 0,
      totalPages: serverPagination?.totalPages ?? 0,
    };
  }, [allRows, debouncedGroup, filterColumns, page, isBaseReady, hasClientFilters, serverPagination]);
}
```

Then in `ReportTableWidget.tsx`:
- Add import: `import { useFilteredData } from '../../hooks/useFilteredData';`
- Remove the `CLIENT_PAGE_SIZE` constant (line 27) — it's now in the hook
- Remove the `useMemo` block (lines ~85-109) and the `useMemo` import
- Replace with:
```typescript
  const { displayData, totalCount, totalPages } = useFilteredData({
    allRows,
    debouncedGroup,
    filterColumns,
    page,
    isBaseReady,
    hasClientFilters,
    serverPagination: quickQuery.data?.pagination,
  });
```
- Remove `applyAllFilters, applyClientFilters` from the imports (moved to the hook)
- Keep `hasAnyClientConditions, hasSkippedOrGroups` imports (still used in ReportTableWidget)

After extraction, verify the line count is under 200: `wc -l client/src/components/widgets/ReportTableWidget.tsx`

Add the new hook file to the git commit in Step 5:
```bash
git add client/src/hooks/useFilteredData.ts
```

- [ ] **Step 5: Verify and commit**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../client && npm test
git add client/src/components/EmptyState.tsx client/src/components/ErrorState.tsx client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: animated empty and error states

Extract empty/error states into dedicated components with
fade+scale entrance and icon bounce animations.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 6: Verify on deployed page**

Apply a filter that returns no results (e.g., search for a vendor that doesn't exist). The "No results found" message should fade in with a scale animation, and the search icon should bounce once. Clear filters to see the data return.

---

### Task 12: Final Verification

**Files:** None — verification only

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
```

Both must pass cleanly with zero errors.

- [ ] **Step 2: Run tests**

```bash
cd /Users/victorproust/Documents/Work/SG\ Interface/Priority\ Reports/client
npm test
```

All tests must pass.

- [ ] **Step 3: Verify line count**

```bash
wc -l client/src/components/widgets/ReportTableWidget.tsx
```

Must be ≤ 200 lines. If not, extract the useMemo block into a hook (see Task 11 Step 4).

- [ ] **Step 4: Verify all new files have intent blocks**

Check each new file has the `FILE`, `PURPOSE`, `USED BY`, `EXPORTS` comment block at the top:
- `client/src/config/animationConstants.ts`
- `client/src/hooks/useReducedMotion.ts`
- `client/src/components/NavTabs.tsx`
- `client/src/components/TableSkeleton.tsx`
- `client/src/components/LoadingBar.tsx`
- `client/src/components/EmptyState.tsx`
- `client/src/components/ErrorState.tsx`

- [ ] **Step 5: Full smoke test on deployed page**

Open the deployed Railway page in Chrome. Run through this checklist:
1. Page loads with shimmer skeleton → data cascades in with stagger
2. Nav tab has blue pill indicator behind active tab
3. Hover over widget card → lifts 2px with shadow
4. Click Filter → panel springs open with height animation
5. Add a filter condition → it slides in
6. Remove a condition → it slides out
7. Click Filter again → panel springs closed
8. Click Export → toast springs in from bottom-right with checkmark animation
9. Apply filter returning no results → empty state fades in with icon bounce
10. Buttons scale down on press (Filter, Columns, Export, Prev, Next)
11. Column manager → toggle switches slide with spring physics
12. Loading bar shows gradient pulse during data fetch

- [ ] **Step 6: Final commit (if any cleanup needed)**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "chore: final cleanup for premium UX animations

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
git push origin main
```
