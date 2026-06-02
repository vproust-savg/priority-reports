# Receiving Log Report Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide canceled GRVs by default (as a removable filter chip) and parse two hand-typed remark-label variants in the Receiving Log report.

**Architecture:** Three small, independent edits. (1) Backend parser gains two prefix aliases. (2) Backend status dropdown gets corrected to Priority's real `STATDES` values. (3) Frontend default filter group gains a removable `status ≠ Canceled` condition for `grv-log`. UI filters reach OData via `buildODataFilter(filterGroup)` ANDed with the base filter — so the "hide canceled" default is a frontend filter-group condition, not a backend base filter. This keeps it visible and overridable, and makes the table and Excel export behave identically (shared filter state).

**Tech Stack:** TypeScript (strict), Express, Vitest (both client and server use `vitest run`), React 19, Zod, `@shared/types`.

**Verified facts (live UAT `DOCUMENTS_P`, 2026-06-01):**
- Real `STATDES` values: `Received`, `In Progress`, `Canceled` (American single-L). The dropdown's current `Cancelled` (double-L) matches **zero** rows.
- Real remarks HTML uses labels `License Plate:` and `Time of Receiving:`. Variants `Receiving Time` / `Licence Plate` are hand-typed deviations.

**Spec:** `docs/superpowers/specs/2026-06-01-receiving-log-edits-design.md`

---

### Task 0: Create a feature branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main**

Run:
```bash
git checkout -b grv-log-canceled-and-parser
```
Expected: `Switched to a new branch 'grv-log-canceled-and-parser'`

---

### Task 1: Parser accepts label variants (`Licence Plate`, `Receiving Time`)

**Files:**
- Test (create): `server/src/services/htmlParser.test.ts`
- Modify: `server/src/services/htmlParser.ts` (`FIELD_MAP`, currently lines 25–34)

**Context:** `parseGrvRemarks(html)` strips HTML, splits into lines, and for each `key: value` line lowercases the key and matches it against `FIELD_MAP` using `rawKey.startsWith(prefix)`. Adding alias prefixes that map to the same output field is the entire change. `Licence Plate` (British) and `Receiving Time` (reversed) do not share a `startsWith` prefix with the existing `license plate` / `time of receiving` entries, so each needs its own row.

- [ ] **Step 1: Write the failing test**

Create `server/src/services/htmlParser.test.ts`:
```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/htmlParser.test.ts
// PURPOSE: Tests parseGrvRemarks — confirms both the template default
//          labels and the hand-typed label variants parse correctly.
// USED BY: Vitest (server suite)
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseGrvRemarks } from './htmlParser';

describe('parseGrvRemarks', () => {
  it('parses the template default labels (License Plate, Time of Receiving)', () => {
    const html = '<p>License Plate: ABC123<br>Time of Receiving: 14:30</p>';
    const r = parseGrvRemarks(html);
    expect(r.licensePlate).toBe('ABC123');
    expect(r.receivingTime).toBe('14:30');
  });

  it('parses the hand-typed variants (Licence Plate, Receiving Time)', () => {
    const html = '<p>Licence Plate: XYZ789<br>Receiving Time: 09:15</p>';
    const r = parseGrvRemarks(html);
    expect(r.licensePlate).toBe('XYZ789');
    expect(r.receivingTime).toBe('09:15');
  });

  it('still parses the other inspection fields', () => {
    const html = [
      'Driver ID: D-42',
      'Truck Temp. °F (dry if ambient): 34',
      'Product Surface Temp °F: 38',
      'Condition of Product (accept/reject): Accept',
      'Condition of Truck (accept/reject): Reject',
      'Comments: looked good',
    ].join('<br>');
    const r = parseGrvRemarks(`<p>${html}</p>`);
    expect(r.driverId).toBe('D-42');
    expect(r.truckTemp).toBe('34');
    expect(r.productTemp).toBe('38');
    expect(r.productCondition).toBe('Accept');
    expect(r.truckCondition).toBe('Reject');
    expect(r.comments).toBe('looked good');
  });
});
```

- [ ] **Step 2: Run the test to verify the variant case fails**

Run:
```bash
cd server && npx vitest run src/services/htmlParser.test.ts
```
Expected: the "hand-typed variants" test FAILS (`r.licensePlate` is `null`, `r.receivingTime` is `null`). The other two tests PASS (that behavior already exists).

- [ ] **Step 3: Add the two alias prefixes to `FIELD_MAP`**

In `server/src/services/htmlParser.ts`, change the `FIELD_MAP` array (lines 25–34) to add two entries. The new array:
```ts
const FIELD_MAP: Array<{ prefix: string; field: keyof GrvRemarkFields }> = [
  { prefix: 'driver id', field: 'driverId' },
  { prefix: 'license plate', field: 'licensePlate' },
  // WHY: Staff sometimes hand-type the British spelling "Licence Plate".
  { prefix: 'licence plate', field: 'licensePlate' },
  { prefix: 'truck temp', field: 'truckTemp' },
  { prefix: 'product surface temp', field: 'productTemp' },
  { prefix: 'condition of product', field: 'productCondition' },
  { prefix: 'condition of truck', field: 'truckCondition' },
  { prefix: 'comments', field: 'comments' },
  { prefix: 'time of receiving', field: 'receivingTime' },
  // WHY: Staff sometimes hand-type "Receiving Time" instead of the template's
  // "Time of Receiving". startsWith won't cross-match the two phrasings.
  { prefix: 'receiving time', field: 'receivingTime' },
];
```

