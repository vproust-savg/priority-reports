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

The table has one default field (Name / `fldkTERhjx4Nq2Xdj`). All other fields must be created during implementation using the Airtable MCP `create_field` tool. Field IDs will be captured at creation time and hardcoded in the service file.

| Field | Type | Format | Purpose |
|-------|------|--------|---------|
| Name (existing, repurposed) | singleLineText | — | **Lot Number** (SERIALNAME) — upsert key |
| Part Number | singleLineText | — | PARTNAME from Priority |
| Part Description | singleLineText | — | PARTDES |
| Balance | number | precision: 2 | Quantity — refreshed from Priority on each tab view |
| Unit | singleLineText | — | UNITNAME |
| Value | currency | $, precision: 2 | Balance x purchase price — recalculated on balance refresh |
| Purchase Price | number | precision: 2 | Y_8737_0_ESH — stored for value recalculation |
| Vendor | singleLineText | — | SUPDES |
| Perishable | singleSelect | choices: Yes, No | Y_9966_5_ESH |
| Brand | singleLineText | — | Y_9952_5_ESH |
| Family | singleLineText | — | Family description (resolved from FAMILY_LOG) |
| Original Expiry Date | date | `YYYY-MM-DD`, dateFormat: iso | Expiry date BEFORE the first extension — set on insert only, never overwritten |
| New Expiry Date | date | `YYYY-MM-DD`, dateFormat: iso | Current/latest expiry date after extension |
| Days Extended | number | precision: 0 | Total days extended (cumulative) |
| Extension Date | dateTime | ISO 8601 with Z suffix, timeZone: America/New_York | Timestamp of the most recent extension |

**Date formats:**
- `date` fields: write as `"YYYY-MM-DD"` (e.g., `"2026-04-09"`). Airtable date fields do not accept time components.
- `dateTime` fields: write as ISO 8601 with UTC suffix: `"2026-04-09T14:30:00.000Z"`. Use `new Date().toISOString()` in code. The field's configured timezone handles display conversion.

**Upsert strategy:** Search by Name (Lot Number) using `filterByFormula`. If found → PATCH (update New Expiry Date, Days Extended, Extension Date, balance, value). If not found → POST (set all fields including Original Expiry Date).

**WHY manual search-then-POST/PATCH instead of native `performUpsert`:** Airtable's native upsert sends the same payload for both insert and update. Our spec requires that `Original Expiry Date` is set only on insert and never overwritten on update. This conditional field exclusion is not possible with native upsert.

**Critical:** Original Expiry Date is only set on POST (first insert). On PATCH (subsequent extensions of the same lot), this field is excluded from the update payload to preserve the original value.

## 3. Airtable Service (Backend)

**New file:** `server/src/services/airtableShortDated.ts` (~175 lines)

Follows `templateService.ts` patterns: native `fetch()`, `Bearer ${env.AIRTABLE_TOKEN}` auth header, field IDs (not names), graceful degradation if token is missing.

**Exports:**

1. **`snapshotExtendedItem(lotNumber, rowData, newExpiryDate, days)`**
   - Called after successful Priority extension
   - Searches Airtable by lot number using `filterByFormula` (URL-encoded via `encodeURIComponent()`)
   - If found: PATCH with updated New Expiry Date, Days Extended (add `days` to existing value), Extension Date
   - If not found: POST new record with all fields, Original Expiry Date = `rowData.expiryDate`
   - Fire-and-forget — caller does not await, logs warning (including lot number) on failure
   - When `rowData` is `undefined`, does not crash — stores only lotNumber + dates

2. **`fetchExtendedItems()`**
   - Returns all records from Airtable using pagination loop (Airtable returns max 100 records per request, uses `offset` cursor for pagination — must loop until no `offset` is returned)
   - Sorts in code by Extension Date descending (not via API — avoids depending on field names in URLs)
   - Transforms Airtable field IDs to report key names (`partNumber`, `partDescription`, etc.)

