# Customer Returns from Supabase — Design

**Status:** Approved to build (2026-10-31; Victor: "ok go", questions skipped)
**Builds on:** `2026-10-30-grv-supabase-design.md`. This is the same move for Customer Returns: a twin report reads a Supabase view and sits on a hidden page beside the old one. Wherever this document says nothing, the GRV Supabase design applies.

## Intent

The Customer Returns page reads Priority today: one `DOCUMENTS_N` query that `$expand`s three subforms and parses the remarks HTML in Node. Victor wants it to read Supabase instead, as the GRV log now does. Supabase is faster, puts no load on Priority's shared 100-calls/minute budget, and does the remark parsing in the database.

## What exists on the Supabase side (built by backend boss, live 2026-10-31)

View `priority_reports.customer_returns_log` (migration 0240):
- One row per return **line**. A return with no lines gives one row with null line columns.
- It includes **all** statuses and has no ORDER BY.
- The `priority_reports_server` login role (the GRV role) has SELECT on it. It is a definer view, so the raw remark text is never exposed.

| Column | Type | Notes |
|---|---|---|
| docno, type | text | `type` is always `'N'` today; the attachment download needs it |
| curdate | date | |
| statdes | text | Final / Canceled / Pending / Draft |
| custname, cdes | text | customer code / name |
| ivnum | text | **The credit memo**: max of the lines' IVNUM. Header IVNUM is empty on every return, so the old Invoice # column was always blank |
| requested_by, request_method, return_details, food_safety_concern | text | DB parse (0230), each masked with `mask_access_code` |
| files | jsonb | `[{extfilenum, name, suffix, size}]` ordered by extfilenum, `[]` when there are none; name is masked |
| file_count | int | |
| kline | int | line number |
| partname, pdes, tunitname, retreasoncode, retreasondes, toserialname | text | |
| tquant | numeric | node-postgres returns a string (e.g. `"1"`, `"0.05"`) |
| exp_date | date | from Y_2301_0_ESH |
| synced_at | timestamptz | not displayed |

Prod counts at the 17:48Z backfill (re-checked): 760 rows, 508 returns. Final: 358 returns on 460 rows, no Final return without lines. 23 returns have files. The earliest `curdate` is **2026-06-29**.

Freshness: the view is synced every 5 min from 05:00 to 21:59 LA, plus a full re-read at 03:23 LA. **There is no on-demand refresh function for returns.**

## What gets built

### Server — new report `customer-returns-supabase`
File `server/src/reports/customerReturnsSupabase.ts`. It mirrors `grvLogSupabase.ts`:
- `fetchRows` queries the view. `buildQuery` is a no-op stub.
- `disableCache: true`, `clientSidePagination: true`, `clearMemoryCache: () => {}`.
- **No `explodeRows`** (the view is already one row per line, and `reportRegistry.ts` forbids it for fetchRows reports). **No `refreshSource`**.
- Columns: the same keys, order and types as `customer-returns`, so the widget and the fallback Excel look the same. The one exception is the **`invoiceNum` label, which becomes "Credit Memo #"**, in both the column and the filter.
- Rows: `where statdes = 'Final'` is always applied. The user's filter clause is ANDed on **inside parentheses**. Order is `curdate desc, docno desc, kline asc`, so a return's lines stay together. The limit is the route's cap (5,000 + 1), as for GRV.
- Selected columns are listed explicitly (no `select *`).
- Filters: every column the old page filters on filters in SQL (`filterLocation: 'server'`, `sqlColumn`), through the existing `buildSqlWhere`. Same keys and filter types as the old page:

  | key | sqlColumn | type |
  |---|---|---|
  | date | curdate | date |
  | docNo | docno | text |
  | customerId | custname | enum `customers` |
  | customerName | cdes | text |
  | invoiceNum | ivnum | text |
  | requestedBy, requestMethod, returnDetails, foodSafetyConcern | requested_by, request_method, return_details, food_safety_concern | text |
  | sku, itemName | partname, pdes | text |
  | returnCode | retreasoncode | enum `returnCodes` |
  | returnReason | retreasondes | enum `returnReasons` |
  | lotNumber | toserialname | text |
  | expDate | exp_date | date |

- `fetchFilters` reads distinct values from **Final rows only**, so a dropdown never offers a value that matches nothing:
  - `customers`: value is custname, label is `${cdes} (${custname})`, one per code, ordered by cdes.
  - `returnCodes`: value is the code, label is `${code} — ${des}` (or just the code when there is no description).
  - `returnReasons`: value and label are both the reason.
- `transformRow` produces the old page's row shape:
  - `date` = `${curdate}T00:00:00Z`.
  - `expDate` = `${exp_date}T00:00:00Z`, or null when exp_date is null.
  - `docNo`, `type`, `customerId`, `customerName`, `invoiceNum` (ivnum), the 4 remark fields.
  - `attachments` = files mapped to `{num: extfilenum, filename, sizeBytes: size}`. The filename is `name.suffix`, or just `name` when there is no suffix.
  - `sku`, `itemName`, `quantity` = `formatQuantityUnit(tquant, tunitname)` with the string passed through, `returnCode`, `returnReason`, `lotNumber`.
- `queryWarnings`: the GRV history-floor warning, with floor `2026-06-29`. The text is: "This page holds returns from 2026-06-29 on. For earlier dates, use the Customer Returns page." The floor logic is moved into a shared helper. GRV keeps its exported names and behaviour.
- Registration: imported for side effect wherever `grvLogSupabase` is (`routes/reports.ts`, `routes/query.ts`, `routes/export.ts`).
- Export: no `exportConfig`, so fallback mode, as the old page uses today.
- Downloads: unchanged. The existing `/api/v1/attachments/DOCUMENTS_N/:docNo/:type/:num` route reads the file from Priority.

### Client
- `pages.ts`: new page `customer-returns-supabase`, name "Customer Returns (Supabase)", path `/customer-returns-supabase`, `hiddenFromNav: true`. One table widget, `reportId: 'customer-returns-supabase'`, title "Customer Returns", `colSpan: 12`, `disableCache: true`, `clientSidePagination: true`, **no `sourceRefresh`**.
- `filterConstants.ts`: the new report gets the same current-month default filter as `customer-returns`.
- No component changes. The attachments cell keys on the column key `attachments`, which is not tied to a report.

## Calls I made (Victor can veto)
1. The Invoice # label becomes **Credit Memo #**. The old field was always blank.
2. Final only, hard-coded, with no status column (same as the old page).
3. No Refresh button. Data is at most ~5 minutes old during working hours.
4. The DB parse differs from the old page on 235 of 358 Final returns: return_details 174, food_safety_concern 219, from the accepted rules (multi-line details, Yes/No/N/A normalisation). **This is expected, not a bug.**
5. Lines are ordered by kline within a return.
6. The old Priority page stays live. Victor moves the Airtable embed when he's ready.

## Non-goals
- Retiring the old page, moving the embed.
- A refresh button (it would need a Supabase function that doesn't exist).
- Changing the download route, or how fallback Excel writes the attachments cell.

## Verification
- Server and client unit tests, plus both `tsc` builds.
- A local live probe via `railway run … -s priority-reports`:
  - `meta.source === 'supabase'`;
  - every row comes from a Final return;
  - the current month returns rows;
  - at least one row has attachments;
  - a filter on a line field (SKU) and on a remark field works;
  - the warning appears for a filter that reaches before 2026-06-29.
- A browser check of the hidden page, including one attachment download, at localhost.
