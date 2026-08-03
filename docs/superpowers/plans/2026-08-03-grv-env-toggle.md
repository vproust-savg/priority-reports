# GRV UAT/Live Environment Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This repo:** subagents are unreliable on this iCloud-backed repo — execute inline (executing-plans). Warm iCloud-evicted files before trusting any build/test failure (see memory `icloud-eviction-breaks-builds`).

**Goal:** Let the GRV Log widget switch between Priority Live and UAT per visit, with request-scoped credentials, environment-scoped caches, no reachable env-blind path, and cancellation of abandoned loads.

**Architecture:** An `AsyncLocalStorage` context carries the requested environment for one request; `getPriorityConfig()` (already called lazily per Priority HTTP call) consults it first, falling back to boot `PRIORITY_ENV`. Routes honor the request field only for reports with `allowEnvOverride: true` (grv-log only). The legacy `GET /:reportId` route is retired; production boot fails without an explicit `PRIORITY_ENV`; responses carry `meta.priorityEnv`.

**Tech Stack:** Express + TypeScript strict, Zod, Vitest + supertest, Node `async_hooks`/`AbortController`, React 19 + TanStack Query v5 + Framer Motion, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-08-03-grv-env-toggle-design.md`

**Deploy gate:** Tasks 1–11 commit locally only. Do NOT `git push` (auto-deploys production) until Victor approves at the Task 11 HOLD.

---

## File map

| File | Change |
|---|---|
| `shared/types/filters.ts` | + `PriorityEnvironment`, `QueryRequest.environment?` |
| `shared/types/api.ts` | + `ResponseMeta.priorityEnv?` |
| `server/src/config/priorityEnvContext.ts` | **new** — ALS context |
| `server/src/config/priority.ts` | consult context before boot env |
| `server/src/config/environment.ts` | production boot guard |
| `server/src/services/logger.ts` | + `environment?` log field |
| `server/src/config/reportRegistry.ts` | + `allowEnvOverride?`; `enrichRows` gains `signal?` |
| `server/src/reports/grvLog.ts` | + `allowEnvOverride: true`; abort check in `enrichRows` |
| `server/src/routes/querySchemas.ts` / `exportSchemas.ts` | + `environment` enum field |
| `server/src/services/cache.ts` | env in query/export keys; **remove** `buildCacheKey` |
| `server/src/routes/query.ts` | resolve env, 2 wrap points, abort wiring, `meta.priorityEnv`, logs |
| `server/src/routes/export.ts` | resolve env, 2 wrap points, env cache key, log |
| `server/src/routes/filters.ts` | validate `?environment`, wrap points, env cache key |
| `server/src/routes/reports.ts` | retire GET `/:reportId` → 404 stub; keep `/list` + registrations |
| `client/src/hooks/useReportQuery.ts` | + `environment` param, AbortSignal |
| `client/src/hooks/useFiltersQuery.ts` | + `environment` param, AbortSignal |
| `client/src/hooks/useExport.ts` | + `environment` param |
| `client/src/config/pages.ts` | + `envToggle` flag; set on grv-log |
| `client/src/components/widgets/EnvToggle.tsx` | **new** — segmented control + UAT badge |
| `client/src/components/TableToolbar.tsx` | + optional env props, render EnvToggle |
| `client/src/components/widgets/ReportTableWidget.tsx` | env state, wire hooks/toolbar |
| `CLAUDE.md` | docker test command gains `-e PRIORITY_ENV=production` |

Tests: `server/tests/priorityEnvContext.test.ts` (new), `server/tests/priorityEnvOverride.test.ts` (new), `server/tests/environmentGuard.test.ts` (new), `server/tests/grvLogReport.test.ts` (extend), `server/tests/querySchemas.test.ts` (extend), `server/tests/exportCacheKey.test.ts` (update), `server/tests/queryCacheKey.test.ts` (new), `server/tests/queryEnvRoute.test.ts` (new), `server/tests/filtersEnvRoute.test.ts` (new), `server/tests/legacyReportRoute.test.ts` (new), `client/src/config/pages.test.ts` (extend), `client/src/components/widgets/EnvToggle.test.tsx` (new), `client/src/hooks/useReportQuery.test.ts` (extend).

File-length note: `query.ts` is pre-existing at 227 lines and lands ≈245 after this plan — under the 250 ceiling; splitting it is deliberate follow-up, not this feature.

---

### Task 1: Shared type + ALS context module (TDD)

**Files:**
- Modify: `shared/types/filters.ts` (after the `QueryRequest` interface, line ~83)
- Create: `server/src/config/priorityEnvContext.ts`
- Test: `server/tests/priorityEnvContext.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/priorityEnvContext.test.ts
// PURPOSE: Verify the request-scoped Priority environment context
//          propagates through the async shapes enrichRows uses
//          (await, Promise.all, setTimeout) and never bleeds
//          between interleaved scopes.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { runWithPriorityEnv, getRequestPriorityEnv } from '../src/config/priorityEnvContext';