3. **`refreshBalancesFromPriority(items)`**
   - Queries `RAWSERIAL` for live balances: `$filter=SERIALNAME eq 'LOT1' or SERIALNAME eq 'LOT2'...` with `$select=SERIALNAME,QUANT,Y_8737_0_ESH`
   - Chunks filter into groups of 30 lot numbers to stay within safe OData URL length limits (~2,000 chars, accounting for Priority's CloudFront which can be finicky with long URLs)
   - Returns a `Map<serialName, { balance, purchasePrice }>` for merging
   - Uses existing `fetchWithRetry` from `priorityHttp.ts` — this function handles Priority auth + retry logic internally, so `airtableShortDated.ts` only builds the URL and parses the response. Do NOT add code to `priorityHttp.ts` (196 lines, at limit)
   - Lots not found in RAWSERIAL (consumed/deleted) are absent from the map — `mergeBalances` treats missing entries as balance 0

4. **`batchUpdateAirtableBalances(updates)`**
   - Batch PATCH records whose balance changed (Airtable supports max 10 records per PATCH)
   - Fire-and-forget — runs after response is sent to client
   - Respects Airtable rate limit (5 req/sec). Handle 429 responses by reading `Retry-After` header. Batch size of 10 makes this a non-issue for typical volumes.
   - No-op when updates array is empty

5. **`mergeBalances(airtableRows, priorityBalances)` (pure, exported for testing)**
   - Merges Priority balance data into Airtable rows
   - Recalculates `value = Math.round(balance * purchasePrice * 100) / 100` (2-decimal precision, avoids floating-point drift)
   - If a lot is not found in Priority (consumed/deleted), balance stays at 0
   - Returns `{ mergedRows, changedRecords }` — mergedRows for the response, changedRecords (only records whose balance actually differs from Airtable) for write-back

**Per `/airtable-api` best practices:**
- Use field IDs (not names) for all read/write API calls
- Batch writes: max 10 records per request (applies to both POST and PATCH)
- Rate limit: 5 requests/second per base (Airtable enforced). 429 → read `Retry-After` header
- Always check `env.AIRTABLE_TOKEN` before making calls
- Always include `Content-Type: application/json` header on POST/PATCH requests
- Always include `typecast: true` in POST/PATCH request bodies — required for `singleSelect` fields (Perishable Yes/No). Without it, writing a choice value returns 422.
- Filter formula for upsert: `encodeURIComponent('{fldkTERhjx4Nq2Xdj}="LOT123"')` — must URL-encode the formula before appending to the URL (same pattern as `templateService.ts` line 40). Field IDs work in filterByFormula (empirically verified, matches existing `templateService.ts` usage).
- Record limit is per-base (all tables combined): Free plan = 1,000, Team = 50,000, Business = 125,000.

## 4. Write Hook in Extend Route

**Modified file:** `server/src/routes/extend.ts` (currently 109 lines — room to add, will reach ~175 lines)

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
  if (result.success && result.newExpiryDate && items[i].rowData) {
    snapshotExtendedItem(
      result.serialName, items[i].rowData!, result.newExpiryDate, items[i].days,
    ).catch((err) => console.warn(`[bbd-extend] Airtable snapshot failed for ${result.serialName}:`, err));
  }
}
```

**Safety:** Guard checks `result.success && result.newExpiryDate` (truthy check instead of `!` non-null assertion). `processExtendItem` always sets `newExpiryDate` on success, but the truthy guard is safer if the function is ever changed.

**`rowData` is optional** — if omitted, the Airtable write is skipped. This preserves backward compatibility with any existing callers.

**Line budget:** If the GET handler approaches 60 lines, extract a `handleGetExtended()` helper to keep the file under 200 lines.

## 5. Read Endpoint

**New route in `server/src/routes/extend.ts`:** `GET /bbd/extended`

**Flow:**
1. Call `fetchExtendedItems()` — get all records from Airtable (handles pagination internally)
2. If no records, return empty response immediately
3. Call `refreshBalancesFromPriority(items)` — get live balances from Priority
4. Call `mergeBalances(airtableRows, priorityBalances)` — merge live data into rows
5. Fire-and-forget: `batchUpdateAirtableBalances(changedRecords)` — write updated balances back to Airtable (do NOT await — must not block response)
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

**New file:** `client/src/components/ReportSubTabs.tsx` (~50 lines)

A compact tab bar rendered above the TableToolbar, inside the WidgetShell card. Uses the same Framer Motion pill indicator pattern as NavTabs.

**Props:**

```typescript
interface ReportSubTabsProps {
  activeTab: 'active' | 'extended';
  onTabChange: (tab: 'active' | 'extended') => void;
  extendedCount?: number;  // Badge showing number of extended items
}
```

**Visual design (per `/frontend-design` analysis):**

- **Typography:** `text-sm` (not `text-xs`) — matches TableToolbar and NavTabs. Visual compactness comes from reduced padding, not smaller type.
- **Layout:** `px-5 pt-2 pb-0 border-b border-slate-100` — aligns with WidgetShell's `px-5` grid (title bar, toolbar all use `px-5`).
- **Active tab:** `font-semibold text-slate-900` with pill background
- **Inactive tab:** `font-medium text-slate-500 hover:text-slate-700`
- **Pill indicator:** Copy NavTabs line 41 verbatim: `absolute inset-0 bottom-1 bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]`
- **Badge:** Inline parenthetical count matching TableToolbar pattern: `Extended (12)`. Show only when `extendedCount > 0`. Use `font-normal text-slate-500` for the count to de-emphasize.

**Animation:**
- Wrap in `<LayoutGroup id="sub-tab-group">` — scopes `layoutId` animations to avoid conflicts with NavTabs' `"nav-indicator"` (different `LayoutGroup` scope)
- `layoutId="sub-tab-indicator"` on the pill
- Transition: `EASE_DEFAULT` from `animationConstants.ts` — same 250ms easing as NavTabs
- Respect `useReducedMotion` — same pattern as NavTabs

**Tab buttons:** Use `<button>` elements (not `<Link>`) since tabs change local state, not URL.

**Conditional rendering:** Only appears when `reportId === 'bbd'` — same pattern as `onBulkExtend` conditional in `ReportTableWidget.tsx`.

## 7. Frontend Integration

### 7.1 ReportTableWidget Split (Required)

**Problem:** `ReportTableWidget.tsx` is already 250 lines. Adding sub-tab state, conditional queries, and conditional rendering adds ~30-40 lines → ~290 lines (well over 200-line CLAUDE.md limit).

**Solution:** Extract `<BBDExtendedView>` as a new component **before** adding sub-tab logic. This component owns the Extended tab's full data path:
- Calls `useExtendedQuery()` internally
- Renders its own `<LoadingToast>`, `<ErrorState>`, `<EmptyState>`, `<ReportTable>`, `<Pagination>`
- No filter/sort/column management (Extended tab is browse-only)

**New file:** `client/src/components/BBDExtendedView.tsx` (~80 lines)

The parent `ReportTableWidget` conditionally renders either its existing content (Active tab) or `<BBDExtendedView>` (Extended tab). This keeps the parent under 200 lines.

### 7.2 ReportTableWidget Changes

**Modified file:** `client/src/components/widgets/ReportTableWidget.tsx`

- Add `activeSubTab` state: `useState<'active' | 'extended'>('active')`
- Render `<ReportSubTabs>` above TableToolbar when `reportId === 'bbd'`
- When `activeSubTab === 'extended'`: render `<BBDExtendedView reportId={reportId} />` instead of the existing table/toolbar/panels
- **Extend button guard:** `reportId === 'bbd' && activeSubTab === 'active' ? handleBulkExtend : undefined` — double condition ensures bulk extend button is hidden on Extended tab. Similarly, `cellRenderers` only passed when `activeSubTab === 'active'`.

### 7.3 Extended Tab Empty State

Extend `EmptyState` component to accept optional `message` and `hint` props:

```typescript
interface EmptyStateProps {
  message?: string;  // Default: "No results found"
  hint?: string;     // Default: "Try adjusting your filters"
}
```

Extended tab uses: `<EmptyState message="No extended items" hint="Items appear here after their expiry date is extended" />`

### 7.4 useExtendedQuery Hook

**New file:** `client/src/hooks/useExtendedQuery.ts` (~40 lines)

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
- `staleTime: 5 * 60 * 1000` (5 minutes) — Extended data refreshes less aggressively than active. Invalidation handles post-extension refresh.
- `refetchOnWindowFocus: false` — matches `useReportQuery` behavior. Prevents unnecessary Priority balance refresh calls when user clicks back into the Airtable window.
- **Critical:** The `['report', 'bbd']` prefix means `useExtendExpiry.ts`'s existing `queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] })` auto-refreshes the Extended tab on successful extension. No change needed in `useExtendExpiry.ts`.

**Type location:** `ExtendedResponse` is client-only. Define it in the hook file, not in `shared/types/` (per CLAUDE.md: "only types used by BOTH client and server belong there").

**Test wrapper:** This is the first hook test in the codebase requiring a `QueryClientProvider`. Create a `makeWrapper()` helper:

```typescript
function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

