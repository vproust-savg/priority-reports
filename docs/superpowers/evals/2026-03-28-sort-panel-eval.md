# Sort Panel — Evaluation Criteria

**Spec:** `docs/superpowers/specs/2026-03-28-sort-panel-design.md`
**Plan:** `docs/superpowers/plans/2026-03-28-sort-panel.md`
**Feature:** Multi-column client-side sort panel for the dashboard toolbar

---

## How to Use This Document

1. **Read before starting** — read the entire eval doc before writing code so implementation choices are shaped by the criteria.
2. **Verify as you go** — each section has a "Verify After" tag. Run checks after those tasks, not at the end. Catching issues early is cheap; catching them late means rework.
3. **Show your work** — paste the command and its output. "I verified it" is not proof. Terminal output is proof.
4. **Pre-Completion Gate** — before declaring complete, run the Quick Smoke Test, paste output, confirm all PASS. Not done until the gate passes with evidence.
5. **Failure recovery** — when a check fails, don't retry the same approach. Read the error, re-read the spec, fix the root cause. Same check fails 3 times: stop and ask the user.

---

## 1. Functional Completeness

**Verify After: Tasks 2, 4, 6, 8, 9**

| # | Check | How to verify |
|---|-------|---------------|
| 1.1 | `useSortManager` hook exports `SortRule` type and hook function | `grep 'export interface SortRule' client/src/hooks/useSortManager.ts` returns 1 match |
| 1.2 | `addSort()` creates a rule with first available column, ascending | Test: `useSortManager.test.ts` — "addSort() adds a rule with first column and ascending" passes |
| 1.3 | `addSort(columnKey)` targets a specific column | Test: `useSortManager.test.ts` — "addSort(columnKey) adds a rule for the specified column" passes |
| 1.4 | `addSort` is no-op when all columns used | Test: `useSortManager.test.ts` — "addSort is a no-op when all columns are used" passes |
| 1.5 | `removeSort`, `updateSort`, `reorderSorts`, `clearAll` all work | 7 CRUD tests in `useSortManager.test.ts` all pass |
| 1.6 | String sort uses `localeCompare` | Test: "sorts strings ascending" + "sorts strings descending" pass |
| 1.7 | Number/currency/percent sort uses numeric comparison | Tests: "sorts numbers ascending/descending", "sorts currency as numbers", "sorts percent as numbers" pass |
| 1.8 | Date sort uses chronological comparison | Test: "sorts dates chronologically" passes |
| 1.9 | Multi-column sort applies rules in priority order | Test: "multi-column sort: primary asc, secondary desc" passes |
| 1.10 | Null/undefined values sort last regardless of direction | Tests: "null values sort last when ascending/descending", "undefined values sort last" pass |
| 1.11 | `sortedData` never mutates input | Test: "sortedData does not mutate the input array" passes |
| 1.12 | Column cleanup removes stale sort rules | Test: "removes sort rules when their column disappears" passes |
| 1.13 | Sort button appears in toolbar between Columns and right-side actions | `grep -n 'ArrowUpDown' client/src/components/TableToolbar.tsx` returns a match |
| 1.14 | Panel mutual exclusivity — opening Sort closes Filter and Columns | `grep 'setIsFilterOpen(false)' client/src/components/widgets/ReportTableWidget.tsx` appears in sort toggle handler |
| 1.15 | `sortedData(displayData)` is piped to ReportTable | `grep 'sortedData(displayData)' client/src/components/widgets/ReportTableWidget.tsx` returns 1 match |

**Verdict:** PASS if 15 of 15 checks succeed.

---

## 2. Code Quality

**Verify After: Tasks 2, 4, 6, 8, 9**

| # | Check | How to verify |
|---|-------|---------------|
| 2.1 | TypeScript client builds clean | `cd client && npx tsc -b --noEmit` — 0 errors |
| 2.2 | TypeScript server builds clean (no breakage) | `cd server && npx tsc --noEmit` — 0 errors |
| 2.3 | All tests pass | `cd client && npx vitest run` — 0 failures |
| 2.4 | Every new file has intent block (FILE, PURPOSE, USED BY, EXPORTS) | `grep -l '// FILE:' client/src/hooks/useSortManager.ts client/src/components/sort/SortPanel.tsx client/src/components/sort/SortRuleRow.tsx` returns 3 files |
| 2.5 | No new file exceeds 200 lines | `wc -l client/src/hooks/useSortManager.ts client/src/components/sort/SortPanel.tsx client/src/components/sort/SortRuleRow.tsx` — all under 200 |
| 2.6 | Modified files stay under 250 lines | `wc -l client/src/components/TableToolbar.tsx client/src/components/widgets/ReportTableWidget.tsx` — both under 250 |
| 2.7 | `SortRule` uses `crypto.randomUUID()` for IDs | `grep 'crypto.randomUUID()' client/src/hooks/useSortManager.ts` returns a match |
| 2.8 | `FILTER_INPUT_CLASS` reused (not duplicated) | `grep 'FILTER_INPUT_CLASS' client/src/components/sort/SortRuleRow.tsx` returns a match AND no inline style duplication |
| 2.9 | `arrayMove` imported from `@dnd-kit/sortable` (not reimplemented) | `grep 'arrayMove' client/src/hooks/useSortManager.ts` returns a match |