describe('priorityEnvContext', () => {
  it('returns undefined outside any scope', () => {
    expect(getRequestPriorityEnv()).toBeUndefined();
  });

  it('runs the callback without a scope when env is undefined', () => {
    const seen = runWithPriorityEnv(undefined, () => getRequestPriorityEnv());
    expect(seen).toBeUndefined();
  });

  it('survives await + Promise.all + setTimeout (the enrichRows shape)', async () => {
    const seen = await runWithPriorityEnv('uat', async () => {
      await new Promise((r) => setTimeout(r, 5)); // batch delay
      const batch = await Promise.all([
        Promise.resolve().then(() => getRequestPriorityEnv()),
        new Promise<string | undefined>((r) => setTimeout(() => r(getRequestPriorityEnv()), 5)),
      ]);
      return batch;
    });
    expect(seen).toEqual(['uat', 'uat']);
  });

  it('does not bleed between interleaved scopes', async () => {
    const [a, b] = await Promise.all([
      runWithPriorityEnv('uat', async () => {
        await new Promise((r) => setTimeout(r, 10));
        return getRequestPriorityEnv();
      }),
      runWithPriorityEnv('production', async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestPriorityEnv();
      }),
    ]);
    expect(a).toBe('uat');
    expect(b).toBe('production');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/priorityEnvContext.test.ts`
Expected: FAIL — cannot resolve `../src/config/priorityEnvContext`

- [ ] **Step 3: Add the shared type**

In `shared/types/filters.ts`, append after the `QueryRequest` interface (keep `QueryRequest` itself for Task 5):

```ts
// WHY: The GRV widget can point one request at Priority UAT or Live
// (production). Shared because the client sends it and the server
// validates/resolves it. 'production' matches the PRIORITY_ENV enum;
// the client renders it as the "Live" label.
export type PriorityEnvironment = 'production' | 'uat';
```

Add `PriorityEnvironment` to the file's intent-block EXPORTS list.

- [ ] **Step 4: Write the context module**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/priorityEnvContext.ts
// PURPOSE: Request-scoped Priority environment override. A route sets
//          it once; getPriorityConfig() reads it at any async depth,
//          so every Priority call in one request — including
//          enrichRows' batched sub-form fetches — uses one environment.
// USED BY: config/priority.ts, routes/query.ts, routes/export.ts,
//          routes/filters.ts
// EXPORTS: runWithPriorityEnv, getRequestPriorityEnv
// ═══════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'node:async_hooks';
import type { PriorityEnvironment } from '@shared/types';

// WHY: ALS (not a module variable) — concurrent requests each get their
// own context; a plain variable would race under parallel Live/UAT loads.
// ALS propagates through await, Promise.all, and timers, which is exactly
// the shape of grvLog's enrichRows batching.
const storage = new AsyncLocalStorage<PriorityEnvironment>();

// WHY: undefined means "no override" — run OUTSIDE any scope so
// getPriorityConfig() falls back to the boot PRIORITY_ENV. Write routes
// (extend) never call this, so writes can never be switched.
export function runWithPriorityEnv<T>(
  env: PriorityEnvironment | undefined,
  fn: () => T,
): T {
  if (!env) return fn();
  return storage.run(env, fn);
}

export function getRequestPriorityEnv(): PriorityEnvironment | undefined {
  return storage.getStore();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd server && npx vitest run tests/priorityEnvContext.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add shared/types/filters.ts server/src/config/priorityEnvContext.ts server/tests/priorityEnvContext.test.ts
git commit -m "feat(grv-env): PriorityEnvironment type + request-scoped ALS context"
```

---

### Task 2: getPriorityConfig consults the context (TDD)

**Files:**
- Modify: `server/src/config/priority.ts`
- Test: `server/tests/priorityEnvOverride.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/priorityEnvOverride.test.ts
// PURPOSE: getPriorityConfig() must use the request-scoped override
//          when present and the boot PRIORITY_ENV otherwise; the
//          missing-credentials error names the requested env.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

// WHY: Mock the environment module so the test controls both credential
// sets without touching real .env values. Boot default = production.
vi.mock('../src/config/environment', () => ({
  env: {
    NODE_ENV: 'test',
    PRIORITY_ENV: 'production',
    PRIORITY_PROD_BASE_URL: 'https://prod.example.com/odata/',
    PRIORITY_PROD_USERNAME: 'prod-user',
    PRIORITY_PROD_PASSWORD: 'prod-pass',
    PRIORITY_UAT_BASE_URL: 'https://uat.example.com/odata/',
    PRIORITY_UAT_USERNAME: 'uat-user',
    PRIORITY_UAT_PASSWORD: 'uat-pass',
  },
}));

import { getPriorityConfig } from '../src/config/priority';
import { runWithPriorityEnv } from '../src/config/priorityEnvContext';

describe('getPriorityConfig env override', () => {
  it('uses boot PRIORITY_ENV outside any scope', () => {
    const config = getPriorityConfig();
    expect(config.env).toBe('production');
    expect(config.username).toBe('prod-user');
    expect(config.baseUrl).toBe('https://prod.example.com/odata/');
  });

  it('uses the request-scoped env inside runWithPriorityEnv', () => {
    const config = runWithPriorityEnv('uat', () => getPriorityConfig());
    expect(config.env).toBe('uat');
    expect(config.username).toBe('uat-user');
    expect(config.baseUrl).toBe('https://uat.example.com/odata/');
  });

  it('falls back to boot env after the scope ends', () => {
    runWithPriorityEnv('uat', () => getPriorityConfig());
    expect(getPriorityConfig().env).toBe('production');
  });
});
```

(The missing-credentials throw is pre-existing behavior; its message change in Step 3 is covered by the diff — do not add module-remock gymnastics for it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/priorityEnvOverride.test.ts`
Expected: FAIL — `config.env` is `'production'` in the override test (context not consulted yet)

- [ ] **Step 3: Implement the override in priority.ts**

Replace the body of `getPriorityConfig()` in `server/src/config/priority.ts`:

```ts
import { env } from './environment';
import { getRequestPriorityEnv } from './priorityEnvContext';

export interface PriorityConfig {
  baseUrl: string;
  username: string;
  password: string;
  env: 'uat' | 'production';
}

export function getPriorityConfig(): PriorityConfig {
  // WHY: Request-scoped override first (GRV UAT/Live toggle), boot env
  // otherwise. Routes set the override only for reports with
  // allowEnvOverride — write paths never set it, so they always use
  // the boot environment.
  const envName = getRequestPriorityEnv() ?? env.PRIORITY_ENV;
  const isProduction = envName === 'production';

  const baseUrl = isProduction ? env.PRIORITY_PROD_BASE_URL : env.PRIORITY_UAT_BASE_URL;
  const username = isProduction ? env.PRIORITY_PROD_USERNAME : env.PRIORITY_UAT_USERNAME;
  const password = isProduction ? env.PRIORITY_PROD_PASSWORD : env.PRIORITY_UAT_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      `Missing Priority ${envName} credentials. Check PRIORITY_${envName === 'production' ? 'PROD' : 'UAT'}_* env vars.`
    );
  }

  return { baseUrl, username, password, env: envName };
}
```

Update the file's intent block: PURPOSE gains "Request-scoped override via priorityEnvContext (GRV UAT/Live toggle).", USED BY unchanged.

Note: the error message previously interpolated `PRIORITY_${env.PRIORITY_ENV.toUpperCase()}_*` which produced `PRIORITY_PRODUCTION_*` — wrong var name. The replacement maps production→PROD (drive-by only because the line is already being edited for `envName`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/priorityEnvOverride.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/config/priority.ts server/tests/priorityEnvOverride.test.ts
git commit -m "feat(grv-env): getPriorityConfig consults request-scoped env override"
```

---

### Task 3: Production boot guard + logger field (TDD)

**Files:**
- Modify: `server/src/config/environment.ts`
- Modify: `server/src/services/logger.ts`
- Test: `server/tests/environmentGuard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/environmentGuard.test.ts
// PURPOSE: Production boots must declare PRIORITY_ENV explicitly —
//          the schema default is 'uat', so an unset Railway variable
//          would silently serve UAT as "Live" (Codex finding 2).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { assertExplicitPriorityEnvInProduction } from '../src/config/environment';

describe('assertExplicitPriorityEnvInProduction', () => {
  it('throws when NODE_ENV=production and PRIORITY_ENV is unset', () => {
    expect(() => assertExplicitPriorityEnvInProduction('production', undefined))
      .toThrow(/PRIORITY_ENV must be set explicitly in production/);
  });

  it('passes when NODE_ENV=production and PRIORITY_ENV is set', () => {
    expect(() => assertExplicitPriorityEnvInProduction('production', 'production')).not.toThrow();
    expect(() => assertExplicitPriorityEnvInProduction('production', 'uat')).not.toThrow();
  });

  it('passes in development/test regardless', () => {
    expect(() => assertExplicitPriorityEnvInProduction('development', undefined)).not.toThrow();
    expect(() => assertExplicitPriorityEnvInProduction('test', undefined)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/environmentGuard.test.ts`
Expected: FAIL — `assertExplicitPriorityEnvInProduction` is not exported

- [ ] **Step 3: Implement the guard**

In `server/src/config/environment.ts`, after `export const env = EnvSchema.parse(process.env);` append:

```ts
// WHY: The schema default above is 'uat' (right for local dev). In a
// production deploy an unset PRIORITY_ENV would therefore silently serve
// UAT data as "Live" and point BBD writes at UAT — with valid credentials,
// so nothing would error (Codex finding 2, env-toggle spec §8). Fail the
// boot instead; Railway's healthcheck keeps the previous deploy serving.
// Exported as a pure function so tests cover the matrix without module
// reload games (dotenv would repopulate process.env from ../.env).
export function assertExplicitPriorityEnvInProduction(
  nodeEnv: string,
  rawPriorityEnv: string | undefined,
): void {
  if (nodeEnv === 'production' && !rawPriorityEnv) {
    throw new Error(
      'PRIORITY_ENV must be set explicitly in production (uat | production). ' +
      'Refusing to boot with the implicit uat default.'
    );
  }
}

assertExplicitPriorityEnvInProduction(env.NODE_ENV, process.env.PRIORITY_ENV);
```

Update the intent block EXPORTS: `env, assertExplicitPriorityEnvInProduction`.

- [ ] **Step 4: Add the logger field**

In `server/src/services/logger.ts`, extend the `logApiCall` entry type with one line after `odataFilter?: string;`:

```ts
  // WHY: Which Priority environment served this request (GRV UAT/Live
  // toggle). Absent for routes that never resolve an environment.
  environment?: string;
```

- [ ] **Step 5: Run tests + server type-check**

Run: `cd server && npx vitest run tests/environmentGuard.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests), tsc clean

- [ ] **Step 6: Commit**

```bash
git add server/src/config/environment.ts server/src/services/logger.ts server/tests/environmentGuard.test.ts
git commit -m "feat(grv-env): production boot requires explicit PRIORITY_ENV; env log field"
```

---

### Task 4: Report opt-in flag + abortable enrichRows (TDD)

**Files:**
- Modify: `server/src/config/reportRegistry.ts` (ReportConfig interface)
- Modify: `server/src/reports/grvLog.ts`
- Test: `server/tests/grvLogReport.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `server/tests/grvLogReport.test.ts` (it already imports the registry and grvLog; add `vi` + priorityClient mock at the top if not present — check the file first; if it has no `vi.mock`, add):

```ts
import { vi } from 'vitest'; // merge into the existing vitest import line

// WHY: enrichRows calls querySubform per row — mock so the abort test
// counts calls hermetically. Existing buildQuery tests don't touch it.
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn().mockResolvedValue({ TEXT: '<p>x</p>' }),
}));
import { querySubform } from '../src/services/priorityClient';
```

New tests:

```ts
describe('grv-log env override opt-in', () => {
  it('sets allowEnvOverride: true (only report that honors the toggle)', () => {
    expect(reportRegistry.get('grv-log')!.allowEnvOverride).toBe(true);
  });
});

describe('grv-log enrichRows abort', () => {
  it('stops issuing sub-form batches once the signal aborts', async () => {
    const report = reportRegistry.get('grv-log')!;
    const rows = Array.from({ length: 20 }, (_, i) => ({
      DOCNO: `D${i}`, TYPE: 'P',
    })) as Record<string, unknown>[];

    const controller = new AbortController();
    (querySubform as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      controller.abort(); // fires during batch 1
      return { TEXT: '<p>x</p>' };
    });
    (querySubform as ReturnType<typeof vi.fn>).mockClear();

    const result = await report.enrichRows!(rows, controller.signal);

    // Batch 1 (10 parallel calls) was already launched; batch 2 must not start.
    expect((querySubform as ReturnType<typeof vi.fn>).mock.calls.length).toBe(10);
    expect(result).toHaveLength(20); // partially-enriched rows still returned
  });

  it('runs all batches when no signal is given', async () => {
    const report = reportRegistry.get('grv-log')!;
    const rows = Array.from({ length: 20 }, (_, i) => ({
      DOCNO: `D${i}`, TYPE: 'P',
    })) as Record<string, unknown>[];
    (querySubform as ReturnType<typeof vi.fn>).mockResolvedValue({ TEXT: '<p>x</p>' });
    (querySubform as ReturnType<typeof vi.fn>).mockClear();

    await report.enrichRows!(rows);
    expect((querySubform as ReturnType<typeof vi.fn>).mock.calls.length).toBe(20);
  });
});
```

If the existing file's other tests break because of the new priorityClient mock, they were calling the real module — they don't (buildQuery tests are pure); if `grvTransformRow.test.ts` style tests live here, they are also pure. Verify by running the whole file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/grvLogReport.test.ts`
Expected: FAIL — `allowEnvOverride` undefined; enrichRows ignores the second argument (20 calls in the abort test) and TypeScript errors on `enrichRows!(rows, controller.signal)` (interface has one parameter)

- [ ] **Step 3: Extend the ReportConfig interface**

In `server/src/config/reportRegistry.ts`, replace the `enrichRows` member and add `allowEnvOverride` at the end of the interface (before the closing brace, after `disableCache?: boolean;`):

```ts
  // WHY: Priority's $expand truncates responses for some entities (DOCUMENTS_P).
  // Reports that need sub-form data use this to fetch it in a second step.
  // The optional signal lets query.ts stop enrichment between batches when
  // the client disconnected (env toggle switch, unmount) — implementations
  // that ignore it still type-check.
  enrichRows?: (
    rows: Record<string, unknown>[],
    signal?: AbortSignal,
  ) => Promise<Record<string, unknown>[]>;
```

```ts
  // WHY: When true, query/filters/export honor the request's `environment`
  // field (UAT/Live toggle) for THIS report only. Everything else ignores
  // the field, and write routes never read it — so only grv-log reads can
  // be pointed at UAT. Single opt-in point, greppable.
  allowEnvOverride?: boolean;
```

- [ ] **Step 4: Update grvLog.ts**

(a) `enrichRows` — new signature + abort check at the top of the loop:

```ts
async function enrichRows(
  rows: Record<string, unknown>[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    // WHY: Client gone (env toggle switch, unmount, reload) — stop burning
    // the shared 95/min Priority budget. Partially-enriched rows are safe:
    // query.ts discards aborted responses and never caches them.
    if (signal?.aborted) return rows;

    const batch = rows.slice(i, i + BATCH_SIZE);
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));

    const results = await Promise.all(
      batch.map((row) =>
        querySubform(
          'DOCUMENTS_P',
          { DOCNO: row.DOCNO as string, TYPE: row.TYPE as string },
          'DOCUMENTSTEXT_SUBFORM',
        ),
      ),
    );
    for (let j = 0; j < batch.length; j++) {
      batch[j].DOCUMENTSTEXT_SUBFORM = results[j];
    }
  }

  return rows;
}
```

(Keep the existing WHY comment block above the function unchanged.)

(b) In the `reportRegistry.set('grv-log', {...})` call, after `disableCache: true,` add:

```ts
  // WHY: Only report with the UAT/Live toggle — some GRV data exists only
  // in Priority UAT and cannot be migrated (Victor, 2026-08-03).
  allowEnvOverride: true,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/grvLogReport.test.ts && npx tsc --noEmit`
Expected: PASS (all, including pre-existing buildQuery tests), tsc clean

- [ ] **Step 6: Commit**

```bash
git add server/src/config/reportRegistry.ts server/src/reports/grvLog.ts server/tests/grvLogReport.test.ts
git commit -m "feat(grv-env): allowEnvOverride flag + abortable grv-log enrichRows"
```

---

### Task 5: Request schemas + shared request/response types (TDD)

**Files:**
- Modify: `server/src/routes/querySchemas.ts`, `server/src/routes/exportSchemas.ts`
- Modify: `shared/types/filters.ts` (QueryRequest), `shared/types/api.ts` (ResponseMeta)
- Test: `server/tests/querySchemas.test.ts` (extend)

- [ ] **Step 1: Write the failing tests** (append to `server/tests/querySchemas.test.ts`; match its existing import style)

```ts
describe('QueryRequestSchema environment field', () => {
  const base = {
    filterGroup: { id: 'r', conjunction: 'and', conditions: [], groups: [] },
  };

  it('accepts production and uat', () => {
    expect(QueryRequestSchema.parse({ ...base, environment: 'production' }).environment).toBe('production');
    expect(QueryRequestSchema.parse({ ...base, environment: 'uat' }).environment).toBe('uat');
  });

  it('is optional (absent = no override)', () => {
    expect(QueryRequestSchema.parse(base).environment).toBeUndefined();
  });

  it('rejects other values', () => {
    expect(() => QueryRequestSchema.parse({ ...base, environment: 'staging' })).toThrow();
    expect(() => QueryRequestSchema.parse({ ...base, environment: '' })).toThrow();
  });
});
```

(If `ExportRequestSchema` has tests in this file or its own file, mirror the three assertions for it; otherwise the export field is covered by Task 8's route test.)

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/querySchemas.test.ts`
Expected: FAIL — unknown key stripped / undefined, `'staging'` not rejected