### 7.5 useExtendExpiry Changes

**Modified file:** `client/src/hooks/useExtendExpiry.ts`

- Expand `ExtendRequest` type to include optional `rowData` in each item
- No change to invalidation logic (prefix matching handles it)

### 7.6 Modal Changes — rowData Construction

**ExtendExpiryModal.tsx** (197 lines — at limit):
- Add a `row?: Record<string, unknown>` prop (the full row object from `extendModal.row`)
- In `handleSubmit`, construct `rowData` from the `row` prop:

```typescript
rowData: row ? {
  partNumber: row.partNumber as string,
  partDescription: row.partDescription as string,
  balance: row.balance as number,
  unit: row.unit as string,
  value: row.value as number,
  purchasePrice: row.purchasePrice as number,
  vendor: row.vendor as string,
  perishable: row.perishable as string,
  brand: row.brand as string,
  family: row.family as string,
  expiryDate: row.expiryDate as string,
} : undefined,
```

- The call site in `ReportTableWidget` already has `extendModal.row` — pass it through: `row={extendModal.row}`
- This adds ~15 lines. The modal may need a minor extraction to stay under 200 lines.

**BulkExtendModal.tsx** (312 lines — over limit):

**Must split before adding `rowData`.** Extract `<BulkExtendRowTable>` as a new component:

