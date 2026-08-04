# GRV Log — UAT/Live Environment Toggle (Design)

**Date:** 2026-08-03
**Status:** Implemented (2026-08-04) — deployed and verified in production.
Post-deploy probes: default query `priorityEnv:production`, 38 rows /
0 caviar / 10.5s (baseline held); UAT query `priorityEnv:uat` 200 with
real rows (Railway UAT creds proven); filters env-distinct (Live 76
vendors, UAT 109); bounded UAT export 200/14.3KB/72s; bbd with
`environment:uat` → `production` (override ignored); legacy route 404
(deploy discriminator); boot guard live. Dev-preview verification:
toggle GRV-only, Live default, switch aborts in-flight Live request
(ERR_ABORTED observed), amber badge renders. Tests: server 361/361,
client 159/159. Local-dev note: Live default 502s locally by design
(prod creds deliberately absent in .env) — click UAT. Airtable embed
visual check: Victor.
v2 history: Codex adversarial review findings addressed (legacy route
retirement, boot-env hardening + provenance, authorization posture
documented as accepted risk — confirmed by Victor at the review gate —
and request cancellation).

## Problem

Some data Victor needs in the GRV Log lives only in the Priority UAT
environment and cannot be migrated to production. The report must be able
to run against either environment on demand. Same code, same report — the
only difference is which Priority credentials/company the server uses for
one request. All credential sets already exist as Railway variables.

## Requirements

1. The GRV Log widget gets a **Live | UAT** toggle. Table data, the
   vendor/status filter dropdowns, and the Excel export all follow the
   selected environment together — never mixed within one view or request.
2. **Every page load starts on Live** (Victor, 2026-08-03). No
   persistence; switching to UAT is a deliberate, per-visit action.
3. UAT mode is visually unmistakable: amber treatment + a "UAT — test
   data" badge, iframe-safe colors (no washed-out slate-300/400).
4. Only the GRV report honors the override. All other reports ignore the
   field even if a client sends it. Priority **write** paths (BBD extend,
   Airtable short-dated snapshots) can never be switched.
5. No cross-environment cache contamination: Redis entries for filters,
   export pages, and query responses are keyed by the resolved
   environment.
6. Fail toward the boot environment — and make the boot environment
   trustworthy: any Priority call outside the override scope uses
   `PRIORITY_ENV`, and **production deployments must set `PRIORITY_ENV`
   explicitly or the server refuses to boot** (Codex finding 2 — the
   schema default is `uat`, so an unset Railway variable would otherwise
   silently serve UAT as "Live" and point BBD writes at UAT). With the
   boot guard, a missed wrap can only ever produce Live data on Railway.
7. Credentials never leave the server; the environment field is a fixed
   Zod enum, never interpolated into URLs.
8. No environment-blind GRV path remains mounted: the legacy
   `GET /api/v1/reports/:reportId` route (superseded by `POST /query`,
   zero remaining callers) is retired (Codex finding 1).
9. A GRV fetch abandoned by the client (toggle switch, unmount, reload)
   stops consuming Priority rate budget within one enrichment batch
   (Codex finding 4).

## Design

### 1. Request-scoped environment context — `server/src/config/priorityEnvContext.ts` (new)

`getPriorityConfig()` is already called lazily on **every** Priority HTTP
call (URL build + auth header). It just reads a boot-time constant. We
make it consult a request-scoped override first:

```ts
// WHY: One request = one environment. The override is set once at the
// route layer and read by getPriorityConfig() at any async depth —
// including enrichRows' batched sub-form fetches (ALS propagates through
// await, Promise.all, and setTimeout). Write routes never set it.
const storage = new AsyncLocalStorage<PriorityEnvironment>();

export function runWithPriorityEnv<T>(
  env: PriorityEnvironment | undefined,
  fn: () => T,
): T {
  if (!env) return fn(); // no override — boot default applies
  return storage.run(env, fn);
}

export function getRequestPriorityEnv(): PriorityEnvironment | undefined {
  return storage.getStore();
}
```

`config/priority.ts` changes one resolution line:

```ts
const envName = getRequestPriorityEnv() ?? env.PRIORITY_ENV;
```

(`isProduction`, the missing-credentials error message, and the returned
`env` field all use `envName`.)

### 2. Per-report opt-in — `reportRegistry.ts`, `grvLog.ts`

`ReportConfig` gains `allowEnvOverride?: boolean`. Only `grv-log` sets it
`true`. Routes resolve:

```ts
const requestedEnv = report.allowEnvOverride ? body.environment : undefined;
const resolvedEnv = requestedEnv ?? env.PRIORITY_ENV; // for cache keys/logs
```