- [ ] **Step 3: Implement**

`querySchemas.ts` — add to `QueryRequestSchema`:

```ts
export const QueryRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(1000).default(50),
  // WHY: GRV UAT/Live toggle. Optional — absent means no override (boot
  // env). Fixed enum: never interpolated into URLs, no injection surface.
  // Only honored when the report sets allowEnvOverride (grv-log).
  environment: z.enum(['production', 'uat']).optional(),
});
```

`exportSchemas.ts` — same field appended to `ExportRequestSchema`:

```ts
export const ExportRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  // WHY: Optional list of visible column keys from the UI. When present,
  // the export only includes these columns in the specified order.
  // Only applies to fallback Excel mode (not template mode).
  visibleColumnKeys: z.array(z.string()).min(1).optional(),
  // WHY: GRV UAT/Live toggle — same contract as QueryRequestSchema.
  environment: z.enum(['production', 'uat']).optional(),
});
```

`shared/types/filters.ts` — extend `QueryRequest`:

```ts
export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
  // WHY: GRV UAT/Live toggle — see PriorityEnvironment below.
  environment?: PriorityEnvironment;
}
```

(Order note: `PriorityEnvironment` is declared after `QueryRequest` in this file from Task 1 — type-only forward references are fine in TS; keep as-is.)

