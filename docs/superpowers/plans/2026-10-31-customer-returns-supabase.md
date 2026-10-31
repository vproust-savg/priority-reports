# Customer Returns from Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `customer-returns-supabase` report and a hidden page that show the Final customer returns from the Supabase view `priority_reports.customer_returns_log`, laid out like today's Customer Returns page.

**Architecture:** This twins `grvLogSupabase.ts`. A self-registering ReportConfig gets `fetchRows`, which runs parameterized SQL through `querySupabase` and `buildSqlWhere`. `transformRow` maps the view's snake_case columns to the old report's row keys, so the existing widget, AttachmentsCell, and the fallback Excel work unchanged. The client change is config only.

**Tech Stack:** Express 5 + TS, node-postgres (`querySupabase`), Vitest, React 19 config files.

**Spec:** `docs/superpowers/specs/2026-10-31-customer-returns-supabase-design.md` (builds on `docs/superpowers/specs/2026-10-30-grv-supabase-design.md`)

## Global Constraints

- Work in `~/worktrees/priority-reports-cr-supabase` on branch `feat/customer-returns-supabase`. Never on `main`, and never push without Victor's yes.
- Every new file starts with the intent block (`FILE`, `PURPOSE`, `USED BY`, `EXPORTS`). Comments are WHY-only. Server tests go in `server/tests/`.
- The report id is `customer-returns-supabase`. The page id is `customer-returns-supabase` and its path is `/customer-returns-supabase`, with `hiddenFromNav: true`.
- The status literal is exactly `'Final'`. The history floor is exactly `'2026-06-29'`.
- The warning text is exactly: `This page holds returns from 2026-06-29 on. For earlier dates, use the Customer Returns page.`
- The `invoiceNum` label is `Credit Memo #`, in both `columns` and `filterColumns`. Every other key, label and type is copied from `server/src/reports/customerReturns.ts`.
- SQL interpolates only column names and the `'Final'` status constant from this file. Every user-supplied value is a bound `$n` param.
- No `explodeRows`, no `refreshSource`, no `exportConfig` on the new report.
- Never print or log the DB URL. Live checks use `railway run -p ba2225e5-2792-4708-aa66-d3b178cfb8d0 -e production -s priority-reports -- …`.

## Review Focus

1. **A user filter with an `or` root must not escape the Final rule.** Pin it with an SQL test: `where statdes = 'Final' and (… OR …)`. (Task 2)
2. **A null `exp_date` must stay null**, not become `"nullT00:00:00Z"`. (Task 2)
3. **A file with an empty or null suffix** must give the filename `name`, not `name.`. (Task 2)
4. **A `tquant` of `"0"` must render `"0 cs"`, not blank.** (Task 2)
5. **Dropdowns must list values from Final rows only.** Every distinct query contains `statdes = 'Final'`. (Task 2)

---

### Task 1: Shared history-floor helper

**Files:**
- Create: `server/src/services/historyFloorWarnings.ts`
- Modify: `server/src/reports/grvLogSupabase.ts:150-170`
- Test: `server/tests/historyFloorWarnings.test.ts`

**Interfaces:**
- Produces: `staysOnOrAfterFloor(group: FilterGroup, floor: string): boolean`. It returns true only when the root is `'and'` and some root condition on `field === 'date'` uses one of `isOnOrAfter | isAfter | isBetween | isInWeek | equals` with `value >= floor`. This is the logic `buildHistoryFloorWarnings` has today.
- GRV keeps its exports `buildHistoryFloorWarnings` and `GRV_SUPABASE_HISTORY_FLOOR` and its behaviour, now delegating to the helper.

- [ ] **Step 1:** Write `historyFloorWarnings.test.ts`. It needs:
  - `true` for an `and` root with `{field:'date', operator:'isOnOrAfter', value:'2026-07-01'}` and floor `'2026-06-29'`;
  - `false` for the same condition with `value:'2026-06-01'`;
  - `false` for an `or` root;
  - `false` for `isBefore`;
  - `false` for an empty group;
  - `false` when the date condition sits only in a sub-group.
- [ ] **Step 2:** Run `cd server && npx vitest run tests/historyFloorWarnings.test.ts`. Expect FAIL (module not found).
- [ ] **Step 3:** Create the helper and move `FLOOR_SAFE_OPERATORS` into it. Make `buildHistoryFloorWarnings` return `staysOnOrAfterFloor(group, GRV_SUPABASE_HISTORY_FLOOR) ? [] : [HISTORY_FLOOR_WARNING]`.
- [ ] **Step 4:** Run `npx vitest run tests/historyFloorWarnings.test.ts tests/grvLogSupabaseRefresh.test.ts`. Expect PASS; the GRV floor tests are unchanged.
- [ ] **Step 5:** Commit: `refactor(supabase): share history-floor check`.

### Task 2: Report `customer-returns-supabase`

