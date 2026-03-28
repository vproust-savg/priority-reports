#!/usr/bin/env bash
set -uo pipefail

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
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    FAIL=$((FAIL + 1))
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
# WHY: NavTabs.test.tsx has 3 pre-existing failures on main. Check that all
# sort-related test files pass, not that the global suite is zero-failure.
check "useSortManager tests pass" bash -c 'cd client && npx vitest run src/hooks/useSortManager.test.ts 2>&1'
check "SortRuleRow tests pass" bash -c 'cd client && npx vitest run src/components/sort/SortRuleRow.test.tsx 2>&1'
check "SortPanel tests pass" bash -c 'cd client && npx vitest run src/components/sort/SortPanel.test.tsx 2>&1'
check "TableToolbar tests pass" bash -c 'cd client && npx vitest run src/components/TableToolbar.test.tsx 2>&1'

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
