# BBD Extend Validation Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the controller session. **Do NOT use subagent-driven-development for this repo** — it is iCloud-backed and subagents cannot reliably read it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BBD extend-shelf-life feature work again — POST /bbd/extend currently 400s ("Invalid request") for ~98% of lots because `rowData.vendor` is `null` and 3 lots have `.` in their lot number.

**Architecture:** Three surgical changes per the approved spec (`docs/superpowers/specs/2026-07-07-bbd-extend-validation-fix-design.md`): (1) null-tolerant `RowDataSchema` + dot in the `serialName` regex in `extend.ts` — the primary fix, immune to Redis/TanStack cache staleness; (2) `?? ''` vendor default in `transformRow`; (3) client surfaces the first Zod issue from the 400 `details` payload.

**Tech Stack:** Express 5 + Zod v4 (`^4.3.6`) on the server, React 19 + TanStack Query v5 on the client, Vitest + supertest for tests. Deploys to Railway on push to `main`.

---

### Task 1: Null-tolerant RowDataSchema + serialName dot support

**Files:**
- Modify: `server/src/routes/extend.ts:22-42`
- Test: `server/src/routes/extend.test.ts`

- [ ] **Step 1: Write three failing tests**

In `server/src/routes/extend.test.ts`, add the first two tests at the END of the `describe('ExtendRequestSchema', ...)` block (after the `'rejects items over 100 entries'` test, before the closing `});` on line 130):

```ts
  it('accepts rowData with null vendor — normalized to empty string', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: JSON.stringify({ EXPIRYDATE: '2026-04-01T00:00:00Z' }) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: null,
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    expect(res.status).toBe(200);
    expect(res.body.results[0].success).toBe(true);
  });

  it('accepts serialName containing a dot', async () => {
    mockFetchWithRetry.mockResolvedValue({ status: 200, body: JSON.stringify({ EXPIRYDATE: '2026-04-01T00:00:00Z' }) });
    mockPostWithRetry.mockResolvedValue({ status: 200, body: '{}' });

    const res = await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: '2518-41.24', days: 7 }],
    });

    expect(res.status).toBe(200);
  });
```

