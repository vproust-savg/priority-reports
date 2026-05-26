# GRV Log — Always-Fresh Search + LA Timezone Dates

**Date:** 2026-05-26

---

## Context

Two related defects in the GRV Log widget (page: `/food-safety/receiving-log`, report id: `grv-log`):

1. **Stale results on repeat search.** When the user changes filters (or re-applies the same filter), the response can come from a cache — the Redis server-side query cache (15-min TTL), the in-memory `subformCache` for DOCUMENTSTEXT_SUBFORM (remarks), and the TanStack client cache (15-min `staleTime`) all sit between the user and Priority. A GRV that was just received in Priority can therefore be missing from the table for up to ~15 minutes after it appears in the ERP. The user wants every new search to reach Priority.

2. **Wrong calendar day on dates.** Priority returns `CURDATE` as `"2026-05-22T00:00:00Z"` — UTC midnight, but semantically a calendar date. The client renders this with `new Date(str)` and the browser's local timezone, so any user west of UTC (including every LA-based user) sees the previous day. The default-week filter (`getMonday(new Date())`) has the same problem on the server (Railway runs in UTC), so the "current week" can be off by one week near a Sunday/Monday LA boundary.

**Intended outcome:** Every new query against grv-log fetches fresh data from Priority (Redis query cache and remarks cache both bypassed), and every date the user sees or filters on is interpreted as an `America/Los_Angeles` calendar date.

---

## Confirmed by live API call (2026-05-26)

`GET /DOCUMENTS_P?$filter=TYPE eq 'P'&$select=DOCNO,TYPE,CURDATE,SUPNAME,STATDES&$top=3` returns:
```json
{"CURDATE":"2026-05-22T00:00:00Z","DOCNO":"GR26000814", ...}
```

Priority stores `CURDATE` as a date-only value serialized as UTC midnight. **Implication:** the existing OData filter bounds (`CURDATE ge YYYY-MM-DDT00:00:00Z and CURDATE le YYYY-MM-DDT23:59:59Z`) already bracket the calendar-day value correctly — **no OData filter changes are needed**. The timezone bugs are purely on the display and default-week sides.

---

## Design

### 1. Server: per-report `disableCache` flag

**Type change** (`server/src/config/reportRegistry.ts`, in the `ReportConfig` interface around line 43). Add:
```ts
// WHY: When true, query route skips both the Redis cache lookup/write and
// any per-report in-memory caches. Use for reports that must always reflect
// the latest Priority data (e.g., GRV log for receiving operations).
disableCache?: boolean;
```

**Report change** (`server/src/reports/grvLog.ts`, in the registered `ReportConfig` object near line 171):
```ts
disableCache: true,
```

**Query route change** (`server/src/routes/query.ts`, the POST `/query` handler around lines 30–192):
- Before `cache.get(cacheKey)`: gate on `if (!report.disableCache)`.
- Before `cache.set(cacheKey, ...)`: same gate.
- No other behavior changes — when the gate is on, the handler always invokes the report's fetch path and returns the result uncached.

**Remarks cache** (`server/src/reports/grvLog.ts`):
- Delete the module-level `subformCache: Map<string, ...>` and its read/write sites inside `enrichRows`.
- The report's existing `clearMemoryCache: () => void` hook (described in the `ReportConfig` comment at lines 86–90) becomes a no-op. Keep the property so the `/refresh` route's call site stays intact.
- WHY rip it out instead of gating on `report.disableCache`: the cache is grv-log-specific module state and grv-log is the only report that uses it. Adding a runtime gate for "the only report this lives in" is extra surface area for no benefit. If a future report needs row-enrichment caching, it should ship its own.

**Cache warming** (`server/src/index.ts`, the `warmCache()` function starting around line 60): skip warming for any report with `disableCache: true`. Replace the `getMonday(new Date())` call (line 62) with `getMonday(nowInLA())` from the new util (described below) so the warmed week for any *other* cached report is also LA-correct.

**`/refresh` route** stays as-is. With grv-log having no Redis entries and no subformCache, both clears become no-ops; the route still works for other reports and stays useful as a manual "invalidate everything" affordance.

### 2. Client: bypass TanStack cache for grv-log

