# BBD Report — Real Warehouse Balance (Design)

**Date:** 2026-07-02
**Status:** Approved by Victor (pending spec review)

## Problem

The BBD (Best By Dates) report's Balance column shows `RAWSERIAL.QUANT` — the
original lot quantity — not current stock. Fully consumed lots (empty
`RAWSERIALBAL_SUBFORM`) still appear in the report because `QUANT` stays
positive forever. This makes the expiration alert list noisy with inventory
that is already gone.

Verified in production (2026-07-01): 645 report rows; spot-checked lots show
many with an empty warehouse-balance sub-form (e.g., lot `188`).

## Environment (no change needed)

Verified empirically that the deployed Railway dashboard reads **production**
Priority: dashboard data diverges from a direct UAT query in ways only
possible across different databases (lots `010626`/`070426` have `QUANT = 0`
in UAT but appear on the dashboard; lot `081525` doesn't exist in UAT).
Local dev `.env` stays `PRIORITY_ENV=uat` — correct for development.

## Requirements

1. Balance column = the lot's **current physical balance**: sum of `BALANCE`
   across ALL `RAWSERIALBAL_SUBFORM` bin rows, regardless of disposition
   (`Available`, `Damaged`, `Past BBD`, `Pending Disposal`, `Disposed`, …).
2. Hide a lot when that balance is **≤ 0** (zero or negative).
3. Value column = current balance × purchase price.
4. All other columns, statuses, sorting, and filters unchanged.

Decision history: Victor explicitly chose all-bins counting and confirmed
lots in non-Available dispositions (e.g., Pending Disposal) must still show.

## Design

All changes in `server/src/reports/bbdReport.ts` plus tests.

### 1. Fetch bin balances inline (`buildQuery`)

Add to the existing RAWSERIAL query:

```
$expand: 'RAWSERIALBAL_SUBFORM($select=BALANCE)'
```

- Verified live against UAT: works on RAWSERIAL (no DOCUMENTS_P abort bug),
  200 rows ≈ 41 KB / 3.1 s.
- `BALANCE` (not `TBALANCE`) so the row total exactly equals the sum of the
  bin rows shown in `BbdDetailPanel.tsx` (which displays `sfRow.BALANCE`).
- `queryPriority`'s `ODataParams.$expand` already handles the raw-append URL
  encoding requirement.

### 2. Sum bins (`transformRow` + new pure function)

New exported pure function (mirrors the `buildExtensionMap` testability
pattern):

```ts
export function sumBinBalances(bins: Array<{ BALANCE?: unknown }> | undefined): number
```

Sums `Number(BALANCE ?? 0)` over all bins; empty/missing sub-form → 0.

In `transformRow`:
- `balance` = `sumBinBalances(raw.RAWSERIALBAL_SUBFORM)`
- `value` = `balance × Number(raw.Y_8737_0_ESH ?? 0)`

`QUANT` remains in `$select`/`$filter` (`QUANT gt 0`) as a cheap server-side
row reducer, but is no longer displayed.

### 3. Row exclusion (`filterRows`)

No code change — the existing `balance > 0` check now operates on real stock,
hiding lots with zero bins or a ≤ 0 total.

### 4. Truncation fix (`buildQuery`)

`$top` 2000 → 5000. The single fetch currently caps at exactly 2000 raw rows
(observed), silently dropping the newest expiries in the 30-day window.
MAXAPILINES is 50,000, so 5000 is safe; payload stays ~1–2 MB.
Confirmed real: a `$top=5000` UAT fetch returned 2,038 matching rows —
`$top=2000` was cutting ~38 lots.

### 5. HTTP timeout raise (`priorityHttp.ts`)

Benchmarked (UAT, 2026-07-02): the expanded query takes **19–24 s
time-to-first-byte** (Priority computes the full expand before streaming).
The GET socket timeout in `server/src/services/priorityHttp.ts` is 30 s —
too close for safety; a slow day fails the report and triggers pointless
retries. Raise the GET timeout `30_000` → `120_000` (still under Priority's
3-minute server cap). PATCH timeout untouched.

## Error handling

If Priority omits the sub-form for a row (null/undefined), `sumBinBalances`
returns 0 and the lot is hidden — consistent with "no bins = no stock".
No new failure modes: the expand rides the existing query; a failed query
already surfaces as a report error.

## Testing

- Extend `server/tests/bbdTransformRow.test.ts`:
  - multiple bins sum correctly
  - empty sub-form → balance 0 (row later filtered out)
  - negative bins reduce the total (net ≤ 0 → filtered out)
  - mixed dispositions all counted
  - value = summed balance × price
- Pre-deploy: `npx tsc -b --noEmit` (client) and `npx tsc --noEmit` (server).
- Post-deploy: fetch production BBD query, assert no row with balance ≤ 0 and
  row count dropped from the 645 baseline; spot-check one lot's table balance
  against its expanded bin rows.

## Known limitation

The Unit column still shows the parent `RAWSERIAL.UNITNAME` while bin
`BALANCE` values are in each bin's own unit. In every sampled lot these
match; if a lot ever stores bins in a different unit, the expanded detail
panel (which shows per-bin units) is the source of truth.

## Out of scope

- Filtering bins by disposition (explicitly rejected — all dispositions count).
- Changing the expanded detail panel, columns, or Excel export shape.
- Cursor-based pagination beyond the `$top` bump.
