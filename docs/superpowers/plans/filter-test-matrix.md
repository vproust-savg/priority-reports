# Filter System Test Matrix

## Scope
Comprehensive testing of the filter engine: OData translation, in-memory evaluation, and Zod validation.

## Existing Coverage (server/tests/)
| File | Tests | Status |
|------|-------|--------|
| odataFilterBuilder.test.ts | 27 tests across 7 describe blocks | Partial — gaps identified below |
| serverClientFilter.test.ts | 18 tests across 1 describe block | Partial — gaps identified below |
| querySchemas (none) | 0 tests | No coverage |

---

## Test Matrix A: OData Filter Builder (`odataFilterBuilder.ts`)

### A1. Operator × Column Type Coverage

| Operator | text | date | number | currency | enum | Status |
|----------|------|------|--------|----------|------|--------|
| equals | DONE | GAP | GAP | GAP | DONE | |
| notEquals | GAP | GAP | GAP | GAP | DONE | |
| isEmpty | DONE | GAP | GAP | GAP | DONE | |
| isNotEmpty | GAP | GAP | GAP | GAP | DONE | |
| contains | DONE (skip) | n/a | n/a | n/a | n/a | |
| notContains | GAP (skip) | n/a | n/a | n/a | n/a | |
| startsWith | GAP (skip) | n/a | n/a | n/a | n/a | |
| endsWith | GAP (skip) | n/a | n/a | n/a | n/a | |
| isBefore | n/a | DONE | n/a | n/a | n/a | |
| isAfter | n/a | DONE | n/a | n/a | n/a | |
| isOnOrBefore | n/a | DONE | n/a | n/a | n/a | |
| isOnOrAfter | n/a | DONE | n/a | n/a | n/a | |
| isBetween | n/a | DONE | n/a | n/a | n/a | |
| isInWeek | n/a | DONE | n/a | n/a | n/a | |
| greaterThan | n/a | n/a | GAP | DONE | n/a | |
| lessThan | n/a | n/a | GAP | DONE | n/a | |
| greaterOrEqual | n/a | n/a | GAP | DONE | n/a | |
| lessOrEqual | n/a | n/a | GAP | DONE | n/a | |
| between | n/a | n/a | GAP | DONE | n/a | |

### A2. Edge Cases — NEW tests needed