**Verdict:** PASS if 9 of 9 checks succeed.

---

## 3. Design / UI Consistency

**Verify After: Tasks 4, 6, 8**

| # | Check | How to verify |
|---|-------|---------------|
| 3.1 | Sort button icon is `ArrowUpDown` (16px) | `grep 'ArrowUpDown' client/src/components/TableToolbar.tsx` — present with `size={16}` |
| 3.2 | Sort button text is "Sort" | `grep "'Sort'" client/src/components/TableToolbar.tsx` or `grep '"Sort"' client/src/components/TableToolbar.tsx` returns a match |
| 3.3 | Badge format is `(N)` | `grep 'sortCount' client/src/components/TableToolbar.tsx` shows `({sortCount})` pattern |
| 3.4 | Active state uses `text-primary bg-primary/5` | `grep 'activeClass' client/src/components/TableToolbar.tsx` — Sort button uses `hasSorts ? activeClass : inactiveClass` |
| 3.5 | Sort panel background is `bg-white` | `grep 'bg-white' client/src/components/sort/SortPanel.tsx` returns a match |
| 3.6 | Sort panel has `border-b border-slate-200` | `grep 'border-slate-200' client/src/components/sort/SortPanel.tsx` returns a match |
| 3.7 | Sort panel padding is `px-5 py-4` | `grep 'px-5 py-4' client/src/components/sort/SortPanel.tsx` returns a match |
| 3.8 | Drag handle uses `GripVertical` (14px) | `grep 'GripVertical' client/src/components/sort/SortRuleRow.tsx` — present with `size={14}` |
| 3.9 | Direction toggle shows `ArrowUp`/"Asc" or `ArrowDown`/"Desc" | `grep -E 'ArrowUp|ArrowDown' client/src/components/sort/SortRuleRow.tsx` — both present |
| 3.10 | "Add sort" styled as `text-xs font-medium text-primary` | `grep 'text-primary' client/src/components/sort/SortPanel.tsx` — present on add button |
| 3.11 | "Clear all" has `border-t border-slate-100` separator | `grep 'border-slate-100' client/src/components/sort/SortPanel.tsx` returns a match |
| 3.12 | Chevron rotates when `isSortPanelOpen` is true | `grep 'isSortPanelOpen.*rotate-180' client/src/components/TableToolbar.tsx` returns a match |

**Verdict:** PASS if 12 of 12 checks succeed.

---

## 4. Test Coverage

**Verify After: Tasks 1, 3, 5, 7**

| # | Check | How to verify |
|---|-------|---------------|
| 4.1 | `useSortManager.test.ts` has 20+ test cases | `grep -c "it('" client/src/hooks/useSortManager.test.ts` returns >= 20 |
| 4.2 | `SortRuleRow.test.tsx` has 6+ test cases | `grep -c "it('" client/src/components/sort/SortRuleRow.test.tsx` returns >= 6 |
| 4.3 | `SortPanel.test.tsx` has 5+ test cases | `grep -c "it('" client/src/components/sort/SortPanel.test.tsx` returns >= 5 |
| 4.4 | `TableToolbar.test.tsx` has 5+ test cases | `grep -c "it('" client/src/components/TableToolbar.test.tsx` returns >= 5 |
| 4.5 | Tests written before implementation (TDD) | Git log shows test commits before implementation commits for each component |
| 4.6 | All 4 test files exist | `ls client/src/hooks/useSortManager.test.ts client/src/components/sort/SortRuleRow.test.tsx client/src/components/sort/SortPanel.test.tsx client/src/components/TableToolbar.test.tsx` — all exist |
| 4.7 | dnd-kit properly mocked in component tests | `grep 'vi.mock.*dnd-kit' client/src/components/sort/SortRuleRow.test.tsx client/src/components/sort/SortPanel.test.tsx` — both have mocks |
| 4.8 | Existing tests unbroken | `cd client && npx vitest run` — 0 failures, test count >= pre-implementation count |

**Verdict:** PASS if 8 of 8 checks succeed.

---

## 5. Integration

**Verify After: Task 9**

