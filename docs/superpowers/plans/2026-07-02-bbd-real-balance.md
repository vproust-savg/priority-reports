# BBD Real Warehouse Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Project-specific override:** per memory, subagents cannot reliably read this iCloud-backed repo — execute INLINE in the controller session (executing-plans), not via subagents.

**Goal:** Make the BBD report's Balance column show real current warehouse stock (sum of all bin balances) and hide lots whose stock is ≤ 0.

**Architecture:** Single-file change to the BBD report definition. The existing RAWSERIAL query gains `$expand=RAWSERIALBAL_SUBFORM($select=BALANCE)`; a new pure function sums bin balances; `transformRow` uses that sum for `balance` and `value`. The existing `filterRows` (`balance > 0`) then naturally drops dead lots. `$top` rises 2000 → 5000 to clear observed truncation.

**Tech Stack:** Express + TypeScript (strict), Vitest, Priority OData API.

**Spec:** `docs/superpowers/specs/2026-07-02-bbd-real-balance-design.md`

**Verified facts (don't re-derive):**
- `$expand=RAWSERIALBAL_SUBFORM($select=...)` works on RAWSERIAL (tested live against UAT: 200 rows, 41 KB, 3.1 s).
- `queryPriority`'s `ODataParams` already has an `$expand` field with correct raw-append URL handling (`server/src/services/priorityClient.ts:41-44`). No client changes needed.
- The expanded-row UI (`client/src/components/details/BbdDetailPanel.tsx:63`) displays `sfRow.BALANCE` per bin — that's why we sum `BALANCE`, not `TBALANCE`.
- Production baseline (2026-07-01): 645 report rows, none with balance < 1, many lots with empty sub-forms.
- All bin dispositions count (Available, Damaged, Past BBD, Pending Disposal, …) — Victor's explicit decision.

---

### Task 1: `sumBinBalances` pure function

**Files:**
- Modify: `server/src/reports/bbdReport.ts` (add function near `buildExtensionMap`, after line 115)
- Test: `server/tests/bbdTransformRow.test.ts`

- [ ] **Step 1: Write the failing tests**

In `server/tests/bbdTransformRow.test.ts`, change the side-effect import (line 13) to a named import:

```ts
// WHY: Named import also side-effect-registers the report into reportRegistry.
import { sumBinBalances } from '../src/reports/bbdReport';
```

Append a new describe block at the end of the file:

```ts
describe('sumBinBalances', () => {
  it('sums BALANCE across multiple bins', () => {
    expect(sumBinBalances([{ BALANCE: 3 }, { BALANCE: 2 }])).toBe(5);
  });

  it('counts negative bins against the total', () => {
    expect(sumBinBalances([{ BALANCE: 5 }, { BALANCE: -7 }])).toBe(-2);
  });

  it('returns 0 for an empty array', () => {
    expect(sumBinBalances([])).toBe(0);
  });

  it('returns 0 when the sub-form is missing', () => {
    expect(sumBinBalances(undefined)).toBe(0);
  });

  it('coerces numeric-string BALANCE values', () => {
    expect(sumBinBalances([{ BALANCE: '4' }, { BALANCE: '1.5' }])).toBe(5.5);
  });

  it('treats missing or non-numeric BALANCE as 0', () => {
    expect(sumBinBalances([{}, { BALANCE: 'abc' }, { BALANCE: 2 }])).toBe(2);
  });
});
```

Also update the test file's intent block PURPOSE line to:

```
// PURPOSE: Tests for BBD report — transformRow fields, sumBinBalances,
//          buildQuery shape, and filterRows exclusion.
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`): `npx vitest run tests/bbdTransformRow.test.ts`
Expected: FAIL — `sumBinBalances` is not exported.

- [ ] **Step 3: Implement `sumBinBalances`**

In `server/src/reports/bbdReport.ts`, insert after `buildExtensionMap` (after line 115):

