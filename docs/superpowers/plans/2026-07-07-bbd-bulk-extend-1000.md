# BBD Bulk Extend — Scale to 1,000 Lots

## Context

The extend-shelf-life feature was fixed and verified live earlier today (vendor-null/dot-serial validation + error detail; Victor extended 3/3 successfully). Victor now needs bulk extends of **up to 1,000 lots**. Four things break at that scale today:

1. **Server caps one request at 100 items** (`ExtendRequestSchema .max(100)`) — his 106-row "Select all" already 400s. The client sends everything in a single POST ([BulkExtendModal.tsx:125](client/src/components/modals/BulkExtendModal.tsx)).
2. **2 Priority calls per lot** (EXPDSERIAL GET lookup + EXPDEXT POST) — 1,000 lots = 2,000 calls ≈ 21 min against the org-wide shared 100-calls/min limit (local limiter: 95/min + 200ms spacing, `priorityRateLimit.ts`).
3. **Airtable snapshots are per-lot fire-and-forget** (2 unawaited calls each) — at scale they exceed Airtable's ~5 rps and drop silently → Extended tab loses records.
4. **Redis report cache is never busted after extends** — the BBD report can show pre-extension data for up to 15 min (`query:bbd:*` keys, 900s TTL).

**Constraints (from /priority-erp-api skill):** Priority writes are quota'd at **10,000/month** (a 1,000-lot run = 1,000 POSTs = 10% of quota — POSTs are irreducible, one extension record per lot); GETs are free and batchable via OR-filters (~30/call, proven in `refreshBalancesFromPriority`); 100 calls/min is shared across ALL company API users.

**Victor's decisions:** browser-driven chunked run (tab stays open ~12 min per 1,000) with progress/ETA/cancel/resume — NOT a server background job (Railway deploys would kill it silently).

**Resulting numbers:** 1,000 lots = 20 chunks of 50 → ~40 batched lookup GETs + 1,000 POSTs ≈ **11–13 min**, ~33–40s per chunk, each chunk well under HTTP timeouts.

## Design

Client splits the selection into **≤50-item requests**, sent sequentially with a progress bar. Server, per request: **batch-lookup** expiry dates (30 serials per OR-filter GET, quota-free) → sequential POSTs per lot (unchanged write semantics) → **batch Airtable snapshots** (10/request) → **bust `query:bbd:` Redis prefix** when ≥1 success. Client invalidates TanStack once at run end. Server's 100-item request cap stays (defense-in-depth); client blocks selections > 1,000 with a notice.

## Server changes

**1. `server/src/routes/extend.ts`**
- New `batchLookupExpiryDates(serialNames: string[], baseUrl: string): Promise<Map<string, string>>` — chunks of 30, `$filter=SERIALNAME eq '…' or …` (escape `'`→`''`), `$select=SERIALNAME,EXPIRYDATE`, via existing `fetchWithRetry`. Trim map keys (EXPDSERIAL serials carry whitespace — see `buildExtensionMap`). Pattern copied from [airtableShortDated.ts:267-302](server/src/services/airtableShortDated.ts) (`refreshBalancesFromPriority`, CHUNK_SIZE 30).
- Rework the POST handler: one lookup map per request → per item: absent from map → `'Lot not found in expiration tracking system'` (message unchanged); no expiry value → existing error; else compute `addDaysToDate` → `postWithRetry` to `EXPDSERIAL(SERIALNAME='…')/EXPDEXT_SUBFORM` (URL/body unchanged). Per-item results preserved in order.
- Replace the per-lot fire-and-forget snapshot loop with one fire-and-forget `snapshotExtendedItemsBatch(successes)` call.
- Signature becomes `createExtendRouter(cache: CacheProvider)`; after ≥1 success, fire-and-forget `cache.invalidateByPrefix('query:bbd:')` — same operation the `/refresh` route does ([query.ts:216](server/src/routes/query.ts)). Update the call site in `server/src/index.ts`.