**Hook change** (`client/src/hooks/useReportQuery.ts`). Current signature is `useReportQuery(reportId, params)` with hardcoded `staleTime: 15 * 60 * 1000`. Add an options object:
```ts
interface ReportQueryOptions { disableCache?: boolean }
export function useReportQuery(
  reportId: string,
  params: ReportQueryParams,
  options: ReportQueryOptions = {},
) {
  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, params],
    queryFn: /* unchanged */,
    staleTime: options.disableCache ? 0 : 15 * 60 * 1000,
    gcTime:    options.disableCache ? 0 : undefined,
    refetchOnMount:        options.disableCache ? 'always' : true,
    refetchOnWindowFocus:  false,
  });
}
```

**Plumbing.** `pages.ts` validates widgets with `WidgetConfigSchema` (Zod). Add `disableCache: z.boolean().optional()` to the schema, then set `disableCache: true` on the grv-log widget entry (`client/src/config/pages.ts` line ~38). `ReportTableWidget` reads `widget.disableCache` and forwards it as the third argument to `useReportQuery`.

**Net behavior:** any filter change, page change, or remount triggers a fresh round-trip; identical re-submissions also fetch fresh because TanStack treats the cached entry as stale.

The existing Refresh button stays. With the new behavior it's mostly redundant for grv-log, but it's harmless and consistent across widgets.

### 3. Shared: LA timezone util

**New file** `shared/utils/timezone.ts`:
```ts
// FILE: shared/utils/timezone.ts
// PURPOSE: Treat all user-facing dates as America/Los_Angeles calendar dates.
//          Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is
//          semantically a calendar day, not a UTC instant.
// USED BY: client/src/config/filterConstants.ts,
//          client/src/utils/formatters.ts,
//          server/src/index.ts (cache warming)
// EXPORTS: LA_TIMEZONE, nowInLA, formatPriorityCalendarDate

export const LA_TIMEZONE = 'America/Los_Angeles';

// WHY: Returns a Date whose .getFullYear/.getMonth/.getDate/.getDay return
// the LA-local values. Lets existing weekUtils math (which uses local Date
// methods) compute the LA week without rewriting weekUtils itself.
export function nowInLA(): Date { /* uses Intl.DateTimeFormat parts */ }

// WHY: Parses 'YYYY-MM-DDT...Z' as a calendar date (ignores the UTC time),
// so the rendered day never shifts based on the browser's timezone.
export function formatPriorityCalendarDate(dateStr: string): string { /* … */ }
```

Implementation sketches (no external dependency):
```ts
function nowInLA(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
  );
}

function formatPriorityCalendarDate(dateStr: string): string {
  const [datePart] = dateStr.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(y, m - 1, d));
}
```

### 4. Call-site updates

| File | Change |
|------|--------|
| `client/src/config/filterConstants.ts` (default "in week" filter) | `getMonday(new Date())` → `getMonday(nowInLA())` |
| `client/src/utils/formatters.ts` (`formatDate`) | Replace `new Date(dateStr)` parsing with `formatPriorityCalendarDate(dateStr)` |
| `server/src/index.ts` (lines 22, 60–62, cache warming) | `new Date()` → `nowInLA()` |

**No changes to** `shared/utils/weekUtils.ts` — it already takes a `Date` parameter and never calls `new Date()` itself. Passing it the result of `nowInLA()` makes its existing math LA-correct without any rewrite.

**No changes to** `server/src/services/odataFilterBuilder.ts` — Priority's calendar-day CURDATE is bracketed correctly by the existing `T00:00:00Z` / `T23:59:59Z` bounds.

---

## Files touched

- `shared/utils/timezone.ts` *(new)* — `LA_TIMEZONE`, `nowInLA`, `formatPriorityCalendarDate`
- `server/src/config/reportRegistry.ts` — add `disableCache?: boolean` to `ReportConfig` interface
- `server/src/reports/grvLog.ts` — set `disableCache: true`; remove module-level `subformCache` and its read/write sites in `enrichRows`
- `server/src/routes/query.ts` — gate `cache.get` / `cache.set` on `report.disableCache`
- `server/src/index.ts` — `warmCache()`: skip when `disableCache: true`; replace `getMonday(new Date())` with `getMonday(nowInLA())`
- `client/src/hooks/useReportQuery.ts` — third `options` param; apply TanStack overrides when `options.disableCache`
- `client/src/config/pages.ts` — extend `WidgetConfigSchema` with optional `disableCache`; set `disableCache: true` on grv-log widget
- `client/src/components/widgets/ReportTableWidget.tsx` — read `widget.disableCache`, forward to `useReportQuery`
- `client/src/utils/formatters.ts` — `formatDate` delegates to `formatPriorityCalendarDate`
- `client/src/config/filterConstants.ts` — `createDefaultFilterGroup()`: `getMonday(new Date())` → `getMonday(nowInLA())`

