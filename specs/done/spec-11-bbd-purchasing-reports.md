# Spec 11 — BBD Report (Best By Dates) on Purchasing Reports Page

## Overview

A new "Purchasing Reports" page with a single BBD (Best By Dates) report widget. The report monitors inventory items nearing or past expiration, using the Priority `RAWSERIAL` entity. Items are color-coded by urgency and grouped with expired items shown first.

The page is embedded in Airtable via Omni, consistent with existing dashboard pages.

## Data Source

**Primary entity:** `RAWSERIAL`
**Sub-form:** `RAWSERIALBAL_SUBFORM` (balance data — use two-step fetch, not `$expand`, to avoid truncation risk)
**OData `$select`:** `PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,SERIAL`
**Report registry key:** `'bbd'`

**Note:** `SERIAL` is included in `$select` solely as the sub-form lookup key for `RAWSERIALBAL_SUBFORM`. It is not displayed as a column or exposed as a filter.

### Fields from RAWSERIAL

| Priority Field | Column Label | Type | Notes |
|---------------|-------------|------|-------|
| `PARTNAME` | Part Number | string | Direct field |
| `PARTDES` | Part Description | string | Direct field |
| `EXPIRYDATE` | Expir. Date | date | Displayed as MM/DD/YY |
| `SUPDES` | Vendor | string | Direct field, dropdown filter values from `SUPPLIERS` |
| `Y_9966_5_ESH` | Perishable | string | SPEC9 — Y/N. Empty string or `null` treated as "N" |
| `Y_9952_5_ESH` | Brand | string | SPEC4 — dropdown filter values from `SPEC4VALUES` |
| `Y_2074_5_ESH` | Family | string | Family code → lookup description via `FAMILY_LOG` |

### Computed Fields

| Column Label | Key | Type | Logic |
|-------------|-----|------|-------|
| Status | `status` | string | Computed from expiry date + perishable flag |
| Days Left | `daysUntilExpiry` | number | Computed: expiry date minus today |

### Sub-Form: Balance