(In `filters.ts` — a GET — `body.environment` is replaced by the
validated `req.query.environment` value; same resolution otherwise.)

A report without the flag yields `requestedEnv = undefined` →
`runWithPriorityEnv` runs the callback with **no** context → boot default.

### 3. Six wrap points — `query.ts`, `export.ts`, `filters.ts`

No signature changes, no re-indentation; each Priority-touching call is
wrapped in place so the promise is **created inside** the ALS scope:

- `query.ts`: the `queryPriority(...)` fetch and the
  `report.enrichRows(rawRows)` call (covers all 50 remarks sub-form
  fetches).
- `export.ts`: the `queryPriority(...)` inside the pagination loop and
  the enrich step.
- `filters.ts`: the fallback vendor `queryPriority(...)` and the
  `report.fetchFilters()` branch (harmless for non-opt-in reports —
  `requestedEnv` is undefined there).

Example (query.ts):

```ts
priorityData = await runWithPriorityEnv(requestedEnv, () =>
  queryPriority(report.entity, { ...params }));
```

The BBD extend route, subform/attachments routes, and
`airtableShortDated.ts` are **not** wrapped — they always use the boot
default (Requirement 4).

### 4. Request schemas

- `querySchemas.ts` / `exportSchemas.ts`:
  `environment: z.enum(['production', 'uat']).optional()`.
- `filters.ts` (GET): validate `req.query.environment` with the same
  enum via `safeParse`; invalid value → 400, absent → no override.
- `shared/types/filters.ts`: `QueryRequest.environment?: PriorityEnvironment`;
  new `export type PriorityEnvironment = 'production' | 'uat'` (used by
  both client and server — belongs in shared/types).

### 5. Environment-scoped cache keys — `services/cache.ts`

All three builders take the **resolved** environment (never the raw
request field, so local dev — where boot default is `uat` — keys
correctly):

- `buildQueryCacheKey(reportId, body, resolvedEnv)` →
  `query:{id}:env{resolvedEnv}:p{page}:...`
- `buildExportCacheKey(reportId, filterGroup, page, baseFilter, resolvedEnv)` →
  `export:{id}:env{resolvedEnv}:p{page}:...`
- filters route key → `filters:{reportId}:{resolvedEnv}`

Old-format keys age out via existing TTLs (15 min / 1 h) — the same
self-versioning pattern as the V8491 base-filter change. No migration.
(grv-log skips the query cache via `disableCache`, but the key gains the
env segment anyway so any future cached+overridable report is safe by
default.)

### 6. Client — toggle on the GRV widget only

- `pages.ts`: `WidgetConfigSchema` gains `envToggle: z.boolean().optional()`;
  the grv-log widget entry sets `envToggle: true`. Config-driven, like
  every other widget capability.
- `ReportTableWidget.tsx`: when `envToggle`, holds
  `useState<PriorityEnvironment>('production')` — plain React state, so
  every mount starts on Live (Requirement 2). The value joins:
  - `useReportQuery` params (it's inside the object already used as the
    TanStack queryKey → switching auto-refetches) and the POST body;
  - `useFiltersQuery` → key becomes `['filters', reportId, environment]`
    and the GET grows `?environment=uat` when toggled;
  - `useExport` POST body.
  Switching environments resets to page 1.
- New `client/src/components/widgets/EnvToggle.tsx`: Apple-style
  segmented control **Live | UAT** (Framer Motion pill slide). UAT active
  = amber pill (amber-600+, iframe-visible) + adjacent badge
  "UAT — test data". Rendered in the widget toolbar.

### 7. Legacy route retirement — `routes/reports.ts` (Codex finding 1)

`GET /api/v1/reports/:reportId` predates `POST /query` (Spec 02). It
still serves any registered report — including grv-log — through the
env-blind `buildCacheKey` (300s TTL) and ignores `disableCache`.
Verified 2026-08-03: **zero callers** — every client hook uses
`/query`, `/filters`, `/export`, `/subform`, `/refresh`, `/extend`,
`/extended`; the only references to the bare GET are in the archived
Spec-02a plan document.

Action: delete the `router.get('/:reportId', …)` handler. Keep
`GET /list` and the side-effect report imports — reports.ts is the only
module that imports `customerReturns` for registration, and that import
must survive. `buildCacheKey` loses its last caller and is removed with
its `report:` key family (age out via TTL).

### 8. Boot-environment hardening + provenance (Codex finding 2)

`environment.ts` gains a post-parse guard:

