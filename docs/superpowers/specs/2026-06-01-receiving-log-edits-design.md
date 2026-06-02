# Receiving Log Report Edits — Design

**Date:** 2026-06-01
**Report:** Food Safety → Receiving Log (`grv-log`, entity `DOCUMENTS_P`)
**Author:** Claude Code (brainstormed with Victor)

## Problem

Two requests for the Receiving Log report:

1. **Hide canceled GRVs by default.** Canceled receiving vouchers are daily noise but must
   stay reachable for audit.
2. **Fine-tune the remarks parser** to accept the label variants staff type by hand:
   - `Receiving Time` as well as the template's `Time of Receiving`
   - `Licence Plate` (British) as well as the template's `License Plate`

## Verified facts (live UAT `DOCUMENTS_P`, 2026-06-01)

- Real `STATDES` values are exactly: `Received` (most common), `In Progress`, and **`Canceled`**
  (American single-L) — matching the user's spelling, **not** the `Cancelled` currently hardcoded
  in the status dropdown.
- Real remarks HTML uses the labels `License Plate:` and `Time of Receiving:`. The variants
  (`Receiving Time`, `Licence Plate`) are hand-typed deviations, confirming the need for alternate
  prefixes.

## How filters actually reach OData (architecture note)

`query.ts` and `export.ts` call `report.buildQuery({ page, pageSize })` — **pagination only**. UI
filters do **not** flow through `buildQuery`'s `filters.status/vendor/from/to` branches (those are
dead in the query path). Instead the UI's `filterGroup` is converted by `buildODataFilter()` and
ANDed with the report's base `$filter`:

```
combinedFilter = [baseParams.$filter, odataFilter].filter(Boolean).join(' and ')
```

Therefore "hide Canceled by default" is implemented as a **default filter-group condition on the
frontend**, not as a backend base filter. This keeps it overridable and reuses all existing filter
machinery (escaping, server/client routing, export parity).

## Changes

### Change 1 — Parser label variants (backend)

**File:** `server/src/services/htmlParser.ts`

Add two entries to `FIELD_MAP` (which is matched via `rawKey.startsWith(prefix)` on lowercased,
colon-split lines):

```ts
{ prefix: 'licence plate',  field: 'licensePlate' },   // British spelling
{ prefix: 'receiving time', field: 'receivingTime' },  // reversed word order
```

The existing `'license plate'` and `'time of receiving'` prefixes remain. Both variants map to the
same output fields, so table columns and the Excel export are unchanged. Each variant differs from
its existing counterpart within the first prefix word, so `startsWith` cannot cross-match.

### Change 2 — Hide Canceled by default as a removable chip (frontend)

**File:** `client/src/config/filterConstants.ts`, function `createDefaultFilterGroup`

For `reportId === 'grv-log'` only, add a second condition to the default group alongside the
existing "Date is in current week":

```ts
{ id: crypto.randomUUID(), field: 'status', operator: 'notEquals', value: 'Canceled' }
```

Root conjunction is `and`, producing `… and STATDES ne 'Canceled'`. The condition only applies to
`grv-log` — `bbd` and other reports keep their date-only default. UX: it renders as a "Status is
not Canceled" chip the user can edit to "is Canceled" or delete to reveal canceled rows. Table and
export inherit it automatically (shared filter state).

### Change 3 — Correct the status dropdown (backend, discovered prerequisite)

**File:** `server/src/routes/filters.ts` (the hardcoded GRV-Log fallback, ~line 84)

The current list is `[{ value: 'Received' }, { value: 'Cancelled' }]` — the `Cancelled` spelling
matches **zero** rows, and `In Progress` is missing. Replace with the three verified values:

```ts
const statuses: FilterOption[] = [
  { value: 'Received',    label: 'Received' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Canceled',    label: 'Canceled' },   // verified against live STATDES, 2026-06-01
];
```

This is required for Change 2's override: the default chip's value (`Canceled`) and the user's
"show canceled" action both need `Canceled` to exist as a dropdown option.

**Cache note:** `filters:grv-log` is cached for 1 hour. After deploy the corrected list self-heals
within an hour. Acceptable; no special invalidation needed (the existing `/refresh` route only
clears `query:` keys, not `filters:`).

## Verification (TDD)

- **New** `server/src/services/htmlParser.test.ts`: assert all four labels
  (`License Plate` / `Licence Plate`, `Time of Receiving` / `Receiving Time`) parse to the correct
  fields, and existing fields (temps, conditions, comments, driver id) still parse.
- **Extend** `client/src/config/filterConstants.test.ts`: assert the `grv-log` default group
  contains a `status` / `notEquals` / `Canceled` condition, and that `bbd` does **not**.
- **Pre-deploy:** `cd client && npx tsc -b --noEmit` and `cd server && npx tsc --noEmit` both clean.
- **Manual:** canceled rows hidden on load; visible after editing/removing the chip; Excel export
  matches the table.

## Out of scope

- Not migrating `grv-log` to dynamic `fetchFilters()` (YAGNI — corrected hardcoded list is enough).
- No changes to columns, the Excel template, pagination, or other reports.
- No change to how non-`grv-log` reports build their default filters.
