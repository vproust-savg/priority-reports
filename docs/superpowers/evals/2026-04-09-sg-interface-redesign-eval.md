# SG Interface Visual Redesign — Evaluation Criteria

**Spec:** `docs/superpowers/specs/2026-04-09-sg-interface-redesign.md`
**Plan:** `docs/superpowers/plans/2026-04-09-sg-interface-redesign.md`
**Purpose:** Define what "done" looks like for the SG Interface visual overhaul and how to prove it at each checkpoint.

---

## How to Use This Document

1. **Read before starting** — read this entire eval doc before writing code so implementation choices are shaped by the criteria.
2. **Verify as you go** — each section has a "Verify After" tag. Run checks after those tasks, not at the end. Catching issues early is cheap; catching them late means rework.
3. **Show your work** — paste the command and its output. "I verified it" is not proof. Terminal output is proof.
4. **Pre-Completion Gate** — before declaring complete, run the Quick Smoke Test, paste output, confirm all PASS. Not done until the gate passes with evidence.
5. **Failure recovery** — when a check fails, don't retry the same approach. Read the error, re-read the spec, fix the root cause. Same check fails 3 times: stop and ask the user.

---

## Overall Score Table

| Section | Weight | Verify After | Verdict |
|---------|--------|-------------|---------|
| 1. Token Integrity | Critical | Tasks 1–2 | |
| 2. Old Palette Elimination | Critical | Tasks 3–11 | |
| 3. Design Fidelity | Critical | Tasks 3–11 | |
| 4. Toolbar Redesign | High | Task 5 | |
| 5. Functional Preservation | High | Tasks 5–11 | |
| 6. Code Quality | Critical | All tasks | |
| 7. Deployment Readiness | Critical | Task 12 | |
| 8. Interaction Quality | Medium | Tasks 4–5 | |

**Ship readiness:** All Critical sections PASS. High sections allow 1 FAIL with documented fix plan.

---

## 1. Token Integrity

> **Verify After:** Tasks 1–2 (CSS token replacement + shared constants)

Confirms the SG Interface token layer is correctly installed and all CSS variables resolve.

| # | Check | How to verify |
|---|-------|---------------|
| 1.1 | `@theme` block contains all 5 gold scale tokens | `grep 'color-gold-' client/src/index.css` — returns exactly: `hover`, `subtle`, `muted`, `light`, `primary` |
| 1.2 | `@theme` block contains dark pair | `grep 'color-dark' client/src/index.css` — returns `--color-dark: #2c2a26` and `--color-dark-hover: #3d3a35` |
| 1.3 | `@theme` block contains 4 text scale tokens | `grep 'color-text-' client/src/index.css` — returns `primary`, `secondary`, `muted`, `faint` |
| 1.4 | `@theme` block contains 4 semantic colors | `grep -c 'color-green\|color-red\|color-yellow\|color-blue' client/src/index.css` — returns `4` |
| 1.5 | `@theme` block contains spacing scale (10 values) | `grep -c 'spacing-' client/src/index.css` — returns `10` |
| 1.6 | `@theme` block contains radius scale (8 values) | `grep -c 'radius-' client/src/index.css` — returns `8` |
| 1.7 | `@theme` block contains 4 shadow tokens | `grep -c 'shadow-' client/src/index.css` — returns `4` |
| 1.8 | No `--color-primary` token exists | `grep 'color-primary:' client/src/index.css` — returns 0 results (old Apple blue removed) |
| 1.9 | Focus ring uses gold-primary | `grep 'focus-visible' client/src/index.css` — contains `var(--color-gold-primary)` |
| 1.10 | Scrollbar uses gold tokens | `grep 'scrollbar' client/src/index.css` — thumb is `var(--color-gold-light)`, track is `var(--color-gold-subtle)` |
| 1.11 | `.skeleton` class uses gold gradient | `grep -A2 '.skeleton' client/src/index.css` — contains `var(--color-gold-subtle)` and `var(--color-gold-hover)` |
| 1.12 | `FILTER_INPUT_CLASS` uses gold tokens | `grep 'FILTER_INPUT_CLASS' client/src/config/filterConstants.ts` — contains `var(--color-gold-subtle)` and `var(--color-gold-primary)` |
| 1.13 | `FILTER_LABEL_CLASS` uses text-muted token | `grep 'FILTER_LABEL_CLASS' client/src/config/filterConstants.ts` — contains `var(--color-text-muted)` |
| 1.14 | `DRAG_HANDLE_CLASS` uses text-faint token | `grep 'DRAG_HANDLE_CLASS' client/src/config/filterConstants.ts` — contains `var(--color-text-faint)` |

