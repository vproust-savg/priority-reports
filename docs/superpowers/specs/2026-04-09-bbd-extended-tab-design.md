# BBD Extended Items Tab — Design Spec

## 1. Context & Goal

The BBD (Best By Dates) report filters items nearing or past expiration (`EXPIRYDATE le cutoff AND QUANT gt 0`). When a user extends an expiration date via the Extend feature, the item's new expiry pushes it past the 30-day cutoff — it **disappears from the report**. Users lose visibility into what was extended.

**Goal:** Add a secondary "Extended" tab within the BBD report page that shows all items whose expiration dates were extended through the dashboard. This tab reads from an Airtable database ("Short-Dated Items") that captures a snapshot at the time of each extension.

**Data flow:**
- **Write:** Extend succeeds in Priority → snapshot item data to Airtable (fire-and-forget)
- **Read:** Extended tab selected → fetch from Airtable → refresh balances from Priority → update Airtable balances → return merged data

## 2. Airtable Table Schema

**Base:** Short-Dated Items (`appEIH4f5K3vrKBuy`)
**Table:** Product Lots (`tblR550VQRqNgNMNE`)

The table has one default field (Name / `fldkTERhjx4Nq2Xdj`). All other fields must be created during implementation. Field IDs will be captured at creation time and hardcoded in the service file.

| Field | Type | Purpose |
|-------|------|---------|
| Name (existing, repurposed) | singleLineText | **Lot Number** (SERIALNAME) — upsert key |
| Part Number | singleLineText | PARTNAME from Priority |
| Part Description | singleLineText | PARTDES |
| Balance | number (precision: 2) | Quantity — refreshed from Priority on each tab view |
| Unit | singleLineText | UNITNAME |
| Value | currency ($, precision: 2) | Balance x purchase price — recalculated on balance refresh |
| Purchase Price | number (precision: 2) | Y_8737_0_ESH — stored for value recalculation |
| Vendor | singleLineText | SUPDES |
| Perishable | singleSelect (Yes/No) | Y_9966_5_ESH |
| Brand | singleLineText | Y_9952_5_ESH |
| Family | singleLineText | Family description (resolved from FAMILY_LOG) |
| Original Expiry Date | date (iso) | Expiry date BEFORE the first extension — set on insert only, never overwritten |
| New Expiry Date | date (iso) | Current/latest expiry date after extension |
| Days Extended | number (precision: 0) | Total days extended (cumulative) |
| Extension Date | dateTime (iso, America/New_York) | Timestamp of the most recent extension |

**Upsert strategy:** Search by Name (Lot Number) using `filterByFormula`. If found → PATCH (update New Expiry Date, Days Extended, Extension Date, balance, value). If not found → POST (set all fields including Original Expiry Date).

**Critical:** Original Expiry Date is only set on POST (first insert). On PATCH (subsequent extensions of the same lot), this field is excluded from the update payload to preserve the original value.

## 3. Airtable Service (Backend)

**New file:** `server/src/services/airtableShortDated.ts`

Follows `templateService.ts` patterns: native `fetch()`, `Bearer ${env.AIRTABLE_TOKEN}` auth header, field IDs (not names), graceful degradation if token is missing.

**Exports:**

1. **`snapshotExtendedItem(lotNumber, rowData, newExpiryDate, days)`**
   - Called after successful Priority extension
   - Searches Airtable by lot number (`filterByFormula`)
   - If found: PATCH with updated New Expiry Date, Days Extended (add `days` to existing), Extension Date
   - If not found: POST new record with all fields, Original Expiry Date = `rowData.expiryDate`
   - Fire-and-forget — caller does not await, logs warning on failure

2. **`fetchExtendedItems()`**
   - Returns all records from Airtable, sorted by Extension Date descending
   - Transforms Airtable field IDs to report key names (`partNumber`, `partDescription`, etc.)