- [ ] **Step 4: Run the test to verify all pass**

Run:
```bash
cd server && npx vitest run src/services/htmlParser.test.ts
```
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/htmlParser.ts server/src/services/htmlParser.test.ts
git commit -m "feat(grv-log): parse Licence Plate / Receiving Time label variants

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Correct the GRV-Log status dropdown values

**Files:**
- Modify: `server/src/routes/filters.ts` (the hardcoded `statuses` array, currently lines 84–87)

**Context:** This is the GRV-Log fallback branch (the report has no `fetchFilters`). The status options are hardcoded. Only the `statuses` array is wrong — `vendors`, `warehouses`, `users` are untouched. There is no isolated unit test for this inline array (it lives inside the router closure); it is verified by the TypeScript build plus the manual smoke check in Task 5. Do **not** refactor it into a separate module just to test it — keep the change surgical.

- [ ] **Step 1: Replace the `statuses` array with the three verified values**

In `server/src/routes/filters.ts`, replace:
```ts
      const statuses: FilterOption[] = [
        { value: 'Received', label: 'Received' },
        { value: 'Cancelled', label: 'Cancelled' },
      ];
```
with:
```ts
      // WHY: Values must match Priority's STATDES exactly. Verified against
      // live DOCUMENTS_P on 2026-06-01: 'Received', 'In Progress', 'Canceled'
      // (American single-L). The prior 'Cancelled' (double-L) matched 0 rows,
      // and 'In Progress' was missing entirely.
      const statuses: FilterOption[] = [
        { value: 'Received', label: 'Received' },
        { value: 'In Progress', label: 'In Progress' },
        { value: 'Canceled', label: 'Canceled' },
      ];
```

- [ ] **Step 2: Verify the server type-checks**

Run:
```bash
cd server && npx tsc --noEmit
```
Expected: no output (clean exit). Catches any typo or type mismatch.

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/filters.ts
git commit -m "fix(grv-log): correct status dropdown to real STATDES values

Cancelled -> Canceled (matched 0 rows), add missing In Progress.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Hide Canceled by default as a removable chip (grv-log only)

**Files:**
- Modify (test): `client/src/config/filterConstants.test.ts` (the existing `grv-log` test, plus one new negative test)
- Modify: `client/src/config/filterConstants.ts` (`createDefaultFilterGroup`, the default/else branch return)

**Context:** `createDefaultFilterGroup(reportId)` builds the initial `FilterGroup` for a report. `customer-returns` gets a month range; every other report gets a current-week date range. The root group is `and`, so adding a `{ field: 'status', operator: 'notEquals', value: 'Canceled' }` condition produces `… and STATDES ne 'Canceled'` via `buildODataFilter`. It must apply **only** to `grv-log`. The date condition must remain `conditions[0]` because the existing test (and potential consumers) read `conditions[0]` as the date filter — so append the status condition, do not prepend. `FilterCondition` is already imported at the top of `filterConstants.ts`.

- [ ] **Step 1: Update the grv-log test and add a negative test**

In `client/src/config/filterConstants.test.ts`, replace the existing test:
```ts
  it("grv-log gets the same default week range (unchanged by customer-returns branch)", () => {
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 15)); // May 15

    const group = createDefaultFilterGroup('grv-log');
    const condition = group.conditions[0];

    expect(condition.operator).toBe('isInWeek');
    expect(condition.field).toBe('date');
  });
```
with:
```ts
  it("grv-log keeps the week-range date default and hides Canceled GRVs", () => {
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 15)); // May 15

    const group = createDefaultFilterGroup('grv-log');

    // WHY: date stays first — other code reads conditions[0] as the date filter.
    expect(group.conditions[0].field).toBe('date');
    expect(group.conditions[0].operator).toBe('isInWeek');

    // Canceled GRVs hidden by default, as a removable chip.
    const statusCond = group.conditions.find((c) => c.field === 'status');
    expect(statusCond).toBeDefined();
    expect(statusCond!.operator).toBe('notEquals');
    expect(statusCond!.value).toBe('Canceled');
  });

  it("does not add a status condition for non-grv-log reports", () => {
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 15)); // May 15

    const group = createDefaultFilterGroup(); // generic default report
    expect(group.conditions.some((c) => c.field === 'status')).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify the new assertions fail**

Run:
```bash
cd client && npx vitest run src/config/filterConstants.test.ts
```
Expected: the "hides Canceled GRVs" test FAILS (`statusCond` is `undefined`). The "does not add a status condition" test PASSES already. Existing date/customer-returns tests PASS.

- [ ] **Step 3: Append the status condition for grv-log**

In `client/src/config/filterConstants.ts`, replace the default/else branch return at the end of `createDefaultFilterGroup`:
```ts
  const monday = getMonday(today);
  const sunday = getSunday(monday);

  return {
    id: 'root',
    conjunction: 'and',
    conditions: [
      {
        id: crypto.randomUUID(),
        field: 'date',
        operator: 'isInWeek',
        value: toISODate(monday),
        valueTo: toISODate(sunday),
      },
    ],
    groups: [],
  };