**Files:**
- Create: `server/src/reports/customerReturnsSupabase.ts`
- Modify: `server/src/routes/reports.ts`, `server/src/routes/query.ts`, `server/src/routes/export.ts`. Add `import '../reports/customerReturnsSupabase';` next to the `grvLogSupabase` import in each.
- Test: `server/tests/customerReturnsSupabase.test.ts`. Mock `../src/services/supabaseDb` exactly as `grvLogSupabase.test.ts` does.

**Interfaces:**
- Consumes: `querySupabase`, `buildSqlWhere(group, filterColumns, firstParamIndex = 1)`, `formatQuantityUnit` (from `customerReturnsLineItems`), `staysOnOrAfterFloor` (Task 1).
- Produces:
  - `transformCustomerReturnSupabaseRow(raw: Record<string, unknown>): Record<string, unknown>`;
  - `buildReturnsHistoryFloorWarnings(group: FilterGroup): string[]`;
  - `CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR = '2026-06-29'`;
  - the registry entry `customer-returns-supabase`.

Decisions the code must follow:
- `SELECT_SQL` lists: `docno, type, curdate, custname, cdes, ivnum, requested_by, request_method, return_details, food_safety_concern, files, kline, partname, pdes, tquant::text as tquant, tunitname, retreasoncode, retreasondes, toserialname, exp_date from priority_reports.customer_returns_log`.
- `fetchRows`:
  - SQL is `${SELECT_SQL} where statdes = 'Final'` followed by ` and (${clause})` when there is a clause, then ` order by curdate desc, docno desc, kline asc limit $${params.length + 1}`.
  - `'Final'` is a code literal (a constant), so `buildSqlWhere` keeps its default index 1.
- `fetchFilters` runs three queries in parallel, each restricted to `statdes = 'Final'` and non-empty values:
  - customers: `select distinct custname, cdes … order by cdes, custname`, deduped by custname in JS, label `${cdes ?? custname} (${custname})`;
  - codes: `select distinct retreasoncode as code, retreasondes as des … order by 1`, label `des ? \`${code} — ${des}\` : code`, deduped by code;
  - reasons: `select distinct retreasondes as v … order by 1`.
  - It returns `{ customers, returnCodes, returnReasons }`.
- `transformRow`:
  - `date: \`${curdate}T00:00:00Z\``;
  - `expDate`: the same form, or `null` when exp_date is null;
  - `docNo`, `type`, `customerId` (custname), `customerName` (cdes), `invoiceNum` (ivnum ?? null), `requestedBy`, `requestMethod`, `returnDetails`, `foodSafetyConcern` (each `?? null`);
  - `attachments`: `files` (an already-parsed array, `[]` when not an array) mapped to `{ num: extfilenum, filename: suffix ? \`${name}.${suffix}\` : name, sizeBytes: size ?? null }`;
  - `sku` (partname), `itemName` (pdes), `quantity: formatQuantityUnit(tquant, tunitname)`, `returnCode`, `returnReason`, `lotNumber` (toserialname).
- Registry: `name: 'Customer Returns (Supabase)'`, `entity: 'priority_reports.customer_returns_log'`, `disableCache: true`, `clientSidePagination: true`, `buildQuery` a no-op returning `{}`, `clearMemoryCache: () => {}`, `queryWarnings: buildReturnsHistoryFloorWarnings`.

- [ ] **Step 1: Write the failing tests** in `customerReturnsSupabase.test.ts`:
  - `transformCustomerReturnSupabaseRow` with a full raw row (curdate `'2026-10-27'`, exp_date `'2027-01-31'`, files `[{extfilenum:1,name:'Email',suffix:'png',size:183335}]`, tquant `'1'`, tunitname `'cs'`, ivnum `'CM26000010'`):
    - `date === '2026-10-27T00:00:00Z'`, `expDate === '2027-01-31T00:00:00Z'`;
    - `attachments` equals `[{num:1, filename:'Email.png', sizeBytes:183335}]`;
    - `quantity === '1 cs'`, `invoiceNum === 'CM26000010'`, `type === 'N'`;
    - every `report().columns` key is present.
  - The edge row: exp_date `null` gives expDate `null`; files `[]` gives `[]`; files `null` gives `[]`; a file with suffix `''` gives filename `'Email'`; tquant `'0'` gives quantity `'0 cs'`; null line fields give null sku/quantity.
  - `fetchRows` with an empty group:
    - SQL contains `where statdes = 'Final' order by curdate desc, docno desc, kline asc limit $1`;
    - params are `[5001]` when called with `{limit: 5001}`.
  - `fetchRows` with an `or` root of two text conditions (`sku contains 'ABC'`, `returnDetails contains 'leak'`):
    - SQL matches `/where statdes = 'Final' and \(.+ OR .+\) order by/`;
    - SQL contains `"partname"` and `"return_details"`;
    - the limit placeholder is `$3`.
  - `fetchFilters`, with `querySupabase` mocked to return rows per call:
    - every SQL string contains `statdes = 'Final'`;
    - customers dedupe by code with label `'Acme Market (C100)'`;
    - returnCodes label `'R1 — Damaged'`;
    - returnReasons value equals label.
  - `buildReturnsHistoryFloorWarnings`: `[]` for `isBetween '2026-10-01'..'2026-10-31'`, and `[the exact warning]` for an empty group.
  - The report definition:
    - `invoiceNum` label is `'Credit Memo #'` in both columns and filterColumns;
    - every filterColumn has `filterLocation:'server'` and a `sqlColumn`;
    - the column keys are exactly, in order: `date, docNo, customerId, customerName, invoiceNum, requestedBy, requestMethod, returnDetails, foodSafetyConcern, attachments, sku, itemName, quantity, returnCode, returnReason, lotNumber, expDate`. These are hardcoded, so the test never imports the Priority-backed report;
    - `explodeRows`, `refreshSource` and `exportConfig` are undefined;
    - `disableCache` and `clientSidePagination` are true.