| # | Check | How to verify |
|---|-------|---------------|
| 5.1 | `useSortManager` called with `visibleColumns` (not raw API columns) | `grep 'useSortManager(visibleColumns)' client/src/components/widgets/ReportTableWidget.tsx` returns 1 match |
| 5.2 | Sort panel rendered in `AnimatePresence` block | `grep -A3 'isSortPanelOpen' client/src/components/widgets/ReportTableWidget.tsx` shows `AnimatePresence` + `motion.div` wrapper |
| 5.3 | Sort panel uses `EASE_FAST` transition | `grep 'EASE_FAST' client/src/components/widgets/ReportTableWidget.tsx` — present in sort panel block |
| 5.4 | Filter toggle closes sort and column panels | `grep -A3 'handleFilterToggle' client/src/components/widgets/ReportTableWidget.tsx` shows `setIsSortPanelOpen(false)` and `setIsColumnPanelOpen(false)` |
| 5.5 | Column toggle closes sort and filter panels | `grep -A3 'handleColumnToggle' client/src/components/widgets/ReportTableWidget.tsx` shows `setIsSortPanelOpen(false)` and `setIsFilterOpen(false)` |
| 5.6 | Sort toggle closes filter and column panels | `grep -A3 'handleSortToggle' client/src/components/widgets/ReportTableWidget.tsx` shows `setIsFilterOpen(false)` and `setIsColumnPanelOpen(false)` |
| 5.7 | `SortPanel` receives `visibleColumns` (not all columns) | `grep 'columns={visibleColumns}' client/src/components/widgets/ReportTableWidget.tsx` — present in SortPanel props |
| 5.8 | `ReportTableWidget` stays under 250 lines | `wc -l client/src/components/widgets/ReportTableWidget.tsx` — under 250 |

**Verdict:** PASS if 8 of 8 checks succeed.

---

## Overall Score Table

| Section | Weight | Verify After | Verdict |
|---------|--------|-------------|---------|
| 1. Functional Completeness | Critical | Tasks 2, 4, 6, 8, 9 | |
| 2. Code Quality | Critical | Tasks 2, 4, 6, 8, 9 | |
| 3. Design / UI Consistency | High | Tasks 4, 6, 8 | |
| 4. Test Coverage | Critical | Tasks 1, 3, 5, 7 | |
| 5. Integration | Critical | Task 9 | |

**Ship readiness:** All Critical sections PASS. High allows 1 FAIL with documented fix plan.

---

## Verification Schedule

| After completing... | Run these sections |
|--------------------|--------------------|
| Phase 1: Hook (Tasks 1-2) | Section 4 (check 4.1, 4.5, 4.6), Section 1 (checks 1.1-1.12), Section 2 (checks 2.1, 2.3, 2.4, 2.5, 2.7, 2.9) |
| Phase 2: Components (Tasks 3-6) | Section 4 (checks 4.2, 4.3, 4.7), Section 1 (check 1.13 not yet — components only), Section 3 (checks 3.5-3.11) |
| Phase 3: Toolbar + Integration (Tasks 7-9) | Section 1 (all), Section 2 (all), Section 3 (all), Section 4 (all), Section 5 (all) |
| Task 10: Final | **Pre-Completion Gate** — full smoke test |

---

## Pre-Completion Gate

Before declaring the feature complete, the implementing agent must:

1. Run the full Quick Smoke Test (below)
2. Paste the **complete output** (not a summary)
3. Confirm every line says OK or PASS
4. If any line fails: fix, re-run, paste again

---

## Quick Smoke Test

Save as `scripts/eval-sort-panel.sh` and run with `bash scripts/eval-sort-panel.sh` from the project root.

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  SORT PANEL — EVALUATION SMOKE TEST"
echo "═══════════════════════════════════════════════════"
echo ""

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "  OK  $label"
    ((PASS++))
  else
    echo "  FAIL  $label"
    ((FAIL++))
  fi
}

# --- Files exist ---
echo "--- File Existence ---"
check "useSortManager.ts exists" test -f client/src/hooks/useSortManager.ts
check "useSortManager.test.ts exists" test -f client/src/hooks/useSortManager.test.ts
check "SortPanel.tsx exists" test -f client/src/components/sort/SortPanel.tsx
check "SortPanel.test.tsx exists" test -f client/src/components/sort/SortPanel.test.tsx
check "SortRuleRow.tsx exists" test -f client/src/components/sort/SortRuleRow.tsx
check "SortRuleRow.test.tsx exists" test -f client/src/components/sort/SortRuleRow.test.tsx
check "TableToolbar.test.tsx exists" test -f client/src/components/TableToolbar.test.tsx

# --- Intent blocks ---
echo ""
echo "--- Intent Blocks ---"
check "useSortManager.ts has intent block" grep -q '// FILE:' client/src/hooks/useSortManager.ts
check "SortPanel.tsx has intent block" grep -q '// FILE:' client/src/components/sort/SortPanel.tsx
check "SortRuleRow.tsx has intent block" grep -q '// FILE:' client/src/components/sort/SortRuleRow.tsx