**New file:** `client/src/components/modals/BulkExtendRowTable.tsx` (~60 lines)

Contains the scrollable table with headers, sort indicators, selection checkboxes, and status-colored rows. The parent `BulkExtendModal` passes props: `rows`, `selected`, `days`, `sortKey`, `sortDir`, `onHeaderClick`, `onToggleRow`, `isSubmitting`. This extraction saves ~60 lines, dropping the parent to ~252 lines. Combined with moving `computeNewDate` and `STATUS_BG` to a shared util, the file reaches ~220-230 lines — close enough to the limit.

In `handleSubmit`, construct `rowData` per item:

```typescript
const items = Array.from(selected).map((serialName) => {
  const row = rows.find((r) => r.serialName === serialName);
  return {
    serialName,
    days,
    rowData: row ? {
      partNumber: row.partNumber as string,
      partDescription: row.partDescription as string,
      balance: row.balance as number,
      unit: row.unit as string,
      value: row.value as number,
      purchasePrice: row.purchasePrice as number,
      vendor: row.vendor as string,
      perishable: row.perishable as string,
      brand: row.brand as string,
      family: row.family as string,
      expiryDate: row.expiryDate as string,
    } : undefined,
  };
});
```

## 8. Architecture Findings

From `/feature-dev:feature-dev` deep analysis:

1. **`priorityHttp.ts` is at 196 lines** — do NOT add any code. Balance refresh uses the already-exported `fetchWithRetry`. That function handles Priority auth + retry logic internally.

