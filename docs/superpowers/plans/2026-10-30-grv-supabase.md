# GRV Receiving Log from Supabase: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a hidden page, `/food-safety/receiving-log-supabase`, that reads Live GRVs from
`priority_reports.grv_receiving_log`. Every column filters in SQL, two Temp Tracker columns are added, and the
Refresh button re-reads the last 30 days. First, fix the broken GRV Excel template lookup for both pages.

**Architecture:**
- A new report, `grv-log-supabase`, plugs into the existing registry through three optional hooks: `fetchRows`,
  `refreshSource` and `queryWarnings`.
- When a report has `fetchRows`, `query.ts` and `export.ts` call it in place of the Priority fetch.
- SQL goes through one small `pg` pool (`supabaseDb.ts`) and a pure `FilterGroup` → parameterized-`WHERE` builder.
- The client gains a `hiddenFromNav` page flag and a refresh outcome for widgets marked `sourceRefresh`.

**Tech Stack:** Express 5 + TypeScript strict, `pg` (node-postgres), Zod, Vitest + supertest (server), React 19 +
Vitest/jsdom (client).

**Spec:** `docs/superpowers/specs/2026-10-30-grv-supabase-design.md` (approved 2026-10-30). Read §5 (delivered
contract) and §6 before any task.

## Global Constraints

- The old page and report (`grv-log`) stay unchanged except for Task 1. TTT Check and the UAT toggle stay.
- Never interpolate user input into SQL. Values are `$n` parameters. Column names come only from `sqlColumn` in the
  report's `filterColumns`.
- Supabase failures never break the Priority reports:
  - the env var unset → 503 for the Supabase report only;
  - a runtime error → 502;
  - the pool has an `error` listener.
- `SUPABASE_GRV_DATABASE_URL` is a secret. Never log it or put it in an error message. `.env.example` gets
  `SUPABASE_GRV_DATABASE_URL=` with an empty value.
- The view's `curdate` is a `date`. Rows reach the client with `date` as the string `YYYY-MM-DDT00:00:00Z` and
  `total` as a JSON number; every other column is a string or null.
- Every new file starts with the intent block (`FILE`, `PURPOSE`, `USED BY`, `EXPORTS`). Add WHY comments where a
  choice isn't obvious. All server tests go in `server/tests/`.
- Before trusting any `tsc` or `vitest` failure, warm `node_modules` (the iCloud gotcha). In a worktree outside
  iCloud, run `npm ci` in `server/` and `client/` first.
- Pre-deploy checks: `cd client && npx tsc -b --noEmit` and `cd server && npx tsc --noEmit`. Both must be clean.
- Do not push, merge to `main` or deploy. Victor does that.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit only the
  task's files: no `.bak` or scratch files, and never `.env`.

## Review Focus

1. **A day shifted by a timezone.** A GRV dated 2026-10-27 must show 10/27 on a machine in Los Angeles. Task 2 sets
   the `date` type parser, and Task 5's test asserts that `transformRow({curdate: '2026-10-27'})` gives
   `'2026-10-27T00:00:00Z'`.
2. **NULL parsed fields under negative filters.** A GRV with no Comments line must match "Comments does not contain
   x", and must also match "Comments is empty". Task 3's parity table covers both.
3. **A filter on a column without `sqlColumn`, or a hostile value** such as `'; drop table` or `50%_`. The
   condition is skipped or bound as a parameter, never pasted into SQL. Task 3 tests both.
4. **Refresh pressed twice, during the nightly window, or the user leaves.** `reused`/`busy` give no error and no
   second request, and a disconnect stops the polling. Task 5 tests `busy`, `reused` and abort.
5. **Supabase down while the old page is in use.** `grv-log` and `bbd` queries still answer, and only
   `grv-log-supabase` gets a 502/503. Task 4 tests the Priority report next to a failing `fetchRows` report.

---

### Task 1: Template lookup by Airtable record ID (both GRV pages)

**Files:**
- Modify: `server/src/services/templateService.ts`
- Modify: `server/src/config/reportRegistry.ts`, the `ExportConfig` interface
- Modify: `server/src/reports/grvLog.ts`, its `exportConfig`
- Modify: `server/src/routes/export.ts`, the `getTemplate` call at about line 182
- Test: `server/tests/templateService.test.ts` (new)

**Interfaces:**
- Produces: `getTemplate(recordId: string): Promise<Buffer | null>` and
  `ExportConfig.templateRecordId: string` (required).
