# GRV receiving log from Supabase: design

**Status:** Implemented (2026-10-31). Deployed to production as `grv-log-supabase` at the hidden page `/food-safety/receiving-log-supabase` (commit 21f8ef5); the old `grv-log` page stays live until the Airtable embed is moved. Supabase side live 2026-10-30 ~21:07Z (migrations 0225–0227).
**Scope:** Goods Receiving Vouchers only. Customer returns get the same treatment in a later spec.

## 1. Intent

The food-safety GRV report (`grv-log`, `/food-safety/receiving-log`) reads Priority live. Each page of 50 rows costs
about 51 Priority calls: one `DOCUMENTS_P` query, then one `DOCUMENTSTEXT_SUBFORM` call per row, in batches of 10
with 200 ms between batches. That is slow, and it spends the 100 calls/min budget that every Priority user shares.

The Supabase project `priority-analytics` (`xupieirpsnzkvlnzzicz`) now holds the GRV headers and their remarks. A
fast-lane sync updates them about every 5 minutes. Victor wants a version of the report that reads from Supabase, with
the query tuned for speed and the remarks already parsed in the database, so that every column is cheap to filter.

The same work adds the two Temp Tracker columns that Victor just put into the Priority remarks template.

## 2. Victor's decisions (2026-10-30)

| # | Decision | Victor's words |
|---|----------|----------------|
| D1 | Up to about 5 minutes behind Priority is fine for this report. | "5 minutes is not an issue for this report" |
| D2 | Keep the current page exactly as it is (Priority, Live/UAT toggle). Build the Supabase version as a **new URL**. Victor moves the Airtable embed when he is ready. | "keep the exiting one, and create a new url with the updated version" |
| D3 | UAT data is still needed, and it will never be in Supabase. It stays on the old page. | "we do need the UAT data for now but it's not in supabase and won't be" |
| D4 | The new page is **hidden**: not in the nav tabs, reachable only by its URL. | "stay hidden and only reachable by url" |
| D5 | Received By has to be the exact `OWNERLOGIN`. Backend boss adds it to the sync; no deriving it from the status log. | "ask backend boss to add the field" |
| D6 | Parse the remarks **in Supabase, inside the ingestion pipeline**. The dashboard reads only parsed columns, through a read-only view. | "ok for your reco, ask backend boss to edit the ingestion pipeline" |
| D7 | Show **two** columns instead of TTT Check: Temp Tracker Included and Temp Tracker Accepted. | "you'll need two columns instead of one" |
| D8 | Tracker values come out as Yes / No / N/A. Anything unclear shows the text exactly as typed. | "the output should be Yes or No", "for na, N/A, NA, you can output n/a", "if anything is unclear, output the written text so the data is not lost" |
| D9 | In the Excel export, Included goes in column **P** and Accepted in column **Q**. | "ok for column P and Q" |
| D10 | The new page's Refresh button makes Supabase re-read the last 30 days of GRVs from Priority. | "add a refresh button that refreshes the last 30 days" |

## 3. Goals, non-goals, anti-goals

**Goals**
- A new hidden page at `/food-safety/receiving-log-supabase` (widget and report id `grv-log-supabase`). It reads
  Live GRVs from one Supabase view and makes no Priority calls on query, filters or export.
- Filtering runs in SQL for every column. Sorting and paging run over the whole filtered result (§6.3).
- The columns match today's report, except that TTT Check is replaced by the two tracker columns (§6.1).
- The Excel export uses the existing GRV Log template, with the two tracker columns in P and Q. The template lookup,
  broken today, is fixed for both pages (§6.2).

**Non-goals**
- Any change to the old page, its report (`grv-log`), its parser, or its export. It keeps TTT Check and the UAT
  toggle. The single exception is the template-lookup fix (§6.2), which repairs today's export.
- Customer returns (the next spec).
- A shared "data source" layer for future Supabase reports. This spec builds what GRV needs and stops there. The
  customer-returns spec can reuse the pieces (§9).