**Verdict:** PASS if 14/14 checks succeed.

---

## 2. Old Palette Elimination

> **Verify After:** Tasks 3–11 (all component updates complete)

Confirms zero old palette references remain in client source code. This is the single most important verification — any old class left behind means the component renders in the wrong palette.

| # | Check | How to verify |
|---|-------|---------------|
| 2.1 | Zero `slate-` Tailwind classes in client source | `grep -rn 'slate-' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.2 | Zero `text-primary` (old token) references | `grep -rn '\btext-primary\b' client/src/ --include='*.tsx' --include='*.ts' \| grep -v 'color-text-primary' \| wc -l` — returns `0` |
| 2.3 | Zero `bg-primary` (old token) references | `grep -rn '\bbg-primary\b' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.4 | Zero `hover:bg-primary` references | `grep -rn 'hover:bg-primary' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.5 | Zero `focus:ring-primary` references | `grep -rn 'focus:ring-primary' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.6 | Zero `focus:border-primary` references | `grep -rn 'focus:border-primary' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.7 | Zero `blue-50` / `blue-200` in non-semantic contexts | `grep -rn 'blue-50\|blue-200' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` (all converted to `var(--color-blue)` opacity variants) |
| 2.8 | Zero `emerald-` references | `grep -rn 'emerald-' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |
| 2.9 | Zero hardcoded hex colors outside CSS variables | `grep -rn '#[0-9a-fA-F]\{6\}' client/src/ --include='*.tsx' --include='*.ts' \| grep -v 'var(--' \| wc -l` — returns `0` |
| 2.10 | Zero hardcoded `shadow-lg` / `shadow-xl` | `grep -rn 'shadow-lg\|shadow-xl' client/src/ --include='*.tsx' --include='*.ts' \| wc -l` — returns `0` |

**Verdict:** PASS if 10/10 checks succeed. Zero tolerance — any old class is a visual defect.

---

## 3. Design Fidelity

> **Verify After:** Tasks 3–11 (component updates complete), best verified with dev server running

Confirms key visual properties match the SG Interface design system spec exactly. These checks require a running dev server and use `preview_inspect` or browser DevTools.

| # | Check | How to verify |
|---|-------|---------------|
| 3.1 | Page background is `#f5f1eb` | Inspect `<body>` or root container — computed `background-color` is `rgb(245, 241, 235)` |
| 3.2 | Card background is `#ffffff` | Inspect any WidgetShell — computed `background-color` is `rgb(255, 255, 255)` |
| 3.3 | Cards have NO visible border | Inspect WidgetShell — `border-width` is `0px` or `border-color` is transparent |
| 3.4 | Card shadow matches `--shadow-card` | Inspect WidgetShell — `box-shadow` contains `rgba(0, 0, 0, 0.04)` |
| 3.5 | Active nav tab background is `#2c2a26` | Inspect active tab pill — computed `background-color` is `rgb(44, 42, 38)` |
| 3.6 | Active nav tab text is white | Inspect active tab text — computed `color` is `rgb(255, 255, 255)` |
| 3.7 | Focus ring is gold on Tab press | Tab to a focusable element — outline color is `#b8a88a` / `rgb(184, 168, 138)` |
| 3.8 | Scrollbar thumb is gold-tinted | Visually confirm scrollbar is thin (4px) and gold, not browser default gray |
| 3.9 | Table row hover is warm | Hover a table row — background flashes `#faf8f4` (gold-hover), not blue |
| 3.10 | Status rows retain red/orange/amber | Expired row has red-tinted background, expiring rows have orange/amber — unchanged from before |

**Verdict:** PASS if 10/10 checks succeed.

---

## 4. Toolbar Redesign

> **Verify After:** Task 5 (toolbar rewrite)