```ts
// WHY: Pure function extracted for testability. Current physical stock is the
// sum of BALANCE across ALL bin rows — every disposition counts (Available,
// Damaged, Past BBD, Pending Disposal; Victor's decision 2026-07-02).
// Empty/missing sub-form means the lot has no stock left → 0.
// Number() guards numeric-string values (Priority may return either under
// IEEE754Compatible).
export function sumBinBalances(bins: unknown): number {
  if (!Array.isArray(bins)) return 0;
  return bins.reduce((sum: number, bin) => {
    const n = Number((bin as Record<string, unknown>).BALANCE ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bbdTransformRow.test.ts`
Expected: PASS (all, including the 6 pre-existing transformRow tests — untouched so far).

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/bbdReport.ts server/tests/bbdTransformRow.test.ts
git commit -m "feat(bbd): add sumBinBalances for real warehouse stock totals"
```

---

### Task 2: `buildQuery` — `$expand` bin balances + `$top` 5000

**Files:**
- Modify: `server/src/reports/bbdReport.ts:59-76` (`buildQuery`)
- Test: `server/tests/bbdTransformRow.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/bbdTransformRow.test.ts`:

```ts
describe('bbdReport buildQuery', () => {
  const report = getReport('bbd')!;

  it('expands RAWSERIALBAL_SUBFORM with nested $select on BALANCE', () => {
    const params = report.buildQuery({});
    expect(params.$expand).toBe('RAWSERIALBAL_SUBFORM($select=BALANCE)');
  });

  it('fetches up to 5000 rows to clear the 2000-row truncation', () => {
    const params = report.buildQuery({});
    expect(params.$top).toBe(5000);
  });
});
```

Note: `buildQuery` takes `ReportFilters`; `{}` is valid because BBD ignores it (`_filters`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/bbdTransformRow.test.ts`
Expected: FAIL — `$expand` is `undefined`, `$top` is `2000`.

- [ ] **Step 3: Update `buildQuery`**

Replace the return statement in `buildQuery` (`server/src/reports/bbdReport.ts:64-75`) with:

```ts
  return {
    // WHY: QUANT is the original lot quantity on RAWSERIAL — it never
    // decreases, so it can't detect consumed lots. Kept in $filter as a cheap
    // server-side row reducer only.
    $select: 'PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,QUANT,UNITNAME,SERIALNAME,CURDATE,Y_8737_0_ESH',
    // WHY: Real current stock lives in RAWSERIALBAL_SUBFORM bin rows.
    // BALANCE (not TBALANCE) matches what BbdDetailPanel shows per bin, so
    // the table total equals the sum of the visible expanded rows.
    $expand: 'RAWSERIALBAL_SUBFORM($select=BALANCE)',
    $filter: `EXPIRYDATE le ${cutoffIso} and QUANT gt 0`,
    $orderby: 'EXPIRYDATE asc',
    // WHY: Single fetch (post-fetch filtering makes OData pagination
    // unreliable). 5000 clears the observed 2000-row truncation and stays
    // well under MAXAPILINES (50,000) and the 3-minute request timeout.
    $top: 5000,
    $skip: 0,
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bbdTransformRow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/bbdReport.ts server/tests/bbdTransformRow.test.ts
git commit -m "feat(bbd): expand bin balances in main query, raise \$top to 5000"
```

---

### Task 3: `transformRow` — balance and value from bin sum

**Files:**
- Modify: `server/src/reports/bbdReport.ts:138-190` (`transformRow`), intent block lines 1-9
- Test: `server/tests/bbdTransformRow.test.ts`

- [ ] **Step 1: Update existing tests + write new failing tests**

In `server/tests/bbdTransformRow.test.ts`:

(a) Replace the `'computes value = QUANT * Y_8737_0_ESH'` test (lines 29-38) with:

```ts
  it('computes value = bin balance sum * Y_8737_0_ESH', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: '2026-02-05T00:00:00Z', Y_8737_0_ESH: 33.97,
      SERIALNAME: '0000',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 6 }, { BALANCE: 4 }],
    });
    expect(row.value).toBeCloseTo(339.7, 2);
  });
```