---

## Risks & tradeoffs

- **Priority rate limit pressure.** Every grv-log page load now costs ~51 Priority calls (1 parent + up to 50 remarks). Priority allows 100 calls/min shared across all SGAPI users. Two grv-log page loads inside a minute, while another sync is running, can push the dashboard into 429 territory. If this turns out to bite, the next step is to add a short-TTL (e.g., 60 s) remarks cache rather than re-introducing the unbounded one.
- **Latency.** No server or client cache means every search waits for Priority. Expect ~1–2 s per query in the warm path, occasionally longer when Priority is slow. The existing loading spinner already covers this UX.
- **LA-only assumption.** `LA_TIMEZONE` is hardcoded. The Savory Gourmet business runs on LA time, so this is intentional. If a future install needs a different timezone, lift the constant to env/config.

---

## Test-Driven Implementation Order

Every production-code change below is preceded by a failing test that locks in the intended behavior. Watch each test fail with the expected message *before* writing the implementation. Existing test infrastructure: Vitest with globals, jsdom on client (`client/src/test/setup.ts`), `@shared` path alias on both sides, React Testing Library + `QueryClientProvider` wrapper pattern proven in [useExtendedQuery.test.ts](client/src/hooks/useExtendedQuery.test.ts:1).

### Step 1 — `nowInLA()` (shared util, drives everything else)

**RED — new test file** `shared/utils/timezone.test.ts`:
- `nowInLA() returns a Date with LA-local components at a known UTC instant`
  - Use `vi.setSystemTime(new Date('2026-05-23T04:00:00Z'))` (9 PM PDT on Thu May 22).
  - Assert `.getFullYear() === 2026`, `.getMonth() === 4`, `.getDate() === 22`, `.getDay() === 4` (Thursday). Skip hour assertions to keep DST edges out of scope.
- `nowInLA() returns Friday LA components at UTC instant after LA midnight rollover`
  - `vi.setSystemTime(new Date('2026-05-23T08:00:00Z'))` (1 AM PDT Fri May 23).
  - Assert `.getDate() === 23`, `.getDay() === 5`.

**Expected RED failure:** `Cannot find module './timezone'` or `nowInLA is not a function`.

**GREEN:** create `shared/utils/timezone.ts` with `LA_TIMEZONE` and `nowInLA()` using `Intl.DateTimeFormat('en-US', { timeZone: LA_TIMEZONE, ... }).formatToParts(...)` as sketched in §3.

### Step 2 — `formatPriorityCalendarDate()`

**RED — extend** `shared/utils/timezone.test.ts`:
- `formats a Priority CURDATE as the literal calendar day, ignoring UTC time`
  - Input `'2026-05-22T00:00:00Z'` → output `'May 22, 2026'`.
- `does not shift the day even when host TZ would push UTC midnight back`
  - Set `process.env.TZ = 'Pacific/Auckland'` in the test (or stub at runtime); same input still returns `'May 22, 2026'`.

**Expected RED failure:** `formatPriorityCalendarDate is not a function`.

**GREEN:** add the function to `shared/utils/timezone.ts`. Implementation parses the `YYYY-MM-DD` prefix and constructs `new Date(year, monthIndex, day)` (local components), then formats with `Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`. No `timeZone` option needed — the date is constructed in local components that already encode the LA calendar day, so the formatter cannot shift it.

### Step 3 — Default-week filter uses LA now