- [ ] **Step 2:** Run `cd server && npx vitest run tests/customerReturnsSupabase.test.ts`. Expect FAIL (module not found).
- [ ] **Step 3:** Implement `customerReturnsSupabase.ts` per the decisions above. Add the three route imports.
- [ ] **Step 4:** Run `npx vitest run` (the whole server suite) and `npx tsc --noEmit`. Expect all green.
- [ ] **Step 5:** Commit: `feat(customer-returns-supabase): report reading priority_reports.customer_returns_log`.

### Task 3: Hidden page and month default

**Files:**
- Modify: `client/src/config/pages.ts`. Add the page right after the `customer-returns` page entry.
- Modify: `client/src/config/filterConstants.ts:121`. Change the condition to `reportId === 'customer-returns' || reportId === 'customer-returns-supabase'`, and update the WHY comment above it.
- Test: `client/src/config/pages.test.ts`, `client/src/config/filterConstants.test.ts`

**Interfaces:**
- Consumes: the report id `customer-returns-supabase` (Task 2).

- [ ] **Step 1:** Add the tests.
  - In `pages.test.ts`, a `describe('customer-returns-supabase page configuration')`. It checks:
    - the page exists with department `food-safety`, path `/customer-returns-supabase`, name `Customer Returns (Supabase)` and `hiddenFromNav: true`;
    - it has one table widget with reportId `customer-returns-supabase`, `disableCache: true`, `clientSidePagination: true`, `colSpan: 12`;
    - `sourceRefresh` is falsy.
  - Add `'customer-returns-supabase'` to the `it.each` list in "clientSidePagination mirrors the server opt-in".
  - In `filterConstants.test.ts`, mirror the mid-month `customer-returns` case for `'customer-returns-supabase'` (2026-05-01 → 2026-05-15).
- [ ] **Step 2:** Run `cd client && npx vitest run src/config`. Expect FAIL.
- [ ] **Step 3:** Add the page entry. The widget title is `Customer Returns` and it carries the same WHY comment as the `customer-returns` widget. Apply the filterConstants change.
- [ ] **Step 4:** Run `npx vitest run`, `npx tsc -b --noEmit` and `npm run lint`. Expect green.
- [ ] **Step 5:** Commit: `feat(customer-returns-supabase): hidden page with month default`.

### Task 4: Live verification and docs

**Files:**
- Modify: `CLAUDE.md`. Add a `customer-returns-supabase` row to the Production state table, and remove the duplicated first `grv-log-supabase` row (keep the more detailed second one).
- Modify: the spec status line, after deploy only (not in this task).

- [ ] **Step 1:** Start the backend under `railway run … -- npm run dev` (in `server/`) and the frontend `npm run dev`.
- [ ] **Step 2:** Probe `POST /api/v1/reports/customer-returns-supabase/query` with the current-month filter. Expect:
  - `meta.source === 'supabase'` and no warnings;
  - the row count equals a count of Final rows for the same month in the view, run at the same moment (it was 128 on 2026-10-31);
  - at least one row with `attachments.length > 0`.
- [ ] **Step 3:** Run three probes:
  - a filter that reaches before 2026-06-29 (`isBefore 2026-07-01`): expect the exact warning;
  - `sku contains` with a SKU seen in Step 2: expect only rows with that SKU;
  - `foodSafetyConcern equals 'Yes'` over `isOnOrAfter 2026-06-29`: expect the rows of the 3 Final returns the view reports as Yes, matching a count in the view taken at the same moment.

  Then `POST /api/v1/reports/customer-returns-supabase/export` with the month filter: expect HTTP 200 and an xlsx body. The local `railway run` injects production Priority credentials, so the attachment route in Step 4 reads Live.
- [ ] **Step 4:** Open `http://localhost:5173/food-safety/customer-returns-supabase`. Check:
  - the table renders and Credit Memo # values show;
  - the paperclip popover opens, and one download returns a file (HTTP 200 from `/api/v1/attachments/...`);
  - the nav has no new tab;
  - the Customer filter dropdown lists customers.
- [ ] **Step 5:** Edit CLAUDE.md as described above. Commit: `docs(customer-returns-supabase): production state row`.