- Produces: `GRV_LOG_TEMPLATE_RECORD_ID = 'recJluOijRUZcZnBS'`, exported from `grvLog.ts` so Task 5 reuses it.

- [ ] **Step 1: Write the failing tests.** Mock `global.fetch` and `env.AIRTABLE_TOKEN`.
  - `fetches the record by id, not by formula`: the first fetch URL equals
    `https://api.airtable.com/v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6/recJluOijRUZcZnBS?returnFieldsByFieldId=true`
    and contains no `filterByFormula`. The mock returns field-ID keys **only** when that parameter is in the URL;
    without it, the keys are field names, as Airtable does. The record JSON is `{ id, fields: { fldTbiJ7t4Ldd3cH9: [{ url: 'https://x/t.xlsx' }] } }`.
    The second fetch is that URL, and the result is a Buffer.
  - `returns null when the record has no template attachment`.
  - `returns null on a 404`.
  - `caches by record id`: two calls make one Airtable fetch pair.
- [ ] **Step 2:** `cd server && npx vitest run tests/templateService.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `getTemplate(recordId)` uses `GET /v0/{base}/{table}/{recordId}?returnFieldsByFieldId=true` (as
    `airtableSnapshots.ts` does) and reads `fields[TEMPLATE_FIELD]`. Drop the
    formula and `REPORT_ID_FIELD`.
  - Add a WHY comment: Report ID became a number formula (101) on 2026-10; the record ID never changes.
  - Add `templateRecordId` to `ExportConfig` with a WHY comment.
  - In `grvLog.ts`: `export const GRV_LOG_TEMPLATE_RECORD_ID = 'recJluOijRUZcZnBS'`, and set it on
    `exportConfig.templateRecordId`.
  - In `export.ts`: `report.exportConfig ? await getTemplate(report.exportConfig.templateRecordId) : null`.
- [ ] **Step 4:** run `npx vitest run` (the whole server suite) and `npx tsc --noEmit`. Expected: all PASS.
  `excelExporter.test.ts` may build `ExportConfig` literals; add `templateRecordId` there if `tsc` asks for it.
- [ ] **Step 5: Commit** with `fix(export): fetch GRV template by Airtable record id (Report ID became a formula)`.

### Task 2: `pg` dependency and the Supabase pool

**Files:**
- Modify: `server/package.json` and `server/package-lock.json` (`npm install --save-exact pg`,
  `npm install --save-exact -D @types/pg`)
- Modify: `server/src/config/environment.ts`: add `SUPABASE_GRV_DATABASE_URL: optionalString`
- Modify: `.env.example`
- Create: `server/src/services/supabaseDb.ts`
- Test: `server/tests/supabaseDb.test.ts`

**Interfaces:**
- Produces:
  - `class SupabaseNotConfiguredError extends Error`
  - `isSupabaseConfigured(): boolean`
  - `querySupabase<T extends Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>`, which throws
    `SupabaseNotConfiguredError` when the URL is unset
  - `parseDateAsString(value: string): string`, the identity function registered for OID 1082, exported so it can
    be tested

- [ ] **Step 1: Write the failing tests.**
  - `querySupabase rejects with SupabaseNotConfiguredError when the URL is unset`: `vi.mock` the environment module
    with `SUPABASE_GRV_DATABASE_URL: undefined`.
  - `the error message never contains the connection string`: set the URL to
    `postgresql://u:SECRETPW@h:5432/postgres` and mock `pg.Pool` so that `query` rejects with
    `new Error('connect failed')`. The rejection message must not contain `SECRETPW`.
  - `date parser returns the raw YYYY-MM-DD string`: `parseDateAsString('2026-10-27')` gives `'2026-10-27'`, and
    `pg.types.getTypeParser(1082)` is that function once the module has loaded.
  - Mock `pg` partially (`vi.mock('pg', async (importOriginal) => ({ ...(await importOriginal()), Pool: FakePool }))`),
    so `types` stays real and the 1082 assertion tests the real registry.
  - `pool has an error listener`: with `pg.Pool` mocked, the first query creates the pool and
    `pool.on('error', …)` was called.