Confirms the toolbar matches the Sales Dashboard v1 icon-based pattern.

| # | Check | How to verify |
|---|-------|---------------|
| 4.1 | Toolbar uses icon buttons, not labeled pills | Screenshot or snapshot — buttons are 28px circles with SVG icons, no text labels for filter/columns/sort |
| 4.2 | Default button state: subtle border + muted icon | Inspect inactive toolbar icon — has `border` with gold-subtle color, text is `--color-text-muted` |
| 4.3 | Active badge state: gold border + gold icon | Activate a filter, then inspect the filter icon — border uses `--color-gold-primary`, icon text is gold |
| 4.4 | Open panel state: gold-primary fill + white icon | Click filter icon to open panel — button background is `--color-gold-primary` (`#b8a88a`), icon is white |
| 4.5 | Badge count appears on active icons | Set 2 filters — filter icon shows gold circle badge with "2" |
| 4.6 | Expandable search animates from 28px to 180px | Click search icon — width animates smoothly from 28px to 180px |
| 4.7 | Click-outside closes open panel | Open filter panel, click outside toolbar area — panel closes |
| 4.8 | Refresh icon spins during refresh | Click refresh — icon shows spin animation |
| 4.9 | Export icon shows spinner during export | Click export — icon switches to Loader2 spin |

**Verdict:** PASS if 8/9 checks succeed (1 FAIL acceptable with fix plan).

---

## 5. Functional Preservation

> **Verify After:** Tasks 5–11 (after toolbar redesign and all component updates)

Confirms no existing functionality was broken by the visual changes.

| # | Check | How to verify |
|---|-------|---------------|
| 5.1 | Filter panel opens and filters work | Open filter panel → add a condition → apply → table shows filtered results |
| 5.2 | Column manager hides/shows columns | Open columns panel → toggle a column off → column disappears from table |
| 5.3 | Sort panel sorts data | Open sort panel → add sort rule → table reorders |
| 5.4 | Drag-reorder works in filter panel | Drag a filter condition to new position → order updates |
| 5.5 | Pagination navigates pages | Click Next → new page of data loads |
| 5.6 | Export downloads CSV | Click export icon → CSV file downloads |
| 5.7 | Row expand/collapse works | Click expand chevron → detail panel slides open → click again → collapses |
| 5.8 | Copy-to-clipboard works | Click a copyable cell → toast appears confirming copy |
| 5.9 | Bulk Extend modal opens and submits | Click extend icon → modal opens → select items → submit works |
| 5.10 | Nav tabs switch between pages | Click different tab → content changes to that page's widgets |
| 5.11 | Error state renders on API failure | Disconnect API → ErrorState component appears with retry link |

**Verdict:** PASS if 11/11 checks succeed.

---

## 6. Code Quality

> **Verify After:** Every task (check incrementally)

Confirms code follows project conventions defined in CLAUDE.md.

| # | Check | How to verify |
|---|-------|---------------|
| 6.1 | TypeScript client builds clean | `cd client && npx tsc -b --noEmit` — zero errors |
| 6.2 | TypeScript server builds clean | `cd server && npx tsc --noEmit` — zero errors |
| 6.3 | No file exceeds 200 lines | `wc -l client/src/components/TableToolbar.tsx` — under 200 (this is the file most at risk after redesign) |
| 6.4 | Intent block on any new/rewritten file | `head -6 client/src/components/TableToolbar.tsx` — contains FILE, PURPOSE, USED BY, EXPORTS |
| 6.5 | No unused imports or variables | TS build (6.1) catches these via `noUnusedLocals: true` |
| 6.6 | All CSS values use var(--) references | Covered by Section 2 (Old Palette Elimination) |
| 6.7 | No dynamic Tailwind classes | `grep -rn 'text-\[${' client/src/ --include='*.tsx' \| wc -l` — returns `0` |

**Verdict:** PASS if 7/7 checks succeed.

---

## 7. Deployment Readiness

> **Verify After:** Task 12 (verification task)

Confirms the app builds and runs in the production Docker environment.

