# Spec: Dashboard Header Cleanup & Tab Styling

## Problem

The dashboard has excessive title repetition and a blue tab style that doesn't match the Apple-premium design language.

**Current visual hierarchy (top to bottom):**

1. "Reports > Purchasing" — Airtable's interface breadcrumb (outside iframe, not ours)
2. "Purchasing Reports" — DepartmentLayout h1 (department name)
3. "BBD — Best By Dates" — NavTabs selected tab (blue text + light blue pill)
4. "BBD — Best By Dates" — PageRenderer h2 (page heading)
5. "BBD — Best By Dates" — WidgetShell h3 (widget card title)

Items 3, 4, and 5 show the same text. Item 4 is pure redundancy — the tab already identifies the current page, and the widget card has its own title.

The selected tab uses `#007AFF` blue with a `bg-primary/10` tinted pill. This looks generic and doesn't match the neutral, premium aesthetic of macOS segmented controls.

## Changes

### 1. Remove page heading from PageRenderer

**File:** `client/src/components/PageRenderer.tsx`

Remove the `<h2>` element that renders `page.name`. The component should render only the widget grid.

**Before:**
```tsx
<div>
  <h2 className="text-[28px] font-bold tracking-tight text-slate-900 mb-6">
    {page.name}
  </h2>
  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
    ...
  </div>
</div>
```

**After:**
```tsx
<div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
  ...
</div>
```

The wrapping `<div>` is no longer needed — the grid becomes the root element.

**New visual hierarchy:**
```
Department name (h1) → Tab bar → Widget card title (h3)
```

### 2. Neutral segmented tab styling in NavTabs

**File:** `client/src/components/NavTabs.tsx`

Replace the blue-tinted active tab with a macOS-style neutral segmented control.

**Before (current NavTabs return block):**
```tsx
<nav className="flex gap-1 -mb-px">
  {pages.map((page) => {
    const isActive = currentPath === page.path || currentPath === page.path + '/';
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
            transition={reduced ? { duration: 0 } : EASE_DEFAULT}
            layout={!reduced}
          />
        )}
        <span className="relative z-10">{page.name}</span>
      </Link>
    );
  })}
</nav>
```

**After:**
```tsx
<nav className="flex gap-1 -mb-px">
  {pages.map((page) => {
    const isActive = currentPath === page.path || currentPath === page.path + '/';
    return (
      <Link
        key={page.id}
        to={page.path}
        className={`relative pb-3 px-3 text-sm transition-colors duration-150 ${
          isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="nav-indicator"
            className="absolute inset-0 bottom-1 bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
            transition={reduced ? { duration: 0 } : EASE_DEFAULT}
            layout={!reduced}
          />
        )}
        <span className="relative z-10">{page.name}</span>
      </Link>
    );
  })}
</nav>
```

**Key changes explained:**
- `font-medium` moved from shared classes into the inactive branch; `font-semibold` used for active
- `text-primary` replaced with `text-slate-900` (neutral dark)
- `bg-primary/10` replaced with `bg-white` + `border border-slate-200/60` + shadow
- `bottom-1` offset on the pill is preserved — it prevents the pill from overlapping the header's bottom border
- WHY shadow is `0.08` not `0.04`: the tab pill needs slightly more visual weight than cards to appear "raised" above the header background, since it sits on a white-on-white surface

**Inactive tab (unchanged):**
- Text: `text-slate-500`
- Hover: `text-slate-700`

**Animation:** The Framer Motion `layoutId` sliding pill stays. It animates the white pill between tabs instead of the blue one.

## What stays the same

- Department name (h1) in DepartmentLayout header
- WidgetShell card title (h3)
- Tab bar position (below department name, inside header)
- Airtable breadcrumb (outside our control, kept for consistency)
- All widget content, filter UI, table layout
- Framer Motion tab animation

## Files changed

| File | Change |
|------|--------|
| `client/src/components/PageRenderer.tsx` | Remove h2 heading, simplify wrapper div |
| `client/src/components/NavTabs.tsx` | Update active tab classes to neutral style |

## Verification

1. `cd client && npx tsc -b --noEmit` — TypeScript check
2. Start dev server, navigate to `/purchasing/bbd`
3. Confirm "BBD — Best By Dates" appears only twice: tab + widget card (not three times)
4. Confirm selected tab has white background, dark text, subtle shadow — no blue
5. Switch between tabs — pill animation should slide smoothly
6. Navigate to `/food-safety/receiving-log` — same behavior
