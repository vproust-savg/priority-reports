# CheeseLoader Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder spinner in `CheeseLoader.tsx` with a premium SVG cheese wheel animation featuring two switchable variants (continuous trailing sweep + slice cut).

**Architecture:** Single-file rewrite of `client/src/components/CheeseLoader.tsx`. Pure inline SVG with CSS `@keyframes` defined via a `<style>` tag inside the SVG (scoped, no external stylesheet changes). Two animation variants controlled by a `variant` prop. The component renders the cheese wheel SVG above the existing `<TableSkeleton />` at 50% opacity.

**Tech Stack:** React 19, TypeScript, inline SVG, CSS `@keyframes` (no Framer Motion, no external libs)

**Spec:** `docs/superpowers/specs/2026-03-23-cheese-loader-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Rewrite | `client/src/components/CheeseLoader.tsx` | SVG cheese wheel + CSS animations + variant prop |
| No change | `client/src/components/TableSkeleton.tsx` | Shimmer skeleton (rendered inside CheeseLoader at 50% opacity) |
| No change | `client/src/components/widgets/ReportTableWidget.tsx` | Already renders `<CheeseLoader />` at line 141 |
| No change | `client/src/index.css` | Shimmer keyframe already defined |

This is a single-file implementation. The component stays under 200 lines.

---

### Task 1: Write the static SVG cheese wheel (no animation)

**Files:**
- Rewrite: `client/src/components/CheeseLoader.tsx`

- [ ] **Step 1: Replace the placeholder with static SVG cheese wheel**

Rewrite `client/src/components/CheeseLoader.tsx` with this exact content:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/CheeseLoader.tsx
// PURPOSE: Branded cheese wheel loading animation. SVG wheel with
//          two animation variants: trailing sweep and slice cut.
//          Pure CSS keyframes — no Framer Motion, no external libs.
// USED BY: ReportTableWidget
// EXPORTS: CheeseLoader (default)
// ═══════════════════════════════════════════════════════════════

import TableSkeleton from './TableSkeleton';

// WHY: 6 wedges at 60deg each. Pre-computed arc endpoints for a circle
// centered at (40,40) with radius 36. Formula: (40 + 36*sin(angle), 40 - 36*cos(angle))
const WEDGE_PATHS = [
  'M40,40 L40,4 A36,36 0 0,1 71.18,22 Z',
  'M40,40 L71.18,22 A36,36 0 0,1 71.18,58 Z',
  'M40,40 L71.18,58 A36,36 0 0,1 40,76 Z',
  'M40,40 L40,76 A36,36 0 0,1 8.82,58 Z',
  'M40,40 L8.82,58 A36,36 0 0,1 8.82,22 Z',
  'M40,40 L8.82,22 A36,36 0 0,1 40,4 Z',
];

// WHY: Holes are subtle texture (15-30% opacity lighter gold), NOT opaque
// white cartoon cutouts. Varying sizes and opacities for organic feel.
const HOLES = [
  { cx: 48, cy: 18, r: 2.5, opacity: 0.25 },
  { cx: 58, cy: 32, r: 2, opacity: 0.2 },
  { cx: 55, cy: 48, r: 3, opacity: 0.3 },
  { cx: 35, cy: 25, r: 1.5, opacity: 0.15 },
  { cx: 28, cy: 42, r: 2.5, opacity: 0.25 },
  { cx: 42, cy: 58, r: 2, opacity: 0.2 },
  { cx: 22, cy: 55, r: 1.5, opacity: 0.15 },
  { cx: 50, cy: 24, r: 1.5, opacity: 0.2 },
];

export default function CheeseLoader() {
  return (
    <div role="status" aria-label="Loading data">
      <div className="flex flex-col items-center justify-center py-16">
        <svg
          viewBox="0 0 80 80"
          width="96"
          height="96"
          style={{ filter: 'drop-shadow(0 2px 8px rgba(180, 140, 50, 0.15))' }}
        >
          <defs>
            <radialGradient id="cheese-gradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#DCBA5C" />
              <stop offset="100%" stopColor="#C89A30" />
            </radialGradient>
          </defs>

          {WEDGE_PATHS.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="url(#cheese-gradient)"
              stroke="#B8912E"
              strokeWidth="0.5"
            />
          ))}

          {HOLES.map((h, i) => (
            <circle
              key={`hole-${i}`}
              cx={h.cx}
              cy={h.cy}
              r={h.r}
              fill="#E0BE6A"
              fillOpacity={h.opacity}
              stroke="#C49B38"
              strokeWidth="0.3"
            />
          ))}
        </svg>
        <p className="mt-4 text-sm text-slate-500">Preparing your report...</p>
      </div>
      <div className="opacity-50">
        <TableSkeleton />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify visually in dev server**

Run: `cd client && npm run dev` (server should already be running on port 3001)

Open the dashboard in browser. The cheese wheel should render as a static gold wheel with subtle holes and "Preparing your report..." text below it, above a dimmed table skeleton. The wheel should have a gradient (lighter center, darker edge) and a soft drop shadow. The loader area will be taller than before (`py-16` vs the old `py-4`) — this is intentional to give the 96px wheel visual breathing room.

If the data loads too fast to see the loader, temporarily add a `sleep` or `setTimeout` in the query to force a loading state, OR check by throttling network in Chrome DevTools.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/CheeseLoader.tsx
git commit -m "feat: add static SVG cheese wheel to CheeseLoader"
```