Add the third test at the END of the `describe('POST /bbd/extend — rowData', ...)` block (after the `'response shape unchanged — rowData not in results'` test, before that block's closing `});`). This block's `beforeEach` already primes the Priority mocks:

```ts
  it('normalizes null vendor to empty string in the Airtable snapshot', async () => {
    await request(app).post('/api/v1/reports/bbd/extend').send({
      items: [{ serialName: 'LOT001', days: 7, rowData: {
        partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
        unit: 'KG', value: 125, purchasePrice: 2.5, vendor: null,
        perishable: 'Yes', brand: 'BrandX', family: 'Sweet', expiryDate: '2026-04-01',
      } }],
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(mockSnapshotExtendedItem).toHaveBeenCalledWith(
      'LOT001',
      expect.objectContaining({ vendor: '' }),
      expect.any(String),
      7,
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npm test -- extend.test`
Expected: 3 FAIL — the first two with `expected 400 to be 200`, the third with `snapshotExtendedItem` not called. All pre-existing tests still pass.

- [ ] **Step 3: Implement the schema change**

In `server/src/routes/extend.ts`, replace lines 22–42 (from `const RowDataSchema = z.object({` through the end of `ExtendRequestSchema`) with:

```ts
// WHY: rowData mirrors report rows, where Priority-sourced fields can be
// null (SUPDES → vendor is null on most live lots, verified 2026-07-07)
// and NaN numbers arrive as null after JSON serialization. It is a display
// snapshot for Airtable, not a business invariant — normalize, don't 400.
const nullableString = z.string().nullish().transform((v) => v ?? '');
const nullableNumber = z.number().nullish().transform((v) => v ?? 0);

const RowDataSchema = z.object({
  partNumber: nullableString,
  partDescription: nullableString,
  balance: nullableNumber,
  unit: nullableString,
  value: nullableNumber,
  purchasePrice: nullableNumber,
  vendor: nullableString,
  perishable: nullableString,
  brand: nullableString,
  family: nullableString,
  expiryDate: nullableString,
}).optional();

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    // WHY: Charset allowlist is the OData injection guard. '.' added because
    // real lot numbers contain it (e.g. 2518-41.24, 3 live lots 2026-07-07);
    // it is inert inside a quoted literal. Single quotes are escaped at use.
    serialName: z.string().regex(/^[a-zA-Z0-9_\-. ]+$/),
    days: z.number().int().min(1).max(365),
    rowData: RowDataSchema,
  })).min(1).max(100),
});
```

No other changes in the file — the transformed output types are still `string`/`number`, so `processExtendItem` and `snapshotExtendedItem` compile unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- extend.test`
Expected: ALL PASS (including the pre-existing `'rejects invalid serialName characters'` — `<`/`>` are still outside the allowlist).

Then run the full suite: `cd server && npm test`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/extend.ts server/src/routes/extend.test.ts
git commit -m "fix(bbd-extend): tolerate null rowData fields and dots in lot numbers

Root cause of 'Invalid request': vendor is null on 104/106 live lots
(SUPDES empty in RAWSERIAL) and z.string() rejects null; 3 lots also
have '.' in serialName. Normalize nullish snapshot fields instead of
400ing; widen the injection-guard charset by '.' only.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Vendor default in transformRow

**Files:**
- Modify: `server/src/reports/bbdReport.ts:205`
- Test: `server/tests/bbdTransformRow.test.ts`

- [ ] **Step 1: Write the failing test**

In `server/tests/bbdTransformRow.test.ts`, add at the END of the `describe('bbdReport transformRow', ...)` block (after the `'balance goes negative when bins net below zero'` test, before that block's closing `});`):

```ts
  it('defaults vendor to empty string when SUPDES is null', () => {
    const row = report.transformRow({
      PARTNAME: 'P001', PARTDES: 'Widget', QUANT: 10, UNITNAME: 'ea',
      EXPIRYDATE: '2026-04-01T00:00:00Z', SUPDES: null,
      Y_9966_5_ESH: 'No', Y_9952_5_ESH: '', Y_2074_5_ESH: '',
      CURDATE: null, Y_8737_0_ESH: 10,
      SERIALNAME: 'L4',
    });
    expect(row.vendor).toBe('');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- bbdTransformRow`
Expected: 1 FAIL — `expected null to be ''`.

- [ ] **Step 3: Implement the one-line default**

In `server/src/reports/bbdReport.ts` line 205, change:

```ts
    vendor: raw.SUPDES,
```

to:

```ts
    vendor: raw.SUPDES ?? '',
```

(Matches the existing `unit: raw.UNITNAME ?? ''` / `brand: raw.Y_9952_5_ESH ?? ''` pattern in the same return object. No new WHY comment needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npm test -- bbdTransformRow`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/bbdReport.ts server/tests/bbdTransformRow.test.ts
git commit -m "fix(bbd): default vendor to empty string when SUPDES is null

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Surface the Zod issue in the client error message

**Files:**
- Modify: `client/src/hooks/useExtendExpiry.ts:51-54`

No unit test for this task: it is 6 lines of defensive string formatting inside the fetch wrapper; testing it would require mocking `fetch` + a QueryClient harness for marginal value. It is exercised end-to-end in Task 4. (Decision approved in the spec.)

- [ ] **Step 1: Implement the detail extraction**

In `client/src/hooks/useExtendExpiry.ts`, replace:

```ts
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? `Request failed: ${res.status}`);
      }
```

with:

```ts
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // WHY: Validation 400s carry field-level Zod issues in `details`.
        // Surface the first one so the modal says WHICH field failed and why
        // (a bare "Invalid request" hid the vendor:null root cause for months).
        const issue = Array.isArray(errorData.details) ? errorData.details[0] : undefined;
        const detail = issue?.message
          ? ` — ${Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join('.') + ': ' : ''}${issue.message}`
          : '';
        throw new Error((errorData.error ?? `Request failed: ${res.status}`) + detail);
      }
```

Both `ExtendExpiryModal` (renders `errorMessage`) and `BulkExtendModal` (renders `err.message`, line 139) display the enriched message with no further changes.

- [ ] **Step 2: Verify client build and tests**

Run: `cd client && npx tsc -b --noEmit`
Expected: clean exit, no output. (`noUnusedLocals` is on — both new consts are used.)

Run: `cd client && npm test`
Expected: ALL PASS (no client test touches this hook).

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useExtendExpiry.ts
git commit -m "feat(bbd-extend): show field-level Zod issue in extend error message

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Pre-deploy verification, deploy, post-deploy proof

**Files:** none created — verification only.

- [ ] **Step 1: Full pre-deploy checklist (railway-deploy guardrails)**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npm run build
grep -r "@shared" dist/ && echo "FAIL: unresolved @shared imports" || echo "OK"
npm test
```

Expected: both builds clean, grep prints `OK`, full server suite passes.

- [ ] **Step 2: Push to main (triggers Railway auto-deploy)**

```bash
git push origin main
```

- [ ] **Step 3: Confirm deploy is healthy**

Wait ~3–5 minutes, then:

```bash
curl -s https://priority-reports-production.up.railway.app/api/health
```

Expected: healthy JSON response (HTTP 200).

- [ ] **Step 4: Post-deploy read-only replica check**

Fetch fresh production rows and evaluate them against the NEW rules — read-only, no writes:

```bash
curl -s --max-time 170 -X POST "https://priority-reports-production.up.railway.app/api/v1/reports/bbd/query" \
  -H 'Content-Type: application/json' \
  -d '{"filterGroup":{"id":"root","conjunction":"and","conditions":[],"groups":[]},"page":1,"pageSize":1000}' \
  -o /tmp/bbd-postdeploy.json
```

```python
import json, re
rows = json.load(open('/tmp/bbd-postdeploy.json'))['data']
SERIAL_RE = re.compile(r'^[a-zA-Z0-9_\-. ]+$')  # new regex, dot allowed
STR = ['partNumber','partDescription','unit','vendor','perishable','brand','family','expiryDate']
NUM = ['balance','value','purchasePrice']
bad = [r['serialName'] for r in rows if not (
    isinstance(r.get('serialName'), str) and SERIAL_RE.match(r['serialName'])
    and all(r.get(f) is None or isinstance(r.get(f), str) for f in STR)
    and all(r.get(f) is None or (isinstance(r.get(f), (int,float)) and not isinstance(r.get(f), bool)) for f in NUM)
)]
print(f"{len(rows)} rows, {len(bad)} would fail extend validation: {bad}")
```

Expected: `N rows, 0 would fail extend validation: []` (N ≈ 106; drifts as lots change).

- [ ] **Step 5: Live end-to-end proof (requires Victor)**

One real extend writes an `EXPDEXT` record in Priority — Victor either names a sacrificial lot for me to extend by 1 day, or clicks Extend himself in the Airtable embed (Reports → Food Safety). Confirm: modal shows "Extended successfully", the lot's new expiry appears after refresh, and the lot shows on the Extended tab (Airtable snapshot). If it fails, the modal now names the failing field — capture that message.

- [ ] **Step 6: Mark the spec Status line**

Update `docs/superpowers/specs/2026-07-07-bbd-extend-validation-fix-design.md` header to `**Status:** Implemented (YYYY-MM-DD)` with the deploy date, and commit:

```bash
git add docs/superpowers/specs/2026-07-07-bbd-extend-validation-fix-design.md
git commit -m "docs(bbd): mark extend validation fix spec implemented

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```
