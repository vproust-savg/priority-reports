# GRV Log — UAT/Live Environment Toggle (Design)

**Date:** 2026-08-03
**Status:** Approved (design) — pending Codex adversarial review, then implementation.

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
6. Fail toward Live: any Priority call outside the override scope uses
   the boot default (`PRIORITY_ENV`, production on Railway). Test data
   must never be able to leak into a Live view.
7. Credentials never leave the server; the environment field is a fixed
   Zod enum, never interpolated into URLs.

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

### 7. Explicitly out of scope

- Persisting the toggle (localStorage/URL) — rejected for safety.
- Env toggle on other reports/pages — flag exists, nothing else opts in.
- Per-environment rate-limit budgets — UAT and Live share the same
  Priority host (only the company code differs), so the single shared
  95/min limiter is correct. A UAT burst competes with Live for budget
  exactly as a second Live user does today; acceptable.
- Health-endpoint credential presence reporting — the post-deploy UAT
  probe verifies credentials *work*, which is stronger.

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
   (queryKey) and resets page to 1.

## Verification & Deploy

1. Pre-deploy: `npx tsc -b --noEmit` (client), `npx tsc --noEmit`
   (server), full server suite (warm iCloud-evicted files first).
2. Push to `main` → Railway auto-deploy; detect via read-only
   discriminating probe.
3. Post-deploy probes (production URL):
   - default query (no `environment`) → Live data, matches the ~37-row
     baseline week from 2026-08-03;
   - `environment:'uat'` query → 200 with UAT DOCNOs (also proves the
     Railway `PRIORITY_UAT_*` variables are real);
   - filters with `?environment=uat` → 200, vendor list differs from
     Live (or at minimum env-scoped cache entries observed);
   - export with `environment:'uat'` → file downloads, spot-check rows
     are UAT;
   - `environment:'uat'` on `bbd` query → identical Live behavior
     (override ignored).
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
