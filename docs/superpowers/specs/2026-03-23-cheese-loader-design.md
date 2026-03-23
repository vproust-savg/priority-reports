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

- **Shape:** Circle, ~80px diameter
- **Segments:** 6 equal wedges (60deg each), drawn as SVG `<path>` elements using arc math
- **Holes:** 4-5 small elliptical cutouts (SVG `<circle>` elements with fill matching background) scattered across the wheel for Swiss cheese texture
- **Centered:** Flexbox centered horizontally, `py-12` vertical padding in the widget area

### Color Palette

| Element | Color | Note |
|---------|-------|------|
| Wedge fill | `#D4A843` | Muted gold — aged Comte/Gruyere |
| Wedge stroke | `#B8912E` | Darker gold outline between slices |
| Hole fill | `white` | Punches through to background (transparent cutout) |
| Hole inner ring | `#C49B38` | 0.5px stroke around holes for subtle depth shadow |
| Text | `text-slate-500` | Matches dashboard's neutral text |

### Text Label

- "Loading..." in `text-sm text-slate-500`
- Below the wheel, `mt-3` spacing
- Static text, no animation on the label

## Animation Variants

### Variant A: Progressive Slice Reveal

**Concept:** Wedges appear one by one, building up the complete wheel, then the whole wheel fades out and the cycle restarts.

**Mechanics:**
1. All 6 wedges start at `opacity: 0`
2. Each wedge fades to `opacity: 1` with staggered `animation-delay`:
   - Wedge 1: 0s delay
   - Wedge 2: 0.35s delay
   - Wedge 3: 0.7s delay
   - Wedge 4: 1.05s delay
   - Wedge 5: 1.4s delay
   - Wedge 6: 1.75s delay
3. Each wedge's fade-in takes 0.3s (`ease-out`)
4. After all wedges visible (~2.1s), hold for 0.4s
5. Entire wheel fades out over 0.3s
6. 0.2s pause, then cycle repeats

**Total cycle:** ~3s
**CSS approach:** Individual `@keyframes wedge-reveal` on each wedge `<path>`, using `animation-delay` for stagger and `animation-fill-mode: both` so wedges stay visible after their fade-in completes. A wrapper `@keyframes cycle-fade` handles the full-wheel fade-out/restart.

**Feel:** "Building up" — conveys progress, something is being assembled.

### Variant B: Slice Cut + Separate

**Concept:** The full wheel is always visible. One wedge at a time "pops out" — translates outward along its radial angle — then smoothly retracts. The next wedge does the same.

**Mechanics:**
1. All 6 wedges rendered at full opacity
2. One wedge animates outward:
   - Translates ~6px along its radial center angle (e.g., wedge at 30deg moves along that vector)
   - Slight 2deg rotation for organic feel
   - Duration: 0.6s ease-in-out (0.25s out, 0.1s hold, 0.25s back)
3. After retraction, next wedge (clockwise) does the same
4. Each wedge's animation is offset by `animation-delay`: 0s, 0.65s, 1.3s, 1.95s, 2.6s, 3.25s
5. After all 6 wedges cycle, seamless loop restart

**Total cycle:** ~4s
**CSS approach:** Each wedge `<path>` has its own `@keyframes slice-pop` with `transform: translate(Xpx, Ypx) rotate(2deg)`. `animation-delay` for round-robin sequencing.

**Pre-computed translate values** (6px along each wedge's radial center angle):

| Wedge | Center angle | translate(x, y) |
|-------|-------------|-----------------|
| 1 | 30deg | `translate(3px, -5.2px)` |
| 2 | 90deg | `translate(6px, 0px)` |
| 3 | 150deg | `translate(3px, 5.2px)` |
| 4 | 210deg | `translate(-3px, 5.2px)` |
| 5 | 270deg | `translate(-6px, 0px)` |
| 6 | 330deg | `translate(-3px, -5.2px)` |

**Feel:** "Being served" — someone is selecting and cutting portions of cheese.

## SVG Structure

```svg
<svg viewBox="0 0 80 80" width="80" height="80">
  <!-- Wedge group (6 paths, one per 60deg segment) -->
  <g class="cheese-wedges">
    <path d="M40,40 L40,4 A36,36 0 0,1 71.18,22 Z" /> <!-- 0-60deg -->
    <path d="M40,40 L71.18,22 A36,36 0 0,1 71.18,58 Z" /> <!-- 60-120deg -->
    <path d="M40,40 L71.18,58 A36,36 0 0,1 40,76 Z" />    <!-- 120-180deg -->
    <path d="M40,40 L40,76 A36,36 0 0,1 8.82,58 Z" />      <!-- 180-240deg -->
    <path d="M40,40 L8.82,58 A36,36 0 0,1 8.82,22 Z" />    <!-- 240-300deg -->
    <path d="M40,40 L8.82,22 A36,36 0 0,1 40,4 Z" />       <!-- 300-360deg -->
  </g>

  <!-- Cheese holes (circles placed at fixed positions) -->
  <circle cx="45" cy="20" r="3" />
  <circle cx="55" cy="35" r="2.5" />
  <circle cx="30" cy="30" r="2" />
  <circle cx="50" cy="55" r="3.5" />
  <circle cx="25" cy="50" r="2" />
</svg>
```

Arc coordinates are approximate — exact values computed with `Math.cos`/`Math.sin` in the component. The holes use `fill="white"` (or the container's background color) to punch through.

## Accessibility

- **`prefers-reduced-motion`:** When active, render the full cheese wheel statically (no animation). The "Loading..." text remains.
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

The existing `<TableSkeleton />` shimmer effect (8 placeholder rows with sweep animation) is currently rendered inside CheeseLoader. Keep it below the cheese wheel animation — it provides visual context for "a table is coming here."

## Performance

- **No JavaScript animation runtime.** CSS `@keyframes` run on the compositor thread.
- **No Framer Motion import.** Avoids loading animation library during data fetch.
- **Static SVG paths.** No dynamic path calculation at runtime — wedge coordinates are hardcoded.
- **Single `<svg>` element.** Minimal DOM nodes (~15 total: 6 paths + 5 circles + wrapper elements).

## Files Changed

| Action | File | What |
|--------|------|------|
| Rewrite | `client/src/components/CheeseLoader.tsx` | Replace spinner with SVG cheese wheel + CSS animations |
| No change | `client/src/components/TableSkeleton.tsx` | Kept as-is, rendered below cheese wheel |
| No change | `client/src/components/widgets/ReportTableWidget.tsx` | Already renders `<CheeseLoader />` |
| No change | `client/src/index.css` | Shimmer keyframe already defined |

## Success Criteria

1. Cheese wheel renders centered in the loading area with warm gold colors
2. Both animation variants work and are switchable via prop
3. Animation is smooth (60fps) with no jank
4. Respects `prefers-reduced-motion` — shows static wheel
5. Screen readers announce "Loading data" via `role="status"`
6. No Framer Motion or external library dependencies
7. Works in Airtable iframe embed (no cross-origin issues with SVG)
8. Total component under 200 lines