| # | Check | How to verify |
|---|-------|---------------|
| 7.1 | Docker build succeeds | `docker build -t priority-dashboard .` — exits with code 0 |
| 7.2 | Docker container starts and serves | `docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 priority-dashboard &` then `curl http://localhost:3001` — returns HTML |
| 7.3 | Health endpoint responds | `curl http://localhost:3001/api/health` — returns 200 with `{"status":"ok"}` |
| 7.4 | Static assets load | `curl -s http://localhost:3001` — HTML references `.js` and `.css` assets that resolve (no 404s) |
| 7.5 | No text uses `text-[var(--color-text-muted)]` or lighter for essential content | Visual scan — all important text (values, labels, buttons) uses `text-secondary` minimum. Only metadata/decorative uses muted/faint. (Airtable iframe JPEG compression makes light text invisible.) |

**Verdict:** PASS if 5/5 checks succeed.

---

## 8. Interaction Quality

> **Verify After:** Tasks 4–5 (nav tabs + toolbar)

Confirms hover states, transitions, and micro-interactions work correctly.

| # | Check | How to verify |
|---|-------|---------------|
| 8.1 | Nav tab pill slides smoothly | Click between tabs — pill animates position (Framer Motion layout animation) |
| 8.2 | Toolbar panel expand/collapse is animated | Open/close filter panel — height animates (not instant snap) |
| 8.3 | Search bar expand is animated | Click search icon — width animates from 28px to 180px smoothly |
| 8.4 | Reduced motion is respected | Set `prefers-reduced-motion: reduce` in DevTools → animations become instant/opacity-only |
| 8.5 | Hover states use correct warm colors | Hover table row → warm cream highlight. Hover toolbar icon → border becomes gold. |

**Verdict:** PASS if 4/5 checks succeed (1 advisory FAIL acceptable).

---

## Verification Schedule

| After completing... | Run these sections |
|--------------------|--------------------|
| Phase 1: Tasks 1–2 (Token layer + shared constants) | **Section 1** (Token Integrity) |
| Phase 2: Tasks 3–4 (Layout shell + nav tabs) | **Section 3** checks 3.1–3.6, **Section 8** check 8.1 |
| Phase 3: Task 5 (Toolbar redesign) | **Section 4** (Toolbar Redesign), **Section 6** checks 6.1, 6.3, 6.4 |
| Phase 4: Tasks 6–11 (All remaining components) | **Section 2** (Old Palette Elimination), **Section 3** checks 3.7–3.10, **Section 5** (Functional Preservation), **Section 8** checks 8.2–8.5 |
| Phase 5: Task 12 (Final verification) | **Section 6** (Code Quality), **Section 7** (Deployment Readiness), **Pre-Completion Gate** |

---

## Pre-Completion Gate

Before declaring the redesign complete:

1. Run the **Quick Smoke Test** below
2. Paste the **complete terminal output** (not a summary)
3. Confirm every line says `OK` or `PASS`
4. If any line says `FAIL`: fix the issue, re-run the entire smoke test, paste the new output

**Not done until the gate passes with evidence.**

---

## Quick Smoke Test

Save as `scripts/sg-eval.sh` and run with `bash scripts/sg-eval.sh`. Runs in under 2 minutes.

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT="/Users/victorproust/Documents/Work/SG Interface/Priority Reports"
cd "$PROJECT"

echo "═══════════════════════════════════════════════════"
echo "  SG Interface Redesign — Quick Smoke Test"
echo "═══════════════════════════════════════════════════"
echo ""

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "  OK   $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL $label"
    FAIL=$((FAIL + 1))
  fi
}

# --- Section 1: Token Integrity ---
echo "── Token Integrity ──"

gold_count=$(grep -c 'color-gold-' client/src/index.css 2>/dev/null || echo 0)
check "Gold scale tokens present (expect >=5)" "$([ "$gold_count" -ge 5 ] && echo 0 || echo 1)"

dark_count=$(grep -c 'color-dark' client/src/index.css 2>/dev/null || echo 0)
check "Dark pair tokens present (expect >=2)" "$([ "$dark_count" -ge 2 ] && echo 0 || echo 1)"

text_count=$(grep -c 'color-text-' client/src/index.css 2>/dev/null || echo 0)
check "Text scale tokens present (expect >=4)" "$([ "$text_count" -ge 4 ] && echo 0 || echo 1)"