`shared/types/api.ts` — import + extend `ResponseMeta`:

```ts
import type { PriorityEnvironment } from './filters';
```

and inside `ResponseMeta`, after `source`:

```ts
  // WHY: Which Priority environment served this response (GRV UAT/Live
  // toggle). Lets probes and the UI verify provenance instead of
  // inferring it from data shape. Absent on routes that don't resolve it.
  priorityEnv?: PriorityEnvironment;
```

Update both files' intent-block EXPORTS lines accordingly.

- [ ] **Step 4: Run tests + both type-checks**

Run: `cd server && npx vitest run tests/querySchemas.test.ts && npx tsc --noEmit && cd ../client && npx tsc -b --noEmit`
Expected: PASS, both tsc clean

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/querySchemas.ts server/src/routes/exportSchemas.ts shared/types/filters.ts shared/types/api.ts server/tests/querySchemas.test.ts
git commit -m "feat(grv-env): environment field in request schemas + meta.priorityEnv type"
```

---

### Task 6: Environment-scoped cache keys (TDD, behavior-neutral)

Signature changes land here with all call sites passing the boot env (`env.PRIORITY_ENV`), so every commit compiles and behavior is unchanged; Tasks 7–8 switch call sites to the per-request resolved env.

**Files:**
- Modify: `server/src/services/cache.ts`
- Modify: `server/src/routes/query.ts` (call site only), `server/src/routes/export.ts` (call site only)
- Test: `server/tests/exportCacheKey.test.ts` (update), `server/tests/queryCacheKey.test.ts` (new)

- [ ] **Step 1: Write/adjust the failing tests**

New `server/tests/queryCacheKey.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryCacheKey.test.ts
// PURPOSE: Query cache keys must be environment-scoped so UAT and
//          Live responses can never cross-contaminate (spec §5).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildQueryCacheKey } from '../src/services/cache';
import type { QueryRequest } from '@shared/types';

const body: QueryRequest = {
  filterGroup: { id: 'r', conjunction: 'and', conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('buildQueryCacheKey environment scoping', () => {
  it('same request, different env → different keys', () => {
    const live = buildQueryCacheKey('grv-log', body, 'production');
    const uat = buildQueryCacheKey('grv-log', body, 'uat');
    expect(live).not.toBe(uat);
    expect(live).toContain('envproduction');
    expect(uat).toContain('envuat');
  });
});
```

In `server/tests/exportCacheKey.test.ts`: update every `buildExportCacheKey(...)` call to pass a fifth argument (`'production'`), and add:

```ts
  it('same request, different env → different keys', () => {
    const live = buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'", 'production');
    const uat = buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'", 'uat');
    expect(live).not.toBe(uat);
  });
```

(Use the file's existing `group` fixture variable name — adjust to whatever it declares.)

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/queryCacheKey.test.ts tests/exportCacheKey.test.ts`
Expected: FAIL — arity/TS errors and missing `env` segment

- [ ] **Step 3: Implement in cache.ts**

```ts
import type { QueryRequest, FilterGroup, PriorityEnvironment } from '@shared/types';
```

```ts
// WHY: resolvedEnv (requested ?? boot PRIORITY_ENV) in the key material —
// UAT and Live cache entries can never collide (spec §5). Uses the
// RESOLVED env, not the raw request field, so local dev (boot uat) keys
// truthfully. Old un-scoped keys age out via TTL (same self-versioning
// pattern as the V8491 base-filter change).
export function buildQueryCacheKey(
  reportId: string,
  body: QueryRequest,
  resolvedEnv: PriorityEnvironment,
): string {
  const filterHash = JSON.stringify(stripIds(body.filterGroup));
  return `query:${reportId}:env${resolvedEnv}:p${body.page}:s${body.pageSize}:${filterHash}`;
}
```

`buildExportCacheKey` gains the trailing param and `env` segment:

```ts
export function buildExportCacheKey(
  reportId: string,
  filterGroup: FilterGroup,
  page: number,
  baseFilter: string | undefined,
  resolvedEnv: PriorityEnvironment,
): string {
  const filterHash = JSON.stringify(stripIds(filterGroup));
  return `export:${reportId}:env${resolvedEnv}:p${page}:s5000:bf${baseFilter ?? ''}:${filterHash}`;
}
```

(Keep the existing WHY comment above it; append one line: "envN segment: see buildQueryCacheKey.")

- [ ] **Step 4: Update call sites (behavior-neutral)**

`server/src/routes/query.ts` — add `import { env } from '../config/environment';` and change line 48:

```ts
    const cacheKey = buildQueryCacheKey(reportId, body, env.PRIORITY_ENV);
```

`server/src/routes/export.ts` — add the same `env` import and change line 72:

```ts
        const cacheKey = buildExportCacheKey(reportId, body.filterGroup, page, baseParams.$filter, env.PRIORITY_ENV);
```

Leave `buildCacheKey` untouched for now — it dies with the legacy route in Task 9.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/queryCacheKey.test.ts tests/exportCacheKey.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean

- [ ] **Step 6: Commit**

```bash
git add server/src/services/cache.ts server/src/routes/query.ts server/src/routes/export.ts server/tests/queryCacheKey.test.ts server/tests/exportCacheKey.test.ts
git commit -m "feat(grv-env): environment-scoped query/export cache keys (boot env for now)"
```

---

### Task 7: query.ts — resolve, wrap, abort, provenance (TDD)

**Files:**
- Modify: `server/src/routes/query.ts`
- Test: `server/tests/queryEnvRoute.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryEnvRoute.test.ts
// PURPOSE: POST /:reportId/query honors `environment` ONLY for reports
//          with allowEnvOverride; sets meta.priorityEnv; passes an
//          AbortSignal to enrichRows; rejects invalid values.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { getRequestPriorityEnv } from '../src/config/priorityEnvContext';

vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn(),
}));
import { queryPriority } from '../src/services/priorityClient';
import { createQueryRouter } from '../src/routes/query';

function makeStubCache(): CacheProvider {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
}

function registerFakeReport(id: string, opts: Partial<ReportConfig> = {}): void {
  reportRegistry.set(id, {
    id,
    name: `Fake ${id}`,
    entity: 'FAKE',
    columns: [{ key: 'docNo', label: 'GRV #', type: 'string' }],
    filterColumns: [],
    buildQuery: () => ({ $select: 'DOCNO,TYPE', $top: 50, $skip: 0 }),
    transformRow: (raw) => ({ docNo: raw.DOCNO }),
    ...opts,
  });
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createQueryRouter(makeStubCache()));
  return app;
}

const emptyBody = {
  filterGroup: { id: 'root', conjunction: 'and' as const, conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('POST /:reportId/query — environment override', () => {
  afterEach(() => {
    reportRegistry.delete('fake-env');
    reportRegistry.delete('fake-plain');
    vi.clearAllMocks();
  });

  it('runs Priority calls in the UAT scope when the report opts in', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    let seenEnv: string | undefined = 'not-called';
    (queryPriority as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      seenEnv = getRequestPriorityEnv();
      return { value: [{ DOCNO: 'X' }] };
    });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send({ ...emptyBody, environment: 'uat' });

    expect(res.status).toBe(200);
    expect(seenEnv).toBe('uat');
    expect(res.body.meta.priorityEnv).toBe('uat');
  });

  it('ignores the field for reports without allowEnvOverride', async () => {
    registerFakeReport('fake-plain');
    let seenEnv: string | undefined = 'not-called';
    (queryPriority as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      seenEnv = getRequestPriorityEnv();
      return { value: [{ DOCNO: 'X' }] };
    });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-plain/query')
      .send({ ...emptyBody, environment: 'uat' });

    expect(res.status).toBe(200);
    expect(seenEnv).toBeUndefined(); // no scope → boot env
    // WHY: meta reports the BOOT env (server/.env → uat locally), never
    // the ignored request value. Import env at the top of the file:
    // import { env } from '../src/config/environment';
    expect(res.body.meta.priorityEnv).toBe(env.PRIORITY_ENV);
  });

  it('rejects invalid environment values with 400', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send({ ...emptyBody, environment: 'staging' });
    expect(res.status).toBe(400);
  });

  // NOTE on coverage: the mid-request client-disconnect path (res 'close'
  // → abort → skip cache/send) is not integration-tested here — supertest
  // can't abort a socket deterministically. It is covered by (a) the
  // grvLogReport abort test (batches stop), (b) this signal-passing test,
  // and (c) the query_aborted log event verified in Railway logs post-
  // deploy. Do not add a flaky socket-destruction test.
  it('passes an AbortSignal to enrichRows', async () => {
    let receivedSignal: unknown = 'nothing';
    registerFakeReport('fake-env', {
      allowEnvOverride: true,
      enrichRows: async (rows, signal) => {
        receivedSignal = signal;
        return rows;
      },
    });
    (queryPriority as ReturnType<typeof vi.fn>).mockResolvedValue({ value: [{ DOCNO: 'X' }] });

    const res = await request(makeApp())
      .post('/api/v1/reports/fake-env/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/queryEnvRoute.test.ts`
Expected: FAIL — `seenEnv` undefined in the opt-in test, `meta.priorityEnv` undefined, no signal

- [ ] **Step 3: Implement in query.ts**

(a) Imports — extend existing lines:

```ts
import { env } from '../config/environment';               // already added in Task 6
import { runWithPriorityEnv } from '../config/priorityEnvContext';
```

(b) After `body = QueryRequestSchema.parse(req.body)` succeeds (line ~46), insert:

```ts
    // WHY: Honor the UAT/Live toggle only for opted-in reports (grv-log).
    // resolvedEnv (requested ?? boot) keys caches and stamps provenance.
    const requestedEnv = report.allowEnvOverride ? body.environment : undefined;
    const resolvedEnv = requestedEnv ?? env.PRIORITY_ENV;

    // WHY: Stop enrichment mid-run when the client is gone (env toggle
    // switch, unmount, reload) — each grv-log load costs ~51 Priority
    // calls against the shared 95/min budget. res 'close' with an
    // unfinished response = client disconnected.
    const abortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abortController.abort();
    });
```

(c) Cache key line becomes:

```ts
    const cacheKey = buildQueryCacheKey(reportId, body, resolvedEnv);
```

(d) Cache-hit branch: stamp provenance and log env — inside `if (cached) {`:

```ts
      cached.meta.priorityEnv = resolvedEnv;
```

and add `environment: resolvedEnv,` to that branch's `logApiCall({...})`.

(e) Wrap point 1 — the Priority fetch:

```ts
      priorityData = await runWithPriorityEnv(requestedEnv, () => queryPriority(report.entity, {
        $select: baseParams.$select,
        $expand: baseParams.$expand,
        $orderby: baseParams.$orderby,
        $filter: combinedFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      }));
```

(f) Wrap point 2 — enrichment, now with the signal:

```ts
        rawRows = await runWithPriorityEnv(requestedEnv, () =>
          report.enrichRows!(rawRows, abortController.signal));
```

(g) Immediately after the enrichment `try/catch` block (before `explodeRows`), insert the aborted gate:

```ts
    // WHY: Client disconnected mid-enrichment. The response is
    // undeliverable — skip transform/cache/send so partial rows are
    // never cached and no more work runs. 499 = client closed request
    // (log-only status, nothing is sent).
    if (abortController.signal.aborted) {
      logApiCall({
        level: 'info', event: 'query_aborted', reportId,
        durationMs: Date.now() - startTime, cacheHit: false,
        statusCode: 499, environment: resolvedEnv,
      });
      res.end();
      return;
    }
```

(h) Response meta gains provenance — in the `response: ApiResponse` literal, after `source: 'priority-odata',`:

```ts
        priorityEnv: resolvedEnv,
```

(i) The final (cache-miss) `logApiCall({...})` gains `environment: resolvedEnv,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/queryEnvRoute.test.ts tests/queryDisableCache.test.ts && npx tsc --noEmit`
Expected: PASS (new + pre-existing disableCache suite), tsc clean

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/query.ts server/tests/queryEnvRoute.test.ts
git commit -m "feat(grv-env): query route honors env override with abort + provenance"
```

---

### Task 8: filters.ts + export.ts wiring (TDD)

**Files:**
- Modify: `server/src/routes/filters.ts`, `server/src/routes/export.ts`
- Test: `server/tests/filtersEnvRoute.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/filtersEnvRoute.test.ts
// PURPOSE: GET /:reportId/filters validates ?environment, honors it
//          only for opted-in reports, and env-scopes its cache key.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { getRequestPriorityEnv } from '../src/config/priorityEnvContext';

vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn(),
}));
import { queryPriority } from '../src/services/priorityClient';
import { createFiltersRouter } from '../src/routes/filters';