2. **`ReportTableWidget.tsx` is at 250 lines** — already at the CLAUDE.md limit. Must extract `<BBDExtendedView>` before adding sub-tab logic (see Section 7.1).

3. **`BulkExtendModal.tsx` is at 312 lines** — extract `<BulkExtendRowTable>` (the scrollable table, ~60 lines). The spec's original candidates (done UI, sorting logic) save only 20-28 lines — insufficient.

4. **`ExtendExpiryModal.tsx` is at 197 lines** — NOT a "single-line change". Needs a `row` prop added and `rowData` construction (~15 lines). May need minor extraction to stay under 200.

5. **Query key design:** `['report', 'bbd', 'extended']` benefits from existing prefix-based invalidation in `useExtendExpiry.ts` line 46. TanStack Query v5's fuzzy matching invalidates any query whose key starts with `['report', 'bbd']`. No code change needed there.

6. **Airtable calls use native `fetch()`** — follow `templateService.ts` pattern exactly. No new dependencies (no Airtable SDK).

7. **No new env vars needed** — `AIRTABLE_TOKEN` already exists in `environment.ts`.

8. **Route co-location:** The GET `/bbd/extended` endpoint belongs in `extend.ts` alongside the existing POST `/bbd/extend`. No route collision — `/:reportId` only matches single-segment paths, `bbd/extended` is two segments.

9. **`$expand` is NOT needed** — balance refresh queries `RAWSERIAL` directly with `$filter` and `$select`. No subform expansion.

10. **Airtable pagination:** `fetchExtendedItems` MUST loop using the `offset` cursor. Airtable returns max 100 records per request. Without the loop, the function silently returns only the first 100 records. Loop pattern: `do { fetch(url + offset); offset = response.offset; } while (offset)`.

## 9. TDD Testing Strategy

From `/test-driven-development` analysis. **89 test cases** across 5 test files.

**Mock patterns (critical — follow exactly):**
- Airtable calls (native `fetch`): use `vi.stubGlobal('fetch', vi.fn())` — NOT `vi.mock`. `fetch` is a global, not a module.
- Priority calls (`fetchWithRetry`): use `vi.mock('../services/priorityHttp')` — mock at the module boundary.
- Restore mocks: `afterEach(() => { vi.restoreAllMocks(); })` in every test file.
- `useExtendedQuery` hook tests need a `QueryClientProvider` wrapper — this is the first hook test in the codebase requiring one. See Section 7.4 for the `makeWrapper()` helper.

### 9.1 `server/src/services/airtableShortDated.test.ts` (34 tests)

**`describe('upsertRow')` — 8 tests:**
- calls PATCH when existing record found for lot number
- calls POST when no existing record exists
- preserves originalExpiryDate on PATCH — does not overwrite
- sets originalExpiryDate on POST from rowData.expiryDate
- throws when Airtable responds with non-2xx on PATCH
- throws when Airtable responds with non-2xx on POST
- POST payload uses field IDs — not human-readable field names
- accumulates daysExtended on PATCH — adds to existing value rather than replacing

**`describe('mergeBalances')` — 7 tests (pure function):**
- updates balance with Priority value when positive
- preserves all other fields when merging
- handles zero balance — does not treat 0 as missing
- handles missing Priority data — keeps existing Airtable balance unchanged
- recalculates value rounded to 2 decimal places — no floating-point drift
- returns empty changedRecords list when all balances match Airtable values
- recalculates value as balance x purchasePrice

**`describe('snapshotExtendedItem')` — 7 tests:**
- writes new Airtable record when lot not yet snapshotted
- upserts existing record when lot already exists
- does not overwrite originalExpiryDate on second call
- stores all rowData fields (partNumber, vendor, etc.)
- does not throw when Airtable unavailable — calls console.warn with lot number
- handles undefined rowData — does not crash on property access
- includes typecast: true in POST/PATCH body