---

### Task 2: Add Variant A — Continuous Trailing Sweep animation

**Files:**
- Modify: `client/src/components/CheeseLoader.tsx`

- [ ] **Step 1: Add the variant prop and CSS keyframes for sweep animation**

Add the `variant` prop type and the CSS keyframes. Update the component to apply sweep animation classes to wedges.

First, add the prop interface and update the function signature. Insert this **before** the `WEDGE_PATHS` constant:

```tsx
interface CheeseLoaderProps {
  variant?: 'slice-reveal' | 'slice-cut';
}
```

Update the function signature:

```tsx
export default function CheeseLoader({ variant = 'slice-reveal' }: CheeseLoaderProps) {
```

Next, add CSS keyframes inside the SVG `<defs>` block (after the `</radialGradient>` closing tag). Add a `<style>` element:

```tsx
<defs>
  <radialGradient id="cheese-gradient" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stopColor="#DCBA5C" />
    <stop offset="100%" stopColor="#C89A30" />
  </radialGradient>
  <style>{`
    @keyframes cheese-sweep {
      0%   { opacity: 0; }
      8%   { opacity: 1; }
      58%  { opacity: 1; }
      67%  { opacity: 0; }
      100% { opacity: 0; }
    }
    .sweep-wedge {
      opacity: 0;
      animation: cheese-sweep 3.6s cubic-bezier(0.25, 0.1, 0.25, 1) infinite both;
    }
  `}</style>
</defs>
```

Then update the wedge `<path>` rendering to conditionally apply the animation class and delay:

```tsx
{WEDGE_PATHS.map((d, i) => (
  <path
    key={i}
    d={d}
    fill="url(#cheese-gradient)"
    stroke="#B8912E"
    strokeWidth="0.5"
    className={variant === 'slice-reveal' ? 'sweep-wedge' : undefined}
    style={variant === 'slice-reveal' ? { animationDelay: `${i * 0.6}s` } : undefined}
  />
))}
```

- [ ] **Step 2: Add reduced motion support**

Add a `prefers-reduced-motion` media query inside the same `<style>` block, after the `.sweep-wedge` rule:

```css
@media (prefers-reduced-motion: reduce) {
  .sweep-wedge, .pop-wedge {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 4: Verify Variant A visually**

Open the dashboard. The cheese wheel should now animate with a continuous trailing sweep — wedges fade in one by one around the wheel, earlier wedges fade out as later ones appear. ~3 wedges visible at any time. No visible "restart" moment.

Check:
- The sweep moves clockwise
- Approximately 3 wedges are visible at once
- The animation loops seamlessly — no visible "restart" or flicker
- The holes remain static (they don't animate). Holes over invisible wedge areas may appear to float — this is expected and acceptable per spec (they're very subtle at 15-30% opacity)
- "Preparing your report..." text is static below

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CheeseLoader.tsx
git commit -m "feat: add Variant A (trailing sweep) animation to CheeseLoader"
```

---

### Task 3: Add Variant B — Slice Cut + Separate animation

**Files:**
- Modify: `client/src/components/CheeseLoader.tsx`

- [ ] **Step 1: Add slice-pop keyframes**

Add the Variant B keyframes inside the existing `<style>` block (after the `.sweep-wedge` rule, before the `@media` query).

Each wedge gets its own `@keyframes` with pre-computed translate values baked in:
- WHY separate keyframes per wedge: each wedge translates along its own radial angle (8px at 30/90/150/210/270/330 degrees). CSS custom properties on `@keyframes` transforms are poorly supported in some browsers, so we hardcode the 6 variants.
- Formula: `translate(8 * sin(angle), -8 * cos(angle))`

