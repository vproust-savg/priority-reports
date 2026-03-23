# Header Cleanup & Tab Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant page heading and restyle the active nav tab from blue to a neutral macOS-style segmented control.

**Architecture:** Two surgical edits — strip the `<h2>` from PageRenderer, and update NavTabs' class strings (both the `<Link>` and the `motion.div` pill).

**Tech Stack:** React, Tailwind CSS v4, Framer Motion

**Spec:** `docs/superpowers/specs/2026-03-23-header-cleanup-design.md`

---

### Task 1: Remove page heading from PageRenderer

**Files:**
- Modify: `client/src/components/PageRenderer.tsx`

- [ ] **Step 1: Remove the h2 and wrapper div**

Replace the return block (lines 27-39) — remove the `<h2>` and the wrapping `<div>`, making the grid the root element:

```tsx
export default function PageRenderer({ page }: PageRendererProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {page.widgets.map((widget) => (
        <div key={widget.id} className={`${COL_SPAN_CLASSES[widget.colSpan] ?? 'col-span-12'}`}>
          <WidgetRenderer widget={widget} />
        </div>
      ))}
    </div>
  );
}
```

Note: `page.name` is no longer referenced in JSX, but it's still part of the `PageConfig` type passed via `page` prop. The prop type stays — `page.name` is still used by NavTabs and other consumers.

- [ ] **Step 2: TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS (no unused variable — `page` is still used for `page.widgets`)

- [ ] **Step 3: Commit**

```bash
git add client/src/components/PageRenderer.tsx
git commit -m "ui: remove redundant page heading from PageRenderer"
```

---

### Task 2: Restyle nav tabs to neutral segmented control

**Files:**
- Modify: `client/src/components/NavTabs.tsx`

- [ ] **Step 1: Update the Link className**

On the `<Link>` element (currently line 34), change the className from:

```tsx
className={`relative pb-3 px-3 text-sm font-medium transition-colors duration-150 ${
  isActive ? 'text-primary' : 'text-slate-500 hover:text-slate-700'
}`}
```

To:

```tsx
className={`relative pb-3 px-3 text-sm transition-colors duration-150 ${
  isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'
}`}
```

Changes:
- `font-medium` removed from shared classes, moved into the inactive branch
- `font-semibold` added to the active branch
- `text-primary` replaced with `text-slate-900`

- [ ] **Step 2: Update the motion.div pill className**

On the `<motion.div>` pill (currently line 41), change the className from:

```tsx
className="absolute inset-0 bottom-1 bg-primary/10 rounded-lg"
```

To:

```tsx
className="absolute inset-0 bottom-1 bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
```

Changes:
- `bg-primary/10` → `bg-white` (neutral background)
- Added `border border-slate-200/60` (subtle border, matches WidgetShell)
- Added `shadow-[0_1px_3px_rgba(0,0,0,0.08)]` (slightly heavier than card shadow at `0.04` — the pill needs more weight to appear raised on the white header)
- `inset-0 bottom-1` and `rounded-lg` unchanged

- [ ] **Step 3: TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/NavTabs.tsx
git commit -m "ui: restyle active tab to neutral macOS segmented control"
```

---

### Task 3: Visual verification

- [ ] **Step 1: Start dev servers**

Run both servers:
- `cd server && npm run dev` (port 3001)
- `cd client && npm run dev` (port 5173)

- [ ] **Step 2: Check title duplication is gone**

Navigate to `http://localhost:5173/purchasing/bbd`.

Verify:
- "Purchasing Reports" appears once (department h1 in header)
- "BBD — Best By Dates" appears in the tab AND in the widget card header — NOT as a standalone page heading between them
- No h2 element exists between the tab bar and the widget card

- [ ] **Step 3: Check tab styling**

Verify the selected "BBD — Best By Dates" tab:
- Text is dark (slate-900), NOT blue
- Background is white pill with subtle shadow and border
- Font weight is semibold (visually heavier than inactive tabs)

- [ ] **Step 4: Check tab animation**

Navigate to `http://localhost:5173/food-safety/receiving-log`.

Verify:
- The white pill slides smoothly between tabs (Framer Motion layoutId animation)
- Inactive tabs show slate-500 text, no background
- Hovering inactive tabs shows slate-700 text

- [ ] **Step 5: Check both departments**

Navigate between `/food-safety` and `/purchasing` routes. Both should show the same styling — no blue anywhere in the tab bar.