# --- File size limits ---
echo ""
echo "--- File Size ---"
check "useSortManager.ts under 200 lines" bash -c '[ $(wc -l < client/src/hooks/useSortManager.ts) -lt 200 ]'
check "SortPanel.tsx under 200 lines" bash -c '[ $(wc -l < client/src/components/sort/SortPanel.tsx) -lt 200 ]'
check "SortRuleRow.tsx under 200 lines" bash -c '[ $(wc -l < client/src/components/sort/SortRuleRow.tsx) -lt 200 ]'
check "TableToolbar.tsx under 200 lines" bash -c '[ $(wc -l < client/src/components/TableToolbar.tsx) -lt 200 ]'
check "ReportTableWidget.tsx under 250 lines" bash -c '[ $(wc -l < client/src/components/widgets/ReportTableWidget.tsx) -lt 250 ]'

# --- Key patterns ---
echo ""
echo "--- Key Patterns ---"
check "SortRule type exported" grep -q 'export interface SortRule' client/src/hooks/useSortManager.ts
check "ArrowUpDown icon in toolbar" grep -q 'ArrowUpDown' client/src/components/TableToolbar.tsx
check "sortedData piped to ReportTable" grep -q 'sortedData(displayData)' client/src/components/widgets/ReportTableWidget.tsx
check "useSortManager called with visibleColumns" grep -q 'useSortManager(visibleColumns)' client/src/components/widgets/ReportTableWidget.tsx
check "FILTER_INPUT_CLASS reused" grep -q 'FILTER_INPUT_CLASS' client/src/components/sort/SortRuleRow.tsx
check "arrayMove imported" grep -q 'arrayMove' client/src/hooks/useSortManager.ts
check "crypto.randomUUID used" grep -q 'crypto.randomUUID' client/src/hooks/useSortManager.ts
check "Panel mutual exclusivity" grep -q 'setIsSortPanelOpen(false)' client/src/components/widgets/ReportTableWidget.tsx

# --- UI consistency ---
echo ""
echo "--- UI Consistency ---"
check "Sort panel bg-white" grep -q 'bg-white' client/src/components/sort/SortPanel.tsx
check "Sort panel border-slate-200" grep -q 'border-slate-200' client/src/components/sort/SortPanel.tsx
check "GripVertical in SortRuleRow" grep -q 'GripVertical' client/src/components/sort/SortRuleRow.tsx
check "Direction arrows in SortRuleRow" grep -q 'ArrowUp\|ArrowDown' client/src/components/sort/SortRuleRow.tsx

# --- TypeScript ---
echo ""
echo "--- TypeScript Build ---"
check "Client tsc clean" bash -c 'cd client && npx tsc -b --noEmit 2>&1'
check "Server tsc clean" bash -c 'cd server && npx tsc --noEmit 2>&1'

# --- Tests ---
echo ""
echo "--- Test Suite ---"
check "All tests pass" bash -c 'cd client && npx vitest run 2>&1'

# --- Test counts ---
echo ""
echo "--- Test Coverage ---"
check "useSortManager tests >= 20" bash -c '[ $(grep -c "it(" client/src/hooks/useSortManager.test.ts) -ge 20 ]'
check "SortRuleRow tests >= 6" bash -c '[ $(grep -c "it(" client/src/components/sort/SortRuleRow.test.tsx) -ge 6 ]'
check "SortPanel tests >= 5" bash -c '[ $(grep -c "it(" client/src/components/sort/SortPanel.test.tsx) -ge 5 ]'
check "TableToolbar tests >= 5" bash -c '[ $(grep -c "it(" client/src/components/TableToolbar.test.tsx) -ge 5 ]'

# --- Summary ---
echo ""
echo "═══════════════════════════════════════════════════"
echo "  RESULTS: $PASS OK / $FAIL FAIL / $((PASS + FAIL)) total"
echo "═══════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo "  STATUS: NOT READY — fix failures above"
  exit 1
else
  echo "  STATUS: SHIP IT"
  exit 0
fi
```

---

## Loop Detection

Stop and ask the user when:

- **Same file edited more than 5 times** for the same eval check
- **Same check fails 3 times in a row** — re-read spec, try a fundamentally different approach
- **Going back to a task already marked complete** — something upstream broke
- **Test passes immediately on first write** without a prior RED phase — you may not be testing the right thing

Recovery protocol:
1. Re-read the spec section relevant to the failing check
2. Re-read this eval doc's "How to verify" for the check
3. Try a fundamentally different implementation approach
4. If still stuck after 3 attempts: stop and ask the user