**RED — new test file** `client/src/config/filterConstants.test.ts` (or extend [client/src/utils/weekUtils.test.ts](client/src/utils/weekUtils.test.ts:1) if a sibling test already exists for `createDefaultFilterGroup`):
- `createDefaultFilterGroup returns LA's Monday–Sunday at a UTC instant that's a different day in LA vs UTC`
  - `vi.setSystemTime(new Date('2026-05-25T04:00:00Z'))` (9 PM PDT Sun May 24 — LA Sunday, UTC Monday).
  - Expect `condition.value === '2026-05-18'` (LA's Monday of that week) and `condition.valueTo === '2026-05-24'` (LA's Sunday).
  - Without the fix, the function reads UTC's Monday (2026-05-25) and returns `'2026-05-25'` / `'2026-05-31'` — wrong week.

**Expected RED failure:** assertion mismatch — receives UTC-derived dates.

**GREEN:** in `client/src/config/filterConstants.ts` `createDefaultFilterGroup`, replace `getMonday(new Date())` with `getMonday(nowInLA())`.

### Step 4 — `formatDate` uses calendar-date formatter

**RED — new test file** `client/src/utils/formatters.test.ts`:
- `formatDate renders Priority CURDATE as the literal calendar day in any browser TZ`
  - Input `'2026-05-22T00:00:00Z'` → output `'May 22, 2026'`.
  - jsdom defaults to UTC, so the existing buggy implementation actually returns `'May 22, 2026'` here — to make this a real test, also assert via `process.env.TZ = 'America/Los_Angeles'`: same input still returns `'May 22, 2026'` (with the bug it would return `'May 21, 2026'`).

**Expected RED failure:** under LA-TZ, the existing `formatDate` returns `'May 21, 2026'`.

**GREEN:** in `client/src/utils/formatters.ts`, replace `formatDate`'s body with `return formatPriorityCalendarDate(dateStr);`.

### Step 5 — Server query route honors `disableCache`

**RED — new test file** `server/tests/queryDisableCache.test.ts`:
- `query route skips cache.get when report.disableCache is true`
  - Build a `ReportConfig` with `disableCache: true`, register it, mock the cache provider (a stubbed `{ get: vi.fn(), set: vi.fn(), delByPrefix: vi.fn() }`), invoke the POST handler via supertest or a direct route-level call, assert `cache.get` was not called.
- `query route skips cache.set when report.disableCache is true`
  - Same setup; assert `cache.set` was not called after the report fetch returns.
- `query route still uses cache when report.disableCache is undefined`
  - Same setup with `disableCache` omitted; assert `cache.get` was called once.

**Expected RED failure:** `cache.get` was called when it shouldn't have been (the gates don't exist yet).

**GREEN:**
1. Add `disableCache?: boolean` to `ReportConfig` in [server/src/config/reportRegistry.ts:43](server/src/config/reportRegistry.ts:43).
2. In [server/src/routes/query.ts](server/src/routes/query.ts:30), wrap the `cache.get` call and the `cache.set` call in `if (!report.disableCache)` blocks.

### Step 6 — `grvLog` report opts in + remarks cache removed

**RED — new test file** `server/tests/grvLogReport.test.ts`:
- `grv-log report sets disableCache: true`
  - Import the registered report from `reportRegistry`, assert `report.disableCache === true`.
- `grv-log enrichRows always fetches each row's subform fresh (no module-level cache)`
  - Stub `querySubform` with `vi.spyOn(...).mockResolvedValue({ TEXT: '...' })`. Call `enrichRows` twice with the same 2 rows. Assert `querySubform` was called 4 times total (2 rows × 2 calls), not 2.

**Expected RED failure:** first test — `disableCache` is undefined. Second test — `querySubform` was called only 2 times because subformCache short-circuited the second pass.

**GREEN:** in [server/src/reports/grvLog.ts](server/src/reports/grvLog.ts:171), add `disableCache: true` to the report object, delete the module-level `subformCache: Map<...>` declaration, remove the get/set sites inside `enrichRows`, and reduce `clearMemoryCache` to a single-line no-op.

### Step 7 — Cache warming skips `disableCache` reports

**RED — extend** an existing test or create `server/tests/cacheWarming.test.ts`:
- `warmCache does not POST a query for a report with disableCache: true`
  - Stub `fetch` (the function uses HTTP self-invocation). Register a dummy `ReportConfig` with `disableCache: true`. Run `warmCache()`. Assert no fetch was made for that report's id.

**Expected RED failure:** the fetch is called for the disabled report.