3. **`refreshBalancesFromPriority(items)`**
   - Queries `RAWSERIAL` for live balances: `$filter=SERIALNAME eq 'LOT1' or SERIALNAME eq 'LOT2'...` with `$select=SERIALNAME,QUANT,Y_8737_0_ESH`
   - Chunks filter into groups of 50 lot numbers to avoid OData URL length limits
   - Returns a `Map<serialName, { balance, purchasePrice }>` for merging
   - Uses existing `fetchWithRetry` from `priorityHttp.ts` (do NOT add code to that file — it's at 196 lines)
   - Lots not found in RAWSERIAL (consumed/deleted) are absent from the map — `mergeBalances` treats missing entries as balance 0

4. **`batchUpdateAirtableBalances(updates)`**
   - Batch PATCH records whose balance changed (Airtable supports 10 records per PATCH)
   - Fire-and-forget — runs after response is sent to client
   - Respects Airtable rate limit (5 req/sec) — batch size of 10 makes this a non-issue for typical volumes

5. **`mergeBalances(airtableRows, priorityBalances)` (pure, exported for testing)**
   - Merges Priority balance data into Airtable rows
   - Recalculates `value = balance * purchasePrice`
   - If a lot is not found in Priority (consumed/deleted), balance stays at 0
   - Returns merged rows and a list of records that changed (for write-back)

**Per `/airtable-api` best practices:**
- Use field IDs (not names) for all API calls
- Batch writes: max 10 records per request
- Rate limit: 5 requests/second (Airtable enforced)
- Always check `env.AIRTABLE_TOKEN` before making calls
- Filter formula for upsert: `filterByFormula={fldkTERhjx4Nq2Xdj}="LOT123"` (Name field ID)

## 4. Write Hook in Extend Route

**Modified file:** `server/src/routes/extend.ts` (currently 109 lines — room to add)

**Changes to `ExtendRequestSchema`:**

```typescript
const RowDataSchema = z.object({
  partNumber: z.string(),
  partDescription: z.string(),
  balance: z.number(),
  unit: z.string(),
  value: z.number(),
  purchasePrice: z.number(),
  vendor: z.string(),
  perishable: z.string(),
  brand: z.string(),
  family: z.string(),
  expiryDate: z.string(),
}).optional();

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),
    days: z.number().int().min(1).max(365),
    rowData: RowDataSchema,
  })).min(1).max(100),
});
```

**Write trigger:** After the `for` loop that populates `results`, iterate over successful items and call `snapshotExtendedItem()` fire-and-forget:

```typescript
// Fire-and-forget: snapshot to Airtable (don't block response)
for (const [i, result] of results.entries()) {
  if (result.success && items[i].rowData) {
    snapshotExtendedItem(
      result.serialName, items[i].rowData!, result.newExpiryDate!, items[i].days,
    ).catch((err) => console.warn(`[bbd-extend] Airtable snapshot failed for ${result.serialName}:`, err));
  }
}
```

**`rowData` is optional** — if omitted, the Airtable write is skipped. This preserves backward compatibility with any existing callers.

## 5. Read Endpoint

**New route in `server/src/routes/extend.ts`:** `GET /bbd/extended`

**Flow:**
1. Call `fetchExtendedItems()` — get all records from Airtable
2. If no records, return empty response immediately
3. Call `refreshBalancesFromPriority(items)` — get live balances from Priority
4. Call `mergeBalances(airtableRows, priorityBalances)` — merge live data into rows
5. Fire-and-forget: `batchUpdateAirtableBalances(changedRecords)` — write updated balances back to Airtable
6. Return response with merged data

**Response shape:**

```typescript
{
  columns: ColumnDefinition[],  // Hardcoded in route — BBD columns + Original Expiry, New Expiry, Extension Date
  data: Record<string, unknown>[],
  pagination: { totalCount, totalPages: 1, page: 1, pageSize: totalCount },
  meta: { source: 'airtable', generatedAt: string }
}
```

**Column definitions for Extended tab:**

| Key | Label | Type |
|-----|-------|------|
| serialName | Lot Number | string |
| partNumber | Part Number | string |
| partDescription | Part Description | string |
| balance | Balance | number |
| unit | Unit | string |
| value | Value | currency |
| vendor | Vendor | string |
| perishable | Perishable | string |
| brand | Brand | string |
| family | Family | string |
| originalExpiryDate | Orig. Expiry | date |
| newExpiryDate | New Expiry | date |
| daysExtended | Days Ext. | number |
| extensionDate | Extended On | date |

**Differences from Active tab columns:** No `receivingDate`, `daysUntilExpiry`, or `status` columns. Added `originalExpiryDate`, `newExpiryDate`, `extensionDate`.

## 6. Sub-Tab UI Component

**New file:** `client/src/components/ReportSubTabs.tsx`

A compact tab bar rendered above the TableToolbar, inside the widget area. Uses the same Framer Motion pill indicator pattern as NavTabs but with a distinct `layoutId` (`"sub-tab-indicator"`) to avoid animation conflicts.

**Props:**

```typescript
interface ReportSubTabsProps {
  activeTab: 'active' | 'extended';
  onTabChange: (tab: 'active' | 'extended') => void;
  extendedCount?: number;  // Badge showing number of extended items
}
```

**Visual design:**
- Compact: `text-xs`, less padding than NavTabs
- Left-aligned, not full-width
- Active tab: `font-semibold text-slate-900` with pill background
- Inactive tab: `font-medium text-slate-500 hover:text-slate-700`
- Optional badge on "Extended" tab showing count (e.g., "Extended (12)")

**Conditional rendering:** Only appears when `reportId === 'bbd'` — same pattern as `onBulkExtend` conditional in `ReportTableWidget.tsx`.

## 7. Frontend Integration

**Modified file:** `client/src/components/widgets/ReportTableWidget.tsx`

**Changes:**
- Add `activeSubTab` state: `useState<'active' | 'extended'>('active')`
- Render `<ReportSubTabs>` above TableToolbar when `reportId === 'bbd'`
- When `activeSubTab === 'extended'`:
  - Use `useExtendedQuery()` instead of `useReportQuery()`
  - Hide Extend buttons: pass `undefined` for `onBulkExtend`, skip `cellRenderers`
  - Use extended columns/data for ReportTable
- Filter, sort, column state reset on tab switch (clear panels, reset to defaults)

**New hook:** `client/src/hooks/useExtendedQuery.ts`

```typescript
export function useExtendedQuery(): {
  data: ExtendedResponse | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}
```

- Query key: `['report', 'bbd', 'extended']`
- Fetches `GET /api/v1/reports/bbd/extended`
- **Critical:** The `['report', 'bbd']` prefix means `useExtendExpiry.ts`'s existing `queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] })` auto-refreshes the Extended tab on successful extension. No change needed in `useExtendExpiry.ts`.

**Modified file:** `client/src/hooks/useExtendExpiry.ts`

- Expand `ExtendRequest` type to include optional `rowData` in each item
- No change to invalidation logic (prefix matching handles it)

**Modified files:** `client/src/components/modals/ExtendExpiryModal.tsx` and `BulkExtendModal.tsx`

- Pass `rowData` object in each item of the extend request
- **ExtendExpiryModal.tsx** (197 lines — at limit): single-line change to add `rowData` to the request object
- **BulkExtendModal.tsx** (312 lines — over limit): must be split before adding `rowData`. Extract confirmation/done UI or sorting logic into a sub-component to get under 200 lines.

## 8. Architecture Findings

From `/feature-dev:feature-dev` deep analysis:

1. **`priorityHttp.ts` is at 196 lines** — do NOT add any code. Balance refresh uses the already-exported `fetchWithRetry`.

2. **`BulkExtendModal.tsx` is at 312 lines** — already over the 200-line CLAUDE.md limit. Adding `rowData` requires splitting the file first. Candidates for extraction: confirmation/done UI (lines 151-170) or sorting logic (lines 66-91).

3. **`ExtendExpiryModal.tsx` is at 197 lines** — at the limit. Keep the `rowData` change to a single line.

4. **Query key design:** `['report', 'bbd', 'extended']` benefits from existing prefix-based invalidation in `useExtendExpiry.ts` line 46. No code change needed there.

5. **Airtable calls use native `fetch()`** — follow `templateService.ts` pattern exactly. No new dependencies (no Airtable SDK).

6. **No new env vars needed** — `AIRTABLE_TOKEN` already exists in `environment.ts`.

7. **Route co-location:** The GET `/bbd/extended` endpoint belongs in `extend.ts` alongside the existing POST `/bbd/extend`. Both share the same domain (BBD extension operations). `extend.ts` is at 109 lines — room to add the GET handler.

8. **Type location:** The `ExtendedResponse` type is client-only (server returns raw JSON). Define it in the hook file, not in `shared/types/` (per CLAUDE.md: "only types used by BOTH client and server belong there").

9. **`$expand` is NOT needed** — balance refresh queries `RAWSERIAL` directly with `$filter` and `$select`. No subform expansion.

## 9. TDD Testing Strategy

From `/test-driven-development` analysis. **68 test cases** across 4 test files.

### 9.1 `server/src/services/airtableShortDated.test.ts`

Mock strategy: `vi.mock` for `fetch` (Airtable calls) and `priorityHttp` (Priority calls). Pure functions exported and tested in isolation.

**`describe('upsertRow')` — 6 tests:**
- calls PATCH when existing record found for lot number
- calls POST when no existing record exists
- preserves originalExpiryDate on PATCH — does not overwrite
- sets originalExpiryDate on POST from rowData.expiryDate
- throws when Airtable responds with non-2xx on PATCH
- throws when Airtable responds with non-2xx on POST

**`describe('mergeBalances')` — 5 tests (pure function):**
- updates balance with Priority value when positive
- preserves all other fields when merging
- handles zero balance — does not treat 0 as missing
- handles missing Priority data — keeps existing Airtable balance unchanged
- recalculates value as balance x purchasePrice

**`describe('snapshotExtendedItem')` — 6 tests:**
- writes new Airtable record when lot not yet snapshotted
- upserts existing record when lot already exists
- does not overwrite originalExpiryDate on second call
- stores all rowData fields (partNumber, vendor, etc.)
- does not throw when Airtable unavailable — logs warning
- handles empty rowData — stores only lotNumber and dates

**`describe('getExtendedItemsWithBalances')` — 8 tests:**
- returns empty array when no Airtable records
- returns records with balance merged from Priority
- keeps Airtable balance when Priority returns no record for lot
- returns all expected fields
- does not write back when Priority balance unavailable
- writes updated balance back to Airtable after refresh
- handles Airtable list failure — throws descriptive message
- handles partial Priority failure — returns successful rows with warning

### 9.2 `server/src/routes/extend.test.ts`

**`describe('GET /bbd/extended — response format')` — 5 tests:**
- returns 200 with data array
- returns columns array with expected keys
- returns empty data array when Airtable has no records
- returns pagination meta with totalCount matching data length
- includes source: 'airtable' in meta

**`describe('GET /bbd/extended — balance refresh')` — 3 tests:**
- balance reflects Priority value, not stale Airtable value
- rows retain all Airtable fields when refresh succeeds
- rows still returned when Priority fails for a lot — balance shows last known value

**`describe('GET /bbd/extended — Airtable failure')` — 3 tests:**
- returns 502 when Airtable completely unreachable
- returns 200 with warnings when some balance refreshes fail
- warning references the failing lot number

**`describe('POST /bbd/extend — rowData')` — 6 tests:**
- accepts request with items[].rowData without validation error
- passes rowData to snapshotExtendedItem after successful extension
- still succeeds when rowData omitted — backward compatible
- calls snapshotExtendedItem once per successful item
- does not call snapshotExtendedItem for failed items
- response shape unchanged — rowData not in results

**`describe('ExtendRequestSchema')` — 6 tests (pure Zod):**
- accepts valid request with rowData
- accepts valid request without rowData
- rejects invalid serialName characters
- rejects days outside 1-365
- rejects empty items array
- rejects items over 100 entries

### 9.3 `client/src/components/ReportSubTabs.test.tsx`

**`describe('ReportSubTabs')` — 11 tests:**
- renders both "Active" and "Extended" tab labels
- applies active styling to Active tab when activeTab is "active"
- applies active styling to Extended tab when activeTab is "extended"
- does not apply active styling to inactive tab
- calls onTabChange with "extended" when Extended tab clicked
- calls onTabChange with "active" when Active tab clicked
- does not call onTabChange if already-active tab clicked
- shows extendedCount badge when count > 0
- does not show badge when count is 0
- does not show badge when count is undefined
- badge text matches extendedCount value

### 9.4 `client/src/hooks/useExtendedQuery.test.ts`

**`describe('useExtendedQuery')` — 9 tests:**
- uses query key `['report', 'bbd', 'extended']`
- fetches from `/api/v1/reports/bbd/extended`
- returns data with columns, data, pagination fields
- data items have expected fields (lotNumber, balance, originalExpiryDate, etc.)
- sets appropriate staleTime
- is in loading state before fetch resolves
- transitions to success after fetch resolves
- transitions to error on non-2xx response
- throws descriptive message on error

## 10. Edge Cases

- **Airtable unavailable during extend:** Extension still succeeds (Priority is source of truth). Airtable write fails silently with console.warn.
- **Airtable unavailable during tab view:** Extended tab shows error state with retry button.
- **Lot extended outside dashboard:** Won't appear in Extended tab. By design — only dashboard extensions are captured.
- **Lot consumed (balance = 0):** Stays in Extended tab with balance 0. Confirms lot was used after extension.
- **Duplicate rapid extensions:** Upsert handles this — second PATCH updates the same record. No duplicates.
- **Original Expiry Date preservation:** Set on first POST only. PATCH payload excludes this field.
- **Large datasets:** Airtable free tier = 1,000 records. Priority filter chunks at 50 lots per query (URL length limits). Airtable batch PATCH = 10 records per request.
- **Missing AIRTABLE_TOKEN:** All Airtable operations skip gracefully with console.warn. Active tab unaffected.

## 11. File Summary

**New files (6):**

| File | Purpose | Est. Lines |
|------|---------|------------|
| `server/src/services/airtableShortDated.ts` | Airtable CRUD: upsert, fetch, balance refresh, merge | ~150 |
| `server/src/services/airtableShortDated.test.ts` | 25 tests for Airtable service | ~200 |
| `server/src/routes/extend.test.ts` | 23 tests for extend routes | ~180 |
| `client/src/components/ReportSubTabs.tsx` | Sub-tab bar (Active/Extended) | ~50 |
| `client/src/components/ReportSubTabs.test.tsx` | 11 tests for sub-tabs | ~80 |
| `client/src/hooks/useExtendedQuery.ts` | TanStack Query hook for GET /bbd/extended | ~40 |
| `client/src/hooks/useExtendedQuery.test.ts` | 9 tests for extended query hook | ~60 |

**Modified files (5):**

| File | Change |
|------|--------|
| `server/src/routes/extend.ts` | Add GET `/bbd/extended`, add Airtable write hook, expand `ExtendRequestSchema` with `rowData` |
| `client/src/components/widgets/ReportTableWidget.tsx` | Add sub-tab state, conditional rendering, hide extend buttons on Extended tab |
| `client/src/hooks/useExtendExpiry.ts` | Expand `ExtendRequest` type with optional `rowData` field |
| `client/src/components/modals/ExtendExpiryModal.tsx` | Pass `rowData` in extend request (single-line change) |
| `client/src/components/modals/BulkExtendModal.tsx` | Pass `rowData` in extend request + split file to get under 200 lines |

**Total: 7 new + 5 modified = 12 files**

## 12. Exclusions

- No periodic sync from Priority — only dashboard-triggered extensions are captured
- No filtering/search on Extended tab (dataset is small enough to browse)
- No Excel export for Extended tab (can be added later if needed)
- No "delete" or "archive" for extended items
- No user tracking ("Extended By" column) — would require auth system
- No real-time updates — tab refreshes on selection and after extensions
