# SG Interface Visual Redesign

## Context

The Priority Reports dashboard currently uses an Apple/Stripe blue aesthetic (`#007AFF` primary, Tailwind slate neutrals, `#f8fafc` page background). We're replacing it with the SG Interface design system — a warm gold/cream visual identity (`#b8a88a` gold accents, `#f5f1eb` cream page background, `#2c2a26` dark active states).

**Why:** Visual consistency across all SG Interface products. The Sales Dashboard v1 already uses SG Interface — Priority Reports should match.

**Layout stays the same.** Top nav tabs + full-width widget grid. Only the visual layer changes.

---

## Scope

Full visual overhaul:
- Replace entire CSS token layer (`index.css` `@theme` block)
- Update all component Tailwind classes from slate/blue to SG Interface tokens
- Redesign toolbar from labeled pill buttons → icon-based (matching Sales Dashboard v1)
- Update scrollbar, focus rings, skeleton shimmer, status row colors
- Animation constants unchanged (already aligned with SG philosophy)

---

## Token Replacement

### File: `client/src/index.css`

Replace the current `@theme` block and global styles with the SG Interface tokens from `sg-tokens.css`. Key changes:

| Token | Current | SG Interface |
|-------|---------|-------------|
| `--color-primary` | `#007AFF` | **Removed** — replaced by `--color-gold-primary` for accents, `--color-dark` for active states |
| Page background | `bg-slate-50` (hardcoded) | `var(--color-bg-page)` = `#f5f1eb` |
| Card background | `bg-white` (hardcoded) | `var(--color-bg-card)` = `#ffffff` |
| Borders | `border-slate-200/60` | `border-[var(--color-gold-subtle)]` = `#f0ece5` |
| Light borders | `border-slate-100` | `border-[var(--color-gold-subtle)]` |
| Text primary | `text-slate-900` | `text-[var(--color-text-primary)]` = `#1a1a1a` |
| Text secondary | `text-slate-600` / `text-slate-500` | `text-[var(--color-text-secondary)]` = `#555555` |
| Text muted | `text-slate-400` | `text-[var(--color-text-muted)]` = `#999999` |
| Focus ring | Browser default | `2px solid var(--color-gold-primary)`, offset 2px |
| Scrollbar thumb | `#cbd5e1` → `#94a3b8` | `var(--color-gold-light)` on `var(--color-gold-subtle)` track |
| Skeleton shimmer | slate-based gradient | `gold-subtle` → `gold-hover` → `gold-subtle` |

### New tokens added (full SG Interface set):
- Gold scale: `--color-gold-hover`, `--color-gold-subtle`, `--color-gold-muted`, `--color-gold-light`, `--color-gold-primary`
- Dark pair: `--color-dark`, `--color-dark-hover`
- Text scale: `--color-text-primary`, `--color-text-secondary`, `--color-text-muted`, `--color-text-faint`
- Semantic: `--color-green`, `--color-red`, `--color-yellow`, `--color-blue`
- Spacing scale: `--spacing-2xs` through `--spacing-4xl`
- Radius scale: `--radius-xs` through `--radius-3xl`
- Shadows: `--shadow-card`, `--shadow-active`, `--shadow-dropdown`, `--shadow-glow`

---

## Component-by-Component Changes

### 1. `DepartmentLayout.tsx`
- Page container: `bg-slate-50` → `bg-[var(--color-bg-page)]`
- Header text: `text-slate-900` → `text-[var(--color-text-primary)]`
- Header border: `border-slate-200/60` → `border-[var(--color-gold-subtle)]`

### 2. `WidgetShell.tsx`
- Card: remove `border border-slate-200/60`, keep `shadow-[var(--shadow-card)]` only (SG Interface cards are borderless)
- Title: `text-slate-600` → `text-[var(--color-text-muted)]`
- Title border: `border-slate-100` → `border-[var(--color-gold-subtle)]`

### 3. `NavTabs.tsx`
- Active tab: white pill with border → `bg-[var(--color-dark)] text-white` pill
- Inactive text: `text-slate-500` → `text-[var(--color-text-muted)]`
- Active text: `text-slate-900 font-semibold` → `text-white font-semibold`
- Tab container border: use `border-[var(--color-gold-subtle)]`
- Active indicator: sliding pill gets `bg-[var(--color-dark)]` instead of white