(b) In the `'value is 0 when Y_8737_0_ESH is 0'` test, add to the raw object:

```ts
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 84 }],
```

(c) In the `'value is 0 when Y_8737_0_ESH is null'` test, add to the raw object:

```ts
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 10 }],
```

(d) Append new tests inside the `'bbdReport transformRow'` describe block:

```ts
  it('balance = sum of RAWSERIALBAL_SUBFORM bins, not QUANT', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L1',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 3 }, { BALANCE: 4 }],
    });
    expect(row.balance).toBe(7);
  });

  it('balance is 0 when the lot has no bin rows (fully consumed)', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L2',
      RAWSERIALBAL_SUBFORM: [],
    });
    expect(row.balance).toBe(0);
    expect(row.value).toBe(0);
  });

  it('balance goes negative when bins net below zero', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 100, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: 'Acme',
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L3',
      RAWSERIALBAL_SUBFORM: [{ BALANCE: 2 }, { BALANCE: -5 }],
    });
    expect(row.balance).toBe(-3);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/bbdTransformRow.test.ts`
Expected: FAIL — `row.balance` still comes from `QUANT` (100), `row.value` from `QUANT × price`.

- [ ] **Step 3: Update `transformRow`**

In `server/src/reports/bbdReport.ts`, replace lines 139-141:

```ts
  // WHY: QUANT (lot quantity) is fetched directly from RAWSERIAL via $select
  // (and filtered via $filter to only include > 0). No sub-form needed.
  const balance = Number(raw.QUANT ?? 0);
```

with:

```ts
  // WHY: Real current stock = sum of expanded bin balances. QUANT (original
  // lot quantity) never decreases, so it can't detect consumed lots.
  // filterRows drops rows where this sum is <= 0.
  const balance = sumBinBalances(raw.RAWSERIALBAL_SUBFORM);
```

And replace line 180:

```ts
    value: Number(raw.QUANT ?? 0) * Number(raw.Y_8737_0_ESH ?? 0),
```

with:

```ts
    value: balance * Number(raw.Y_8737_0_ESH ?? 0),
```

Also update the file intent block (lines 3-6) to reflect reality:

```
// PURPOSE: BBD (Best By Dates) report. Queries RAWSERIAL for items
//          nearing or past expiration, with bin balances inlined via
//          $expand. Balance = sum of all bins; lots with no remaining
//          stock are excluded. Provides dropdown filter values.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/bbdTransformRow.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/bbdReport.ts server/tests/bbdTransformRow.test.ts
git commit -m "feat(bbd): balance and value from summed bin balances"
```

---

### Task 4: `filterRows` characterization test (no code change)

**Files:**
- Test: `server/tests/bbdTransformRow.test.ts`

- [ ] **Step 1: Write the test (expected to pass immediately)**

Append to `server/tests/bbdTransformRow.test.ts`:

```ts
describe('bbdReport filterRows', () => {
  const report = getReport('bbd')!;

  it('drops rows with balance <= 0, keeps positive-balance flagged rows', () => {
    const rows = [
      { balance: 5, status: 'expired', daysUntilExpiry: -1 },
      { balance: 0, status: 'expired', daysUntilExpiry: -2 },
      { balance: -3, status: 'expiring-perishable', daysUntilExpiry: 3 },
    ];
    const result = report.filterRows!(rows);
    expect(result).toHaveLength(1);
    expect(result[0].balance).toBe(5);
  });
});
```

- [ ] **Step 2: Run the full server suite**

Run (from `server/`): `npm test -- --run`
Expected: PASS — everything, including untouched suites.

- [ ] **Step 3: Commit**

```bash
git add server/tests/bbdTransformRow.test.ts
git commit -m "test(bbd): characterize filterRows exclusion of balance <= 0"
```

---

### Task 5: Type checks + local UAT smoke test

**Files:** none modified (verification only)