```
with:
```ts
  const monday = getMonday(today);
  const sunday = getSunday(monday);

  const conditions: FilterCondition[] = [
    {
      id: crypto.randomUUID(),
      field: 'date',
      operator: 'isInWeek',
      value: toISODate(monday),
      valueTo: toISODate(sunday),
    },
  ];

  // WHY: Receiving Log hides canceled GRVs by default as a removable chip the
  // user can edit (-> "is Canceled") or delete to reveal them. 'Canceled' is
  // the exact STATDES value in Priority (verified 2026-06-01). Appended after
  // the date condition so conditions[0] stays the date filter.
  if (reportId === 'grv-log') {
    conditions.push({
      id: crypto.randomUUID(),
      field: 'status',
      operator: 'notEquals',
      value: 'Canceled',
    });
  }

  return {
    id: 'root',
    conjunction: 'and',
    conditions,
    groups: [],
  };
```

- [ ] **Step 4: Run the test to verify all pass**

Run:
```bash
cd client && npx vitest run src/config/filterConstants.test.ts
```
Expected: all tests in the file PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/config/filterConstants.ts client/src/config/filterConstants.test.ts
git commit -m "feat(grv-log): hide Canceled GRVs by default via removable filter chip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full test suites green

**Files:** none (verification only)

- [ ] **Step 1: Run the full server suite**

Run:
```bash
cd server && npm test
```
Expected: all tests pass, including the new `htmlParser.test.ts`.

- [ ] **Step 2: Run the full client suite**

Run:
```bash
cd client && npm test
```
Expected: all tests pass, including the updated `filterConstants.test.ts`.

---

### Task 5: Pre-deploy type-check gate + manual smoke

**Files:** none (verification only)

**Context:** Both TypeScript builds must pass cleanly — any error kills the Railway Docker build (`noUnusedLocals` is on). The manual smoke confirms the dropdown and default-chip behavior the unit tests can't cover end-to-end.

- [ ] **Step 1: Client build type-check**

Run:
```bash
cd client && npx tsc -b --noEmit
```
Expected: no output (clean exit).

- [ ] **Step 2: Server build type-check**

Run:
```bash
cd server && npx tsc --noEmit
```
Expected: no output (clean exit).

- [ ] **Step 3: Manual smoke (run both dev servers)**

Run, in two terminals:
```bash
cd server && npm run dev      # Express on :3001
cd client && npm run dev      # Vite on :5173
```
Then open the Receiving Log page and confirm:
- On load, the table shows **no** Canceled rows, and a "Status is not Canceled" filter chip is visible alongside the date-week chip.
- Editing that chip's operator to "is" (Status **is** Canceled) shows only canceled GRVs; deleting the chip shows all statuses.
- The status dropdown lists exactly **Received, In Progress, Canceled** (no `Cancelled`).
- Exporting to Excel reflects the same filtered rows as the table.

> **Cache caveat:** The `/filters` response is cached in Redis for 1 hour under `filters:grv-log`. If the dropdown still shows the old `Cancelled`, the cache is stale — wait for the TTL or clear that key; it self-heals within an hour and on a fresh cache.

- [ ] **Step 4: Final no-op commit check**

Run:
```bash
git status
```
Expected: clean working tree (all changes already committed in Tasks 1–3). The stray untracked `API call example.docx` is unrelated and should be left alone.

---

## Self-Review

**Spec coverage:**
- "Hide canceled by default (removable chip)" → Task 3. ✓
- "Parse `Receiving Time` / `Licence Plate` variants" → Task 1. ✓
- "Correct status dropdown (prerequisite)" → Task 2. ✓
- "TDD: new htmlParser test, extended filterConstants test" → Tasks 1 & 3. ✓
- "Pre-deploy tsc gates + manual" → Task 5. ✓
- "Cache self-heal note" → Task 5 caveat. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command and expected result.

**Type consistency:** `FilterCondition` is imported in `filterConstants.ts`; condition shape (`id`/`field`/`operator`/`value`/`valueTo?`) matches `createEmptyCondition`. `FilterOption` is already imported in `filters.ts`. `GrvRemarkFields` keys (`licensePlate`, `receivingTime`, etc.) match the test assertions and `FIELD_MAP` `field` values. Operator `notEquals` is valid for `enum` columns per `OPERATORS_BY_TYPE.enum` and maps to OData `ne` in `odataFilterBuilder`.