```css
.pop-wedge {
  transform-origin: 40px 40px;
  animation-duration: 3.9s;
  animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
  animation-iteration-count: infinite;
  animation-fill-mode: both;
}
@keyframes pop-0 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(4px,-6.9px) rotate(3deg); }
  9% { transform: translate(4px,-6.9px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
@keyframes pop-1 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(8px,0px) rotate(3deg); }
  9% { transform: translate(8px,0px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
@keyframes pop-2 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(4px,6.9px) rotate(3deg); }
  9% { transform: translate(4px,6.9px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
@keyframes pop-3 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(-4px,6.9px) rotate(3deg); }
  9% { transform: translate(-4px,6.9px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
@keyframes pop-4 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(-8px,0px) rotate(3deg); }
  9% { transform: translate(-8px,0px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
@keyframes pop-5 {
  0% { transform: translate(0,0) rotate(0); }
  6.5% { transform: translate(-4px,-6.9px) rotate(3deg); }
  9% { transform: translate(-4px,-6.9px) rotate(3deg); }
  15.5% { transform: translate(0,0) rotate(0); }
  100% { transform: translate(0,0) rotate(0); }
}
```

- [ ] **Step 2: Update wedge rendering for Variant B**

Update the wedge `<path>` rendering to handle both variants:

```tsx
{WEDGE_PATHS.map((d, i) => {
  const isSweep = variant === 'slice-reveal';
  return (
    <path
      key={i}
      d={d}
      fill="url(#cheese-gradient)"
      stroke="#B8912E"
      strokeWidth="0.5"
      className={isSweep ? 'sweep-wedge' : 'pop-wedge'}
      style={isSweep
        ? { animationDelay: `${i * 0.6}s` }
        : { animationName: `pop-${i}`, animationDelay: `${i * 0.65}s` }
      }
    />
  );
})}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 4: Verify Variant B visually**

To test Variant B, temporarily change the default prop or pass `variant="slice-cut"` in `ReportTableWidget.tsx` line 141:

```tsx
{query.isLoading && <CheeseLoader variant="slice-cut" />}
```

Open the dashboard. The cheese wheel should be fully visible, with one wedge at a time popping outward (translating + rotating slightly), then retracting. The pop should have a slight overshoot (organic, physical feel). Wedges pop in clockwise order.

Check:
- All 6 wedges are visible at rest
- Only one wedge pops out at a time
- The pop has a slight overshoot on the outward motion
- Rotation pivots around the wheel center (not the wedge's own corner)
- The loop is seamless — no visible gap between last and first wedge

**After verifying, revert `ReportTableWidget.tsx` back to `<CheeseLoader />`** (no variant prop — defaults to `slice-reveal`).

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CheeseLoader.tsx
git commit -m "feat: add Variant B (slice cut + separate) animation to CheeseLoader"
```

---

### Task 4: Final verification and cleanup

**Files:**
- Verify: `client/src/components/CheeseLoader.tsx`

- [ ] **Step 1: Verify file is under 200 lines**

Run: `wc -l client/src/components/CheeseLoader.tsx`
Expected: Under 200 lines. If over, the CSS keyframes for Variant B's 6 individual `@keyframes` blocks may push it. If so, consider consolidating using CSS custom properties — but only if needed.

- [ ] **Step 2: Verify TypeScript build**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify both variants render correctly**

Test Variant A (default):
```tsx
{query.isLoading && <CheeseLoader />}
```
- Trailing sweep, ~3 wedges visible, seamless loop

Test Variant B:
```tsx
{query.isLoading && <CheeseLoader variant="slice-cut" />}
```
- Full wheel, one wedge pops at a time, overshoot feel

**Revert to default (no variant prop) after testing.**

- [ ] **Step 4: Verify accessibility attributes**

Inspect the DOM (browser DevTools Elements panel or accessibility inspector). Verify:
- The outer `<div>` has `role="status"` and `aria-label="Loading data"`
- Screen readers would announce this as a loading state

- [ ] **Step 5: Test reduced motion**

In Chrome DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`.

Expected: The cheese wheel renders fully visible with no animation. "Preparing your report..." text still shows. The table skeleton shimmer may still animate (that's OK — it uses its own keyframe in `index.css`).

- [ ] **Step 6: Test in Airtable iframe context**

If possible, check the production deploy in the Airtable iframe at `https://airtable.com/appjwOgR4HsXeGIda/paghFfcwBwoGt6PA7`. The inline SVG should render correctly — no cross-origin issues since everything is inline (no external SVG references).

- [ ] **Step 7: Final commit if any cleanup was needed**

```bash
git add client/src/components/CheeseLoader.tsx
git commit -m "feat: finalize CheeseLoader with both animation variants"
```