function makeStubCache() {
  const stub = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  };
  const _typecheck: CacheProvider = stub;
  void _typecheck;
  return stub;
}

function registerFakeReport(id: string, opts: Partial<ReportConfig> = {}): void {
  reportRegistry.set(id, {
    id, name: `Fake ${id}`, entity: 'FAKE',
    columns: [], filterColumns: [],
    buildQuery: () => ({}),
    transformRow: (raw) => raw,
    ...opts,
  });
}

describe('GET /:reportId/filters — environment override', () => {
  afterEach(() => {
    reportRegistry.delete('fake-env');
    vi.clearAllMocks();
  });

  function makeApp(cache: CacheProvider) {
    const app = express();
    app.use('/api/v1/reports', createFiltersRouter(cache));
    return app;
  }

  it('rejects invalid environment values with 400', async () => {
    registerFakeReport('fake-env', { allowEnvOverride: true });
    const res = await request(makeApp(makeStubCache()))
      .get('/api/v1/reports/fake-env/filters?environment=staging');
    expect(res.status).toBe(400);
  });

  it('runs fetchFilters in the UAT scope and env-scopes the cache key', async () => {
    let seenEnv: string | undefined = 'not-called';
    registerFakeReport('fake-env', {
      allowEnvOverride: true,
      fetchFilters: async () => {
        seenEnv = getRequestPriorityEnv();
        return { vendors: [] };
      },
    });
    const cache = makeStubCache();
    const res = await request(makeApp(cache))
      .get('/api/v1/reports/fake-env/filters?environment=uat');

    expect(res.status).toBe(200);
    expect(seenEnv).toBe('uat');
    // Both the read and the write must use the env-scoped key.
    expect(cache.get.mock.calls[0][0]).toBe('filters:fake-env:uat');
    expect(cache.set.mock.calls[0][0]).toBe('filters:fake-env:uat');
  });

  it('ignores the parameter without allowEnvOverride (boot-env key)', async () => {
    let seenEnv: string | undefined = 'not-called';
    registerFakeReport('fake-env', {
      fetchFilters: async () => {
        seenEnv = getRequestPriorityEnv();
        return { vendors: [] };
      },
    });
    const cache = makeStubCache();
    const res = await request(makeApp(cache))
      .get('/api/v1/reports/fake-env/filters?environment=uat');

    expect(res.status).toBe(200);
    // WHY: seenEnv undefined is the real proof the override was ignored
    // (no ALS scope). The key assertion uses the boot env because locally
    // server/.env boots as 'uat' — same VALUE as the ignored parameter,
    // so only the scope check distinguishes them.
    expect(seenEnv).toBeUndefined();
    expect(cache.get.mock.calls[0][0]).toBe(`filters:fake-env:${env.PRIORITY_ENV}`);
  });
});
```

(Add `import { env } from '../src/config/environment';` with the other imports.)

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/filtersEnvRoute.test.ts`
Expected: FAIL — 400 not returned, key is `filters:fake-env` (no env segment), `seenEnv` undefined in test 2