old_primary=$(grep -c '\-\-color-primary:' client/src/index.css 2>/dev/null || echo 0)
check "Old --color-primary removed (expect 0)" "$([ "$old_primary" -eq 0 ] && echo 0 || echo 1)"

skeleton_gold=$(grep -A3 '.skeleton' client/src/index.css 2>/dev/null | grep -c 'color-gold' || echo 0)
check "Skeleton uses gold tokens (expect >=1)" "$([ "$skeleton_gold" -ge 1 ] && echo 0 || echo 1)"

echo ""

# --- Section 2: Old Palette Elimination ---
echo "── Old Palette Elimination ──"

slate_count=$(grep -rn 'slate-' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
check "Zero slate- classes (found: $slate_count)" "$([ "$slate_count" -eq 0 ] && echo 0 || echo 1)"

old_text_primary=$(grep -rn '\btext-primary\b' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v 'color-text-primary' | wc -l | tr -d ' ')
check "Zero old text-primary (found: $old_text_primary)" "$([ "$old_text_primary" -eq 0 ] && echo 0 || echo 1)"

old_bg_primary=$(grep -rn '\bbg-primary\b' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
check "Zero old bg-primary (found: $old_bg_primary)" "$([ "$old_bg_primary" -eq 0 ] && echo 0 || echo 1)"

emerald_count=$(grep -rn 'emerald-' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
check "Zero emerald- classes (found: $emerald_count)" "$([ "$emerald_count" -eq 0 ] && echo 0 || echo 1)"

hex_count=$(grep -rn '#[0-9a-fA-F]\{6\}' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v 'var(--' | wc -l | tr -d ' ')
check "Zero hardcoded hex colors (found: $hex_count)" "$([ "$hex_count" -eq 0 ] && echo 0 || echo 1)"

shadow_old=$(grep -rn 'shadow-lg\|shadow-xl' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | wc -l | tr -d ' ')
check "Zero old shadow-lg/xl (found: $shadow_old)" "$([ "$shadow_old" -eq 0 ] && echo 0 || echo 1)"

echo ""

# --- Section 6: Code Quality ---
echo "── Code Quality ──"

echo "  Running client TypeScript build..."
(cd client && npx tsc -b --noEmit 2>&1) && check "Client TS build passes" "0" || check "Client TS build passes" "1"

echo "  Running server TypeScript build..."
(cd server && npx tsc --noEmit 2>&1) && check "Server TS build passes" "0" || check "Server TS build passes" "1"

toolbar_lines=$(wc -l < client/src/components/TableToolbar.tsx 2>/dev/null | tr -d ' ')
check "TableToolbar.tsx under 200 lines (actual: $toolbar_lines)" "$([ "$toolbar_lines" -le 200 ] && echo 0 || echo 1)"

dynamic_tw=$(grep -rn 'text-\[${' client/src/ --include='*.tsx' 2>/dev/null | wc -l | tr -d ' ')
check "Zero dynamic Tailwind classes (found: $dynamic_tw)" "$([ "$dynamic_tw" -eq 0 ] && echo 0 || echo 1)"

echo ""

# --- Summary ---
echo "═══════════════════════════════════════════════════"
echo "  Results: $PASS OK, $FAIL FAIL"
if [ "$FAIL" -eq 0 ]; then
  echo "  STATUS: ALL PASS ✓"
else
  echo "  STATUS: $FAIL CHECK(S) FAILED"
fi
echo "═══════════════════════════════════════════════════"
```

---

## Loop Detection

If any of these occur during implementation, STOP and reassess:

| Trigger | What to do |
|---------|-----------|
| Same file edited more than 5 times for the same check | Re-read the spec and color mapping table. The mapping is deterministic — if you're oscillating, you're using the wrong source class. |
| Same eval check fails 3 times in a row | Stop. Read the error output carefully. Try a fundamentally different approach. If still stuck, ask the user. |
| Going back to a task already marked complete | A later task broke something. Identify which change caused the regression before fixing. |
| TypeScript build fails after a color-only change | You likely introduced a syntax error in a Tailwind class string. Check for unbalanced brackets in `var(--` expressions. |