**`describe('getExtendedItemsWithBalances')` — 8 tests:**
- returns empty array when no Airtable records
- returns records with balance merged from Priority
- keeps Airtable balance when Priority returns no record for lot
- returns all expected fields
- does not write back when Priority balance unavailable
- writes updated balance back to Airtable after refresh
- handles Airtable list failure — throws descriptive message
- handles partial Priority failure — returns successful rows with warning

**`describe('refreshBalancesFromPriority')` — 5 tests:**
- returns empty Map when input is empty — does not call Priority
- chunks 31 lot numbers into two separate Priority queries (batch size 30)
- merges results from multiple chunks into one Map
- returns Map keyed by trimmed SERIALNAME
- throws with descriptive message when Priority query returns non-2xx

**`describe('batchUpdateAirtableBalances')` — 4 tests:**
- no-op when updates array is empty — fetch not called
- sends one PATCH for 10 or fewer records
- sends two PATCHes for 11 records — splits at batch size 10
- each PATCH body uses field IDs not field names

### 9.2 `server/src/routes/extend.test.ts` (25 tests)

**`describe('GET /bbd/extended — response format')` — 5 tests:**
- returns 200 with data array
- returns columns array with expected keys
- returns empty data array when Airtable has no records
- returns pagination meta with totalCount matching data length
- includes source: 'airtable' in meta

**`describe('GET /bbd/extended — balance refresh')` — 4 tests:**
- balance reflects Priority value, not stale Airtable value
- rows retain all Airtable fields when refresh succeeds
- rows still returned when Priority fails for a lot — balance shows last known value
- fires batchUpdateAirtableBalances without awaiting it — does not block response

**`describe('GET /bbd/extended — Airtable failure')` — 3 tests:**
- returns 502 when Airtable completely unreachable
- returns 200 with warnings when some balance refreshes fail
- warning references the failing lot number

**`describe('POST /bbd/extend — rowData')` — 7 tests:**
- accepts request with items[].rowData without validation error
- passes rowData to snapshotExtendedItem after successful extension
- still succeeds when rowData omitted — backward compatible
- calls snapshotExtendedItem once per successful item
- does not call snapshotExtendedItem for failed items (result.success false)
- does not call snapshotExtendedItem when Priority throws (distinct from success:false)
- response shape unchanged — rowData not in results

**`describe('ExtendRequestSchema')` — 6 tests (pure Zod):**
- accepts valid request with rowData
- accepts valid request without rowData
- rejects invalid serialName characters
- rejects days outside 1-365
- rejects empty items array
- rejects items over 100 entries

### 9.3 `client/src/components/ReportSubTabs.test.tsx` (13 tests)

**`describe('ReportSubTabs')` — 13 tests:**
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
- tab buttons have implicit button role — keyboard accessible
- renders without crashing when extendedCount is 1000

### 9.4 `client/src/hooks/useExtendedQuery.test.ts` (12 tests)

**`describe('useExtendedQuery')` — 12 tests:**
- uses query key `['report', 'bbd', 'extended']`
- fetches from `/api/v1/reports/bbd/extended`
- returns data with columns, data, pagination fields
- data items have expected fields (lotNumber, balance, originalExpiryDate, etc.)
- staleTime is 5 minutes (300000 ms)
- is in loading state before fetch resolves
- transitions to success after fetch resolves
- transitions to error on non-2xx response
- throws descriptive message on error
- does not refetch on window focus
- invalidated by useExtendExpiry mutation success — shares query key prefix
- staleTime is defined and greater than zero

### 9.5 Test Count Summary

| File | Tests |
|------|-------|
| `airtableShortDated.test.ts` | 8+7+7+8+5+4 = **39** |
| `extend.test.ts` | 5+4+3+7+6 = **25** |
| `ReportSubTabs.test.tsx` | **13** |
| `useExtendedQuery.test.ts` | **12** |
| **Total** | **89** |

## 10. Edge Cases