- [ ] **Step 3: Implement filters.ts**

Add imports:

```ts
import { z } from 'zod';
import { env } from '../config/environment';
import { runWithPriorityEnv } from '../config/priorityEnvContext';
```

After the `report` 404 guard, insert:

```ts
    // WHY: GET route — the env override arrives as a query parameter.
    // Same contract as the query/export body field (spec §4).
    const envParse = z.enum(['production', 'uat']).optional()
      .safeParse(req.query.environment);
    if (!envParse.success) {
      res.status(400).json({ error: 'Invalid environment parameter' });
      return;
    }
    const requestedEnv = report.allowEnvOverride ? envParse.data : undefined;
    const resolvedEnv = requestedEnv ?? env.PRIORITY_ENV;
```

Change the cache key line:

```ts
    const cacheKey = `filters:${reportId}:${resolvedEnv}`;
```

Wrap both fetch branches:

```ts
        filters = await runWithPriorityEnv(requestedEnv, () => report.fetchFilters!());
```

```ts
        vendorData = await runWithPriorityEnv(requestedEnv, () => queryPriority(report.entity, {
          $select: 'SUPNAME,CDES',
          $orderby: 'CDES',
          $top: 1000,
        }));
```

- [ ] **Step 4: Implement export.ts**

After `body = ExportRequestSchema.parse(req.body)` succeeds, insert:

```ts
    // WHY: Same override contract as query.ts (spec §2–§3). The export
    // must follow the toggle so the Excel matches the table on screen.
    const requestedEnv = report.allowEnvOverride ? body.environment : undefined;
    const resolvedEnv = requestedEnv ?? env.PRIORITY_ENV;
```

Cache key call (Task 6 placeholder) becomes:

```ts
        const cacheKey = buildExportCacheKey(reportId, body.filterGroup, page, baseParams.$filter, resolvedEnv);
```

Wrap point 1 — the paginated fetch:

```ts
          const response = await runWithPriorityEnv(requestedEnv, () => queryPriority(report.entity, {
            $select: baseParams.$select,
            $expand: baseParams.$expand,
            $orderby: baseParams.$orderby,
            $filter: combinedFilter,
            $top: PAGE_SIZE,
            $skip: page * PAGE_SIZE,
          }));
```

Wrap point 2 — enrichment:

```ts
        enrichedRows = await runWithPriorityEnv(requestedEnv, () => report.enrichRows!(allRawRows));
```

Final `logApiCall({...})` gains `environment: resolvedEnv,`.

Add the `runWithPriorityEnv` import (the `env` import exists from Task 6).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/filtersEnvRoute.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/filters.ts server/src/routes/export.ts server/tests/filtersEnvRoute.test.ts
git commit -m "feat(grv-env): filters + export honor env override with scoped cache keys"
```

---

### Task 9: Retire the legacy GET route (TDD)

**Files:**
- Modify: `server/src/routes/reports.ts`
- Modify: `server/src/services/cache.ts` (remove `buildCacheKey`)
- Test: `server/tests/legacyReportRoute.test.ts` (new)

- [ ] **Step 1: Write the failing tests**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/legacyReportRoute.test.ts
// PURPOSE: The legacy GET /:reportId data route is retired (env-toggle
//          spec §7): explicit 404 JSON (the production SPA catch-all
//          would otherwise serve index.html), /list still works, and
//          reports.ts keeps registering customer-returns.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createReportsRouter } from '../src/routes/reports';
import { getReport } from '../src/config/reportRegistry';

function makeApp() {
  const app = express();
  app.use('/api/v1/reports', createReportsRouter());
  return app;
}

describe('legacy GET /:reportId retirement', () => {
  it('returns 404 JSON for the retired data route', async () => {
    const res = await request(makeApp()).get('/api/v1/reports/grv-log');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/retired/i);
  });

  it('keeps GET /list working', async () => {
    const res = await request(makeApp()).get('/api/v1/reports/list');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.reports)).toBe(true);
  });

  it('still registers customer-returns via side-effect import', () => {
    expect(getReport('customer-returns')).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && npx vitest run tests/legacyReportRoute.test.ts`
Expected: FAIL — GET returns 200 (route still live) and `createReportsRouter()` needs a cache argument (TS error)

- [ ] **Step 3: Rewrite reports.ts**

Full new content (the file shrinks; `createReportsRouter` loses its now-unused `cache` parameter):

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/reports.ts
// PURPOSE: Report metadata endpoints (/list) + explicit 404 stub for
//          the retired legacy data route. Data queries live in
//          routes/query.ts (POST /:reportId/query).
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createReportsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { reportRegistry } from '../config/reportRegistry';

// WHY: Import report definitions so they self-register into reportRegistry.
// reports.ts is the ONLY module importing customerReturns — removing these
// imports would silently drop that report from every route.
import '../reports/grvLog';
import '../reports/bbdReport';
import '../reports/customerReturns';

export function createReportsRouter(): Router {
  const router = Router();

  // GET /list — returns array of available report IDs + names
  router.get('/list', (_req, res) => {
    const reports = Array.from(reportRegistry.entries()).map(([id, config]) => ({
      id,
      name: config.name,
    }));
    res.json({ reports });
  });

  // WHY: Legacy data route retired 2026-08-03 (env-toggle spec §7) — it
  // bypassed the environment override, env-scoped caching, and
  // disableCache. POST /:reportId/query replaced it in Spec 02; zero
  // callers remained. Explicit 404 because in production the SPA
  // catch-all would otherwise answer old API URLs with index.html.
  router.get('/:reportId', (req, res) => {
    res.status(404).json({
      error: `Route retired — use POST /api/v1/reports/${req.params.reportId}/query`,
    });
  });

  return router;
}
```

- [ ] **Step 4: Update the two call/definition sites the rewrite orphans**

(a) `server/src/index.ts` line 40:

```ts
app.use('/api/v1/reports', createReportsRouter());
```

(b) `server/src/services/cache.ts`: delete the `buildCacheKey` function (lines 22–28) and remove `buildCacheKey` from the intent-block EXPORTS line. (Task 6's key builders remain.)

(c) Search for stragglers:

```bash
cd server && grep -rn "buildCacheKey" src tests
```

Expected: no matches. If a test file references it, delete that test case — it tested the retired route's key.

- [ ] **Step 5: Run tests + type-check**

Run: `cd server && npx vitest run tests/legacyReportRoute.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests), tsc clean (`noUnusedLocals` catches any leftover import in reports.ts/index.ts — fix by removing exactly the unused names)

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/reports.ts server/src/index.ts server/src/services/cache.ts server/tests/legacyReportRoute.test.ts
git commit -m "feat(grv-env): retire legacy GET report route; drop env-blind buildCacheKey"
```

---

### Task 10: Client — hooks, config, EnvToggle, widget wiring (TDD)

**Files:**
- Modify: `client/src/hooks/useReportQuery.ts`, `client/src/hooks/useFiltersQuery.ts`, `client/src/hooks/useExport.ts`
- Modify: `client/src/config/pages.ts`
- Create: `client/src/components/widgets/EnvToggle.tsx`
- Modify: `client/src/components/TableToolbar.tsx`, `client/src/components/widgets/ReportTableWidget.tsx`
- Test: `client/src/config/pages.test.ts` (extend), `client/src/hooks/useReportQuery.test.ts` (extend), `client/src/components/widgets/EnvToggle.test.tsx` (new)

- [ ] **Step 1: Write the failing tests**

`client/src/config/pages.test.ts` — append (match the file's existing style):

```ts
it('grv-log widget enables the env toggle', () => {
  const grv = pages.flatMap((p) => p.widgets).find((w) => w.reportId === 'grv-log');
  expect(grv?.envToggle).toBe(true);
});
```

`client/src/hooks/useReportQuery.test.ts` — append inside the existing `describe('useReportQuery', ...)` block (the file already provides `makeWrapper`, `emptyGroup`, and the `mockFetch` stub via `beforeEach`):

```ts
  it('sends environment in the POST body and passes an AbortSignal', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50, environment: 'uat' as const };

    const hook = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).environment).toBe('uat');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits environment from the body when not provided', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const hook = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    // WHY: JSON.stringify drops undefined — non-toggle widgets send
    // byte-identical bodies to the pre-feature shape.
    expect('environment' in JSON.parse(init.body as string)).toBe(false);
  });