| Test | What it verifies |
|------|-----------------|
| date equals → T00:00:00Z suffix | `eq` operator on date uses `T00:00:00Z` — potential bug if Priority stores times |
| date notEquals → T00:00:00Z suffix | Same concern for `ne` |
| number equals (integer) | Numeric equality without quotes |
| number equals (float) | Float precision: `100.50` not quoted |
| number notEquals | Numeric inequality |
| isEmpty on number column | Should return undefined (not text/enum) |
| isNotEmpty on number column | Should return undefined |
| isEmpty on date column | Should return undefined |
| isNotEmpty on date column | Should return undefined |
| notContains skipped | Client-only operator skipped in OData |
| startsWith skipped | Client-only operator skipped in OData |
| endsWith skipped | Client-only operator skipped in OData |
| isBetween missing valueTo | Should return undefined |
| isInWeek missing valueTo | Should return undefined |
| between missing valueTo | Should return undefined (NaN) |
| Zero as numeric value | `$field gt 0` not `$field gt NaN` |
| Negative number | `$field gt -5` |
| Float number | `$field gt 10.5` |
| Special chars: ampersand | `&` in string values |
| Special chars: backslash | `\` in string values |
| Deeply nested: AND → OR → AND | 3-level nesting |
| Multiple nested groups | Parent AND with 2+ child OR groups |
| Empty group | No conditions, no nested groups → undefined |
| All conditions skipped in AND | Every condition is client-side → undefined |

### A3. OR Group Safety — EXPAND existing

| Test | What it verifies |
|------|-----------------|
| OR with unknown field | isFullyServerSide returns false → entire group skipped |
| OR nested inside AND, mixed | Parent AND keeps server conditions, skips mixed child OR |
| OR group with only empty-field conditions | All conditions have field='' → skipped |

---

## Test Matrix B: Server Client Filter (`serverClientFilter.ts`)

### B1. Operator Coverage — NEW tests needed

| Operator | Status | Test description |
|----------|--------|-----------------|
| notEquals | GAP | `str !== val` case-insensitive |
| isInWeek | GAP | Falls through to isBetween — verify it works |
| equals (case-insensitive) | GAP | Verify `'ALICE'` matches `'alice'` |
| default operator | GAP | Unknown operator returns true |

### B2. Edge Cases — NEW tests needed

| Test | What it verifies |
|------|-----------------|
| null cell value for contains | `String(null)` → `'null'`, not crash |
| undefined cell value for contains | `String(undefined)` → `'undefined'`, not crash |
| null cell for isEmpty | `cellValue == null` → true |
| undefined cell for isEmpty | `cellValue == null` → true |
| whitespace-only for isEmpty | `' '.trim() === ''` → true |
| whitespace-only for isNotEmpty | `' '.trim() === ''` → false |
| case-insensitive startsWith | `'Good'` starts with `'goo'` |
| case-insensitive endsWith | `'ITEMS'` ends with `'items'` |
| between with date strings | Numeric between on date strings |
| isBetween with date strings | Date range check |
| Empty group (no conditions) | Returns all rows |
| Nested AND inside OR | Complex nesting |
| Mixed server+client AND | Server conditions skipped, client evaluated |
| Condition with empty value | Skipped (guard: `c.value` is falsy) |

---

## Test Matrix C: Zod Schema Validation (`querySchemas.ts`)

| Test | What it verifies |
|------|-----------------|
| Valid minimal request | Parses successfully |
| Missing id on FilterGroup | Rejects |
| Missing id on FilterCondition | Rejects |
| Invalid operator string | Rejects |
| >50 conditions | `.max(50)` rejects |
| >10 nested groups | `.max(10)` rejects |
| Page defaults to 1 | `.default(1)` |
| PageSize defaults to 50 | `.default(50)` |
| PageSize > 1000 | `.max(1000)` rejects |
| Page < 1 | `.min(1)` rejects |
| Empty value defaults to '' | `.default('')` |
| valueTo is optional | Parses without valueTo |
| Recursive nesting | Groups contain groups |

---

## Test Matrix D: Frontend UI (Manual/Preview)

| Area | Test | Report |
|------|------|--------|
| Operator dropdown | Text column shows 8 operators | GRV Log |
| Operator dropdown | Date column shows 10 operators | GRV Log |
| Operator dropdown | Number column shows 9 operators | GRV Log |
| Operator dropdown | Currency column shows 9 operators | GRV Log |
| Operator dropdown | Enum column shows 4 operators | GRV Log, BBD |
| WeekPicker | isInWeek shows week picker | GRV Log |
| Enum dropdown | Vendors populated | GRV Log, BBD |
| Enum dropdown | Statuses populated | GRV Log, BBD |
| Enum dropdown | Brands populated | BBD |
| Enum dropdown | Families populated | BBD |
| Enum dropdown | Perishables populated | BBD |
| Conjunction | AND toggle works | Both |
| Conjunction | OR toggle works | Both |
| Nested group | Add group button works | Both |
| Clear filters | Reset returns all rows | Both |
| Multiple conditions | Adding 3+ conditions | Both |

---

## Potential Bugs to Watch For

1. **Date `equals` in OData**: Uses `eq` with `T00:00:00Z` suffix — only matches midnight. If Priority stores `2026-01-15T08:00:00Z`, the filter won't match. May need `ge/le` range instead.
2. **`isEmpty`/`isNotEmpty` for date/number in OData**: Returns `undefined` (silently skipped). Is this correct behavior or should these operators not be available for these types?
3. **`isInWeek` in serverClientFilter**: Falls through to `isBetween` — verify the date comparison works correctly with ISO date strings.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `server/tests/odataFilterBuilder.test.ts` | EXPAND with ~25 new tests |
| `server/tests/serverClientFilter.test.ts` | EXPAND with ~15 new tests |
| `server/tests/querySchemas.test.ts` | CREATE with ~13 tests |
| `docs/filter-test-results.md` | CREATE if bugs found |