- [ ] **Step 1: Pre-deploy TypeScript checks (both must pass cleanly)**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
```

Expected: no output, exit 0. Any error kills the Railway Docker build — fix before proceeding.

- [ ] **Step 2: Start the server locally (UAT credentials)**

From `server/`: `npm run dev` (background). Wait for the listening log on port 3001.

- [ ] **Step 3: Smoke-test the query endpoint**

```bash
curl -s --max-time 180 -X POST "http://localhost:3001/api/v1/reports/bbd/query" \
  -H "Content-Type: application/json" \
  -d '{"filterGroup":{"id":"root","conjunction":"and","conditions":[],"groups":[]},"page":1,"pageSize":1000}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=d['data']
bad=[r for r in rows if not (isinstance(r['balance'],(int,float)) and r['balance']>0)]
print('rows:',len(rows),'| balance<=0 rows:',len(bad))
assert not bad, bad[:3]
print('OK: every visible lot has positive real stock')"
```

Expected: `balance<=0 rows: 0` and the OK line. (UAT data, so the row count will differ from production.)

- [ ] **Step 4: Stop the dev server.**

---

### Task 6: Deploy + production verification

**Files:** none modified

- [ ] **Step 1: Push to main (Railway auto-deploys)**

```bash
git push origin main
```

- [ ] **Step 2: Wait for deploy, confirm health**

Poll until healthy (deploys take a few minutes):

```bash
curl -s "https://priority-reports-production.up.railway.app/api/v1/health"
```

Expected: `{"status":"ok","environment":"production",...}`.

- [ ] **Step 3: Verify production output**

```bash
curl -s --max-time 180 -X POST "https://priority-reports-production.up.railway.app/api/v1/reports/bbd/query" \
  -H "Content-Type: application/json" \
  -d '{"filterGroup":{"id":"root","conjunction":"and","conditions":[],"groups":[]},"page":1,"pageSize":1000}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=d['data']
bad=[r for r in rows if not (isinstance(r['balance'],(int,float)) and r['balance']>0)]
print('rows:',len(rows),'(baseline was 645) | balance<=0:',len(bad))
assert not bad
print('sample:',{k:rows[0][k] for k in ('serialName','partNumber','balance','value')})"
```

Expected: 0 rows with balance ≤ 0; row count meaningfully below the 645 baseline (dead lots removed). NOTE: the query cache TTL is 15 min — if the response `meta.cache` says `hit` with a pre-deploy `generatedAt`, hit `POST /api/v1/reports/bbd/refresh` first or wait out the TTL.

- [ ] **Step 4: Spot-check one lot: table balance = sum of its expanded bin rows**

Pick a `serialName` from the sample above, then:

```bash
curl -s "https://priority-reports-production.up.railway.app/api/v1/reports/bbd/subform/<SERIAL>" \
  | python3 -c "
import json,sys
bins=json.load(sys.stdin)['data']
print('bin BALANCEs:',[b['BALANCE'] for b in bins],'sum:',sum(b['BALANCE'] for b in bins))"
```

Expected: sum equals the lot's table `balance`.

- [ ] **Step 5: Verify in the Airtable embed** (per CLAUDE.md, iframe behavior can differ): open the Airtable Interface page "Reports > Food Safety" and confirm the BBD widget renders with the reduced lot list.

---

## Self-Review Notes

- Spec coverage: Req 1 (all-bins balance) → Tasks 1-3; Req 2 (hide ≤ 0) → Task 4 (existing code, characterized); Req 3 (value) → Task 3; Req 4 (nothing else changes) → surgical edits only; truncation fix → Task 2; environment → verified, no task needed.
- `report.buildQuery({})` — `ReportFilters` fields are all optional (GRV concepts BBD ignores); `{}` compiles.
- `filterRows` is optional on `ReportDefinition`, hence the non-null assertion in tests.
- Existing tests at lines 62-83 remain green after fixture updates ((b)/(c)) because 0-price × any balance = 0.