- [ ] **Step 2:** run that test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Create a lazy singleton `Pool` with `connectionString`, `max: 3`, `idleTimeoutMillis: 30_000`,
    `connectionTimeoutMillis: 10_000`, `statement_timeout: 10_000` and `application_name: 'priority-reports'`.
  - At module load, call `types.setTypeParser(1082, parseDateAsString)`.
  - `pool.on('error', err => console.error('[supabaseDb] idle client error:', err.message))`.
  - Wrap query errors as `new Error(\`Supabase query failed: ${err.message}\`)`. pg error messages don't include the
    URL; the test proves it.
  - Leave TLS settings to `sslmode=require` in the URL. The real check is Task 8's probe.
- [ ] **Step 4:** run the tests, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(server): add pg pool for Supabase reads (SUPABASE_GRV_DATABASE_URL)`.

### Task 3: FilterGroup → parameterized SQL `WHERE`

**Files:**
- Modify: `shared/types/filters.ts`: add `sqlColumn?: string` to `ColumnFilterMeta`, with a WHY comment ("Supabase
  view column; server-only meaning, like odataField")
- Create: `server/src/services/sqlFilterBuilder.ts`
- Test: `server/tests/sqlFilterBuilder.test.ts`

**Interfaces:**
- Produces: `buildSqlWhere(group: FilterGroup, filterColumns: ColumnFilterMeta[], firstParamIndex = 1):
  { clause: string | undefined; params: unknown[] }`.

**Rules.** These mirror `applyServerClientFilters`, so the parity test can hold both to the same result.
- Skip a condition with no `field`, an unknown key, or no `sqlColumn`.
- Skip a condition with an empty `value`, unless the operator is `isEmpty`/`isNotEmpty`.
- `sqlColumn` must match `/^[a-z_][a-z0-9_]*$/`, or the condition is skipped. Quote it as `"col"`.
- **Text and enum** (case-insensitive, NULL ≡ `''`), with `T = lower(coalesce("col", ''))`:
  - `equals` → `T = lower($n)`
  - `notEquals` → `T <> lower($n)`
  - `contains` / `notContains` → `T LIKE '%' || lower($n) || '%' ESCAPE '\'`, or `NOT LIKE`
  - `startsWith` → `T LIKE lower($n) || '%' ESCAPE '\'`
  - `endsWith` → `T LIKE '%' || lower($n) ESCAPE '\'`
  - escape `\`, `%` and `_` in the bound value first
  - `isEmpty` → `btrim(coalesce("col", '')) = ''`
  - `isNotEmpty` → `btrim(coalesce("col", '')) <> ''`
- **Number and currency**, with `N = coalesce("col", 0)`:
  - `equals` / `notEquals` → `N = $n` / `N <> $n`
  - `greaterThan` / `lessThan` / `greaterOrEqual` / `lessOrEqual` → `>`, `<`, `>=`, `<=`
  - `between` → `N BETWEEN $a AND $b`
  - skip the condition if `parseFloat` gives NaN, or if lo > hi; bind numbers
- **Date** (the column is a `date`):
  - `equals` → `"col" = $n::date`; `notEquals` → `<>`
  - `isBefore` → `<`; `isAfter` → `>`; `isOnOrBefore` → `<=`; `isOnOrAfter` → `>=`
  - `isBetween` / `isInWeek` → `"col" BETWEEN $a::date AND $b::date`
  - skip the condition if a value fails `/^\d{4}-\d{2}-\d{2}$/` or value > valueTo
  - `isEmpty` / `isNotEmpty` → `IS NULL` / `IS NOT NULL`
- **Groups:** join the parts with ` AND ` or ` OR ` and wrap each subgroup in parentheses. A group with no parts
  returns `undefined`. Params are numbered from `firstParamIndex`, in order.

- [ ] **Step 1: Write the failing tests.**
  - one `it` per operator per type, asserting `clause` and `params`;
  - `binds hostile text as a param`: the value `x'; drop table t; --` appears only in `params`, never in `clause`;
  - `escapes LIKE wildcards`: contains `50%_` → the param is `50\%\_`;
  - `skips unknown key / missing sqlColumn / bad identifier`;
  - `nested or group parenthesized`;
  - `firstParamIndex offsets numbering` (start at 3 → `$3`);
  - **parity table:** about 8 fixture rows, including NULL/`''`/mixed-case text, NULL numbers and dates. For each
    of about 20 filter groups on **text, enum and number** columns, compare `applyServerClientFilters` (with every column marked
    `filterLocation: 'client'`) against a small in-test evaluator of the SQL rules above, written as JS predicates.
    Expect identical row sets. Include `notContains`, `notEquals`, `isEmpty` and `isNotEmpty` on NULLs.
  - Dates are **not** in the parity table. The JS filter compares `'…T00:00:00Z'` strings with `'YYYY-MM-DD'`, so its
    date `equals` is wrong by design. Assert date clauses and params against the `odataFilterBuilder` semantics
    instead: inclusive day bounds, skipped on a bad format or when value > valueTo.
