# BBD Extend — Fix "Invalid request" Validation Failure (Design)

**Date:** 2026-07-07
**Status:** Implemented (2026-07-07) — deployed and verified live; Victor extended 3/3 lots successfully

## Problem

Clicking Extend on a BBD lot shows a red "Invalid request" error. The POST
never reaches Priority — it dies at Zod validation in
`server/src/routes/extend.ts`.

Verified against production (2026-07-07, 106 live rows):

| # | Defect | Evidence | Effect |
|---|--------|----------|--------|
| 1 | `rowData.vendor` is `null` — `RowDataSchema` requires `z.string()`, which rejects `null` | 104/106 rows have `vendor: null` (RAWSERIAL.SUPDES empty; `transformRow` passes it through with no default, `bbdReport.ts:205`) | Extend 400s for ~98% of lots |
| 2 | Lot numbers containing `.` fail the `serialName` regex `/^[a-zA-Z0-9_\- ]+$/` | 3/106 lots, e.g. `2518-41.24` | Those lots would still 400 after fixing #1 |
| 3 | Client discards the server's `details` (Zod issues) and shows only `error` (`useExtendExpiry.ts:53`) | Modal says just "Invalid request" | Root cause invisible to users; delayed diagnosis |

**Broken since 2026-04-09** (`8b53ca7` added `rowData` to the extend payload
for Airtable snapshots). Not caused by the 2026-07-02 bin-balance work.
Both `ExtendExpiryModal` and `BulkExtendModal` build `rowData` identically
(TS `as string` casts — compile-time only), so both paths are broken.
Only 2 of 106 current lots can be extended today.

## Requirements

1. Extending any lot currently listed in the BBD report passes request
   validation, regardless of null vendor or `.` in the lot number.
   (Priority may still legitimately reject a lot — e.g. missing from
   EXPDSERIAL — that is correct behavior and unchanged.)
2. The server stays the validation authority; the `serialName` injection
   guard is preserved (charset allowlist + single-quote escaping).
3. Any future validation 400 must show the failing field and reason in the
   modal, not a bare "Invalid request".
4. No behavior change for already-valid payloads; display output unchanged
   (vendor `null` → `''` renders the same blank cell).

## Design

### 1. Tolerant `RowDataSchema` + widened regex — `server/src/routes/extend.ts`

`rowData` is a display snapshot destined for Airtable, not a business
invariant — tolerate real-world nulls and normalize:

```ts
// WHY: rowData mirrors report rows, where Priority-sourced fields can be
// null (e.g. SUPDES → vendor on 104/106 live rows, 2026-07-07). NaN numbers
// also arrive as null after JSON serialization. Normalize instead of 400ing.
const nullableString = z.string().nullish().transform((v) => v ?? '');
const nullableNumber = z.number().nullish().transform((v) => v ?? 0);
```

All 8 string fields use `nullableString`; `balance`, `value`,
`purchasePrice` use `nullableNumber`. Inferred output types stay
`string`/`number`, so `snapshotExtendedItem` and everything downstream are
unaffected. A missing (undefined) field now also normalizes instead of
400ing — same tolerance direction, acceptable for a snapshot payload.

`serialName` regex gains only the dot (evidence-based: 3 live lots):

```ts
serialName: z.string().regex(/^[a-zA-Z0-9_\-. ]+$/),
```

`.` is inert inside an OData quoted literal (`EXPDSERIAL(SERIALNAME='…')`);
single quotes remain escaped by doubling. No other charset widening.

WHY this layer is primary: it fixes single and bulk modals at once, and
takes effect immediately on deploy — server-side, so the 15-minute Redis
and TanStack caches can't serve the bug back.

### 2. Vendor default at the source — `server/src/reports/bbdReport.ts:205`

```ts
vendor: raw.SUPDES ?? '',
```

Matches the existing `unit`/`brand` pattern on adjacent lines. Only vendor —
it is the one field proven null in production. No speculative defaults.

### 3. Surface the Zod issue — `client/src/hooks/useExtendExpiry.ts`

On a non-OK response, if `errorData.details` is an array with entries,
append the first issue to the error message:

```ts
const issue = Array.isArray(errorData.details) ? errorData.details[0] : undefined;
const detail = issue?.message
  ? ` — ${Array.isArray(issue.path) ? issue.path.join('.') + ': ' : ''}${issue.message}`
  : '';
throw new Error((errorData.error ?? `Request failed: ${res.status}`) + detail);
```

Example rendered message:
`Invalid request — items.0.rowData.vendor: Invalid input: expected string, received null`.
Defensive optional-chaining; no new dependencies; existing modal error box
displays it unchanged.

### 4. Tests (TDD — written first, must fail before the fix)

In `server/src/routes/extend.test.ts` (existing harness):

- `vendor: null` in rowData → request accepted, Priority mock reached,
  per-item success returned.
- `serialName: '2518-41.24'` → request accepted.
- Fully-valid payload → behavior unchanged (regression guard).

In the BBD report tests: `SUPDES: null` → `transformRow` returns
`vendor: ''`.

### 5. Out of scope

- Untrimmed `serialName` whitespace reaching the EXPDSERIAL lookup — no
  evidence it bites today; revisit only if a lookup 404 surfaces.
- Other reports, broader serialName charset, `$since`/ORDERS work from
  `API call example.docx`.

## Verification & Deploy

1. Pre-deploy checklist: `npx tsc -b --noEmit` (client),
   `npx tsc --noEmit` (server), `npm test` (server).
2. Push to `main` → Railway auto-deploy.
3. Post-deploy read-only check: re-run the 2026-07-07 validation replica
   against production — expect 106/106 rows to pass the new schema.
4. End-to-end proof requires one real extend (writes an EXPDEXT record in
   Priority): Victor names a sacrificial lot (or clicks Extend himself in
   the Airtable embed) and we confirm the success state, the EXPDSERIAL
   record, and the Airtable snapshot row.

## Decision History

- Victor reported the bug 2026-07-07; error text "invalid request".
- Root cause established via read-only reproduction (live rows × exact
  schema replica) — no writes to Priority during investigation.
- **Approach B chosen** (boundary tolerance + source default + error
  visibility) over A (boundary only — leaves the next null field armed and
  errors cryptic) and C (strict schema, fix data at source — delayed by
  caches, duplicated across two modals, brittle against future nulls).