```

New `client/src/components/widgets/EnvToggle.test.tsx`:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/EnvToggle.test.tsx
// PURPOSE: EnvToggle renders Live/UAT segments, fires onChange with
//          the PriorityEnvironment value, and shows the UAT badge
//          only in UAT mode.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EnvToggle from './EnvToggle';

describe('EnvToggle', () => {
  it('renders both segments and marks the active one', () => {
    render(<EnvToggle value="production" onChange={() => {}} />);
    // WHY: getAttribute, not jest-dom's toHaveAttribute — keeps the test
    // independent of whether jest-dom matchers are registered.
    expect(screen.getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'UAT' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/test data/i)).toBeNull();
  });

  it('fires onChange with uat and shows the badge in UAT mode', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EnvToggle value="production" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'UAT' }));
    expect(onChange).toHaveBeenCalledWith('uat');

    rerender(<EnvToggle value="uat" onChange={onChange} />);
    expect(screen.getByText(/UAT — test data/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd client && npx vitest run src/config/pages.test.ts src/components/widgets/EnvToggle.test.tsx`
Expected: FAIL — `envToggle` undefined (Zod strips unknown keys is NOT the issue; the flag isn't set), EnvToggle module missing

- [ ] **Step 3: pages.ts config flag**

In `WidgetConfigSchema` after `clientSidePagination`:

```ts
  // WHY: Renders the Live/UAT segmented control in the widget toolbar
  // (GRV only). The server independently honors the override only for
  // reports with allowEnvOverride — this flag is just the UI switch.
  envToggle: z.boolean().optional(),
```

In the grv-log widget entry after `disableCache: true,`:

```ts
        envToggle: true,
```

- [ ] **Step 4: Hooks**

`useReportQuery.ts` — full replacement of the interfaces + hook body (imports unchanged plus `PriorityEnvironment`):

```ts
import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, PriorityEnvironment, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
  // WHY: GRV UAT/Live toggle. Part of params → part of the queryKey, so
  // switching environments automatically refetches.
  environment?: PriorityEnvironment;
}

// WHY: When disableCache:true, the hook flips TanStack to "always stale,
// always refetch on mount, no GC retention" so the user never sees stale
// data after re-mount or identical re-renders. Used by grv-log.
interface ReportQueryOptions {
  disableCache?: boolean;
}

export function useReportQuery(
  reportId: string,
  params: ReportQueryParams,
  options: ReportQueryOptions = {},
) {
  return useQuery<ApiResponse>({
    queryKey: ['report', reportId, params],
    // WHY: TanStack's signal aborts the HTTP request on queryKey change or
    // unmount; the server stops enrichment when the socket closes. Without
    // it, an abandoned Live load keeps burning ~50 Priority calls.
    queryFn: async ({ signal }) => {
      const body: QueryRequest = {
        filterGroup: params.filterGroup,
        page: params.page,
        pageSize: params.pageSize,
        environment: params.environment,
      };
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) throw new Error(`Report query failed: ${response.status}`);
      return response.json();
    },
    staleTime: options.disableCache ? 0 : 15 * 60 * 1000,
    gcTime: options.disableCache ? 0 : undefined,
    refetchOnMount: options.disableCache ? 'always' : true,
    refetchOnWindowFocus: false,
  });
}
```

(Preserve the existing WHY comments shown; they are already in the file.)

`useFiltersQuery.ts` — replace the hook:

```ts
import { useQuery } from '@tanstack/react-query';
import type { FiltersResponse, PriorityEnvironment } from '@shared/types';

export function useFiltersQuery(reportId: string, environment?: PriorityEnvironment) {
  return useQuery<FiltersResponse>({
    // WHY: env in the key — UAT vendor options must never render while
    // the toggle says Live (and vice versa).
    queryKey: ['filters', reportId, environment],
    queryFn: async ({ signal }) => {
      const url = environment
        ? `/api/v1/reports/${reportId}/filters?environment=${environment}`
        : `/api/v1/reports/${reportId}/filters`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Filters fetch failed: ${response.status}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

`useExport.ts` — signature + body + deps (three edits):

```ts
export function useExport(
  reportId: string,
  filterGroup: FilterGroup,
  visibleColumnKeys?: string[],
  environment?: PriorityEnvironment,
): UseExportReturn {
```

```ts
        body: JSON.stringify({ filterGroup, visibleColumnKeys, environment }),
```

```ts
  }, [reportId, filterGroup, visibleColumnKeys, environment]);