- Sending sort from the client to the server. Sorting stays where it is today, in `useSortManager`.
- Showing data freshness (`_synced_at`) in the UI. Nobody asked for it.

**Anti-goals**
- The dashboard must never be able to read the raw remarks (`raw.goods_receiving_voucher_remarks.text` /
  `text_plain`). They can hold lockbox, gate and door codes. This is enforced by the database role (§5), not by
  application code.
- V8491 (Petrovich Caviar) must never show, whatever filter is applied. It is excluded inside the view.
- No user input is ever concatenated into SQL. Values are bound parameters, and column names come from a fixed map.

## 4. Data today (measured 2026-10-30)

- `raw.goods_receiving_vouchers`: 1,503 GRVs, `curdate` from 2026-06-28 to today, `type` is always `P`, 662 are
  V8491. Statuses: Received 1,268, In Progress 150, Canceled 85. Warehouse codes: Main 1,422, RCH 51, Prim 13, Real 11,
  SF 6. No `OWNERLOGIN` and no `TOWARHSDES` yet (both are requested, §5).
- `raw.goods_receiving_voucher_remarks`: 1,498 rows, holding Priority's HTML verbatim. The only index is the primary
  key on `docno`. Locked to the sync role.
- `raw.vendors.supdes`: the vendor display name (`CDES` today). All 1,503 GRVs join.
- "Temp Tracker Included" appears in about 915 remarks. Values: N 332, blank 242, Y 146, NA 32, plus a few free-text
  serial numbers. No remark has "Temp Tracker Accepted" yet.
- Data before 2026-06-28 is not in Supabase. That is acceptable, because the old page still serves it (D2).

## 5. Dependency: the Supabase view (built by backend boss's job, not in this repo)

Victor approved the request on 2026-10-30. Backend boss has queued it as one job, waiting for Victor to start it in
the backend boss session. It delivers:

1. `OWNERLOGIN` and `TOWARHSDES` on the GRV header, synced on every read path and backfilled.
2. Parsed remark columns, written in the same transaction as the remarks. They come from a port of
   `server/src/services/htmlParser.ts`, checked against this repo's parity tests (`server/tests/htmlParser.test.ts`,
   `htmlParserLabelVariants.test.ts`). All existing rows are re-parsed. The columns are `driver_id`,
   `license_plate`, `receiving_time`, `truck_temp`, `product_temp`, `temp_tracker_included`,
   `temp_tracker_accepted`, `product_condition`, `truck_condition` and `comments`.
3. The tracker rule (D8), applied in the sync:
   - Trim the value, then strip trailing `. , ; !`.
   - Match the whole value, ignoring case:
     - `y|yes|yep|yeah` becomes `Yes`;
     - `n|no|nope` becomes `No`;
     - `na|n/a|n.a|n.a.` becomes `N/A`.
   - A blank value or a missing line becomes null.
   - Anything else is kept as the typed, trimmed text. For example, "Y - TempTale 4 QBV31" is kept whole.
4. One view, one row per GRV, with V8491 excluded. Columns: `docno, curdate, ordname, supname`, the vendor name,
   `towarhsname, towarhsdes, statdes, totprice, ownerlogin`, the parsed columns, and the remarks' `_synced_at`.
5. A dedicated login role that has `SELECT` on that view and nothing in `raw`. The view does not rely on the caller's
   rights over the raw remarks. It is not in a schema that anon/authenticated can reach.
6. A **30-day refresh request** (D10, requested 2026-10-30), usable by the same role:
   - one call queues a re-read of `DOCUMENTS_P` where CURDATE is within the last 30 days, through the sync's normal
     window path, so headers, remarks and parsed columns all refresh;
   - one call reads that request's status (pending / running / done / error, plus finished_at);
   - dedupe: if a 30-day GRV re-read is already pending or running, or finished in the last 2 minutes, the request
     call returns that one instead of queuing another;
   - estimated cost: about 330 GRVs, 1–2 Priority calls of about 25 s each.
   Backend boss chooses the mechanism. The request and status call names and the expected end-to-end time come
   back in their reply.

