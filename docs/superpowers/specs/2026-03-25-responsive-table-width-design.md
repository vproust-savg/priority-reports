# Spec: Responsive Table Width for Multi-Screen Support

## Context

The dashboard is embedded in an Airtable iframe. The layout container uses `max-w-7xl` (1280px), which wastes significant horizontal space on larger screens:

| Screen | Iframe width | Current usable | Wasted |
|--------|-------------|---------------|--------|
| 13" MacBook | ~1200px | ~1152px | ~0px |
| 27" iMac | ~2344px | ~1232px | **~1064px (45%)** |

Users on 27" and 32" screens see the report table cut off or horizontally scrolling despite having ample screen space. Columns like "Vendor" and "Part Description" are truncated unnecessarily.

## Design Decision

**Replace `max-w-7xl` (1280px) with `max-w-[2400px]`** in `DepartmentLayout.tsx`.

### Why 2400px?

- Fills the iframe on 27" screens (2344px iframe → 2296px content area)
- Acts as a safety cap for ultrawide monitors (32"+, 3440px+) to prevent columns from stretching excessively
- The browser's `table-layout: auto` algorithm distributes extra width proportionally to content length — short columns ("Unit", "Days Left") get modest expansion while long columns ("Part Description", "Vendor") absorb most of the extra space

### Why not remove the cap entirely?

On ultrawide monitors (3440px+), removing the cap would make narrow-data columns like "Unit" and "Days Left" uncomfortably wide. The 2400px cap prevents this edge case while being wide enough for all standard monitor sizes.

## Change

**Single file:** `client/src/components/DepartmentLayout.tsx`

**Line 32 (header):**
```diff
- <div className="max-w-7xl mx-auto px-6">
+ <div className="max-w-[2400px] mx-auto px-6">
```

**Line 55 (main content):**
```diff
- <main className="max-w-7xl mx-auto px-6 py-6">
+ <main className="max-w-[2400px] mx-auto px-6 py-6">
```

No other files change. The table (`w-full`), toolbar, filters, pagination, and header all use flexible layout — they expand naturally within the wider container.

## Effect by Screen Size

| Screen | Iframe width | New usable width | Improvement |
|--------|-------------|-----------------|-------------|
| 13" MacBook | ~1200px | ~1152px (scroll if needed) | No change |
| 15" MacBook | ~1440px | ~1392px | +112px (+9%) |
| 27" iMac | ~2344px | ~2296px | **+1016px (+80%)** |
| 32" / ultrawide | 2400px+ | 2352px (cap) | **+1072px (+84%)** |

## Scope

- Both reports (BBD — Best By Dates, GRV Log) benefit equally since they share `DepartmentLayout`
- Header, breadcrumbs, page title, and table all align at the same wider edge
- Horizontal scrolling on 13" screens remains available via `overflow-x-auto` on the table container
- At sub-1200px viewports (tablets, narrow browser windows), behavior is unchanged — the container never reached the old 1280px cap anyway
- Excel export is unaffected — export goes through server-side generation, not CSS layout

## Verification

1. `cd client && npx tsc -b --noEmit` — TypeScript check (should pass, no type changes)
2. Start dev servers, open the app at different viewport widths:
   - 1200px: table should scroll horizontally if needed (no regression)
   - 1600px: table should use available width without cutoff
   - 2400px+: table should cap at 2400px container width, centered
3. Check in Airtable iframe embed on a wide screen — table should fill the available space
4. Verify both reports (Purchasing > BBD, Food Safety > GRV Log)