```

Add `import type { FilterGroup, PriorityEnvironment } from '@shared/types';` (extends the existing FilterGroup import line).

- [ ] **Step 5: EnvToggle component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/EnvToggle.tsx
// PURPOSE: Live/UAT segmented control for the GRV widget toolbar.
//          UAT mode is deliberately loud (amber pill + "test data"
//          badge) so nobody mistakes test data for live receiving
//          records inside the Airtable iframe.
// USED BY: TableToolbar.tsx (rendered when the widget sets envToggle)
// EXPORTS: EnvToggle (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import type { PriorityEnvironment } from '@shared/types';

interface EnvToggleProps {
  value: PriorityEnvironment;
  onChange: (env: PriorityEnvironment) => void;
}

const SEGMENTS: { env: PriorityEnvironment; label: string }[] = [
  { env: 'production', label: 'Live' },
  { env: 'uat', label: 'UAT' },
];

export default function EnvToggle({ value, onChange }: EnvToggleProps) {
  const isUat = value === 'uat';

  return (
    <div className="flex items-center gap-2">
      {/* WHY: amber-700 on amber-50 — passes the iframe/JPEG visibility rule
          (slate-300/400 washes out in the Airtable embed). */}
      {isUat && (
        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          UAT — test data
        </span>
      )}
      <div
        role="group"
        aria-label="Priority environment"
        className={`flex h-7 items-center rounded-full border p-0.5 text-[11px] font-medium ${
          isUat ? 'border-amber-400' : 'border-[var(--color-gold-subtle)]'
        }`}
      >
        {SEGMENTS.map(({ env, label }) => {
          const active = value === env;
          return (
            <button
              key={env}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(env)}
              className={`relative h-6 rounded-full px-2.5 transition-colors duration-150 ${
                active
                  ? 'text-white'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="env-toggle-pill"
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className={`absolute inset-0 -z-10 rounded-full ${
                    env === 'uat' ? 'bg-amber-600' : 'bg-[var(--color-gold-primary)]'
                  }`}
                />
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: TableToolbar props**

In `TableToolbarProps` add:

```ts
  // WHY: Present only for widgets with envToggle (GRV). Toolbar renders
  // the segmented control; state lives in ReportTableWidget.
  priorityEnv?: PriorityEnvironment;
  onEnvChange?: (env: PriorityEnvironment) => void;
```

Add imports: `import EnvToggle from './widgets/EnvToggle';` and `import type { PriorityEnvironment } from '@shared/types';`. Destructure `priorityEnv, onEnvChange` in the component parameters. Render immediately after `<div className="flex-1" />`:

```tsx
        {onEnvChange && priorityEnv && (
          <EnvToggle value={priorityEnv} onChange={onEnvChange} />
        )}
```

- [ ] **Step 7: ReportTableWidget wiring**

Add imports: `useCallback` is already imported; add `import type { PriorityEnvironment } from '@shared/types';`.

After the `widgetConfig` lookup (line ~56), add:

```tsx
  // WHY: Every mount starts on Live (plain state, no persistence) — a
  // food-safety user can never inherit UAT from a previous session.
  // activeEnv stays undefined for widgets without the toggle so their
  // requests and queryKeys are byte-identical to before this feature.
  const envToggleEnabled = !!widgetConfig?.envToggle;
  const [priorityEnv, setPriorityEnv] = useState<PriorityEnvironment>('production');
  const activeEnv = envToggleEnabled ? priorityEnv : undefined;
  const handleEnvChange = useCallback((next: PriorityEnvironment) => {
    setPriorityEnv(next);
    setPage(1); // WHY: page N of Live has no meaning in UAT's result set
  }, [setPage]);
```

Move the `useFiltersQuery` call and its adjacent `filterColumns` line together BELOW this block (they currently sit above `widgetConfig`; the reorder is required because `activeEnv` derives from `widgetConfig`; hooks order stays unconditional so the Rules of Hooks hold):

```tsx
  const filtersQuery = useFiltersQuery(reportId, activeEnv);
  const filterColumns = filtersQuery.data?.columns ?? [];
```

Thread into the report query:

```tsx
  const query = useReportQuery(
    reportId,
    { filterGroup: debouncedGroup, page: clientPaged ? 1 : page, pageSize: 50, environment: activeEnv },
    { disableCache: widgetConfig?.disableCache },
  );
```

Thread into export:

```tsx
  const { isExporting, toast, clearToast, triggerExport } = useExport(
    reportId, debouncedGroup, visibleColumnKeys, activeEnv,
  );
```

Thread into the toolbar:

```tsx
            <TableToolbar
              ...existing props unchanged...
              priorityEnv={activeEnv}
              onEnvChange={envToggleEnabled ? handleEnvChange : undefined}
            />
```

- [ ] **Step 8: Run client tests + type-check**

Run: `cd client && npx vitest run src/config/pages.test.ts src/components/widgets/EnvToggle.test.tsx src/hooks/useReportQuery.test.ts && npx tsc -b --noEmit`
Expected: PASS, tsc clean (`noUnusedLocals` — remove any leftover unused names)

- [ ] **Step 9: Visual verification (dev servers)**

Start both dev servers (`server/` and `client/` `npm run dev`), open the preview at `http://localhost:5173`, then on the Receiving Log page verify: toggle renders right-aligned in the toolbar; default Live; clicking UAT shows amber pill + "UAT — test data" badge, table refetches (LoadingToast), vendor dropdown refetches; clicking Live returns; other pages (BBD, Customer Returns) show no toggle. Local dev boot env is `uat`, so both segments hit UAT data locally — the UI behavior (state, refetch, badge) is what's being verified here, not data difference.

- [ ] **Step 10: Commit**

```bash
git add client/src/hooks/useReportQuery.ts client/src/hooks/useFiltersQuery.ts client/src/hooks/useExport.ts client/src/config/pages.ts client/src/config/pages.test.ts client/src/components/widgets/EnvToggle.tsx client/src/components/widgets/EnvToggle.test.tsx client/src/components/TableToolbar.tsx client/src/components/widgets/ReportTableWidget.tsx client/src/hooks/useReportQuery.test.ts
git commit -m "feat(grv-env): Live/UAT toggle UI — EnvToggle, hook env threading, abort signals"
```

---

### Task 11: Pre-deploy verification + HOLD

**Files:**
- Modify: `CLAUDE.md` (docker command line only)

- [ ] **Step 1: Warm iCloud-evicted files** (memory: `icloud-eviction-breaks-builds`)

```bash
cd server && find node_modules/@types -name '*.d.ts' -print0 | xargs -0 cat > /dev/null
cd ../client && find node_modules/@types -name '*.d.ts' -print0 | xargs -0 cat > /dev/null 2>/dev/null || true
```

- [ ] **Step 2: Full pre-deploy checklist**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
cd server && npm test
```

Expected: both tsc clean; full Vitest suite green (~345+ tests). Any cold-run failure: re-run the failing file individually before believing it.

- [ ] **Step 3: Update the CLAUDE.md docker command**

The boot guard breaks the documented local Docker test (image has no `.env`; `NODE_ENV=production` without `PRIORITY_ENV` now refuses to boot — intended). Update the line in CLAUDE.md:

Old:
```
**Local Docker test:** `docker build -t priority-dashboard . && docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 priority-dashboard`
```

New:
```
**Local Docker test:** `docker build -t priority-dashboard . && docker run --rm -p 3001:3001 -e NODE_ENV=production -e PORT=3001 -e PRIORITY_ENV=production priority-dashboard` (PRIORITY_ENV is mandatory in production since the env-toggle boot guard, 2026-08-03)
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: PRIORITY_ENV now mandatory in the local Docker test command"
```

- [ ] **Step 5: HOLD — confirm with Victor before pushing**

Railway UAT variables must exist before deploy: `PRIORITY_UAT_BASE_URL`, `PRIORITY_UAT_USERNAME`, `PRIORITY_UAT_PASSWORD` (Victor stated they are all in Railway — the post-deploy UAT probe is the proof; if it 502s with "Missing Priority uat credentials", set them in the Railway service and redeploy). **Do not `git push` until Victor approves.**

---

### Task 12: Deploy + post-deploy verification

- [ ] **Step 1: Push** (only after the Task 11 HOLD clears)

```bash
git push origin main
```

- [ ] **Step 2: Detect the new build** (poll every ~60s; the legacy-route probe is the discriminator — old build 200, new build 404)

```bash
curl -s -o /dev/null -w "%{http_code}" "https://priority-reports-production.up.railway.app/api/v1/reports/grv-log?pageSize=1"
```

Expected transition: `200` → `404` when the deploy is live.
(`pageSize=1` matters: on the OLD build this route really queries Priority — 1 row + 1 sub-form call ≈ 2 Priority calls per poll instead of ~51 at the default page size.)

- [ ] **Step 3: Post-deploy probes** (spec Verification §3)

Default query — expect `meta.priorityEnv:"production"`, ~37-row week baseline:

```bash
curl -s -X POST https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/query \
  -H 'Content-Type: application/json' \
  -d '{"filterGroup":{"id":"r","conjunction":"and","conditions":[{"id":"c1","field":"date","operator":"isInWeek","value":"2026-07-27","valueTo":"2026-08-02"},{"id":"c2","field":"status","operator":"notEquals","value":"Canceled"}],"groups":[]},"page":1,"pageSize":50}' \
  | head -c 400
```

UAT query — expect `meta.priorityEnv:"uat"` and HTTP 200 (proves Railway UAT creds work; row set will differ):

```bash
curl -s -X POST https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/query \
  -H 'Content-Type: application/json' \
  -d '{"filterGroup":{"id":"r","conjunction":"and","conditions":[],"groups":[]},"page":1,"pageSize":5,"environment":"uat"}' \
  | head -c 400
```

Filters both envs (vendor lists may differ; both 200):

```bash
curl -s "https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/filters?environment=uat" | head -c 300
curl -s "https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/filters" | head -c 300
```

Override ignored on bbd — expect `meta.priorityEnv:"production"` (bbd is one Priority call but slow — its $expand query has ~20-25s time-to-first-byte; be patient, don't retry):

```bash
curl -s -X POST https://priority-reports-production.up.railway.app/api/v1/reports/bbd/query \
  -H 'Content-Type: application/json' \
  -d '{"filterGroup":{"id":"r","conjunction":"and","conditions":[],"groups":[]},"page":1,"pageSize":1,"environment":"uat"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['meta'].get('priorityEnv'))"
```

Export UAT spot-check (file downloads, non-trivial size):

```bash
curl -s -X POST https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/export \
  -H 'Content-Type: application/json' \
  -d '{"filterGroup":{"id":"r","conjunction":"and","conditions":[],"groups":[]},"environment":"uat"}' \
  -o /dev/null -w "HTTP %{http_code} | %{size_download} bytes | %{time_total}s\n"
```

- [ ] **Step 4: Update the spec status + commit**

Mark the spec `Status: Implemented (2026-08-03)` with measured probe results (same pattern as the V8491 spec), commit, push.

- [ ] **Step 5: Hand off to Victor**

Victor visually checks the Airtable embed (Reports > Food Safety): toggle present, Live default, UAT switch shows amber badge + UAT rows.