**GREEN:** in `warmCache()` ([server/src/index.ts:60](server/src/index.ts:60)), iterate `reportRegistry.values()` (or whatever pattern is already there) and `continue` when `report.disableCache`. Also swap `getMonday(new Date())` → `getMonday(nowInLA())` on line 62 — that line already has implicit test coverage via the Step 3 default-week behavior once the same `nowInLA` is reused.

### Step 8 — Client hook honors `disableCache` option

**RED — extend** [client/src/hooks/useReportQuery.test.ts](client/src/hooks/useReportQuery.test.ts:1) (or create it — does not exist yet). Use the `QueryClientProvider` wrapper pattern from [useExtendedQuery.test.ts](client/src/hooks/useExtendedQuery.test.ts:11):
- `re-renders re-fetch when disableCache is true`
  - Mount the hook with `disableCache: true`, wait for first fetch. Unmount, re-mount with identical params. Assert `fetch` was called twice.
- `re-renders use cached data when disableCache is omitted`
  - Same setup without `disableCache`. Assert `fetch` was called only once.

**Expected RED failure:** with the current hardcoded `staleTime: 15 * 60 * 1000`, both tests would call fetch only once. The first test fails because it expects 2 calls.

**GREEN:** add the `options: ReportQueryOptions = {}` parameter and the conditional TanStack settings shown in §2.

### Step 9 — Plumbing: widget config flag

**RED — extend** [client/src/config/pages.test.ts](client/src/config/pages.test.ts:1):
- `grv-log widget config has disableCache: true`
  - Find the widget, assert `widget.disableCache === true`.
- `WidgetConfigSchema accepts optional disableCache boolean`
  - Parse a minimal widget object with `disableCache: true` — should not throw. Parse one with `disableCache: 'yes'` — should throw.

**Expected RED failure:** first test — field is undefined. Second test — schema parse passes for `'yes'` (no validation yet).

**GREEN:** add `disableCache: z.boolean().optional()` to `WidgetConfigSchema` and `disableCache: true` to the grv-log widget entry.

The final wiring — `ReportTableWidget` forwarding `widget.disableCache` to `useReportQuery` — has no behavioral test of its own (it's a pure pass-through) but is exercised end-to-end by the manual verification steps below.

### Order summary

```
1. nowInLA (shared)
2. formatPriorityCalendarDate (shared)
3. createDefaultFilterGroup uses nowInLA
4. formatDate delegates to formatPriorityCalendarDate
5. query route gates on report.disableCache
6. grvLog sets disableCache + removes subformCache
7. warmCache skips disableCache reports + uses nowInLA
8. useReportQuery honors options.disableCache
9. pages.ts schema + widget config
```

Each step ends with `npm test` green on both `server/` and `client/` before moving on. The pre-deploy check (`cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit`) runs at the end.

---

## Verification

Manual checks after deploy:
1. **Default week is LA-correct:** open the page at a time that's a different day in UTC vs LA (e.g., 6 PM Pacific on a Sunday). The default-week filter should reflect LA's Monday–Sunday, not UTC's.
2. **Filtered day matches:** filter "Date is 2026-05-22"; every visible row's Date column reads "May 22, 2026" (not "May 21").
3. **Cache truly bypassed:**
   - Tail Express logs on Railway.
   - Run a search → expect a Priority OData call in the logs.
   - Re-run the same search 30 s later → expect another Priority call (not a cache hit).
   - Paginate to page 2 within the same filter → expect another Priority call.
4. **Remarks freshness:** edit a GRV's remark in Priority. Reload the page (or change a filter and change back). The new remark text appears without clicking the Refresh button.
5. **Airtable iframe sanity check:** verify the above in the Airtable Omni embed, not just the direct Railway URL — JPEG/iframe quirks have masked rendering bugs before.

Automated checks:
- `cd server && npm test` — all server suites green, including the new `queryDisableCache.test.ts`, `grvLogReport.test.ts`, and `cacheWarming.test.ts`.
- `cd client && npm test` — all client suites green, including the new `timezone.test.ts` (shared util), `formatters.test.ts`, `filterConstants.test.ts`, and the extended `useReportQuery.test.ts` / `pages.test.ts`.
- `cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit` — type-level changes (the `disableCache?: boolean` field on `ReportConfig` and `WidgetConfigSchema`, the new hook options param) compile cleanly. This must pass before pushing to `main` per CLAUDE.md.