```ts
// WHY: The schema default is 'uat' (local dev). In production an unset
// PRIORITY_ENV would silently serve UAT data as "Live" and point BBD
// writes at UAT — with valid credentials, so nothing would error.
// Fail the boot instead; Railway's healthcheck keeps the old deploy.
if (env.NODE_ENV === 'production' && !process.env.PRIORITY_ENV) {
  throw new Error('PRIORITY_ENV must be set explicitly in production');
}
```

Codex also recommended hard-pinning mutation paths to production. That
is deliberately **not** adopted: local development intentionally runs
BBD extend against UAT (`PRIORITY_ENV=uat` in `.env`). Write-path safety
comes from two facts instead: writes are never request-overridable (no
wrap), and the boot environment is explicit-or-crash in production.

Provenance (adopted from the same finding): `ApiResponse.meta` gains
optional `priorityEnv: PriorityEnvironment` (additive envelope change —
consumers reviewed, none break), set by query.ts from `resolvedEnv`; the
query-route `logApiCall` entries gain an `environment` field. Post-deploy
probes and the UI can then verify the served environment directly
instead of inferring it from data shape.

### 9. Request cancellation — budget protection (Codex finding 4)

A GRV page load costs ~51 Priority calls against the shared 95/min
budget. The Live-default toggle makes double-loads routine: open (Live,
51 calls) → switch to UAT (51 more) in the same minute, while the
abandoned Live enrichment keeps running server-side. Fix both ends,
narrowly:

- **Client:** `useReportQuery`'s `queryFn` consumes TanStack's
  `AbortSignal` (`queryFn: ({ signal }) => fetch(url, { …, signal })`)
  so a queryKey change or unmount aborts the HTTP request.
  `useFiltersQuery` gets the same one-line treatment.
- **Server (`query.ts`):** an `AbortController` aborts on `req.on('close')`.
  Its signal is passed to enrichment: `ReportConfig.enrichRows` gains an
  optional second parameter `signal?: AbortSignal` (backward compatible —
  existing implementations that ignore it still type-check). grvLog's
  `enrichRows` checks `signal?.aborted` between batches and throws an
  abort error; query.ts recognizes it, skips the cache write, and ends
  without a response body (the socket is already gone).
- **Effect:** an abandoned Live load stops within one batch (≤10
  in-flight sub-form calls) instead of running all ~50.

This is a narrow slice of the broader retry-storm hardening
(server-side dedupe of identical in-flight queries, client retry caps),
which remains out of scope — tracked separately (chip task_4b5a62f6).

### 10. Explicitly out of scope

- Persisting the toggle (localStorage/URL) — rejected for safety.
- Env toggle on other reports/pages — flag exists, nothing else opts in.
- Per-environment rate-limit budgets — UAT and Live share the same
  Priority host (only the company code differs), so the single shared
  95/min limiter is correct. With §9's cancellation, a Live→UAT switch
  costs one batch of waste, not a full duplicate run.
- Health-endpoint credential presence reporting — the post-deploy UAT
  probe verifies credentials *work*, which is stronger.
- Authentication/authorization for the dashboard — see "Security &
  authorization posture" below; building an auth layer is its own
  project if wanted.
- Full retry-storm hardening (in-flight query dedupe, client retry
  caps) — chip task_4b5a62f6; §9 implements only the cancellation slice
  this feature itself makes routine.

## Security & authorization posture (Codex finding 3 — accepted risk)

Codex correctly notes the override has no authorization boundary. The
dashboard has **no authentication at all today, by design**: it is a
public-but-unlinked Railway URL consumed inside the Airtable Omni iframe,
and any caller who reaches it already has unrestricted read access to
all Live reports (GRV, BBD, Customer Returns) and their exports. The
toggle adds read access to UAT GRV data — the same company's ERP data,
same sensitivity class — for that same caller set, and adds **no** write
surface (extend is never overridable). Treating a Zod enum as an access
control is not the claim; the claim is that UAT read access does not
change the existing exposure class.

**Accepted as residual risk — explicitly flagged for Victor at the spec
review gate.** If the dashboard ever needs an auth boundary (e.g. the
URL leaks beyond the intended audience), that is a standalone spec.

## Error handling & edge cases

- **UAT credentials missing/wrong in Railway:** `getPriorityConfig()`
  throws its existing precise message → route's existing catch → 502 →
  widget's existing error state. The post-deploy probe catches this
  before users do.
- **UAT empty for the default week:** expected (UAT data is older); the
  normal empty state + date chips handle it; the amber badge explains it.
