# Spec 09 — Premium UX: Animations & Micro-interactions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the dashboard from a static, functional tool into a premium, Stripe/Linear-quality experience with spring-physics animations, staggered reveals, and purposeful micro-interactions on every surface.

**Philosophy:** Polished & Purposeful. Motion guides attention, provides feedback, and creates continuity between states. Nothing is decorative — every animation serves a UX purpose (orientation, feedback, or continuity).

**Tech Stack:** Framer Motion (latest, ~32kb gzipped — verify post-install with `npx vite-bundle-analyzer`), CSS @keyframes for shimmer/pulse, existing Tailwind CSS v4 design tokens

**Date:** 2026-03-23
**Status:** Ready for implementation planning
**Depends on:** All prior specs (01–08) complete

**Deploy workflow:** Push each completed feature to `main` → Railway auto-deploys via Dockerfile. Verify on the deployed Railway URL using Chrome browser tools. The Railway build runs `tsc -b && vite build` for the client — any TypeScript error kills the build.

**Pre-push checklist (MUST run before every push to main):**
```bash
cd client && npx tsc -b --noEmit   # Client TS check
cd ../server && npx tsc --noEmit   # Server TS check (should be unchanged but verify)
cd ../client && npm test            # ColumnRow.test.tsx must pass
```

---

## 1. Scope

### 1.1 What Changes

1. **Framer Motion dependency** — install `framer-motion` in `client/`
2. **Animation infrastructure** — shared spring presets in `animationConstants.ts` + `useReducedMotion` hook for accessibility from day one
3. **Animated Nav Tabs** — sliding pill indicator with `motion.div` layout animation
4. **Page Content Transitions** — `AnimatePresence` fade+slide between pages
5. **Staggered Table Row Entrance** — rows cascade in on data load / filter change
6. **Premium Skeleton Loading** — Stripe-style diagonal shimmer sweep replacing current pulse skeleton
7. **Smooth Filter Panel Expand/Collapse** — spring height animation via `AnimatePresence`
8. **Button & Control Micro-interactions** — `whileTap`, `whileHover` on interactive elements
9. **Premium Toast Notifications** — spring slide-in, animated checkmark SVG, smooth exit
10. **Enhanced Card & Row Hover** — lift effect on widget cards, smooth row highlights
11. **Phase Loading Progress Bar** — thin gradient bar showing two-phase loading state
12. **Animated Empty & Error States** — fade-in with icon animation

### 1.2 Out of Scope

- Dark mode (separate spec if desired)
- Parallax scroll effects (overkill for data dashboard)
- 3D transforms / perspective effects
- Sound effects or haptic feedback
- Lottie or video-based animations
- Changing the existing color palette, typography, or spacing system
- Server-side changes (this spec is frontend-only)

### 1.3 Iframe Embedding Note

The dashboard is embedded in Airtable via Omni (iframe). Implications:
- `position: fixed` elements (Toast) position relative to the iframe viewport — this is correct behavior
- `z-index: 50` on overlays is fine since we control the entire iframe content
- No cross-frame communication needed for any animation

---

## 2. Animation Principles

All animations follow these constraints:

| Principle | Rule |
|-----------|------|
| **Duration** | 150–400ms. Never exceed 500ms. |
| **Easing** | Spring-based for interactive elements. Ease-out for entrances. Always use named presets from `animationConstants.ts` — never inline spring configs. |
| **Stagger** | 30–50ms between siblings. Max 10 items staggered (rest appear instantly). |
| **Reduced motion** | Respect `prefers-reduced-motion: reduce` via `useReducedMotion()` hook. When true, disable transforms and springs — keep only opacity fades at 150ms duration. Every animated component MUST check this. |
| **Performance** | Only animate `transform` and `opacity` (GPU-composited). For height animations, use Framer Motion's `height: "auto"` which internally measures and converts to transform. |
| **Purpose** | Every animation must serve orientation (where am I?), feedback (did my action work?), or continuity (what changed?). |

### 2.1 Named Spring Presets

All spring configs live in `client/src/config/animationConstants.ts`. Components import the preset name, never write spring values inline.