### 4. `TableToolbar.tsx` — REDESIGN
Replace labeled pill buttons with icon-based toolbar matching Sales Dashboard v1 `ItemsToolbar.tsx`.

**New pattern:**
- 28px round icon buttons with SVG icons
- Three states: default (subtle border + muted icon), active/has-badge (gold border + gold icon), open (gold-primary fill + white icon)
- Badge: gold-primary circle with count, positioned top-right
- Expandable search bar (28px collapsed → 180px expanded)
- Inline expanding panels with AnimatePresence height animation
- Click-outside handler to close panels
- Right-aligned: filter count display ("X of Y"), refresh, extend, export icons

**Reference:** Sales Dashboard v1 `ItemsToolbar.tsx` (lines 56–98) and `ToolbarIcon` component (lines 154–182).

**Keep:** All existing functionality (filter, columns, sort, refresh, export, bulk extend). Just change the visual presentation.

### 5. `ReportTable.tsx`
- Header text: current uppercase slate-400 → `text-[11px] font-semibold uppercase text-[var(--color-text-muted)]`
- Header border: `border-slate-200` → `border-[var(--color-gold-subtle)]`
- Row dividers: use `border-[var(--color-bg-page)]` (cream separator, like Sales Dashboard v1)
- Row hover: `hover:bg-blue-50/60` → `hover:bg-[var(--color-gold-hover)]`
- Alternating rows: `bg-slate-50/30` → remove (Sales Dashboard doesn't use alternating)
- Status rows stay: red/orange/amber borders + tinted backgrounds (keep current semantic colors)

### 6. `Pagination.tsx`
- Button text: `text-primary` → `text-[var(--color-text-primary)]`
- Button bg: `bg-primary/5` → `border border-[var(--color-gold-subtle)]`
- Hover: `hover:bg-primary/10` → `hover:bg-[var(--color-gold-hover)]`
- Disabled: `text-slate-300` → `text-[var(--color-text-faint)]`
- Record count: `text-slate-400` → `text-[var(--color-text-muted)]`

### 7. `FilterBuilder.tsx`
- Panel bg: `bg-white border-b border-slate-200` → `bg-[var(--color-bg-card)] border-b border-[var(--color-gold-subtle)]`
- Add links: `text-primary` → `text-[var(--color-gold-primary)]`
- Input borders: `border-slate-200` → `border-[var(--color-gold-subtle)]`
- Input focus: `ring-primary/20 border-primary` → `ring-[var(--color-gold-primary)]/20 border-[var(--color-gold-primary)]`

### 8. `ColumnManagerPanel.tsx`
- Same border/bg pattern as FilterBuilder
- Checkbox active: blue → `bg-[var(--color-gold-primary)]`
- Drag handle: `text-slate-300` → `text-[var(--color-text-faint)]`

### 9. `SortPanel.tsx`
- Same border/bg pattern as FilterBuilder
- Active sort indicator: blue → `text-[var(--color-gold-primary)]`

### 10. `Modal.tsx`
- Backdrop: `bg-black/50` → keep as-is (works with both palettes)
- Content border-radius: `rounded-2xl` → `rounded-[var(--radius-3xl)]`
- Close button: `text-slate-400 hover:text-slate-600` → `text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]`

### 11. `Toast.tsx`
- Border: `border-slate-200/60` → `border-[var(--color-gold-subtle)]`
- Success icon: `text-emerald-500` → `text-[var(--color-green)]`
- Error icon: `text-red-500` → `text-[var(--color-red)]`

### 12. `EmptyState.tsx` / `ErrorState.tsx`
- Icon/text colors: slate variants → SG Interface text scale tokens

### 13. `TableSkeleton.tsx`
- Shimmer animation: should use `.skeleton` CSS class from new tokens

### 14. Cell Components (`CopyableCell.tsx`, `ExpiryDateCell.tsx`)
- Any hardcoded slate colors → SG Interface tokens
- Status semantic colors stay the same

### 15. `filterConstants.ts`
- If any hardcoded color classes exist, update to SG tokens

---

## Animation Constants — No Changes

`animationConstants.ts` already follows the same philosophy (simple ease-out, no springs, 150-250ms). No modifications needed.

---

## Files Modified (complete list)

| File | Change Type |
|------|-------------|
| `client/src/index.css` | **Full rewrite** of `@theme` + global styles |
| `client/src/components/DepartmentLayout.tsx` | Color class updates |
| `client/src/components/WidgetShell.tsx` | Remove borders, update colors |
| `client/src/components/NavTabs.tsx` | Active state redesign (dark pill) |
| `client/src/components/TableToolbar.tsx` | **Redesign** → icon-based toolbar |
| `client/src/components/ReportTable.tsx` | Row/header color updates |
| `client/src/components/Pagination.tsx` | Color class updates |
| `client/src/components/filter/FilterBuilder.tsx` | Color class updates |
| `client/src/components/filter/FilterConditionRow.tsx` | Color class updates |
| `client/src/components/filter/FilterGroupPanel.tsx` | Color class updates |
| `client/src/components/filter/FilterValueInput.tsx` | Color class updates |
| `client/src/components/filter/WeekPicker.tsx` | Color class updates |
| `client/src/components/filter/WeekPickerDropdown.tsx` | Color class updates |
| `client/src/components/columns/ColumnManagerPanel.tsx` | Color class updates |
| `client/src/components/columns/ColumnRow.tsx` | Color class updates |
| `client/src/components/sort/SortPanel.tsx` | Color class updates |
| `client/src/components/sort/SortRuleRow.tsx` | Color class updates |
| `client/src/components/modals/Modal.tsx` | Color class updates |
| `client/src/components/modals/ExtendExpiryModal.tsx` | Color class updates |
| `client/src/components/modals/BulkExtendModal.tsx` | Color class updates |
| `client/src/components/modals/BulkExtendRowTable.tsx` | Color class updates |
| `client/src/components/cells/CopyableCell.tsx` | Color class updates |
| `client/src/components/cells/ExpiryDateCell.tsx` | Color class updates |
| `client/src/components/Toast.tsx` | Color class updates |
| `client/src/components/EmptyState.tsx` | Color class updates |
| `client/src/components/ErrorState.tsx` | Color class updates |
| `client/src/components/LoadingToast.tsx` | Color class updates |
| `client/src/components/TableSkeleton.tsx` | Use `.skeleton` class |
| `client/src/components/details/BbdDetailPanel.tsx` | Color class updates |

---

## Verification

### Automated checks (run after implementation)
```bash
# Zero hardcoded hex colors (all should use var(--))
grep -rn '#[0-9a-fA-F]\{6\}' client/src/ --include='*.tsx' --include='*.ts' | grep -v 'var(--' | grep -v 'node_modules'

# Zero old palette references (slate, blue, text-primary, bg-primary)
grep -rn 'slate-\|blue-\|text-primary\|bg-primary' client/src/ --include='*.tsx' --include='*.ts' | grep -v 'color-text-primary'

# Zero hardcoded spacing (should use var(--)
grep -rn 'p-\[.*px\]\|m-\[.*px\]\|gap-\[.*px\]' client/src/ --include='*.tsx' | grep -v 'var(--'

# TypeScript build passes
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
```

### Visual checks (browser)
1. Page background is warm cream (`#f5f1eb`), not white or cool gray
2. Cards have no visible border — shadow-only
3. Active nav tab is dark (`#2c2a26`) with white text
4. Toolbar uses round icon buttons, not labeled pills
5. Focus rings are gold (`#b8a88a`)
6. Scrollbar is gold-tinted (4px, subtle track)
7. Table row hover is warm (`gold-hover`), not blue
8. Status rows (expired/expiring) still show red/orange/amber
9. Skeleton loading uses gold-tinted shimmer
10. Financial numbers are tabular-aligned

### Production check
- Build Docker image locally and verify
- Check in Airtable iframe embed (JPEG compression makes light colors invisible — ensure text passes `text-[var(--color-text-secondary)]` minimum for important content)