- [ ] **Step 2:** run that test file. Expected: FAIL.
- [ ] **Step 3:** implement `buildSqlWhere` in `sqlFilterBuilder.ts` following the rules above.
- [ ] **Step 4:** run the tests and `npx tsc --noEmit` in both `server/` and `client/`, because the shared type
  changed. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(server): FilterGroup to parameterized SQL builder`.

### Task 4: Registry hooks and route branches (query, export, filters, refresh)

**Files:**
- Modify: `server/src/config/reportRegistry.ts`
- Modify: `shared/types/api.ts`: `source: 'priority-odata' | 'mock' | 'supabase'`
- Modify: `server/src/routes/query.ts`, `server/src/routes/export.ts`, `server/src/routes/filters.ts`,
  `server/src/routes/queryRefresh.ts`
- Test: `server/tests/fetchRowsRoutes.test.ts` (new; copy the `registerFakeReport`/`makeStubCache` pattern from
  `queryDisableCache.test.ts`)

**Interfaces:**
- Produces, on `ReportConfig`:
  - `fetchRows?: (filterGroup: FilterGroup, options: { limit: number; signal?: AbortSignal }) => Promise<Record<string, unknown>[]>`
  - `refreshSource?: (signal?: AbortSignal) => Promise<RefreshOutcome>`
  - `queryWarnings?: (filterGroup: FilterGroup) => string[]`
- Produces, exported: `type RefreshOutcome = { status: 'done' | 'error' | 'timeout' | 'busy' }`
- Produces, in `query.ts`: `FETCH_ROWS_CAP = 5000`, exported
- Consumes: `SupabaseNotConfiguredError` (Task 2)

- [ ] **Step 1: Write the failing tests** (supertest, Priority client mocked).
  - query, with a fake report that has `fetchRows` returning 2 raw rows:
    - 200, and `queryPriority` is not called;
    - `meta.source === 'supabase'` and `meta.priorityEnv === 'production'`;
    - rows have gone through `transformRow`;
    - `fetchRows` received `{ limit: 5001 }` and the body's `filterGroup`.
  - query: `fetchRows` returning 5,001 rows → 5,000 rows, plus the warning
    `Showing the first 5,000 rows; narrow the filter`.
  - query: `queryWarnings` returning `['W']` → `W` is in `warnings`.
  - query: `fetchRows` rejecting with `SupabaseNotConfiguredError` → 503, and with `Error('boom')` → 502. In the same
    test, a second fake report without `fetchRows` still answers 200.
  - export: `fetchRows` is called with `{ limit: 100_001 }`, `applyServerClientFilters` is not used, and
    `queryPriority` is not called. Mock `getTemplate` to return null and the fallback generator to return a Buffer,
    then assert 200.
  - export: `fetchRows` rejecting with `SupabaseNotConfiguredError` → 503, and with `Error('boom')` → 502.
  - filters: `fetchFilters` rejecting with `SupabaseNotConfiguredError` → 503.
  - refresh: `refreshSource` rejecting (for example `Error('pg down')`) → 200 `{ status: 'error' }`, never a 500.
  - refresh: `refreshSource` resolving `{status:'timeout'}` → 200 with body `{ status: 'timeout' }` and the cache
    prefix invalidated. A report without the hook gives the same body as today.
- [ ] **Step 2:** run that test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `query.ts`: right after the cache lookup, branch with `if (report.fetchRows)`:
    - fetch with `{ limit: FETCH_ROWS_CAP + 1, signal: abortController.signal }`;
    - if more than the cap came back, slice to the cap and push the cap warning;
    - map with `transformRow`, then apply `filterRows`;
    - append `report.queryWarnings?.(body.filterGroup)`;
    - then fall into the existing pagination and response code, with `source` set to `'supabase'` and
      `priorityEnv: 'production'`.
    - Write the branch so the existing Priority path below it is unchanged. A small helper in `queryHelpers.ts` is
      fine.
  - `export.ts`: the same branch with `limit: ROW_CAP + 1`. There are no `queryWarnings` here: an Excel download
    has no warnings channel, and the user sees the history-floor warning on screen before exporting. This
    deviates from spec §6.2, which is why it is written down here. Treat more than `ROW_CAP` rows the way the existing cap
    path does. Skip `applyServerClientFilters` for these rows.
  - Error mapping, in all three routes: `SupabaseNotConfiguredError` → 503 with
    `{ error: 'Supabase is not configured for this report' }`; any other `fetchRows`/`fetchFilters` error → 502 with
    `{ error: \`Failed to fetch from Supabase: ${message}\` }`.
  - `queryRefresh.ts`: after the cache clear, if `report?.refreshSource` exists, call it and merge `status` into the
    JSON. If it throws, log the message and answer `status: 'error'` with a 200, so the widget's notice fires. Pass the signal from `createClientDisconnectAbort(res)` (import it from `queryHelpers.ts`).
- [ ] **Step 4:** run the whole server suite and `tsc` in both packages. Expected: PASS. The existing route tests
  are the regression proof for the Priority path.
- [ ] **Step 5: Commit** with `feat(server): fetchRows/refreshSource/queryWarnings report hooks`.

### Task 5: The `grv-log-supabase` report

**Files:**
- Create: `server/src/reports/grvLogSupabase.ts`
- Modify: `server/src/routes/reports.ts`, `query.ts` and `export.ts`: add `import '../reports/grvLogSupabase';`
  next to the existing report imports
- Test: `server/tests/grvLogSupabase.test.ts`

**Interfaces:**
- Consumes: `querySupabase` (Task 2), `buildSqlWhere` (Task 3), the hooks and `RefreshOutcome` (Task 4),
  `GRV_LOG_TEMPLATE_RECORD_ID` (Task 1).
- Produces: `transformGrvSupabaseRow(raw)`, exported for tests, and the registered `grv-log-supabase` report.

**Contents.** These values are pinned by the spec (§5, §6.1, §6.2).
- **`columns`:** the same as `grv-log` (keys, labels, types, `copyable`), minus `tttCheck`. Insert
  `{ key: 'tempTrackerIncluded', label: 'Temp Tracker Included', type: 'string' }` and
  `{ key: 'tempTrackerAccepted', label: 'Temp Tracker Accepted', type: 'string' }` after `truckCondition`.
- **`filterColumns`:** all `filterLocation: 'server'`, each with `sqlColumn`:
  - date → `curdate`; receivingTime → `receiving_time`; docNo → `docno`; poNumber → `ordname`;
  - vendor → `vendor_name` (enum, `enumKey: 'vendors'`); warehouse → `towarhsdes` (enum, `'warehouses'`);
    status → `statdes` (enum, `'statuses'`);
  - total → `totprice` (currency);
  - driverId → `driver_id`; licensePlate → `license_plate`; truckTemp → `truck_temp`; productTemp → `product_temp`;
  - productCondition → `product_condition`; truckCondition → `truck_condition`;
  - tempTrackerIncluded → `temp_tracker_included`; tempTrackerAccepted → `temp_tracker_accepted`;
  - comments → `comments`; receivedBy → `ownerlogin`;
  - types: text unless stated.
- **`fetchRows(group, { limit })`:**
  - SQL:
    `select docno, curdate, receiving_time, ordname, vendor_name, towarhsdes, statdes, totprice::float8 as totprice,
    driver_id, license_plate, truck_temp, product_temp, product_condition, truck_condition, temp_tracker_included,
    temp_tracker_accepted, comments, ownerlogin from priority_reports.grv_receiving_log`
  - then ` where <clause>` when present, then `order by curdate desc, docno desc limit $k`, where `k` is the next
    param index.
- **`transformGrvSupabaseRow`:**
  - `date: \`${curdate}T00:00:00Z\``
  - `docNo` from `docno`; `poNumber` from `ordname`; `vendor` from `vendor_name`; `warehouse` from `towarhsdes`;
    `status` from `statdes`
  - `total: totprice` (a number, or null)
  - `receivingTime`, `driverId`, `licensePlate`, `truckTemp`, `productTemp`, `productCondition`, `truckCondition`,
    `tempTrackerIncluded`, `tempTrackerAccepted`, `comments`
  - `receivedBy` from `ownerlogin`
- **`fetchFilters`:** three
  `select distinct <col> as v from priority_reports.grv_receiving_log where <col> is not null and <col> <> '' order by 1`
  queries (`vendor_name`, `towarhsdes`, `statdes`), run in `Promise.all`. Map them to `{ value: v, label: v }` and
  return `{ vendors, warehouses, statuses }`.
- **Registration:**
  - `id: 'grv-log-supabase'`, name `'GRV Log (Supabase)'`, entity `'priority_reports.grv_receiving_log'`;
  - `buildQuery: () => ({})`, with a WHY comment: unused, because `fetchRows` replaces the Priority path;
  - `transformRow: transformGrvSupabaseRow`;
  - `fetchRows` and `fetchFilters` (Task 5b adds `queryWarnings` and `refreshSource`);
  - `disableCache: true`, `clientSidePagination: true`, `clearMemoryCache: () => {}`;
  - `exportConfig`: `grv-log`'s mapping without `'P': 'tttCheck'`, plus `'P': 'tempTrackerIncluded'` and
    `'Q': 'tempTrackerAccepted'`; `dataStartRow: 5`, `templateRecordId: GRV_LOG_TEMPLATE_RECORD_ID`;
  - `excelStyle`: `grv-log`'s widths without `tttCheck`, plus `tempTrackerIncluded: 12` and
    `tempTrackerAccepted: 12`; `fontSize: 8`.

- [ ] **Step 1: Write the failing tests** (mock `../src/services/supabaseDb`).
  - `transformGrvSupabaseRow`: `curdate '2026-10-27'` gives `date '2026-10-27T00:00:00Z'`, and `totprice 12.5`
    gives `total 12.5` (`typeof` number). A null tracker stays null, and every key in `columns` is present.
  - `fetchRows`: an empty group gives SQL with no `where`, `limit $1` and params `[5001]`. A docNo `equals` gives
    `where … limit $2` with params `['x', 5001]`.
  - `filterColumns`: every entry has `sqlColumn` and `filterLocation: 'server'`, and no `tttCheck` exists.
  - `exportConfig.mapping.P === 'tempTrackerIncluded'`, `Q === 'tempTrackerAccepted'`, and
    `templateRecordId === 'recJluOijRUZcZnBS'`.
- [ ] **Step 2:** run that test file. Expected: FAIL.
- [ ] **Step 3:** implement `grvLogSupabase.ts` as above. Copy the `grv-log` structure and comment style.
- [ ] **Step 4:** run the whole server suite and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(grv-log-supabase): Supabase-backed GRV report with tracker columns`.

### Task 5b: History-floor warning and 30-day refresh for `grv-log-supabase`

**Files:**
- Modify: `server/src/reports/grvLogSupabase.ts`
- Test: `server/tests/grvLogSupabaseRefresh.test.ts`

**Interfaces:**
- Consumes: `querySupabase` (Task 2), `RefreshOutcome` and the hooks (Task 4), the report from Task 5.
- Produces: `buildHistoryFloorWarnings(group: FilterGroup): string[]`, `refreshGrvSource(signal?, deps?)` and
  `GRV_SUPABASE_HISTORY_FLOOR = '2026-06-28'`, all exported. Registers `queryWarnings` and `refreshSource` on the report.

**Contents** (spec §5.6, §6.2):
- **`buildHistoryFloorWarnings(group)`:** returns `[]` only when `group.conjunction === 'and'` and some root
  condition on `date` is `isOnOrAfter`/`isAfter` with a value ≥ the floor, or `isBetween`/`isInWeek`/`equals` with a
  value ≥ the floor. Otherwise it returns
  `['This page holds GRVs from 2026-06-28 on. For earlier dates, use the Receiving Log page.']`.
- **`refreshGrvSource(signal, deps = { query: querySupabase, sleep, now: Date.now })`:**
  - first `select * from priority_reports.request_grv_refresh()`;
  - if `status === 'busy'` or `request_id` is null → `{status:'busy'}`;
  - if the status is already `done`/`error` (a reused finished request) → return it;
  - otherwise poll `select * from priority_reports.grv_refresh_status($1)` every 3,000 ms until `done`/`error`;
  - after 90,000 ms → `{status:'timeout'}`;
  - if `signal.aborted` → stop and return `{status:'timeout'}`;
  - no row → keep polling until the timeout.

- [ ] **Step 1: Write the failing tests.**
  - `buildHistoryFloorWarnings`: an empty group warns; `isInWeek 2026-10-26..2026-11-01` doesn't warn; `isOnOrAfter
    2026-06-01` warns; an `or` root warns.
  - `refreshGrvSource` with fake deps:
    - pending → running → done gives `done` after 2 polls;
    - error gives `error`;
    - always running gives `timeout`, with `now` advanced 90 s;
    - `busy` gives `busy` with no status query;
    - a reused `done` on the first call gives `done` with no poll;
    - an aborted signal gives `timeout` after at most one poll.
- [ ] **Step 2:** run that test file. Expected: FAIL.
- [ ] **Step 3:** implement both functions in `grvLogSupabase.ts` and register them on the report.
- [ ] **Step 4:** run the whole server suite and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(grv-log-supabase): history-floor warning and 30-day refresh`.

### Task 6: Hidden page and default filter (client)

Run `ui-consistency:finding-patterns` once before this task; it's the first change users can see.

**Files:**
- Modify: `client/src/config/pages.ts`: `PageConfigSchema` gains `hiddenFromNav: z.boolean().optional()`;
  `WidgetConfigSchema` gains `sourceRefresh: z.boolean().optional()`; add the new page entry after `receiving-log`
- Modify: `client/src/components/DepartmentLayout.tsx`: the nav list filters out `p.hiddenFromNav`
- Modify: `client/src/App.tsx`: the index redirect uses the first page that is not hidden. Routes still map every
  page.
- Modify: `client/src/config/filterConstants.ts`: the Canceled chip applies when
  `reportId === 'grv-log' || reportId === 'grv-log-supabase'`
- Test: `client/src/config/pages.test.ts`, `client/src/config/filterConstants.test.ts`, and a new
  `client/src/components/DepartmentLayout.test.tsx`

**Interfaces:**
- Produces: `PageConfig.hiddenFromNav?: boolean` and `WidgetConfig.sourceRefresh?: boolean`.

The page entry:
- id `receiving-log-supabase`, department `food-safety`, name `Receiving Log (Supabase)`, path
  `/receiving-log-supabase`, `hiddenFromNav: true`;
- widget: id and reportId `grv-log-supabase`, `type: 'table'`, title `GRV Log — Goods Receiving Vouchers`,
  `colSpan: 12`, `disableCache: true`, `clientSidePagination: true`, `sourceRefresh: true`, no `envToggle`.

- [ ] **Step 1: Write the failing tests.**
  - `pages.test`: the new page exists with `hiddenFromNav: true`, and its widget has no `envToggle`.
  - `filterConstants.test`: the default group for `grv-log-supabase` has the status `notEquals Canceled` condition.
  - `DepartmentLayout.test`, rendered in a `MemoryRouter` at `/food-safety/receiving-log`: no nav tab named
    `Receiving Log (Supabase)`, and the `Receiving Log` tab is present.
  - An App-level test: rendering at `/food-safety/receiving-log-supabase` shows the GRV widget title, and
    `/food-safety` redirects to `/food-safety/receiving-log`. If `App` is too heavy for jsdom, extract the redirect
    target into a pure `firstVisiblePage(deptPages)` in `pages.ts` and test that instead.
- [ ] **Step 2:** `cd client && npx vitest run <files>`. Expected: FAIL.
- [ ] **Step 3:** implement the changes above.
- [ ] **Step 4:** run `npx vitest run`, `npx tsc -b --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(client): hidden receiving-log-supabase page (hiddenFromNav)`.

### Task 7: Refresh outcome in the widget (client, stateful UI)

**Files:**
- Modify: `client/src/components/TableToolbar.tsx`: optional prop `refreshLabel?: string`, used as the button's
  `title` and aria-label. The visible text stays "Refresh".
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`: `handleRefresh` and a `refreshNotice` state
- Test: `client/src/components/TableToolbar.test.tsx` and a new
  `client/src/components/widgets/ReportTableWidget.refresh.test.tsx` (copy the setup from
  `ReportTableWidget.attachments.test.tsx`)

**Interfaces:**
- Consumes: `WidgetConfig.sourceRefresh` (Task 6), and the refresh response `{ status?: RefreshOutcome['status'] }`
  (Task 4).

**Behaviour:**
- When `widgetConfig?.sourceRefresh` is set, pass `refreshLabel="Refresh last 30 days from Priority"`.
- `handleRefresh`:
  - clear `refreshNotice`;
  - POST and parse the JSON body (ignore a parse failure);
  - invalidate the report query whatever the status, as today;
  - then set the notice from `status`:
    - `timeout` → `Still refreshing from Priority, so data may update in a minute`
    - `error` → `Refresh from Priority failed; showing the last synced data`
    - `busy` → `Priority refresh is paused during the nightly sync (1:45–2:45 AM); try again later`
    - `done`, or no status → no notice.
- Render `refreshNotice` with the same amber warning markup as `data.warnings`, just above them.
- Widgets without `sourceRefresh` keep today's behaviour exactly; their response has no `status`.

- [ ] **Step 1: Write the failing tests.** First read `TableToolbar.tsx`'s button component and see how it takes a
  `title`/aria-label; add the prop there if it lacks one.
  - The toolbar: with `refreshLabel`, the refresh button's title is that text; without it, the title is unchanged.
  - The widget, with `fetch` mocked:
    - `timeout` shows the timeout text;
    - `done` shows nothing, and the query is invalidated (the query fetch is called again);
    - `busy` shows the busy text;
    - a second click clears the earlier notice before the new answer arrives.
- [ ] **Step 2:** run those test files. Expected: FAIL.
- [ ] **Step 3:** implement the behaviour above.
- [ ] **Step 4:** run `npx vitest run`, `npx tsc -b --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat(client): show Supabase refresh outcome on the GRV widget`.

### Task 8: Verification and gates

- [ ] **Step 1:** run the full suites: `cd server && npx vitest run && npx tsc --noEmit`, then
  `cd client && npx vitest run && npx tsc -b --noEmit && npm run lint`. Expected: all clean.
- [ ] **Step 2:** `docker build -t priority-dashboard .` from the repo root. Expected: the build succeeds (`pg` is
  bundled in the server stage).
- [ ] **Step 2b: Move to the iCloud checkout** (the preview servers, `.claude/launch.json` and `../.env` live there).
  - `git worktree remove <worktree>`;
  - in the iCloud checkout, `git checkout feat/grv-supabase`;
  - run `npm ci` in `server/` and `client/` there (new dependency `pg`);
  - warm `node_modules` (the CLAUDE.md command);
  - re-run Step 1 there once.
- [ ] **Step 3: Probe, gated on the password.** If `SUPABASE_GRV_DATABASE_URL` is in the local `.env`, run a
  scratchpad script (outside the repo) with `pg` and that URL:
  - `select count(*) from priority_reports.grv_receiving_log`;
  - one parameterized query;
  - `show statement_timeout`;
  - fetch one real row and assert `typeof row.curdate === 'string'`. This is the only end-to-end check of the date
    parser.
  Record in the build notes whether TLS worked with `sslmode=require`. If the variable is absent, record "probe
  pending: password not set" and stop here. Steps 4 and 5 then wait for Victor.
- [ ] **Step 4: Local end-to-end, gated.**
  - Start the `backend` and `frontend` preview servers.
  - Open `/food-safety/receiving-log-supabase` and check through the DOM:
    - this week's rows render, and the tracker columns exist;
    - the vendor/warehouse/status dropdowns are filled;
    - Refresh shows no notice after `done`;
    - Export downloads a file with P/Q filled.
- [ ] **Step 5: Parity and speed, gated.**
  - Pick one completed past week (for example 2026-10-19..2026-10-25).
  - Fetch old-page rows through the production URL's `grv-log` query endpoint. It's read-only, about 51 Priority
    calls, and should run once.
  - Fetch new-page rows locally.
  - Diff them by docNo on every column. Expected differences: TTT Check → the tracker columns, plus the backend's
    documented parser changes.
  - Record server time for both.
  - Write `docs/superpowers/reviews/2026-10-30-grv-supabase-build-log.md` with the results.
- [ ] **Step 6: Update `CLAUDE.md`.**
  - Production state table: add `grv-log-supabase` (hidden page, `/food-safety/receiving-log-supabase`, reading
    `priority_reports.grv_receiving_log`, with a 30-day refresh).
  - Environments: add `SUPABASE_GRV_DATABASE_URL` (session pooler, role `priority_reports_server`).
  - Common mistakes: add "node-postgres parses `date` into local-midnight JS Dates; `supabaseDb.ts` overrides OID
    1082. Never remove it."
  - Commit with `docs(claude-md): GRV Supabase page`.