- **Airtable unavailable during extend:** Extension still succeeds (Priority is source of truth). Airtable write fails silently with console.warn including the lot number.
- **Airtable unavailable during tab view:** Extended tab shows error state with retry button. GET returns 502.
- **Missing AIRTABLE_TOKEN:** All Airtable operations skip gracefully with console.warn. Active tab unaffected. GET `/bbd/extended` returns 502 with descriptive message.
- **Lot extended outside dashboard:** Won't appear in Extended tab. By design — only dashboard extensions are captured.
- **Lot consumed (balance = 0):** Stays in Extended tab with balance 0 (or the last known balance from RAWSERIAL). Confirms the lot was used after extension.
- **Duplicate rapid extensions (sequential):** Upsert handles this — second PATCH updates the same record. No duplicates.
- **Concurrent extensions (two users, same lot):** Known limitation — both `filterByFormula` calls may find "no record" and both POST, creating duplicate rows. This is a TOCTOU race condition inherent in the search-then-POST pattern. Mitigation: the Airtable table will rarely have concurrent writes to the same lot. If duplicates occur, they are manually resolvable and do not affect Priority (which is the source of truth).
- **Original Expiry Date preservation:** Set on first POST only. PATCH payload excludes this field.
- **Large datasets:** Airtable record limit is per-base (all tables combined): Free = 1,000, Team = 50,000. `fetchExtendedItems` paginates with `offset` cursor (max 100 per page). Priority filter chunks at 30 lot numbers per query (OData URL length). Airtable batch PATCH = 10 records per request.
- **Floating-point precision:** `mergeBalances` rounds `value = balance * purchasePrice` to 2 decimal places to avoid JavaScript floating-point drift (e.g., `1.1 * 1.1 = 1.2100000000000002`).

## 11. File Summary

**New files (9):**

| File | Purpose | Est. Lines |
|------|---------|------------|
| `server/src/services/airtableShortDated.ts` | Airtable CRUD: upsert, fetch, balance refresh, merge | ~175 |
| `server/src/services/airtableShortDated.test.ts` | 39 tests for Airtable service | ~250 |
| `server/src/routes/extend.test.ts` | 25 tests for extend routes | ~200 |
| `client/src/components/ReportSubTabs.tsx` | Sub-tab bar (Active/Extended) | ~50 |
| `client/src/components/ReportSubTabs.test.tsx` | 13 tests for sub-tabs | ~90 |
| `client/src/components/BBDExtendedView.tsx` | Extended tab view (query + table + pagination) | ~80 |
| `client/src/components/modals/BulkExtendRowTable.tsx` | Extracted scrollable table from BulkExtendModal | ~60 |
| `client/src/hooks/useExtendedQuery.ts` | TanStack Query hook for GET /bbd/extended | ~40 |
| `client/src/hooks/useExtendedQuery.test.ts` | 12 tests for extended query hook | ~80 |

**Modified files (6):**

| File | Change |
|------|--------|
| `server/src/routes/extend.ts` | Add GET `/bbd/extended`, add Airtable write hook, expand `ExtendRequestSchema` with `rowData` |
| `client/src/components/widgets/ReportTableWidget.tsx` | Add sub-tab state, conditional rendering between Active content and `<BBDExtendedView>` |
| `client/src/hooks/useExtendExpiry.ts` | Expand `ExtendRequest` type with optional `rowData` field |
| `client/src/components/modals/ExtendExpiryModal.tsx` | Add `row` prop, construct `rowData` in extend request |
| `client/src/components/modals/BulkExtendModal.tsx` | Extract `<BulkExtendRowTable>`, add `rowData` construction in `handleSubmit` |
| `client/src/components/EmptyState.tsx` | Add optional `message` and `hint` props |

**Total: 9 new + 6 modified = 15 files**

## 12. Exclusions

- No periodic sync from Priority — only dashboard-triggered extensions are captured
- No filtering/search on Extended tab (dataset is small enough to browse)
- No Excel export for Extended tab (can be added later if needed)
- No "delete" or "archive" for extended items
- No user tracking ("Extended By" column) — would require auth system
- No real-time updates — tab refreshes on selection and after extensions
- No native Airtable `performUpsert` — requires conditional field exclusion (Original Expiry Date) which upsert cannot do
