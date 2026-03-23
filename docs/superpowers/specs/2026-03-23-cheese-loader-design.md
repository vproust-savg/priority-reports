# CheeseLoader Animation Design Spec

## Problem

The Priority ERP Dashboard needs a branded loading animation to replace the generic spinner + skeleton. The dashboard serves a cheese industry food safety team, so a cheese wheel is on-brand. The animation must feel premium and minimal (Apple/Stripe aesthetic), not cartoonish.

## Solution

A self-contained `<CheeseLoader />` React component rendering an SVG cheese wheel with pure CSS keyframe animation. Two animation variants are built side-by-side for comparison — once a winner is chosen, the other variant's code and the `variant` prop are deleted.

## Component

**File:** `client/src/components/CheeseLoader.tsx`

**Props:** `variant?: 'slice-reveal' | 'slice-cut'` (default: `'slice-reveal'`)

**Rendered by:** `ReportTableWidget.tsx` when `query.isLoading` is true.

**No external dependencies.** Pure SVG + CSS `@keyframes`. No Framer Motion (keep lightweight during data fetching).

## Visual Design

### Cheese Wheel

- **Shape:** Circle, 96px rendered size (viewBox stays `0 0 80 80`, rendered at `width="96" height="96"`)
- **Segments:** 6 equal wedges (60deg each), drawn as SVG `<path>` elements using arc math
- **Depth:** SVG `<radialGradient>` on wedges — lighter gold at center, slightly darker at outer edge — creates the illusion of a rounded wheel surface
- **Shadow:** CSS `filter: drop-shadow(0 2px 8px rgba(180, 140, 50, 0.15))` on the SVG element lifts the wheel off the page
- **Holes:** 7-8 small circles (r=1.5 to r=3) with varying opacity (0.15-0.3), filled with lighter gold (`#E0BE6A` at 20-30% opacity) for depth texture — NOT opaque white cutouts. Thin `#C49B38` stroke ring (0.3px) for subtle definition. Some partially hidden under wedge edges for organic feel.
- **Centered:** Flexbox centered horizontally, `py-16` vertical padding in the widget area

### Color Palette

| Element | Color | Note |
|---------|-------|------|
| Wedge gradient center | `#DCBA5C` | Lighter gold — catches "light" at center |
| Wedge gradient edge | `#C89A30` | Darker gold — shadow at rim |
| Wedge stroke | `#B8912E` | Darker gold outline between slices |
| Hole fill | `#E0BE6A` at 20-30% opacity | Subtle depth impression, not cartoon cutout |
| Hole stroke | `#C49B38` at 0.3px | Thin ring for definition |
| Text | `text-slate-500` | Matches dashboard's neutral text |

### SVG Gradient Definition

```svg
<defs>
  <radialGradient id="cheese-gradient" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#DCBA5C" />
    <stop offset="100%" stop-color="#C89A30" />
  </radialGradient>
</defs>
```

All wedge `<path>` elements use `fill="url(#cheese-gradient)"`.

### Text Label

- **"Preparing your report..."** in `text-sm text-slate-500`
- Below the wheel, `mt-4` spacing
- Static text, no animation on the label

## Animation Variants

### Variant A: Continuous Trailing Sweep

**Concept:** Wedges fade in one by one around the wheel, then the earliest wedges begin fading out as new ones appear — creating a trailing "sweep" that circles endlessly. No visible reset. ~3 wedges fully visible at any time (plus 1 transitioning).

**Mechanics:**
1. Each wedge has a single `@keyframes` animation that handles its full lifecycle:
   - 0%: `opacity: 0`
   - 8%: `opacity: 1` (fade in over ~0.3s)
   - 58%: `opacity: 1` (hold visible — ~3 wedges on screen at any moment)
   - 67%: `opacity: 0` (fade out over ~0.3s)
   - 100%: `opacity: 0` (stay hidden until next cycle)
2. Each wedge uses the same keyframes but with staggered `animation-delay`:
   - Wedge 1: 0s
   - Wedge 2: 0.6s
   - Wedge 3: 1.2s
   - Wedge 4: 1.8s
   - Wedge 5: 2.4s
   - Wedge 6: 3.0s