```typescript
// Named presets — every component uses these, never inline values
export const SPRING_SNAPPY = { type: "spring" as const, stiffness: 500, damping: 35 };
export const SPRING_GENTLE = { type: "spring" as const, stiffness: 300, damping: 25 };
export const SPRING_BOUNCY = { type: "spring" as const, stiffness: 400, damping: 15 };
export const SPRING_STIFF  = { type: "spring" as const, stiffness: 600, damping: 20 };
export const EASE_FADE     = { duration: 0.2, ease: "easeOut" as const };

// Reusable variant sets for common patterns
export const FADE_SLIDE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
};

export const FADE_SCALE = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.95 },
};

// Reduced motion versions — opacity only, no transforms
export const REDUCED_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: { duration: 0.15 },
};
```

### 2.2 Reduced Motion Hook

```typescript
// client/src/hooks/useReducedMotion.ts
import { useEffect, useState } from 'react';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
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

### 2.3 TypeScript Import Rules

The project has `verbatimModuleSyntax: true` in tsconfig. When importing Framer Motion:
- Value imports: `import { motion, AnimatePresence } from 'framer-motion';`
- Type imports: `import type { Variants } from 'framer-motion';`
- Never use `import { type X, Y }` mixed syntax — use separate import statements

---

## 3. Detailed Effects

### 3.1 Animated Nav Tabs

**Current state:** `client/src/components/Layout.tsx` (lines 32-49) renders nav tabs as `<Link>` elements with conditional `text-primary border-b-2 border-primary` class for the active state. The active indicator jumps instantly.

**Target state:** Extract nav into `NavTabs.tsx`. Add a `motion.div` with `layoutId="nav-indicator"` that slides smoothly between tabs using Framer Motion's layout animation.

**Behavior:** A background pill (`bg-primary/10 rounded-lg`) sits behind the active tab and glides to the newly selected tab with spring physics when clicked. The text color still changes via CSS classes.

**Implementation detail:**
- Extract the `<nav>` section from `Layout.tsx` into a new `NavTabs.tsx` component
- `NavTabs` receives `pages` and `currentPath` as props
- Each tab renders a `<Link>` as before
- The active tab ALSO renders a `motion.div` with `layoutId="nav-indicator"` positioned absolutely behind the text
- The `layoutId` causes Framer Motion to automatically animate the pill between positions
- Transition: `SPRING_SNAPPY`
- When `useReducedMotion()` is true, set `layout={false}` to disable the slide — the pill just appears instantly

**New file — `client/src/components/NavTabs.tsx`:**
```
Intent block: FILE, PURPOSE (animated nav with sliding pill), USED BY (Layout.tsx), EXPORTS (NavTabs)
Props: { pages: PageConfig[], currentPath: string }
Imports: Link from react-router-dom, motion from framer-motion, useReducedMotion
~50 lines
```

**Modified file — `client/src/components/Layout.tsx`:**
- Remove lines 32-49 (the inline `<nav>` block)
- Replace with `<NavTabs pages={pages} currentPath={location.pathname} />`
- Add import for NavTabs
- The `<header>` structure, `<h1>`, and DEV badge remain unchanged

---

### 3.2 Page Content Transitions

**Current state:** `client/src/components/Layout.tsx` line 55 renders `<Outlet />` directly inside `<main>`. Page changes are instant with no transition.

**Target state:** Wrap `<Outlet />` in `AnimatePresence mode="wait"` with a keyed `motion.div` so pages cross-fade with a subtle vertical shift.

**WHY this is in Layout.tsx, not PageRenderer.tsx:** `AnimatePresence` must wrap the component that gets mounted/unmounted to detect exits. React Router unmounts the old route's `PageRenderer` and mounts the new one — `AnimatePresence` needs to be ABOVE this switching point (around `<Outlet />`), not inside the component being switched.

**Implementation detail:**
- Import `AnimatePresence, motion` from framer-motion and `useLocation` from react-router-dom (already imported)
- Wrap `<Outlet />` in:
  ```tsx
  <AnimatePresence mode="wait">
    <motion.div
      key={location.pathname}
      {...(reduced ? REDUCED_FADE : FADE_SLIDE_UP)}
      transition={EASE_FADE}
    >
      <Outlet />
    </motion.div>
  </AnimatePresence>
  ```
- The `key={location.pathname}` causes AnimatePresence to detect the route change and play exit/enter animations
- When reduced motion: only opacity fade, no y-shift

**Modified file — `client/src/components/Layout.tsx`:**
- Line 54-56: wrap `<Outlet />` in AnimatePresence + motion.div
- Add imports: `AnimatePresence, motion` from framer-motion
- Add import: `useReducedMotion` from hooks
- Add imports: `FADE_SLIDE_UP, EASE_FADE, REDUCED_FADE` from animationConstants
- File stays well under 200 lines

---

### 3.3 Staggered Table Row Entrance

**Current state:** `client/src/components/ReportTable.tsx` (lines 37-58) renders `<tr>` elements with no entrance animation. Rows appear instantly.

**Target state:** Each row is a `motion.tr` that fades in and slides up 6px with staggered timing.

**Implementation detail:**
- Change `<tr>` on line 38 to `<motion.tr>`
- Add animation props:
  ```tsx
  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
  animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
  transition={{ delay: Math.min(rowIdx, 10) * 0.03, duration: 0.15 }}
  ```
- Rows 0-9 get staggered delay (0ms, 30ms, 60ms... 300ms). Rows 10+ get delay capped at 300ms (appear together)
- The `key={rowIdx}` remains unchanged — this means animation only triggers on mount (data change), not on every render
- Import `motion` from framer-motion
- Import `useReducedMotion` — but this component receives data as props, so pass `reduced` as a prop from the parent, OR call the hook directly (it's lightweight)
- Actually, since `ReportTable` is a presentational component, add a `disableAnimation?: boolean` prop and let the parent pass `useReducedMotion()`. This keeps the component pure.

**Modified file — `client/src/components/ReportTable.tsx`:**
- Add `disableAnimation?: boolean` to `ReportTableProps`
- Change `<tr>` to `<motion.tr>` with stagger props
- Add import: `motion` from framer-motion
- File stays under 80 lines

**Modified file — `client/src/components/widgets/ReportTableWidget.tsx`:**
- Pass `disableAnimation={reduced}` to `<ReportTable>`
- Add `const reduced = useReducedMotion();` (will be used by multiple effects in this file)

---

### 3.4 Premium Skeleton Loading

**Current state:** `client/src/components/widgets/ReportTableWidget.tsx` (lines 176-187) renders a basic pulse skeleton with `animate-pulse` bars.

**Target state:** Replace with a dedicated `TableSkeleton` component using a Stripe-style shimmer sweep.

**Implementation detail:**
- New CSS `@keyframes shimmer` in `index.css`:
  ```css
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  ```
- `TableSkeleton` renders a fake table: one header row (3-4 bars) + 8 body rows with varying widths
- Each bar has class: `h-4 rounded bg-slate-100` with inline style:
  ```
  backgroundImage: 'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.5) 50%, transparent 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
  ```
- Container matches table padding: `px-5 py-6 space-y-4`
- Row width variation: alternate between `w-full`, `w-5/6`, `w-4/5` for visual interest

**New file — `client/src/components/TableSkeleton.tsx`:**
```
Intent block: FILE, PURPOSE (Stripe-style shimmer skeleton for table loading), USED BY (ReportTableWidget), EXPORTS (TableSkeleton)
~40 lines, no props needed
```

**Modified files:**
- `client/src/components/widgets/ReportTableWidget.tsx`: Replace lines 176-187 with `<TableSkeleton />`
- `client/src/index.css`: Add `@keyframes shimmer` after the existing `toast-slide-up` keyframe

---

### 3.5 Smooth Filter Panel Expand/Collapse

**Current state:** `client/src/components/widgets/ReportTableWidget.tsx` (lines 124-142) conditionally renders `FilterBuilder` and `ColumnManagerPanel` with `{isFilterOpen && <FilterBuilder .../>}`. Panels appear/disappear instantly.

**Target state:** Wrap each panel in `AnimatePresence` + `motion.div` so they smoothly expand/collapse with spring height animation.

**Implementation detail:**
- Wrap each panel's conditional render:
  ```tsx
  <AnimatePresence>
    {isFilterOpen && (
      <motion.div
        key="filter-panel"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ height: SPRING_SNAPPY, opacity: { duration: 0.15 } }}
        style={{ overflow: "hidden" }}
      >
        <FilterBuilder ... />
      </motion.div>
    )}
  </AnimatePresence>
  ```
- Same pattern for `ColumnManagerPanel`
- When `useReducedMotion()`: skip height animation, only opacity fade
- **CRITICAL — dnd-kit coexistence:** The `motion.div` wrapper goes AROUND the `FilterBuilder`/`ColumnManagerPanel`, NOT on any element that `@dnd-kit` manages internally. `@dnd-kit` controls `transform` via `CSS.Translate.toString(transform)` on sortable items. If Framer Motion also tries to animate `transform` on those same elements, they will conflict. The AnimatePresence wrapper is on the container level — this is safe.

**Additionally — filter condition add/remove animation in `FilterBuilder.tsx`:**
- Wrap the condition list `{filterGroup.conditions.map(...)}` items in `AnimatePresence`
- Each condition's wrapper `<div key={condition.id}>` becomes `<motion.div>` with fade+slide
- This is on the wrapper div (lines 101-119), NOT on the sortable elements that dnd-kit controls
- When a condition is added, it slides in. When removed, it slides out.

**Modified files:**
- `client/src/components/widgets/ReportTableWidget.tsx`: Wrap panels in AnimatePresence
- `client/src/components/filter/FilterBuilder.tsx`: AnimatePresence on condition wrappers

---

### 3.6 Button & Control Micro-interactions

**Current state:** Buttons in `TableToolbar.tsx`, `Pagination.tsx`, `FilterBuilder.tsx` use CSS `transition-colors` for hover. No press/tap feedback.

**Target state:** All interactive buttons get `whileTap={{ scale: 0.97 }}` and enhanced hover states via Framer Motion.

**Implementation detail:**

**TableToolbar.tsx (lines 37-48, 51-62, 65-75):**
- Change `<button>` to `<motion.button>` for the three buttons (Filter, Columns, Export)
- Add `whileTap={{ scale: 0.97 }}` and `transition={SPRING_STIFF}`
- Keep existing className unchanged — the CSS `transition-colors` handles color, Framer Motion handles scale
- The `<ChevronDown>` icon rotation stays as CSS `transition-transform` (simpler, works fine)
- When reduced motion: remove `whileTap` (set to `undefined`)

**Pagination.tsx (lines 24-37):**
- Change both `<button>` to `<motion.button>`
- Add `whileTap={{ scale: 0.97 }}` and `transition={SPRING_STIFF}`
- Keep `disabled` handling — Framer Motion respects `disabled` attribute

**FilterBuilder.tsx (lines 137-145 add buttons):**
- Change the two add buttons ("+ Add condition", "+ Add group") to `<motion.button>`
- Add `whileTap={{ scale: 0.97 }}`

**ColumnRow.tsx — spring-animated toggle switch:**
- The toggle thumb (line 47-49) currently uses CSS `transition-transform` for slide
- Change the thumb `<div>` to `<motion.div>` with `layout` prop
- Framer Motion's layout animation makes the thumb slide smoothly with spring physics
- Transition: `SPRING_SNAPPY`
- **dnd-kit safety:** The `motion.div` is on the toggle THUMB only, not on the row element. The row element (line 36) keeps its `ref={setNodeRef}` and `style={style}` from dnd-kit untouched.
- Remove CSS `transition-transform` from the thumb since Framer Motion handles it

**Modified files:**
- `client/src/components/TableToolbar.tsx`
- `client/src/components/Pagination.tsx`
- `client/src/components/filter/FilterBuilder.tsx`
- `client/src/components/columns/ColumnRow.tsx`

**Test impact:** `ColumnRow.test.tsx` mocks `@dnd-kit/sortable` and `@dnd-kit/utilities`. It does NOT mock `framer-motion`. After adding `motion.div` to the toggle thumb, the test should still pass because:
- Framer Motion's `motion.div` renders a regular `<div>` in test environments
- The test queries by `role="button"` which targets the toggle `<button>`, not the thumb `<div>`
- If the test fails, add a mock: `vi.mock('framer-motion', () => ({ motion: { div: 'div' } }));`

---

### 3.7 Premium Toast Notifications

**Current state:** `client/src/components/Toast.tsx` uses CSS animation `toast-slide-up 200ms ease-out` (defined in `index.css` line 27-30). No exit animation — toast just disappears when unmounted.

**Target state:** Spring-physics entrance via Framer Motion, animated SVG checkmark for success, smooth exit animation via `AnimatePresence`.

**Implementation detail:**

**Toast.tsx changes:**
- Replace `style={{ animation: 'toast-slide-up 200ms ease-out' }}` with Framer Motion:
  ```tsx
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 10, scale: 0.95 }}
    transition={SPRING_GENTLE}
    className="fixed bottom-4 right-4 z-50 ..."
  >
  ```
- The `AnimatePresence` wrapper goes in `ReportTableWidget.tsx` around the toast render:
  ```tsx
  <AnimatePresence>
    {toast && <Toast ... />}
  </AnimatePresence>
  ```
  (Currently line 218-220 in ReportTableWidget.tsx)

**Animated checkmark for success variant:**
- Replace `<CheckCircle2>` lucide icon with a custom SVG that draws on:
  ```tsx
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
    <motion.circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
      transition={{ duration: 0.3 }} />
    <motion.path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
      transition={{ duration: 0.2, delay: 0.2 }} />
  </svg>
  ```
- Error variant keeps `<XCircle>` lucide icon (no animation needed for errors)

**Dead CSS cleanup in `index.css`:**
- Remove `@keyframes toast-slide-up` (lines 27-30) — now dead code
- Remove the WHY comment above it (lines 25-26)

**Modified files:**
- `client/src/components/Toast.tsx`
- `client/src/components/widgets/ReportTableWidget.tsx` (add AnimatePresence around toast)
- `client/src/index.css` (remove dead keyframe)

---

### 3.8 Enhanced Card & Row Hover

**Current state:**
- `WidgetShell.tsx` (line 18): `hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200`
- `ReportTable.tsx` (line 40): `hover:bg-blue-50/40 transition-colors duration-150`

**Target state:**
- Widget cards lift 2px on hover with deeper shadow via Framer Motion spring
- Table rows get enhanced highlight (CSS only — no Framer Motion on 50+ rows)

**Implementation detail:**

**WidgetShell.tsx:**
- Change the outer `<div>` to `<motion.div>`
- Remove CSS `hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)] transition-shadow duration-200` from className
- Add Framer Motion:
  ```tsx
  whileHover={reduced ? undefined : { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.08)" }}
  transition={SPRING_GENTLE}
  ```
- Keep the base shadow `shadow-[0_1px_3px_rgba(0,0,0,0.04)]` in className
- When reduced motion: no hover lift, keep CSS `hover:shadow` as fallback

**ReportTable.tsx:**
- Change `hover:bg-blue-50/40` to `hover:bg-blue-50/60` for stronger highlight
- This is CSS only — no Framer Motion for performance with many rows

**Modified files:**
- `client/src/components/WidgetShell.tsx`
- `client/src/components/ReportTable.tsx` (if not already modified in 3.3)

---

### 3.9 Phase Loading Progress Bar

**Current state:** `client/src/components/widgets/ReportTableWidget.tsx` (lines 170-174) shows a simple `h-0.5 bg-primary/20` bar with `animate-pulse` during background fetches.

**Target state:** A premium 2px gradient bar at the top of the widget content area that shows the two-phase loading progression.

**WHY rendered in ReportTableWidget, not WidgetShell:** The loading phase is computed from `quickQuery` and `baseQuery` which are internal to `ReportTableWidget`. `WidgetShell` is a generic wrapper that only knows about `title` and `children` — it has no concept of loading state. Passing loading state UP from `ReportTableWidget` to `WidgetShell` would require a context or ref-based approach (WidgetShell wraps ReportTableWidget, not the other way around). Simpler to render the bar inside ReportTableWidget at the top of its return.

**Implementation detail:**

**New file — `client/src/components/LoadingBar.tsx`:**
```
Intent block: FILE, PURPOSE (phase loading progress bar), USED BY (ReportTableWidget), EXPORTS (LoadingBar)
Props: { phase: 'idle' | 'quick' | 'base' | 'complete' }
```

Phase behavior:
- `idle`: not rendered (return null)
- `quick`: bar width oscillates 20%-60% via CSS animation `loading-pulse`
- `base`: bar width transitions to 100% via Framer Motion spring
- `complete`: bar opacity fades to 0 over 300ms, then parent stops rendering it

CSS gradient: `linear-gradient(90deg, var(--color-primary), #5AC8FA)`
Position: relative within the widget content (NOT absolutely positioned in WidgetShell)
Height: `h-0.5` (2px), `rounded-full`

New CSS keyframe in `index.css`:
```css
@keyframes loading-pulse {
  0%, 100% { width: 20%; }
  50%      { width: 60%; }
}
```

**Modified file — `client/src/components/widgets/ReportTableWidget.tsx`:**
- Replace lines 170-174 (current fetching bar) with `<LoadingBar phase={loadingPhase} />`
- Compute `loadingPhase` from query states:
  ```tsx
  const loadingPhase = isLoading ? 'quick'
    : isFetching ? 'base'
    : 'idle';
  ```
- Place `<LoadingBar>` as the first element in the return JSX (above `<TableToolbar>`)

**New file — `client/src/components/LoadingBar.tsx`:** ~40 lines
**Modified:** `client/src/index.css` (add `@keyframes loading-pulse`)

---

### 3.10 Animated Empty & Error States

**Current state:**
- Empty state: `ReportTableWidget.tsx` lines 198-203, plain text "No results found" / "Try adjusting your filters"
- Error state: `ReportTableWidget.tsx` lines 189-196, plain text "Failed to load data" + "Retry" button

**Target state:** Extract into dedicated components with fade+scale entrance animation and icon bounce.

**Implementation detail:**

**New file — `client/src/components/EmptyState.tsx`:**
```
Intent block: FILE, PURPOSE (animated empty state), USED BY (ReportTableWidget), EXPORTS (EmptyState)
No props needed (static content)
~35 lines
```
- Uses `motion.div` with `FADE_SCALE` variants and `SPRING_GENTLE` transition
- Renders a `Search` or `Inbox` icon from lucide-react with bounce animation:
  ```tsx
  <motion.div
    initial={{ scale: 0.8, rotate: -5 }}
    animate={{ scale: 1, rotate: 0 }}
    transition={{ ...SPRING_BOUNCY, delay: 0.1 }}
  >
    <SearchX size={32} className="text-slate-300" />
  </motion.div>
  ```
- Text: "No results found" (slate-500, text-sm, font-medium) + "Try adjusting your filters" (slate-400, text-xs)
- When reduced motion: only opacity fade

**New file — `client/src/components/ErrorState.tsx`:**
```
Intent block: FILE, PURPOSE (animated error state with retry), USED BY (ReportTableWidget), EXPORTS (ErrorState)
Props: { onRetry: () => void }
~40 lines
```
- Same animation pattern as EmptyState
- Renders `AlertCircle` icon with bounce
- Text: "Failed to load data" (red-500, text-sm) + "Retry" button (primary, underline)
- The Retry button uses `<motion.button whileTap={{ scale: 0.97 }}>`

**Modified file — `client/src/components/widgets/ReportTableWidget.tsx`:**
- Replace lines 189-203 with:
  ```tsx
  {error && <ErrorState onRetry={() => refetch()} />}
  {!isLoading && !error && displayData.length === 0 && <EmptyState />}
  ```
- This extraction removes ~14 lines from ReportTableWidget (which is at 223, over the 200-line limit)

---

## 4. File Map Summary

### New Files (7)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `client/src/config/animationConstants.ts` | ~45 | Named spring presets, variant helpers, reduced-motion variants |
| `client/src/hooks/useReducedMotion.ts` | ~15 | `prefers-reduced-motion` media query hook |
| `client/src/components/NavTabs.tsx` | ~50 | Animated nav with sliding pill indicator |
| `client/src/components/TableSkeleton.tsx` | ~40 | Shimmer skeleton matching table layout |
| `client/src/components/LoadingBar.tsx` | ~40 | Thin gradient progress bar for phase loading |
| `client/src/components/EmptyState.tsx` | ~35 | Animated "No results" with icon bounce |
| `client/src/components/ErrorState.tsx` | ~40 | Animated error with retry button |

### Modified Files (10)

| File | Current Lines | Changes |
|------|--------------|---------|
| `client/package.json` | 44 | Add `framer-motion` dependency |
| `client/src/index.css` | 31 | Add `@keyframes shimmer` + `loading-pulse`, remove dead `toast-slide-up` |
| `client/src/components/Layout.tsx` | 59 | Import NavTabs, replace inline nav. Add AnimatePresence around Outlet |
| `client/src/components/WidgetShell.tsx` | 27 | `motion.div` with whileHover lift |
| `client/src/components/widgets/ReportTableWidget.tsx` | 223 | Use TableSkeleton/EmptyState/ErrorState/LoadingBar, AnimatePresence on panels+toast. Net line reduction. |
| `client/src/components/ReportTable.tsx` | 63 | `motion.tr` with staggered entrance, enhanced hover color |
| `client/src/components/TableToolbar.tsx` | 79 | `motion.button` with whileTap on all 3 buttons |
| `client/src/components/Pagination.tsx` | 41 | `motion.button` with whileTap on both buttons |
| `client/src/components/filter/FilterBuilder.tsx` | 157 | AnimatePresence on condition list, `motion.button` on add buttons |
| `client/src/components/Toast.tsx` | 48 | Framer Motion spring entrance/exit, animated checkmark SVG |
| `client/src/components/columns/ColumnRow.tsx` | 72 | `motion.div` on toggle thumb for spring slide |

**NOT modified:** `PageRenderer.tsx`, `WidgetRenderer.tsx`, `App.tsx`, `ColumnManagerPanel.tsx`, any server files

---

## 5. Accessibility

- **`prefers-reduced-motion`**: Every animated component imports `useReducedMotion()` and uses `REDUCED_FADE` variants when true. Built in from Step 1, not retrofitted.
- **Focus indicators**: Existing `focus:ring-2 focus:ring-primary/20` styles remain unchanged. No animation interferes with keyboard navigation or focus order.
- **No content shift**: Animations must not cause layout shift that moves interactive targets while the user is trying to click them. The `whileTap={{ scale: 0.97 }}` is small enough to not cause misclicks.
- **Existing tests**: `ColumnRow.test.tsx` must continue to pass. The test mocks `@dnd-kit/sortable` but not `framer-motion`. Framer Motion's `motion.div` renders a regular `<div>` in test environments, so tests should work. If not, mock framer-motion.

---

## 6. Performance Constraints

- **No layout thrashing**: Only animate `transform` and `opacity` (GPU-composited properties). Framer Motion's `height: "auto"` is the only exception — it internally measures and converts to transform.
- **Stagger cap**: Max 10 items staggered per group. Items beyond 10 get delay capped at `10 * 0.03 = 300ms`.
- **AnimatePresence cleanup**: Always use `mode="wait"` for page transitions to prevent DOM buildup.
- **Table rows**: Use CSS transitions for hover (not Framer Motion) since there can be 50+ rows. Only the entrance stagger uses Framer Motion on rows.
- **Skeleton shimmer**: Pure CSS `@keyframes` — no JavaScript animation loop.
- **Bundle impact**: Framer Motion adds ~32kb gzipped. Verify post-install. No other new dependencies.
- **TypeScript**: Use `import type { ... } from 'framer-motion'` for type-only imports per `verbatimModuleSyntax: true`.
- **noUnusedLocals**: After each change, ensure no unused imports remain — `noUnusedLocals: true` in tsconfig means `tsc -b` fails, killing the Railway Docker build.

---

## 7. Implementation Order

Each step is independently deployable and testable. After each step:
1. Run `cd client && npx tsc -b --noEmit` (must pass)
2. Run `cd client && npm test` (ColumnRow.test.tsx must pass)
3. Commit and push to `main`
4. Wait for Railway deploy
5. Test the feature on the deployed Railway page using Chrome browser

**Steps:**

1. **Foundation** — Install Framer Motion, create `animationConstants.ts`, create `useReducedMotion.ts`, add CSS keyframes to `index.css`
2. **Premium Skeleton** (3.4) — Create `TableSkeleton.tsx`, update `ReportTableWidget.tsx`
3. **Animated Nav Tabs** (3.1) — Create `NavTabs.tsx`, update `Layout.tsx`
4. **Page Content Transitions** (3.2) — Update `Layout.tsx` with AnimatePresence around Outlet
5. **Staggered Table Rows** (3.3) — Update `ReportTable.tsx` with motion.tr
6. **Smooth Filter Panel** (3.5) — Update `ReportTableWidget.tsx` and `FilterBuilder.tsx` with AnimatePresence
7. **Button Micro-interactions** (3.6) — Update `TableToolbar.tsx`, `Pagination.tsx`, `FilterBuilder.tsx`, `ColumnRow.tsx`
8. **Enhanced Hover** (3.8) — Update `WidgetShell.tsx`, `ReportTable.tsx`
9. **Phase Loading Bar** (3.9) — Create `LoadingBar.tsx`, update `ReportTableWidget.tsx`, `index.css`
10. **Premium Toast** (3.7) — Update `Toast.tsx`, `ReportTableWidget.tsx`, `index.css` (remove dead keyframe)
11. **Animated Empty/Error States** (3.10) — Create `EmptyState.tsx`, `ErrorState.tsx`, update `ReportTableWidget.tsx`
12. **Final verification** — Run full test suite, verify `prefers-reduced-motion`, check bundle size, confirm ReportTableWidget.tsx is under 200 lines

### Line Budget for ReportTableWidget.tsx

Currently 223 lines (over the 200-line limit). Line changes per step:
- Step 2 (skeleton): removes ~11 lines (176-187), adds ~1 line → net -10
- Step 6 (filter panels): adds ~8 lines (AnimatePresence wrappers)
- Step 9 (loading bar): removes ~5 lines (170-174), adds ~3 lines → net -2
- Step 10 (toast): adds ~3 lines (AnimatePresence wrapper)
- Step 11 (empty/error): removes ~14 lines (189-203), adds ~2 lines → net -12

**Projected final:** 223 - 10 + 8 - 2 + 3 - 12 = ~210 lines. Add `useReducedMotion` const + loadingPhase computation = ~4 more → ~214 lines. If over 200, extract the `displayData/totalCount/totalPages` useMemo block (lines 85-109) into a `useFilteredData` hook.

---

## 8. Testing Strategy

### Automated
- `cd client && npm test` — `ColumnRow.test.tsx` must pass after every step
- `cd client && npx tsc -b --noEmit` — TypeScript must compile cleanly after every step

### Manual (via Chrome on deployed Railway page)
After each push, verify on the deployed page:
1. **Nav tabs**: Click between tabs (if multiple pages exist). Pill should slide smoothly.
2. **Page transition**: Navigate between pages. Content should fade+slide.
3. **Table rows**: Refresh the page. Rows should cascade in from top.
4. **Skeleton**: Hard refresh (Cmd+Shift+R). Shimmer should sweep while loading.
5. **Filter panel**: Click Filter button. Panel should spring open/close.
6. **Buttons**: Click any button. Should scale down slightly on press.
7. **Toast**: Click Export. Toast should spring in from bottom-right.
8. **Card hover**: Hover over the widget card. Should lift 2px with shadow.
9. **Loading bar**: Change a filter. Gradient bar should appear at top.
10. **Empty state**: Apply a filter that returns no results. Icon should bounce in.
11. **Reduced motion**: Enable "Reduce motion" in System Preferences (macOS) or browser DevTools. All transforms should disable, only opacity fades remain.

---

## 9. Rollback

Each step is an independent commit on `main`. If any step causes issues:
- `git revert <commit-sha>` to remove just that step
- Framer Motion can be removed entirely by reverting Step 1 and all subsequent steps
- No server-side changes means backend is never affected