Balance is fetched from `RAWSERIALBAL_SUBFORM` using **two-step fetch** (same pattern as GRV Log's `DOCUMENTSTEXT_SUBFORM`):
1. Query `RAWSERIAL` for the main fields
2. For each row, query `RAWSERIALBAL_SUBFORM` to get balance

**Balance field name:** Needs API verification — likely `TBALANCE` or `BALANCE`. Check via `GetMetadataFor(entity='RAWSERIAL')` or test the sub-form directly.

**Post-fetch filter:** Exclude rows where balance ≤ 0 after fetching (cannot filter sub-form fields via OData).

## Expiration Threshold Logic

The report is an **alert view** — it only shows items that are flagged.

| Condition | Perishable = "Y" | Perishable = "N" or empty |
|-----------|-----------------|--------------------------|
| Past expiry date | Status: `expired` | Status: `expired` |
| ≤7 days to expiry | Status: `expiring-perishable` | Not flagged |
| ≤30 days to expiry | Not flagged | Status: `expiring-non-perishable` |
| >30 days to expiry | Not flagged | Not flagged |

Items that are "Not flagged" are **excluded from results** entirely.

## Sort Order

1. **Expired items first** (past expiry date), sorted by expiry date descending (most recently expired at top)
2. Then **expiring items**, sorted by expiry date ascending (soonest expiry at top)

## Dropdown Filter Lookups

Three dropdown filters require fetching values from separate Priority entities:

| Filter | Priority Entity | Fields to Fetch |
|--------|----------------|-----------------|
| Vendor | `SUPPLIERS` | Vendor descriptions |
| Brand | `SPEC4VALUES` | SPEC4 values |
| Family | `FAMILY_LOG` | `FAMILYNAME` (code) + `FAMILYDESC` (description) — display description, match on code |

## Filter Columns

All 9 data columns are filterable:

| Key | Label | Filter Type | Filter Location | Notes |
|-----|-------|------------|-----------------|-------|
| `partNumber` | Part Number | text | client | |
| `partDescription` | Part Description | text | client | |
| `balance` | Balance | number | client | |
| `expiryDate` | Expir. Date | date | client | |
| `vendor` | Vendor | enum | client | Dropdown from `SUPPLIERS` |
| `perishable` | Perishable | enum | client | Hardcoded: Yes / No. `transformRow()` normalizes raw `Y` → `Yes`, `N`/null/empty → `No` |
| `brand` | Brand | enum | client | Dropdown from `SPEC4VALUES` |
| `family` | Family | enum | client | Dropdown from `FAMILY_LOG` |
| `status` | Status | enum | client | Hardcoded: Expired / Expiring Soon (Perishable) / Expiring Soon |

## Row-Level Color Coding

A new generic row-styling mechanism for `ReportTable.tsx`.

### Mechanism

- Add optional `rowStyleField` to `ReportConfig` — specifies which row data field drives styling
- `ReportTable.tsx` reads the field value and applies a CSS class per row
- The status field value maps to a visual treatment

### Color Mapping

| Status Value | Background | Left Border | Meaning |
|-------------|-----------|-------------|---------|
| `expired` | Soft red (`bg-red-50`) | Red accent | Past expiry date |
| `expiring-perishable` | Soft orange (`bg-orange-50`) | Orange accent | Perishable, ≤7 days |
| `expiring-non-perishable` | Soft amber (`bg-amber-50`) | Amber accent | Non-perishable, ≤30 days |

Visual grouping should feel clean and modern — the `/frontend-design` skill will guide exact styling during implementation.

## Infrastructure Changes (Multi-Report Support)

The existing filter and report infrastructure was built for a single report (GRV Log). This spec introduces the second report, requiring these generalizations:

### 1. Generalize `FiltersResponse` type

`shared/types/filters.ts` currently has a hardcoded `filters` shape (`vendors`, `statuses`, `warehouses`, `users`). Change to a generic `Record<string, FilterOption[]>` so each report can define its own filter keys.

### 2. Add `fetchFilters()` to `ReportConfig`

Add an optional `fetchFilters?: () => Promise<Record<string, FilterOption[]>>` method to `ReportConfig`. Each report defines how to fetch its own dropdown values. The `filters.ts` route dispatches to the report's `fetchFilters()`.

**Fallback for GRV Log:** When `fetchFilters()` is absent on a report, the `filters.ts` route falls back to the current hardcoded GRV Log logic. This avoids modifying `grvLog.ts` in this spec — GRV Log can be migrated to `fetchFilters()` in a future cleanup.

For BBD, `fetchFilters()` queries three separate Priority entities (`SUPPLIERS`, `SPEC4VALUES`, `FAMILY_LOG`) and returns the dropdown values. These lookups should be cached (5-minute TTL, same as existing filter cache).

### 3. Side-effect import in all route files

The BBD report import must be added in `reports.ts`, `query.ts`, AND `filters.ts` — all three files import report definitions for side-effect registration.

### 4. Family lookup map

The `FAMILY_LOG` data serves two purposes:
- **Filter dropdown:** Display family descriptions for the user to select
- **Row enrichment:** Convert the family code in each row to its description for display

Build the `FAMILY_LOG` lookup map once in `fetchFilters()` and cache it. Reuse it in `transformRow()` to convert `Y_2074_5_ESH` (code) → family description. This avoids a separate lookup per row.

## Data Fetching Strategy

### Reducing data volume

`RAWSERIAL` may contain tens of thousands of rows. To avoid fetching the entire table:
- Apply an OData `$filter` on `EXPIRYDATE` to limit to items expiring within 30 days or already expired: `EXPIRYDATE le '{30_days_from_now}'`
- This covers both perishable (≤7 days) and non-perishable (≤30 days) thresholds, plus all expired items
- Balance > 0 filtering and status computation happen post-fetch in code

### Pagination interaction

Since unflagged items are excluded post-fetch, standard OData pagination (`$top/$skip`) won't work reliably — a page of 50 OData rows might yield only 5 visible rows after filtering. Instead:
- Fetch all rows matching the date filter (with cursor-based pagination if >2000 rows)
- Apply balance > 0 and expiration threshold filters in code
- Return all flagged rows to the frontend
- Frontend handles client-side pagination of the filtered result set

## Architecture — Follows Existing Patterns

### Backend (server/)

New file: `server/src/reports/bbdReport.ts`
- Self-registers into `reportRegistry` with key `'bbd'` (same pattern as `grvLog.ts`)
- Imported in `server/src/routes/reports.ts`, `query.ts`, AND `filters.ts` for side-effect registration
- `buildQuery()`: computes the 30-day-from-today date internally (ignores `from`/`to` from `ReportFilters` — those are GRV Log concepts). Constructs OData query with `$filter=EXPIRYDATE le '{30_days_from_now}'`, `$select=PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,SERIAL`
- `transformRow()`: maps Priority fields → column keys, converts family code to description using cached lookup map, computes `status` + `daysUntilExpiry`
- `enrichRows()`: two-step fetch for `RAWSERIALBAL_SUBFORM` (batched, same pattern as GRV Log's sub-form enrichment). Only adds balance data to each row.
- `filterRows()`: **new optional method on `ReportConfig`** — runs after `enrichRows()` and `transformRow()`. Filters out rows with balance ≤ 0 and rows without a flagged status. This keeps `enrichRows()` focused on data fetching (consistent with GRV Log pattern) and moves exclusion logic to a dedicated step.
- `fetchFilters()`: queries `SUPPLIERS`, `SPEC4VALUES`, `FAMILY_LOG` for dropdown values. Caches results (5-minute TTL).

### Shared Types (shared/types/)

- Generalize `FiltersResponse.filters` to `Record<string, FilterOption[]>`
- Add optional `fetchFilters` to `ReportConfig` interface
- Add optional `filterRows` to `ReportConfig` interface (post-transform row exclusion)
- Add optional `rowStyleField: string` to `ReportConfig` interface
- Add `rowStyleField?: string` to `ResponseMeta` in `shared/types/api.ts` — the `query.ts` route reads it from `ReportConfig` and includes it in the API response `meta` object

### Frontend (client/)

**No new widget component.** Reuses `ReportTableWidget` (type: `'table'`).

Changes:
1. `client/src/config/pages.ts` — add "Purchasing Reports" page with BBD widget
2. `client/src/components/ReportTable.tsx` — accept an optional `rowStyleField` prop. When present, read the field value from each row and apply a CSS class. The style map (status value → CSS class) lives in a small lookup object in ReportTable.
3. `client/src/components/widgets/ReportTableWidget.tsx` — reads `rowStyleField` from the query response's `meta.rowStyleField` and passes it down to ReportTable. (WidgetRenderer does not need changes — it already passes `reportId`, and ReportTableWidget fetches its own data via `useReportQuery`.)
4. No Excel template for BBD — omit `exportConfig`. The existing export button will use the default CSV/basic export fallback. A custom Excel template can be added later if needed.

### Page Configuration

```
{
  id: 'purchasing-reports',
  name: 'Purchasing Reports',
  path: '/purchasing-reports',
  widgets: [
    {
      id: 'bbd',
      reportId: 'bbd',
      type: 'table',
      title: 'BBD — Best By Dates',
      colSpan: 12,
    },
  ],
}
```

## Risks & Open Questions

1. **SPEC field names** (`Y_9966_5_ESH`, `Y_9952_5_ESH`, `Y_2074_5_ESH`) are company-specific custom fields not in the standard XML metadata. Need to verify these field names against the live API.
2. **`RAWSERIALBAL_SUBFORM` balance field name** — needs API verification. Likely `TBALANCE` or `BALANCE`. Check via `GetMetadataFor(entity='RAWSERIAL')` or test the sub-form directly.
3. **`SPEC4VALUES` entity** — need to verify API access is enabled and confirm the field names for the dropdown values.
4. **`FAMILY_LOG` entity** — need to verify field names (`FAMILYNAME`, `FAMILYDESC`) match what the API returns.
5. **Date format MM/DD/YY** — this is a display format. The backend stores/returns ISO dates; the frontend formatter handles the display format.
6. **Data volume** — if `RAWSERIAL` has many rows even after the 30-day `EXPIRYDATE` filter, may need cursor-based pagination (MAXAPILINES cap at 2000).
7. **Rate limiting** — three additional entity lookups (SUPPLIERS, SPEC4VALUES, FAMILY_LOG) per filter fetch. Mitigated by 5-minute cache.

## Out of Scope

- Toggle to show all items (not flagged)
- Additional reports on the Purchasing Reports page (future specs)
- New widget types — this uses the existing `table` widget type
- Airtable "API Reports" table update (will be done separately after deployment)