**2. `server/src/services/airtableShortDated.ts`**
- New `snapshotExtendedItemsBatch(items: Array<{serialName; rowData?; newExpiryDate; days}>)`: chunked `OR({fld…}="…",…)` filterByFormula search (30/call) → partition existing vs new → PATCH/POST in batches of 10 (reuse `AIRTABLE_BATCH_SIZE` pattern from `batchUpdateAirtableBalances`), sequential with ~250ms spacing; same field logic as today (`originalExpiryDate` only on create; `daysExtended` accumulates on update); `console.warn` on failures.
- Reimplement `snapshotExtendedItem` as a batch-of-1 wrapper so there is exactly one write path.

## Client changes

**3. `client/src/hooks/useExtendExpiry.ts`** — hook option `useExtendExpiry({ invalidateOnSuccess = true })`; bulk passes `false` (otherwise 20 chunks trigger 20 mid-run refetches).

**4. New `client/src/hooks/useBulkExtendRunner.ts`** — extracted chunk-runner (keeps BulkExtendModal under the 250-line limit; pure logic is unit-testable): chunk selection (50), sequential loop, rolling-average ETA, cancel flag honored between chunks, per-item failure accumulation, thrown-chunk-error → paused + resume (skips serials already in the success map).

**5. `client/src/components/modals/BulkExtendModal.tsx`** — wire the runner: progress bar (`done/total` + ETA), confirm box shows lot count, estimated minutes, "uses N of 10,000 monthly Priority writes", and "keep this tab open"; cancel/resume buttons; selection > 1,000 blocks confirm with a notice; one `queryClient.invalidateQueries({queryKey:['report','bbd']})` at run end. `ExtendExpiryModal` unchanged.

## Reused utilities (do not reinvent)

- `rateLimitDelay` — already serializes/paces every Priority call ([priorityRateLimit.ts](server/src/services/priorityRateLimit.ts))
- `fetchWithRetry` / `postWithRetry` / `extractErrorMessage` ([priorityHttp.ts](server/src/services/priorityHttp.ts))
- OR-filter chunk lookup pattern + `AIRTABLE_BATCH_SIZE` writes ([airtableShortDated.ts](server/src/services/airtableShortDated.ts))
- `invalidateByPrefix` ([cache.ts:75](server/src/services/cache.ts)) with the exact prefix `query:bbd:`

## Tests (TDD — red first, existing harnesses)

- `extend.test.ts` (module-boundary `vi.mock` harness): lookup batching (1 GET per 30 serials; quote-escaping; trimmed keys); missing serial → per-item error; result order preserved; `invalidateByPrefix` called on ≥1 success and NOT on all-fail; `snapshotExtendedItemsBatch` called with only successes. Mock cache injected via `createExtendRouter(cache)`.
- New `server/tests/airtableSnapshotBatch.test.ts` (mock global `fetch`): create/update partition, 10-per-request batching, `daysExtended` accumulation, `originalExpiryDate` preserved on update.
- New `client/src/hooks/useBulkExtendRunner.test.ts`: chunk math (1,000→20), cancel stops between chunks, resume excludes succeeded serials, failure accumulation (mocked extend fn).

## Out of scope

Server background jobs; raising the per-request Zod cap; Extended-tab redesign; write-quota increases (flag to Priority admin if 1,000-lot runs become frequent).

## Cleanup (from previous workstream)

Mark `docs/superpowers/specs/2026-07-07-bbd-extend-validation-fix-design.md` Status → Implemented (2026-07-07). Also mirror this plan into `docs/superpowers/plans/2026-07-07-bbd-bulk-extend-1000.md` per house convention and commit both.

## Verification

1. Full suites (`npm test` server + client) and both `tsc` builds; railway-deploy checklist (server `npm run build` + runtime-only `@shared` grep on `dist/**/*.js` excluding comments).
2. Push → deploy → liveness probe (`days:0` + `vendor:null` → exactly 1 Zod issue).
3. Read-only cap check: 101-item payload with `days:0` → still 400 (server cap intact).
4. Live small run: Victor selects 2–3 lots in the Airtable embed → verify progress UI, per-item results, Extended-tab snapshots, and that the report shows post-extension state immediately (Redis bust working: `meta.cache` = miss on refetch).
5. First real large run (≥100 lots) monitored together; capture actual chunk timings vs the ~35s estimate.
