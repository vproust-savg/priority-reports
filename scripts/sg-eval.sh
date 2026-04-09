#!/usr/bin/env bash
set -u

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

old_primary=$(grep -c 'color-primary:' client/src/index.css 2>/dev/null || true)
old_primary=$(echo "$old_primary" | head -1 | tr -d ' ')
check "Old --color-primary removed (expect 0)" "$([ "${old_primary:-0}" -eq 0 ] && echo 0 || echo 1)"

skeleton_gold=$(grep -A3 '.skeleton' client/src/index.css 2>/dev/null | grep -c 'color-gold' || echo 0)
check "Skeleton uses gold tokens (expect >=1)" "$([ "$skeleton_gold" -ge 1 ] && echo 0 || echo 1)"

echo ""

# --- Section 2: Old Palette Elimination ---
echo "── Old Palette Elimination ──"

slate_count=$(grep -rn '\bslate-' client/src/ --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v 'translate' | wc -l | tr -d ' ')
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