- **Concurrent mixed-env requests:** ALS context is per async chain — no
  cross-talk between simultaneous Live and UAT requests by construction.
- **V8491 exclusion, filter semantics, remarks parsing:** identical in
  both environments (same code path).

## Testing (TDD — failing first; server tests in `server/tests/`)

1. **Context propagation:** value survives the exact `enrichRows` shape
   (`await` + `Promise.all` + `setTimeout` batches); absent → undefined;
   two interleaved `runWithPriorityEnv` scopes don't bleed.
2. **`getPriorityConfig`:** inside `runWithPriorityEnv('uat')` returns
   UAT creds; outside returns boot default; missing-creds throw names the
   requested env.
3. **Route opt-in:** `environment:'uat'` on grv-log → Priority layer sees
   the UAT context; same field on a non-opt-in report → context stays
   undefined; invalid value → 400 (body) / 400 (filters query param).
4. **Cache keys:** same request, different resolved env → different
   query, export, and filters keys.
5. **Client:** pages schema accepts `envToggle`; EnvToggle switch flips
   state, renders the UAT badge, propagates env into query params
   (queryKey) and resets page to 1; `useReportQuery` passes TanStack's
   `AbortSignal` into `fetch`.
6. **Legacy route retired:** `GET /api/v1/reports/grv-log` → 404;
   `customer-returns` remains registered (its registration import lives
   in reports.ts) and still answers `POST /query`.
7. **Boot guard:** `NODE_ENV=production` without explicit `PRIORITY_ENV`
   → environment module throws; with `PRIORITY_ENV=production` → boots.
8. **Cancellation:** with a mocked `querySubform` counting calls,
   aborting after the first enrichment batch stops further batches
   (≤ one batch of calls after abort); aborted requests never write to
   cache. `meta.priorityEnv` equals the resolved environment.

## Verification & Deploy

1. Pre-deploy: `npx tsc -b --noEmit` (client), `npx tsc --noEmit`
   (server), full server suite (warm iCloud-evicted files first).
2. Push to `main` → Railway auto-deploy; detect via read-only
   discriminating probe.
3. Post-deploy probes (production URL):
   - default query (no `environment`) → `meta.priorityEnv:'production'`,
     Live data matches the ~37-row baseline week from 2026-08-03;
   - `environment:'uat'` query → 200 with `meta.priorityEnv:'uat'` (also
     proves the Railway `PRIORITY_UAT_*` variables are real);
   - filters with `?environment=uat` → 200, vendor list differs from
     Live (or at minimum env-scoped cache entries observed);
   - export with `environment:'uat'` → file downloads, spot-check rows
     are UAT;
   - `environment:'uat'` on `bbd` query → `meta.priorityEnv:'production'`
     (override ignored);
   - `GET /api/v1/reports/grv-log` → 404 (legacy route retired).
4. Victor: visual check of the toggle + badge in the Airtable embed
   (Reports > Food Safety).
5. Rollback: the field is optional end-to-end — reverting the client
   commit alone removes the feature; server override code is inert
   without callers.

## Decision History

- 2026-08-03: Feature requested — some GRV data exists only in UAT and
  cannot be migrated; needs a user-facing environment switch on the GRV
  report. All credentials already in Railway.
- Default environment = **Always Live** on every load, no persistence —
  Victor (safety for food-safety users in the Airtable embed).
- Approach A (request-scoped ALS context + per-report opt-in) chosen over
  B (explicit param threading through ~8 files — churn + silent
  mixed-environment failure mode if one call site is missed) and C
  (second Railway service — CORS, double infra, Redis contamination).
- ALS accepted despite the repo's explicit-over-implicit rule: confined
  to one ~30-line module, wrap points visible at call sites, and the
  fallback direction (boot default = Live) makes the worst failure
  "production data shown while toggled to UAT", never the reverse.
- Codex adversarial review (2026-08-03): needs-attention — legacy
  `GET /:reportId` route bypasses ALS + env-scoped caching (high);
  `PRIORITY_ENV` schema default `uat` falsifies "fail toward Live"
  (high); no authorization boundary on the override (high); Live→UAT
  switch can double the Priority budget cost with no cancellation
  (medium). v2 resolutions: legacy route retired (§7, zero callers
  verified); production boot requires explicit `PRIORITY_ENV` +
  `meta.priorityEnv` provenance (§8); auth documented as accepted risk,
  Victor to confirm (posture section); AbortSignal cancellation end to
  end (§9). Codex's "hard-pin mutation paths to production" rejected —
  local dev deliberately writes to UAT; boot guard + never-overridable
  writes cover the risk.