3. `animation-duration: 3.6s`, `animation-iteration-count: infinite`
4. `animation-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1)` (matches project's `EASE_DEFAULT`)

**Total cycle:** 3.6s (seamless — no visible restart)
**CSS approach:** Single `@keyframes cheese-sweep` applied to all wedges with different `animation-delay`. `animation-fill-mode: both`.

**Feel:** Hypnotic, infinite, premium — like a clock hand made of glowing wedges sweeping around.

### Variant B: Slice Cut + Separate

**Concept:** The full wheel is always visible. One wedge at a time "pops out" — translates outward along its radial angle with a slight overshoot — then smoothly retracts. The next wedge does the same.

**Mechanics:**
1. All 6 wedges rendered at full opacity
2. One wedge animates outward:
   - Translates ~8px along its radial center angle
   - Slight 3deg rotation for organic feel
   - `transform-origin: 40px 40px` (wheel center) on every wedge — so rotation pivots correctly
   - Pop occupies first ~15% of the keyframe cycle, rest is idle
3. After retraction, next wedge (clockwise) does the same
4. Each wedge's animation is offset by `animation-delay`: 0s, 0.65s, 1.3s, 1.95s, 2.6s, 3.25s
5. After all 6 wedges cycle, seamless loop restart

**Keyframe structure** (`animation-duration: 3.9s`, `animation-iteration-count: infinite`):
```css
@keyframes slice-pop {
  0%    { transform: translate(0, 0) rotate(0); }
  6.5%  { transform: translate(Xpx, Ypx) rotate(3deg); } /* pop out */
  9%    { transform: translate(Xpx, Ypx) rotate(3deg); } /* hold */
  15.5% { transform: translate(0, 0) rotate(0); }         /* retract */
  100%  { transform: translate(0, 0) rotate(0); }         /* idle */
}
```
`animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1)` (slight overshoot — physical, organic feel).

**Total cycle:** 3.9s
**CSS approach:** Each wedge `<path>` has the same `@keyframes slice-pop` but with unique translate values baked into the keyframe (or via CSS custom properties). `animation-delay` for round-robin sequencing.

**Pre-computed translate values** (8px along each wedge's radial center angle):

| Wedge | Center angle | translate(x, y) |
|-------|-------------|-----------------|
| 1 | 30deg | `translate(4px, -6.9px)` |
| 2 | 90deg | `translate(8px, 0px)` |
| 3 | 150deg | `translate(4px, 6.9px)` |
| 4 | 210deg | `translate(-4px, 6.9px)` |
| 5 | 270deg | `translate(-8px, 0px)` |
| 6 | 330deg | `translate(-4px, -6.9px)` |

**Feel:** "Being served" — someone is selecting and cutting portions of cheese.

## SVG Structure

```svg
<svg viewBox="0 0 80 80" width="96" height="96"
     style="filter: drop-shadow(0 2px 8px rgba(180, 140, 50, 0.15))">
  <defs>
    <radialGradient id="cheese-gradient" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#DCBA5C" />
      <stop offset="100%" stop-color="#C89A30" />
    </radialGradient>
  </defs>

  <!-- Wedge group (6 paths, one per 60deg segment) -->
  <g>
    <path d="M40,40 L40,4 A36,36 0 0,1 71.18,22 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
    <path d="M40,40 L71.18,22 A36,36 0 0,1 71.18,58 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
    <path d="M40,40 L71.18,58 A36,36 0 0,1 40,76 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
    <path d="M40,40 L40,76 A36,36 0 0,1 8.82,58 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
    <path d="M40,40 L8.82,58 A36,36 0 0,1 8.82,22 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
    <path d="M40,40 L8.82,22 A36,36 0 0,1 40,4 Z"
          fill="url(#cheese-gradient)" stroke="#B8912E" stroke-width="0.5" />
  </g>

  <!-- Cheese holes — subtle texture, not cartoon cutouts -->
  <circle cx="48" cy="18" r="2.5" fill="#E0BE6A" fill-opacity="0.25"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="58" cy="32" r="2" fill="#E0BE6A" fill-opacity="0.2"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="55" cy="48" r="3" fill="#E0BE6A" fill-opacity="0.3"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="35" cy="25" r="1.5" fill="#E0BE6A" fill-opacity="0.15"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="28" cy="42" r="2.5" fill="#E0BE6A" fill-opacity="0.25"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="42" cy="58" r="2" fill="#E0BE6A" fill-opacity="0.2"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="22" cy="55" r="1.5" fill="#E0BE6A" fill-opacity="0.15"
          stroke="#C49B38" stroke-width="0.3" />
  <circle cx="50" cy="24" r="1.5" fill="#E0BE6A" fill-opacity="0.2"
          stroke="#C49B38" stroke-width="0.3" />
</svg>
```

Arc coordinates are approximate — exact values computed with `Math.cos`/`Math.sin` in the component.

**Note on holes in Variant A:** When only ~3 wedges are visible, holes over invisible wedges will appear floating. This is acceptable — the holes are very subtle (15-30% opacity) and won't be noticeable.

**Note on gradient ID:** `id="cheese-gradient"` is a global SVG ID. Only one `<CheeseLoader />` renders at a time in the current architecture, so collisions aren't a concern. If multiple loaders ever coexist, use React's `useId()` for uniqueness.

## Accessibility

- **`prefers-reduced-motion`:** When active, render the full cheese wheel statically (no animation). The "Preparing your report..." text remains.
- **`aria-label="Loading data"`** on the container
- **`role="status"`** so screen readers announce loading state
- No `aria-hidden` — the loading state should be announced

## Integration

### Current state (placeholder)

```tsx
// CheeseLoader.tsx — currently a basic spinner
{query.isLoading && <CheeseLoader />}
```

### After implementation

Same render location. The component is a drop-in replacement:

```tsx
// ReportTableWidget.tsx — no changes needed to the consumer
{query.isLoading && <CheeseLoader />}
```

To compare variants during development:

```tsx
{query.isLoading && <CheeseLoader variant="slice-reveal" />}
// or
{query.isLoading && <CheeseLoader variant="slice-cut" />}
```

### TableSkeleton

The existing `<TableSkeleton />` shimmer effect (8 placeholder rows with sweep animation) is rendered inside CheeseLoader below the cheese wheel. Wrap it in a div with `opacity-50` to establish visual hierarchy — the cheese wheel is the primary loading indicator, the skeleton is secondary context.

## Performance

- **No JavaScript animation runtime.** CSS `@keyframes` run on the compositor thread.
- **No Framer Motion import.** Avoids loading animation library during data fetch.
- **Static SVG paths.** No dynamic path calculation at runtime — wedge coordinates are hardcoded.
- **Single `<svg>` element.** Minimal DOM nodes (~20 total: 6 paths + 8 circles + defs + wrapper elements).
- **Compositor-friendly properties.** Animations use only `opacity` and `transform` — no layout triggers.

## Files Changed

| Action | File | What |
|--------|------|------|
| Rewrite | `client/src/components/CheeseLoader.tsx` | Replace spinner with SVG cheese wheel + CSS animations |
| No change | `client/src/components/TableSkeleton.tsx` | Kept as-is, rendered below cheese wheel at 50% opacity |
| No change | `client/src/components/widgets/ReportTableWidget.tsx` | Already renders `<CheeseLoader />` |
| No change | `client/src/index.css` | Shimmer keyframe already defined |

## Success Criteria

1. Cheese wheel renders centered in the loading area with warm gold gradient and subtle drop shadow
2. Holes read as natural texture, not cartoon Swiss cheese cutouts
3. Both animation variants work and are switchable via prop
4. Variant A sweeps continuously with no visible reset/restart
5. Variant B slice pop-out has organic overshoot feel
6. Animation is smooth (60fps) with no jank — uses only opacity + transform
7. Respects `prefers-reduced-motion` — shows static wheel
8. Screen readers announce "Loading data" via `role="status"`
9. No Framer Motion or external library dependencies
10. Works in Airtable iframe embed (no cross-origin issues with inline SVG)
11. Total component under 200 lines
