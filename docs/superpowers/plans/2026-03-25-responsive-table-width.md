# Responsive Table Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the layout container from 1280px to 2400px so report tables use available screen space on larger monitors.

**Architecture:** Replace `max-w-7xl` with `max-w-[2400px]` in the shared `DepartmentLayout` component. All child components (tables, toolbars, filters) already use flexible layout and expand naturally.

**Tech Stack:** React, Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-25-responsive-table-width-design.md`

---

### Task 1: Widen layout container

**Files:**
- Modify: `client/src/components/DepartmentLayout.tsx:32,55`

- [ ] **Step 1: Edit the header container (line 32)**

Change `max-w-7xl` to `max-w-[2400px]`:

```tsx
// Line 32 — before:
<div className="max-w-7xl mx-auto px-6">

// Line 32 — after:
<div className="max-w-[2400px] mx-auto px-6">
```

- [ ] **Step 2: Edit the main content container (line 55)**

Change `max-w-7xl` to `max-w-[2400px]`:

```tsx
// Line 55 — before:
<main className="max-w-7xl mx-auto px-6 py-6">

// Line 55 — after:
<main className="max-w-[2400px] mx-auto px-6 py-6">
```

- [ ] **Step 3: TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: Clean pass (no type changes, only CSS class string)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/DepartmentLayout.tsx
git commit -m "feat: widen layout container from 1280px to 2400px for large screens"
```

---

### Task 2: Visual verification

- [ ] **Step 1: Start dev servers**

Run `npm run dev` in both `server/` and `client/` directories.

- [ ] **Step 2: Verify at 1200px viewport width**

Resize browser to 1200px wide. Table should scroll horizontally if content exceeds width. No regression from current behavior.

- [ ] **Step 3: Verify at 1600px viewport width**

Resize browser to 1600px wide. Table should use available width without cutoff. Columns should distribute space proportionally.

- [ ] **Step 4: Verify at 2400px+ viewport width**

Resize browser to 2500px wide. Table container should cap at 2400px and center. Content should not stretch beyond 2400px.

- [ ] **Step 5: Check both reports**

Navigate to Purchasing > BBD and Food Safety > GRV Log. Both should benefit from the wider layout equally.

- [ ] **Step 6: Verify in Airtable iframe**

Open the Airtable embed at `https://airtable.com/appjwOgR4HsXeGIda/pagxKcPvhRwFGe7wX` on a wide screen. Table should fill the available iframe space.