**Gates on the backend side.** Backend boss will:
- measure, without printing any values, whether `comments` or the condition fields hold codes, and ask Victor before
  they are exposed;
- deploy the role, grant and view only after Victor types his go in the backend boss session;
- leave the role password for Victor to set.

**The delivered contract** (from the GRV backend session's reply, 2026-10-30). Migration 0225 (fields + parsing) is
live. 0226 (view + role) and the refresh migration wait on a production permission unblock that Victor holds.
- **View** `priority_reports.grv_receiving_log`: one row per GRV, V8491 excluded. Columns:
  - header: `docno, curdate, ordname, supname, vendor_name, towarhsname, towarhsdes, statdes, totprice, ownerlogin`;
  - parsed: `driver_id, license_plate, receiving_time, truck_temp, product_temp, temp_tracker_included,
    temp_tracker_accepted, product_condition, truck_condition, comments`;
  - timestamps: `remarks_synced_at, header_synced_at`.
  `curdate` is a `date`, Priority's calendar date. All parsed columns are text, and null means the line is
  missing.
- **Masking.** A parsed value holding an access-code word and 3 or more digits comes out as
  `[hidden: check Priority]`. That is 0 rows today. The page shows it as-is. This is how the backend settled the
  free-text gate, so no column is withheld.
- **Role** `priority_reports_server`: LOGIN, `SELECT` on the view, `EXECUTE` on the two refresh functions, nothing in
  `raw`. Its connection limit is 10, so the pool max is at most 5. Victor sets the password.
- **Connection.** Supavisor session pooler, port 5432:
  `postgresql://priority_reports_server.xupieirpsnzkvlnzzicz:<PASSWORD>@<session-pooler-host>:5432/postgres?sslmode=require`.
  The host is the "Session pooler" host in the Supabase dashboard's Connect panel. Note: recent `pg-connection-string`
  versions treat `sslmode=require` as full verification, so the probe (§6.2) must confirm TLS works with the
  pooler's certificate, without turning verification off.
- **Refresh functions** (§5.6):
  - `select * from priority_reports.request_grv_refresh()` returns one row:
    `(request_id bigint, status text, requested_at, finished_at, reused boolean)`;
  - `select * from priority_reports.grv_refresh_status($1)` returns
    `(request_id, status, requested_at, started_at, finished_at, docs)`, or no row;
  - statuses are `pending | running | done | error`. `busy` with a null `request_id` means 01:45–02:45 Los Angeles
    time (the nightly sync), when nothing gets queued;
  - dedupe returns the existing request with `reused = true`;
  - expected time is about 25–30 s with the lock free, minutes when it is behind the nightly sync.
- **Parser differences from `parseGrvRemarks`:**
  1. `<p>`/`<div>` tags with attributes now break lines. This changes 2 of 1,498 rows (3 cells each gain a value);
  2. the two tracker fields are new;
  3. tracker values are trimmed again after the punctuation strip, and a punctuation-only value becomes null.
  The parity check (§8.5) treats (1) as an expected difference.
- **Counts from the re-parse:**
  - driver_id 601, license_plate 589, receiving_time 586, truck_temp 597, product_temp 587;
  - temp_tracker_included 514 (Yes 146, No 332, N/A 32, other 4), temp_tracker_accepted 0;
  - product_condition 918, truck_condition 918, comments 158.

**Build order.** The dashboard code and its unit tests can be written before the view exists. Three things wait until
the role exists and Victor has set its password: the pooler probe (§6.2), a local end-to-end run with the real
connection string in the local `.env`, and the merge to `main`. The probe and the local run gate the merge, so a pooler
problem shows up on a laptop, not after a deploy.

**A column Victor keeps out of the view.** If Victor's free-text check (the first gate above) keeps `comments` or a
condition field out of the view, the new page drops that column completely: from `columns`, from `filterColumns`,
from `transformRow`, and from the export mapping (M for comments, J/K for conditions). It is not left blank and not
redacted. The parity check (§8.5) then skips that field. (My call: a blank column would look like missing data.)

## 6. Dashboard design

### 6.1 Columns (new report `grv-log-supabase`)

The table keeps the current order, with TTT Check swapped for the two tracker columns:

Date · Receiving Time · GRV # · PO # · Vendor · Warehouse · Status · Total · Driver ID · License Plate ·
Truck Temp °F · Product Temp °F · Product Condition · Truck Condition · **Temp Tracker Included** ·
**Temp Tracker Accepted** · Comments · Received By

- The keys, labels and column types (`date`, `currency`, `string`) stay the same as `grv-log`, so the client code
  behaves identically. The two new keys are
  `tempTrackerIncluded` and `tempTrackerAccepted`, both `type: 'string'`.
- GRV # and PO # stay `copyable`.
- Vendor shows the vendor name and Warehouse shows `towarhsdes`, as today.
- Received By shows `ownerlogin`, the raw login exactly as today (no lookup to a user name).

### 6.2 Server

- **Connection.** Add `pg` (node-postgres) and `@types/pg`, with versions pinned and the lockfile committed. One
  small `Pool` in a new `server/src/services/supabaseDb.ts`:
  - it reads one new env var, `SUPABASE_GRV_DATABASE_URL`;
  - pool max is about 3, with a statement timeout of about 10 s;
  - **As built (2026-10-31):** `sslmode=require` makes node-postgres verify the certificate against Node's CA store,
    which lacks Supabase's root, so every connect failed (`SELF_SIGNED_CERT_IN_CHAIN`). The code now strips the
    `ssl*` params from the URL and pins Supabase Root 2021 CA (`server/src/config/supabaseRootCa.ts`, SHA-256
    `80:70:25:AD:…:CA:FA`, expires 2031-04-26) with `rejectUnauthorized: true`. `statement_timeout` is a
    `SET` on each new connection, not a startup parameter. The Railway variable stays as set;
  - Railway reaches Supabase through the Supavisor pooler, over TLS. The probe also has to settle the TLS settings
    that node-postgres needs for the pooler certificate, and must never disable verification silently.
  - The env var holds the role password, so it is a Railway secret and is never logged, including in error
    messages. `.env.example` gets the name with a placeholder value.
  The service is written with unit tests first. Once the role from §5 exists, probe the connection from the
  scratchpad (outside the repo) before merging: find out whether session mode (5432) or transaction mode (6543)
  works with node-postgres parameterized queries and with the statement timeout. Transaction mode may reject a
  `statement_timeout` sent as a startup option; if so, set it per query or use session mode. Log the result in the
  build notes.
  - If the env var is missing, the server still boots, and only the `grv-log-supabase` routes answer 503 with a
    clear message.
  - If Supabase fails at runtime (connection refused, timeout, SQL error), query, export and filters catch the
    error and answer 502, as they do for a Priority failure.
  - The pool has an `error` listener that logs. Without one, an idle-client error crashes the Node process, which
    would take the Priority reports down with it.
  - The rule: the Priority reports must never break because of Supabase.
- **Report definition.** Add `server/src/reports/grvLogSupabase.ts`, which self-registers like the other reports and
  is imported in `routes/reports.ts`, `query.ts` and `export.ts`.
  - It has its own `columns` and `filterColumns`. Every filter column is `filterLocation: 'server'`.
  - It has a `transformRow` that maps view columns to the keys in §6.1. **Shape contract:** each value has the same
    wire type `grv-log` sends today. The date is the string `YYYY-MM-DDT00:00:00Z`, as Priority sends it. The total
    is a JSON number. Every other column is a string or null. This matters because node-postgres returns
    `timestamptz` as a JS `Date` (serialized `…T00:00:00.000Z`) and `numeric` as a string, and the client's date and
    currency cells were written against Priority's shapes. Casting in SQL or through `pg` type parsers are both
    fine; tests assert the shapes.
  - It sets `disableCache: true`, because a query costs no Priority calls and D1 already allows the sync lag.
    Redis would only add more lag.
  - It sets `clientSidePagination: true` (§6.3).
  - It has no `allowEnvOverride`, no `enrichRows` and no `expandConfig`.
- **New `ReportConfig` hook.** Add one optional hook,
  `fetchRows?: (filterGroup, options: { limit: number; signal?: AbortSignal }) => Promise<Record<string, unknown>[]>`:
  - `limit` is the most rows the SQL may return. The route passes its cap + 1 and decides about truncation itself;
    `fetchRows` never trims or warns.
  - when it is present, `query.ts` and `export.ts` call it in place of the Priority fetch, enrich and
    client-filter steps;
  - they still apply `transformRow` and the existing pagination branch;
  - with the hook present, `entity` and `buildQuery` are unused. The builder decides between making them optional
    and giving them placeholder values, and writes down why in a WHY comment.
  - `meta.source` gains a `'supabase'` value in `shared/types/api.ts`, set when `fetchRows` is used, and
    `meta.priorityEnv` is `'production'`.
  - Reports without the hook behave exactly as they do today (regression tests in §7).
- **Filter → SQL.** Add `server/src/services/sqlFilterBuilder.ts`. It turns a `FilterGroup` into a parameterized
  `WHERE` clause. Columns come from a new `sqlColumn` field on `ColumnFilterMeta`, which serves the same role as
  `odataField`; a key with no mapping is ignored, never interpolated.
  - It supports every `FilterOperator`, including contains / notContains / startsWith / endsWith, which OData could
    not do.
  - Semantics must match `applyServerClientFilters` for text, which is case-insensitive. Enum compares the same way (case-insensitive; build ruling 2026-10-31: dropdown values match exactly, so results are identical).
    Date and number operators follow `odataFilterBuilder`: day bounds are inclusive, invalid values are skipped, and
    `between` requires lo ≤ hi.
  - **Nulls.** `applyServerClientFilters` compares `String(cellValue ?? '')`, so a missing value counts as `''`.
    The SQL compares text and enum columns as `coalesce(col, '')`, so NULL ≡ `''` for every operator. This covers
    `notEquals`, `notContains`, `isEmpty` and `isNotEmpty`; without it, SQL's three-valued logic would drop rows that
    have a NULL. Parsed columns are NULL whenever a remark line is missing, so this case is common.
  - LIKE wildcards in user text (`%`, `_`, `\`) are escaped.
  - Nested groups and `or` work fully. No column is client-side any more, so the "or-group not fully server-side"
    fallback cannot happen for this report.
  - Dates: the view's `curdate` is a `date`, so compare it directly with the `YYYY-MM-DD` value, bound as a
    parameter (`$n::date`). `sqlColumn` is always a plain identifier from the fixed map, and no SQL expression is
    ever stored in config.
  - Reading dates back: node-postgres parses `date` (OID 1082) into a JS Date at local midnight, which shifts the
    day on any machine that is not on UTC. So the `date` parser is set to return the raw `YYYY-MM-DD` string, or
    the SQL selects `curdate::text`. `transformRow` then emits `YYYY-MM-DDT00:00:00Z` (the shape contract).
- **Query.** `select <columns> from priority_reports.grv_receiving_log where <filter> order by curdate desc, docno desc limit $limit`:
  - `query.ts` passes `limit` = 5,001. If it gets 5,001 rows back, it keeps the first 5,000 and adds a warning to
    `warnings`: "Showing the first 5,000 GRVs; narrow the filter";
  - `export.ts` passes its existing `ROW_CAP` + 1 and handles a hit the same way it handles one today.
  This is a safety cap. A week holds about 47 in-scope GRVs on average (841 non-V8491 GRVs over about 18 weeks), and the whole history
  is about 840 today.
- **History floor.** Supabase holds GRVs from 2026-06-28 only (§4). A named constant holds that date. When the
  filter does not keep every row on or after it, `query.ts` and `export.ts` add a warning, but still answer: "This
  page holds GRVs from 2026-06-28 on. For earlier dates, use the Receiving Log page." The filter fails to keep every
  row there when the root group has no `and`-level date condition whose lower bound is on or after the floor (no
  date filter, an `or` root, or an earlier start). The widget already renders `warnings`.
- **Refresh route (D10).** Today `POST /:reportId/refresh` (`queryRefresh.ts`) only clears the in-memory and Redis
  caches. Add one optional `ReportConfig` hook, `refreshSource?: (signal?) => Promise<RefreshOutcome>`. When the hook
  is present, the route calls it after clearing caches, and the new report implements it:
  - call `request_grv_refresh()`;
  - if it returns `busy`, answer `busy` at once;
  - otherwise poll `grv_refresh_status(request_id)` every 3 s until it reaches done or error, or 90 s pass;
  - stop early if the client disconnects;
  - answer `{ status: 'done' | 'error' | 'timeout' | 'busy' }`.
  On `error` or `timeout`, the response still returns 200 with that status, so the widget can say what happened.
  Reports without the hook behave exactly as they do today.
- **Filters route.** `fetchFilters()` on the new report returns `vendors`, `warehouses` and `statuses`, from
  `select distinct` on the view (`vendor_name`, `towarhsdes`, `statdes`). It does not use the hard-coded GRV branch in
  `filters.ts`. The env query parameter is ignored. The cache key already includes the env, so a fixed
  `'production'` is fine.
- **Export.** It reuses `grv-log`'s `exportConfig` mapping with `P → tempTrackerIncluded` and
  `Q → tempTrackerAccepted`; `tttCheck` is dropped. `excelStyle` widths: both new columns are 12, the rest as
  `grv-log`.
- **Template lookup fix (both pages; lands first, as its own commit and deploy).**
  - **The bug (found 2026-10-30).** In the API Reports table, `Report ID` (`fldrsiqwORzxJ6Ouq`) is now a number
    formula, `100 + {fld9syIuf8mQVJsQX}`, and the GRV Log record reads `101`. `getTemplate('grv-log')` builds the
    formula `{fldrsiqwORzxJ6Ouq}="grv-log"`, which matches 0 records (`=101` matches 1). So the live `grv-log` export
    falls back to the plain Excel. Scored frequency 9 × severity 4 = 36.
  - **The fix (Victor: "do what you think best").** Add a required `templateRecordId` to `ExportConfig`. Set it to
    `'recJluOijRUZcZnBS'` (the "GRV Log" record) on both `grv-log` and `grv-log-supabase`.
  - **How it changes `getTemplate`.** It takes that record ID and fetches the record directly
    (`GET /v0/{base}/{table}/{recordId}`, the same token). There is no formula any more. The 24 h cache is keyed by
    record ID.
  - **Why the record ID.** It is the one key Airtable never changes; `Report ID` has already changed once. Nothing
    changes in Airtable.
  - **Scope.** Only GRV Log has a template today. The "Returns Log" record has none and no other report has an
    `exportConfig`, so no other report is affected.
  - **When it lands.** This fix touches the old page, which is the one exception to the §3 non-goal. It goes in
    first, so the old page's export gets its template back right away, before any Supabase work deploys.
  - **Headers.** The template's header row is row 4, and it ends at column M ("Comments"; checked 2026-10-30
    against the attached file "SFO 11.6b & 12.6b Incoming Inspection Log (1).xlsx"). Today N, O and P are already
    written with no header. The new P and Q work the same way, and no header-writing code is added. (My call: it
    matches today's printout.)

### 6.3 Paging and sort

`clientSidePagination: true` makes the server return the whole filtered result. The widget then sorts and pages it
locally, which the BBD and customer-returns pages already do. The point is that sorting covers every matching GRV,
not only the 50 rows on screen, and needs no change to the sort protocol. The 5,000-row cap (§6.2) bounds it.

### 6.4 Client

- `pages.ts`: add an optional `hiddenFromNav` to `PageConfigSchema`.
  - `DepartmentLayout`'s nav list skips hidden pages.
  - `App.tsx` still registers their routes.
  - The department index redirect (`deptPages[0]`) must never pick a hidden page, so it uses the first page that is
    not hidden.
- New page entry:
  - id `receiving-log-supabase`, department `food-safety`, name "Receiving Log (Supabase)", path
    `/receiving-log-supabase`, `hiddenFromNav: true`;
  - one table widget `grv-log-supabase` with `disableCache: true` and `clientSidePagination: true`, and no
    `envToggle`;
  - title "GRV Log — Goods Receiving Vouchers", the same as today.
- **Refresh button (D10).** It stays the existing toolbar Refresh button, with no new component:
  - for this widget it waits for the refresh route's answer (spinner while waiting, as today), then refetches;
  - on `timeout` it shows "Still refreshing from Priority, so data may update in a minute";
  - on `error` it shows "Refresh from Priority failed; showing the last synced data";
  - on `busy` it shows "Priority refresh is paused during the nightly sync (1:45–2:45 AM); try again later";
  - both messages use the widget's existing warning style;
  - other widgets keep today's behaviour.
  The tooltip or label says "Refresh last 30 days from Priority", so people know it takes a while.
- `filterConstants.ts`: the default "status is not Canceled" chip is applied to `grv-log-supabase` as well as
  `grv-log`. The week filter is already the default for every report.
- No new components. Before the first UI task, run `ui-consistency:finding-patterns`. The only visible change is two
  extra string columns and a hidden page, but the plan follows the house order.

## 7. Tests

Server tests go in `server/tests/` and client tests next to their components, as today. Write them first.

- `sqlFilterBuilder`:
  - every operator, for each filter type;
  - a nested `or` group;
  - invalid values are skipped;
  - LIKE escaping;
  - an unknown key is ignored;
  - no value ever appears in the SQL text (it is in params only);
  - a parity table showing that, on the same fixture rows, the SQL semantics match `applyServerClientFilters`.
    The fixtures must include NULL values for every negative operator and for isEmpty / isNotEmpty. Use a pure-JS
    evaluation of the same rules, or an optional run against a local Postgres; the builder decides which.
- `grvLogSupabase`:
  - `transformRow` maps every view column, and null tracker values stay null;
  - the shape contract holds: the date is a `…T00:00:00Z` string, the total is a number, the rest are strings or
    null;
  - the exported mapping has P/Q.
- `query.ts` / `export.ts`:
  - a report with `fetchRows` skips Priority entirely (Priority client mocked, asserted not called);
  - a report without it is unchanged;
  - the cap warning appears when more than 5,000 rows come back;
  - a missing env var gives a 503 for this report only;
  - a `fetchRows` that throws gives a 502 on query, export and filters, and the server keeps serving the other
    reports;
  - refresh with `refreshSource`: done → 200 `done`; error → 200 `error`; no final status within 90 s → 200
    `timeout`; a client disconnect stops the polling. Without the hook: unchanged;
  - client: after a `done` the widget refetches, and on `timeout`/`error` it shows the matching message;
  - the history-floor warning appears with no date filter, with a start before 2026-06-28, and with an `or` root.
    It does not appear for the default current-week filter.
- Template lookup: `getTemplate` fetches by record ID (Airtable mocked), the cache is keyed by record ID, and both
  GRV reports pass `recJluOijRUZcZnBS`.
- Client:
  - a page with `hiddenFromNav` has no nav tab, but its route renders;
  - the index redirect skips hidden pages;
  - the default filter includes the Canceled chip for `grv-log-supabase`.
- Pre-deploy: `cd client && npx tsc -b --noEmit` and `cd server && npx tsc --noEmit`. Warm `node_modules` first (the
  iCloud gotcha in CLAUDE.md).

## 8. Rollout and checks

1. Backend boss's job lands: view, role and grant in production. Victor sets the role password and adds
   `SUPABASE_GRV_DATABASE_URL` to Railway.
2. Before the first push, run the pre-deploy checklist plus a local `docker build`, because `pg` is a new runtime
   dependency (the `railway-deploy` skill covers this case). Then merge to `main`, which auto-deploys. Confirm the
   deployment in Railway, not through `/health`.
3. Live checks on production:
   - `POST /api/v1/reports/grv-log-supabase/query` for the current week has `meta.source = 'supabase'`;
   - its row count matches the view, using the same week, not Canceled, through MCP SQL;
   - no V8491 rows;
   - the tracker columns appear on recent GRVs;
   - `filters` returns vendors, warehouses and statuses;
   - the export opens with the template, with P/Q filled.
4. **Speed.** Before deploying, time today's page for one week (cold, about 51 Priority calls). Time the new page
   after. Target: under 1 s server time for one week. Report both numbers.
5. **Parity.** For one completed past week (to avoid the up-to-5-minute lag), compare the old and new pages row by
   row on every column, including the date and total shapes. Any difference is either a parser-port bug (send it to backend boss) or the expected TTT Check →
   tracker change.
6. Victor opens the hidden URL inside the Airtable Omni embed. When he is happy, he repoints the embed. Retiring the
   old page is a separate later decision.

## 9. Risks and what's known

- **Sync lag** is up to about 5 minutes (D1) for anything that moves Priority's `$since`.
- **Late remark-only edits.** It is not proven that editing only a remark moves `$since`. If it doesn't, the edit
  shows up the next time the sync re-reads that GRV by date:
  - the nightly 1-day window catches edits made on the GRV's own date;
  - the Sunday 7- and 31-day windows catch older ones;
  - so an edit can take up to a week to appear for a GRV less than 31 days old, and never for an older one;
  Codex rated this frequency 2 × severity 3 = 6 for a food-safety log. **Mitigation (D10):** the new page's Refresh
  button forces a re-read of the last 30 days on demand.
- **Remarks kill switch.** If the sync's `GRV_REMARKS_ENABLED` is turned off, parsed fields freeze silently. Rated
  frequency 1 × severity 3 = 3. Filed as
  [vproust-savg/priority-reports#2](https://github.com/vproust-savg/priority-reports/issues/2).
- **Fallback Excel layout.** If the template can't be loaded, the fallback export lays columns out in table order,
  so the tracker columns land in O/P, still under labelled headers. Rated 2 × 2 = 4. Filed as
  [vproust-savg/priority-reports#3](https://github.com/vproust-savg/priority-reports/issues/3).
- **Parser drift.** The old page parses in Node, the new one in the sync. The parity check (§8.5) catches drift at
  rollout. After the switch, only the sync parser matters.
- **Reuse for customer returns.** `supabaseDb.ts`, `fetchRows`, `sqlFilterBuilder` and `refreshSource` are
  written to be reusable, without any extra abstraction.

## 10. Left to the builder

- Making `entity`/`buildQuery` optional versus using placeholders when `fetchRows` is set (§6.2).
- The pooler mode, after the probe.
- The exact pool size and timeouts.
- How the parity test in §7 is run.
- Mapping the delivered view columns (§5) to the report keys in §6.1.

## 11. Calls I made (for Victor to check)

- New URL `/food-safety/receiving-log-supabase` and report id `grv-log-supabase`. The page title matches the old one.
- I asked backend boss to add the warehouse description (`TOWARHSDES`) too, so the Warehouse column matches today's.
- An answer like "Y - serial…" keeps its full text instead of being shortened to Yes.
- No caching on the new page. Sorting and paging cover the whole filtered result, with a 5,000-row safety cap.
- Received By shows the login, as today, not the user's full name.
- The old page is left untouched (TTT Check included), apart from the template-lookup fix.
- The broken template lookup is fixed in code, keyed on the Airtable record ID, with no Airtable change. It ships
  first, so today's page gets its template back.
