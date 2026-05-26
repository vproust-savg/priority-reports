# GRV Log — Always-Fresh Search + LA Timezone Dates — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-26-grv-log-refresh-and-la-timezone-design.md](../specs/2026-05-26-grv-log-refresh-and-la-timezone-design.md)

**Goal:** Make every GRV log search fetch fresh data from Priority (no Redis cache, no client cache, no per-document remarks cache) and ensure every date the user sees or filters on is interpreted as an `America/Los_Angeles` calendar date.

**Architecture:** Add an opt-in `disableCache` flag on `ReportConfig` that the server's POST `/:reportId/query` handler gates `cache.get`/`cache.set` on, mirrored by an `options.disableCache` parameter on `useReportQuery` that flips TanStack to `staleTime: 0` + `refetchOnMount: 'always'`. For dates, add a new `shared/utils/timezone.ts` (`nowInLA`, `formatPriorityCalendarDate`, `LA_TIMEZONE`) and swap the two call sites (`createDefaultFilterGroup`, `formatDate`) plus server cache warming. No new dependencies — built on `Intl.DateTimeFormat`.

**Tech Stack:** TypeScript strict mode, Vitest (+ supertest for server routes, jsdom + React Testing Library for client), TanStack Query v5, Zod, Express. All runs on existing `npm test` / `npx tsc --noEmit` toolchain — no installs needed.

**Conventions you must follow:**
- Every new file starts with the intent block (`FILE`, `PURPOSE`, `USED BY`, `EXPORTS`) — see [`shared/utils/weekUtils.ts`](../../../shared/utils/weekUtils.ts) for the exact format.
- Comments explain WHY, not WHAT.
- Every file under 200 lines.
- Commit after every green test step. Commit message style: `feat(grv-log): ...`, `test(grv-log): ...`, `refactor(grv-log): ...`.

**Pre-deploy gate (run before any push to `main`):**
```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/client" && npx tsc -b --noEmit
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/server" && npx tsc --noEmit
```
Both must pass — any TypeScript error kills the Railway Docker build.

**Working directory for all commands:** `/Users/victorproust/Documents/Work/SG Interface/Priority Reports`

---

## Task 1: `nowInLA()` shared util

**Files:**
- Create: `shared/utils/timezone.ts`
- Test: `shared/utils/timezone.test.ts`

This util underpins every subsequent date fix. It returns a `Date` whose `.getFullYear()/.getMonth()/.getDate()/.getDay()` reflect LA-local components — letting existing `weekUtils.ts` math (which uses local `Date` methods) compute the LA week without rewriting `weekUtils`.

- [ ] **Step 1.1: Write the failing test**

Create `shared/utils/timezone.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.test.ts
// PURPOSE: Tests for LA-timezone date utilities.
// USED BY: Vitest (both server and client suites)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { nowInLA } from './timezone';

describe('nowInLA', () => {
  beforeAll(() => { vi.useFakeTimers(); });
  afterAll(() => { vi.useRealTimers(); });

  it('returns LA-local components when UTC clock is past LA midnight rollover', () => {
    // 2026-05-23T04:00:00Z is 21:00 PDT on Friday May 22 in LA (PDT = UTC-7).
    vi.setSystemTime(new Date('2026-05-23T04:00:00Z'));
    const d = nowInLA();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);       // May (0-indexed)
    expect(d.getDate()).toBe(22);
    expect(d.getDay()).toBe(5);         // Friday
  });

  it('returns LA-local components when UTC is the next LA day', () => {
    // 2026-05-23T08:00:00Z is 01:00 PDT on Saturday May 23 in LA.
    vi.setSystemTime(new Date('2026-05-23T08:00:00Z'));
    const d = nowInLA();
    expect(d.getDate()).toBe(23);
    expect(d.getDay()).toBe(6);         // Saturday
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd server && npx vitest run ../shared/utils/timezone.test.ts
```

Expected: **FAIL** with `Failed to resolve import "./timezone"` (the module doesn't exist yet).

- [ ] **Step 1.3: Write minimal implementation**

Create `shared/utils/timezone.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.ts
// PURPOSE: Treat all user-facing dates as America/Los_Angeles calendar dates.
//          Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is
//          semantically a calendar day, not a UTC instant.
// USED BY: client/src/config/filterConstants.ts,
//          client/src/utils/formatters.ts,
//          server/src/index.ts (cache warming)
// EXPORTS: LA_TIMEZONE, nowInLA, formatPriorityCalendarDate
// ═══════════════════════════════════════════════════════════════

export const LA_TIMEZONE = 'America/Los_Angeles';

// WHY: Returns a Date whose .getFullYear/.getMonth/.getDate/.getDay return
// the LA-local values. Lets existing weekUtils math (which uses local Date
// methods) compute the LA week without rewriting weekUtils itself.
export function nowInLA(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // WHY: 'hour' can come back as '24' in en-US 24-hour formatting at midnight;
  // normalize to '00' so the ISO string is parseable.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`,
  );
}
```

- [ ] **Step 1.4: Run test to verify it passes**

```bash
cd server && npx vitest run ../shared/utils/timezone.test.ts
```

Expected: **PASS** (2 tests).

- [ ] **Step 1.5: Commit**

```bash
git add shared/utils/timezone.ts shared/utils/timezone.test.ts
git commit -m "feat(timezone): add nowInLA() LA-local clock helper"
```

---

## Task 2: `formatPriorityCalendarDate()`

**Files:**
- Modify: `shared/utils/timezone.ts`
- Modify: `shared/utils/timezone.test.ts`

Priority returns calendar dates as `"YYYY-MM-DDT00:00:00Z"`. Parsing that with `new Date()` and formatting in any TZ west of UTC shifts the day. This helper parses the date parts directly and constructs a local Date whose components encode the same calendar day.

- [ ] **Step 2.1: Write the failing test**

Append to `shared/utils/timezone.test.ts` (after the `describe('nowInLA', ...)` block):

```ts
import { formatPriorityCalendarDate } from './timezone';

describe('formatPriorityCalendarDate', () => {
  it('renders a Priority CURDATE as the literal calendar day', () => {
    expect(formatPriorityCalendarDate('2026-05-22T00:00:00Z')).toBe('May 22, 2026');
  });

  it('handles single-digit months and days', () => {
    expect(formatPriorityCalendarDate('2026-01-05T00:00:00Z')).toBe('Jan 5, 2026');
  });

  it('ignores the time portion entirely', () => {
    // Same calendar day regardless of T-suffix.
    expect(formatPriorityCalendarDate('2026-05-22T23:59:59Z')).toBe('May 22, 2026');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd server && npx vitest run ../shared/utils/timezone.test.ts
```

Expected: **FAIL** with `formatPriorityCalendarDate is not a function` (or `Import not found`).

- [ ] **Step 2.3: Write minimal implementation**

Append to `shared/utils/timezone.ts`:

```ts
// WHY: Parses 'YYYY-MM-DD...' as a calendar date (ignores the UTC time),
// so the rendered day never shifts based on the browser's timezone.
// Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is a
// calendar day, not a UTC instant — formatting it through new Date(str)
// + browser-local Intl drops a day everywhere west of UTC.
const calendarDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatPriorityCalendarDate(dateStr: string): string {
  const [datePart] = dateStr.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  return calendarDateFormatter.format(new Date(y, m - 1, d));
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd server && npx vitest run ../shared/utils/timezone.test.ts
```

Expected: **PASS** (5 tests total in the file).

- [ ] **Step 2.5: Commit**

```bash
git add shared/utils/timezone.ts shared/utils/timezone.test.ts
git commit -m "feat(timezone): add formatPriorityCalendarDate"
```

---

## Task 3: `createDefaultFilterGroup` uses `nowInLA()`

**Files:**
- Modify: `client/src/config/filterConstants.ts:13` (import line) and `createDefaultFilterGroup` function
- Create: `client/src/config/filterConstants.test.ts`

The default filter ("Date is in this week") currently computes the week from the browser/server's wall-clock `new Date()`. On Railway (UTC) or any non-LA browser, this can show the wrong week. Switch to `nowInLA()`.

- [ ] **Step 3.1: Write the failing test**

Create `client/src/config/filterConstants.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.test.ts
// PURPOSE: Tests for filter builder factories — specifically that
//          the default week filter is anchored to LA time.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

// WHY: Mock nowInLA BEFORE importing filterConstants so the module
// picks up the mocked binding. vi.mock is hoisted by Vitest.
vi.mock('@shared/utils/timezone', () => ({
  LA_TIMEZONE: 'America/Los_Angeles',
  nowInLA: vi.fn(),
  formatPriorityCalendarDate: vi.fn(),
}));

import { createDefaultFilterGroup } from './filterConstants';
import { nowInLA } from '@shared/utils/timezone';

describe('createDefaultFilterGroup', () => {
  it("returns LA's Monday-Sunday range from nowInLA()", () => {
    // Sunday May 24, 2026 in LA-local components.
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 24));

    const group = createDefaultFilterGroup();
    const condition = group.conditions[0];

    expect(condition.field).toBe('date');
    expect(condition.operator).toBe('isInWeek');
    expect(condition.value).toBe('2026-05-18');     // Monday of that LA week
    expect(condition.valueTo).toBe('2026-05-24');   // Sunday of that LA week
    expect(nowInLA).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
cd client && npx vitest run src/config/filterConstants.test.ts
```

Expected: **FAIL** — `nowInLA` was never called and `condition.value` is whatever the real wall-clock Monday was (not `'2026-05-18'`).

- [ ] **Step 3.3: Write minimal implementation**

In `client/src/config/filterConstants.ts`, change the import (line 13) and the `createDefaultFilterGroup` function:

```ts
// BEFORE (line 13):
import { getMonday, getSunday, toISODate } from '../utils/weekUtils';

// AFTER (line 13 — add the new import below the existing one):
import { getMonday, getSunday, toISODate } from '../utils/weekUtils';
import { nowInLA } from '@shared/utils/timezone';
```

In the same file, replace the `getMonday(new Date())` call inside `createDefaultFilterGroup`:

```ts
// BEFORE:
const monday = getMonday(new Date());

// AFTER:
// WHY: Use LA-now so the default "this week" reflects the Savory Gourmet
// business calendar, not the browser's or Railway's wall-clock TZ.
const monday = getMonday(nowInLA());
```

- [ ] **Step 3.4: Run test to verify it passes**

```bash
cd client && npx vitest run src/config/filterConstants.test.ts
```

Expected: **PASS** (1 test).

- [ ] **Step 3.5: Commit**

```bash
git add client/src/config/filterConstants.ts client/src/config/filterConstants.test.ts
git commit -m "fix(filters): anchor default week to America/Los_Angeles"
```

---

## Task 4: `formatDate` delegates to `formatPriorityCalendarDate`

**Files:**
- Modify: `client/src/utils/formatters.ts:36-38`
- Create: `client/src/utils/formatters.test.ts`

`formatDate` parses with `new Date(dateStr)` then formats in browser TZ. For Priority's `"YYYY-MM-DDT00:00:00Z"` values, every LA browser sees the previous day. Replace the body with a call to the calendar-date helper.

- [ ] **Step 4.1: Write the failing test**

Create `client/src/utils/formatters.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/formatters.test.ts
// PURPOSE: Tests for the user-facing cell formatters — specifically
//          that formatDate delegates to the calendar-day helper so
//          Priority CURDATE never appears off-by-one.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/utils/timezone', () => ({
  LA_TIMEZONE: 'America/Los_Angeles',
  nowInLA: vi.fn(),
  // WHY: Sentinel return value lets us prove delegation without TZ tricks.
  formatPriorityCalendarDate: vi.fn((s: string) => `CAL(${s})`),
}));

import { formatDate } from './formatters';
import { formatPriorityCalendarDate } from '@shared/utils/timezone';

describe('formatDate', () => {
  it('delegates to formatPriorityCalendarDate', () => {
    const out = formatDate('2026-05-22T00:00:00Z');
    expect(out).toBe('CAL(2026-05-22T00:00:00Z)');
    expect(formatPriorityCalendarDate).toHaveBeenCalledWith('2026-05-22T00:00:00Z');
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd client && npx vitest run src/utils/formatters.test.ts
```

Expected: **FAIL** — `out` is `'May 22, 2026'` (or `'May 21, 2026'` if host TZ is west of UTC), not the sentinel.

- [ ] **Step 4.3: Write minimal implementation**

In `client/src/utils/formatters.ts`, change lines 36–38:

```ts
// Add import at top (after existing imports, before the formatter constants):
import { formatPriorityCalendarDate } from '@shared/utils/timezone';

// REPLACE the current formatDate (lines 36-38):
export function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr));
}

// WITH:
// WHY: Priority CURDATE is a calendar day ('YYYY-MM-DDT00:00:00Z') not a
// UTC instant. Parsing it through new Date() + browser-local Intl drops a
// day for every user west of UTC. Delegate to the calendar-day helper.
export function formatDate(dateStr: string): string {
  return formatPriorityCalendarDate(dateStr);
}
```

Also delete the now-unused `dateFormatter` constant (lines 17–21) since nothing else uses it. **Verify** with grep before deleting:

```bash
cd client && grep -rn "dateFormatter" src/
```

Expected: only the line in `formatters.ts` itself. If anything else uses it, leave the constant.

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd client && npx vitest run src/utils/formatters.test.ts
```

Expected: **PASS** (1 test).

Also run the full client suite to confirm no regressions:

```bash
cd client && npm test -- --run
```

Expected: all green.

- [ ] **Step 4.5: Commit**

```bash
git add client/src/utils/formatters.ts client/src/utils/formatters.test.ts
git commit -m "fix(formatters): render Priority dates as LA calendar day"
```

---

## Task 5: `ReportConfig.disableCache` flag

**Files:**
- Modify: `server/src/config/reportRegistry.ts:43` (`ReportConfig` interface)

Pure type addition — no behavior yet. Skipping the test step here because it's a type-only change and TypeScript's compile-check IS the test. The next task exercises the field at runtime.

- [ ] **Step 5.1: Add the field**

In `server/src/config/reportRegistry.ts`, add this property inside the `ReportConfig` interface (insert after the existing `clearMemoryCache?` property at line 90, before the closing `}`):

```ts
  // WHY: When true, the POST /:reportId/query route skips both the Redis
  // cache lookup/write AND any per-report in-memory caches. Use for reports
  // that must always reflect the latest Priority data (e.g., GRV log for
  // receiving operations where stale data risks shipping the wrong goods).
  disableCache?: boolean;
```

- [ ] **Step 5.2: Verify type compiles**

```bash
cd server && npx tsc --noEmit
```

Expected: **no errors**.

- [ ] **Step 5.3: Commit**

```bash
git add server/src/config/reportRegistry.ts
git commit -m "feat(reports): add ReportConfig.disableCache type"
```

---

## Task 6: Query route gates cache on `disableCache`

**Files:**
- Modify: `server/src/routes/query.ts:53-58` (cache read) and `query.ts:180-182` (cache write)
- Create: `server/tests/queryDisableCache.test.ts`

Wrap the `cache.get`/`cache.set` calls in `if (!report.disableCache)` guards.

- [ ] **Step 6.1: Write the failing test**

Create `server/tests/queryDisableCache.test.ts`. This builds a minimal Express app with a stub cache, registers a fake report, and uses supertest (already a dependency — see `server/tests/health.test.ts:9`):

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/queryDisableCache.test.ts
// PURPOSE: Verify the POST /:reportId/query route honors the
//          ReportConfig.disableCache flag — skips Redis read AND write.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { CacheProvider } from '../src/services/cache';
import { reportRegistry, type ReportConfig } from '../src/config/reportRegistry';
import { createQueryRouter } from '../src/routes/query';

// WHY: querySubform/queryPriority hit the real Priority API by default.
// Mock the priority client so the test stays hermetic.
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn().mockResolvedValue({ value: [{ DOCNO: 'X', TYPE: 'P' }] }),
  querySubform: vi.fn(),
}));

function makeStubCache(): CacheProvider & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    invalidateByPrefix: vi.fn().mockResolvedValue(0),
    isConnected: vi.fn().mockResolvedValue(true),
  } as unknown as CacheProvider & { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };
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

function makeApp(cache: CacheProvider) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/reports', createQueryRouter(cache));
  return app;
}

const emptyBody = {
  filterGroup: { id: 'root', conjunction: 'and' as const, conditions: [], groups: [] },
  page: 1,
  pageSize: 50,
};

describe('POST /:reportId/query — disableCache gate', () => {
  afterEach(() => {
    reportRegistry.delete('fake-disabled');
    reportRegistry.delete('fake-cached');
    vi.clearAllMocks();
  });

  it('skips cache.get and cache.set when report.disableCache is true', async () => {
    registerFakeReport('fake-disabled', { disableCache: true });
    const cache = makeStubCache();

    const res = await request(makeApp(cache))
      .post('/api/v1/reports/fake-disabled/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(cache.get).not.toHaveBeenCalled();
    // WHY: cache.set is called via .catch() (fire-and-forget); give it a tick.
    await new Promise((r) => setImmediate(r));
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('still uses cache when report.disableCache is undefined', async () => {
    registerFakeReport('fake-cached'); // no disableCache
    const cache = makeStubCache();

    const res = await request(makeApp(cache))
      .post('/api/v1/reports/fake-cached/query')
      .send(emptyBody);

    expect(res.status).toBe(200);
    expect(cache.get).toHaveBeenCalledTimes(1);
    await new Promise((r) => setImmediate(r));
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd server && npx vitest run tests/queryDisableCache.test.ts
```

Expected: **FAIL** — the first test fails because `cache.get` IS called (the gate doesn't exist yet).

- [ ] **Step 6.3: Write minimal implementation**

In `server/src/routes/query.ts`:

Replace lines 53–58:

```ts
// BEFORE:
let cached: ApiResponse | null = null;
try {
  cached = await cache.get<ApiResponse>(cacheKey);
} catch (err) {
  console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
}

// AFTER:
let cached: ApiResponse | null = null;
// WHY: Some reports (grv-log) require always-fresh Priority data. Skip the
// cache lookup entirely when the report opts out — staleness risk > latency.
if (!report.disableCache) {
  try {
    cached = await cache.get<ApiResponse>(cacheKey);
  } catch (err) {
    console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
  }
}
```

Replace lines 180–182:

```ts
// BEFORE:
cache.set(cacheKey, response, cacheTtl).catch((err) => {
  console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
});

// AFTER:
// WHY: Mirror the read-gate above so disableCache reports never populate Redis.
if (!report.disableCache) {
  cache.set(cacheKey, response, cacheTtl).catch((err) => {
    console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
  });
}
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd server && npx vitest run tests/queryDisableCache.test.ts
```

Expected: **PASS** (2 tests).

Run the full server suite to confirm no regressions:

```bash
cd server && npm test
```

Expected: all green.

- [ ] **Step 6.5: Commit**

```bash
git add server/src/routes/query.ts server/tests/queryDisableCache.test.ts
git commit -m "feat(query): skip Redis cache when report.disableCache is true"
```

---

## Task 7: `grvLog` opts in + remove `subformCache`

**Files:**
- Modify: `server/src/reports/grvLog.ts` (delete `subformCache`/`SUBFORM_CACHE_MAX` declarations and their use in `enrichRows`; add `disableCache: true`; simplify `clearMemoryCache`)
- Create: `server/tests/grvLogReport.test.ts`

This is the change that flips the user-visible behavior: every grv-log query now hits Priority cold, including remarks.

- [ ] **Step 7.1: Write the failing test**

Create `server/tests/grvLogReport.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvLogReport.test.ts
// PURPOSE: Verify grv-log opts into disableCache AND that enrichRows
//          no longer reuses a per-document remarks cache between calls.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/services/priorityClient', () => ({
  // WHY: We only care about call counts here; return a stable remarks payload.
  querySubform: vi.fn().mockResolvedValue({ TEXT: '<p>fake remarks</p>' }),
  queryPriority: vi.fn(),
}));

import '../src/reports/grvLog'; // side-effect: registers grv-log
import { reportRegistry } from '../src/config/reportRegistry';
import { querySubform } from '../src/services/priorityClient';

describe('grv-log report definition', () => {
  it('opts into disableCache', () => {
    const report = reportRegistry.get('grv-log')!;
    expect(report.disableCache).toBe(true);
  });

  it('enrichRows re-fetches each row on every call (no per-document cache)', async () => {
    const report = reportRegistry.get('grv-log')!;
    expect(report.enrichRows).toBeDefined();

    const rows = [
      { DOCNO: 'GR26000001', TYPE: 'P' },
      { DOCNO: 'GR26000002', TYPE: 'P' },
    ];

    vi.mocked(querySubform).mockClear();
    await report.enrichRows!([...rows]);
    await report.enrichRows!([...rows]);

    // WHY: 2 rows × 2 enrich calls = 4 Priority fetches if the cache is gone.
    expect(querySubform).toHaveBeenCalledTimes(4);
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
cd server && npx vitest run tests/grvLogReport.test.ts
```

Expected: **FAIL** —
- Test 1 fails: `report.disableCache` is `undefined`.
- Test 2 fails: `querySubform` was called only **2** times, not 4, because `subformCache` served the second pass.

- [ ] **Step 7.3: Write minimal implementation**

In `server/src/reports/grvLog.ts`:

**(a)** Delete lines 84–89 entirely:

```ts
// DELETE:
// WHY: Per-document sub-form cache. Sub-form data (driver ID, temps, comments)
// doesn't change between filter changes — caching it means we only fetch
// each document's remarks ONCE, then reuse across all filter combinations.
// Cleared on server restart. Prevents re-enrichment when filters change.
const subformCache = new Map<string, Record<string, unknown> | null>();
const SUBFORM_CACHE_MAX = 5000;
```

**(b)** Replace the `enrichRows` body (lines 94–146) with the simplified version that always fetches:

```ts
// WHY: Priority's $expand truncates responses on DOCUMENTS_P (CloudFront
// drops connection mid-body). Two-step fetch: get rows, then fetch each
// text sub-form individually. Batched in groups of 10 for rate limit safety.
// WHY (no cache): grv-log opts into disableCache — receiving operations need
// the latest remarks every time, even if it costs ~50 extra Priority calls
// per page load.
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
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

**(c)** Add `disableCache: true` to the registered object — insert after the `entity: 'DOCUMENTS_P',` line (currently line 171):

```ts
reportRegistry.set('grv-log', {
  id: 'grv-log',
  name: 'GRV Log',
  entity: 'DOCUMENTS_P',
  // WHY: Receiving operations need the latest GRV state and the latest remarks
  // every search — stale data risks shipping the wrong goods. Bypasses Redis
  // query cache AND the per-document remarks fetch is now always live.
  disableCache: true,
  columns,
  // ...rest unchanged
```

**(d)** Replace the `clearMemoryCache` line (currently line 180):

```ts
// BEFORE:
clearMemoryCache: () => subformCache.clear(),

// AFTER:
// WHY: Kept as a no-op so the /refresh route's optional-chain call site stays
// valid. The remarks cache it used to clear was removed when grv-log adopted
// disableCache: true.
clearMemoryCache: () => {},
```

- [ ] **Step 7.4: Run test to verify it passes**

```bash
cd server && npx vitest run tests/grvLogReport.test.ts
```

Expected: **PASS** (2 tests).

Run the full server suite (the existing `grvTransformRow.test.ts` exercises `transformRow` and must still pass):

```bash
cd server && npm test
```

Expected: all green.

- [ ] **Step 7.5: Commit**

```bash
git add server/src/reports/grvLog.ts server/tests/grvLogReport.test.ts
git commit -m "feat(grv-log): always fetch fresh from Priority (disableCache + drop subformCache)"
```

---

## Task 8: Cache warming skips `disableCache` reports

**Files:**
- Modify: `server/src/index.ts:57-95` (`warmCache` function)
- Create: `server/tests/warmCache.test.ts` (or co-locate in an existing test file)

`warmCache` currently always pre-fetches the grv-log "current week". Now that grv-log has `disableCache: true`, this is wasted work — it hits Priority but nothing is cached. Make `warmCache` short-circuit, and switch its own `new Date()` to `nowInLA()` for any future cached report.

- [ ] **Step 8.1: Write the failing test**

Create `server/tests/warmCache.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/warmCache.test.ts
// PURPOSE: Verify cache warming skips reports with disableCache:true
//          and that, when warming proceeds, the date window is LA-local.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock priority client BEFORE importing grvLog (which uses it on registration is fine — only enrichRows uses it).
vi.mock('../src/services/priorityClient', () => ({
  queryPriority: vi.fn(),
  querySubform: vi.fn(),
}));

import '../src/reports/grvLog'; // side-effect: registers grv-log with disableCache:true (after Task 7)
import { warmCache } from '../src/index';

describe('warmCache', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({ meta: { cache: 'miss', executionTimeMs: 1 }, data: [] }),
    });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not POST a query when the target report has disableCache:true', async () => {
    await warmCache();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

```bash
cd server && npx vitest run tests/warmCache.test.ts
```

Expected: **FAIL** — `warmCache is not exported from '../src/index'` (the current `warmCache` is module-private). The test forces us to export it. After exporting, it'll still fail because `warmCache` doesn't yet check `disableCache`.

- [ ] **Step 8.3: Write minimal implementation**

In `server/src/index.ts`:

**(a)** Add the import next to the existing `weekUtils` import (line 22):

```ts
// BEFORE:
import { getMonday, getSunday, toISODate } from '../../shared/utils/weekUtils';

// AFTER (add the second line):
import { getMonday, getSunday, toISODate } from '../../shared/utils/weekUtils';
import { nowInLA } from '../../shared/utils/timezone';
```

**(b)** Replace the `warmCache` function (lines 57–95):

```ts
// BEFORE:
// WHY: Pre-cache the default view (current week) so the first user
// sees data instantly instead of waiting 3-5s on cold load.
async function warmCache() {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);
  // ...rest...
}

// AFTER:
// WHY: Pre-cache the default view (current week) so the first user
// sees data instantly instead of waiting 3-5s on cold load.
// EXPORTED so warmCache.test.ts can exercise the disableCache short-circuit.
export async function warmCache(): Promise<void> {
  // WHY: When the target report has disableCache:true, warming would just
  // burn Priority API budget and never populate Redis. Short-circuit.
  const target = getReport('grv-log');
  if (!target || target.disableCache) return;

  // WHY: nowInLA so the warmed week matches LA's business calendar even
  // though Railway runs in UTC.
  const monday = getMonday(nowInLA());
  const sunday = getSunday(monday);

  const body = {
    filterGroup: {
      id: 'warmup',
      conjunction: 'and' as const,
      conditions: [{
        id: 'warmup-date',
        field: 'date',
        operator: 'isInWeek' as const,
        value: toISODate(monday),
        valueTo: toISODate(sunday),
      }],
      groups: [],
    },
    page: 1,
    pageSize: 50,
  };

  // WHY: Hit our own endpoint via HTTP to reuse all query logic
  // (OData translation, enrichment, caching). Simpler than
  // extracting and calling the handler function directly.
  const port = env.PORT;
  try {
    const response = await fetch(`http://localhost:${port}/api/v1/reports/grv-log/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { meta: { cache: string; executionTimeMs: number }; data: unknown[] };
    console.log(`[warmup] Pre-cached current week: ${data.data.length} rows in ${data.meta.executionTimeMs}ms`);
  } catch (err) {
    console.warn('[warmup] Cache warming failed:', err);
  }
}
```

**(c)** Add the `getReport` import (it's already imported via the `reports/grvLog` side-effect, but we need the named import). Near the existing imports:

```ts
// Add (after the existing imports — placement near other config imports):
import { getReport } from './config/reportRegistry';
```

- [ ] **Step 8.4: Run test to verify it passes**

```bash
cd server && npx vitest run tests/warmCache.test.ts
```

Expected: **PASS** (1 test).

Full server suite:

```bash
cd server && npm test
```

Expected: all green.

- [ ] **Step 8.5: Commit**

```bash
git add server/src/index.ts server/tests/warmCache.test.ts
git commit -m "fix(warmup): skip cache warming for disableCache reports; use LA time"
```

---

## Task 9: `useReportQuery` honors `options.disableCache`

**Files:**
- Modify: `client/src/hooks/useReportQuery.ts` (add options param + conditional TanStack settings)
- Create: `client/src/hooks/useReportQuery.test.ts`

When `disableCache: true`, the hook flips TanStack to "always stale, always refetch on mount, no GC retention" so re-mounts or identical re-renders re-fetch.

- [ ] **Step 9.1: Write the failing test**

Create `client/src/hooks/useReportQuery.test.ts` (model the wrapper pattern from [`client/src/hooks/useExtendedQuery.test.ts:11`](../../../client/src/hooks/useExtendedQuery.test.ts)):

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.test.ts
// PURPOSE: Tests for the useReportQuery hook — specifically that
//          the disableCache option bypasses TanStack's staleTime
//          so re-mounts trigger fresh fetches.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useReportQuery } from './useReportQuery';
import type { FilterGroup } from '@shared/types';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const fakeResponse = {
  meta: { reportId: 'grv-log', reportName: 'GRV Log', generatedAt: '', cache: 'miss', executionTimeMs: 1, source: 'priority-odata' },
  data: [],
  pagination: { page: 1, pageSize: 50, totalCount: 0, totalPages: 0 },
  columns: [],
};

const emptyGroup: FilterGroup = { id: 'r', conjunction: 'and', conditions: [], groups: [] };

let mockFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => fakeResponse,
  });
  vi.stubGlobal('fetch', mockFetch);
});

describe('useReportQuery', () => {
  it('re-mounts re-fetch when disableCache is true', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const first = renderHook(() => useReportQuery('grv-log', params, { disableCache: true }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useReportQuery('grv-log', params, { disableCache: true }), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('re-mounts use cached data when disableCache is omitted', async () => {
    const wrapper = makeWrapper();
    const params = { filterGroup: emptyGroup, page: 1, pageSize: 50 };

    const first = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useReportQuery('grv-log', params), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 9.2: Run test to verify it fails**

```bash
cd client && npx vitest run src/hooks/useReportQuery.test.ts
```

Expected: **FAIL** — first test: hook signature doesn't accept a third `options` argument (TS error), OR if TS lets it slide it'd still receive 1 fetch (current `staleTime: 15 * 60 * 1000` means second mount reuses cache).

- [ ] **Step 9.3: Write minimal implementation**

Replace the entire body of `client/src/hooks/useReportQuery.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useReportQuery.ts
// PURPOSE: Fetches report data via POST /query endpoint. Accepts a
//          FilterGroup tree instead of flat query params.
// USED BY: ReportTableWidget
// EXPORTS: useReportQuery
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ApiResponse, FilterGroup, QueryRequest } from '@shared/types';

interface ReportQueryParams {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
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
    queryFn: async () => {
      const body: QueryRequest = {
        filterGroup: params.filterGroup,
        page: params.page,
        pageSize: params.pageSize,
      };
      const response = await fetch(`/api/v1/reports/${reportId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Report query failed: ${response.status}`);
      return response.json();
    },
    // WHY: disableCache reports skip both stale-time caching AND retention
    // across unmounts. Standard reports keep the 15-min staleTime to match
    // server Redis TTL.
    staleTime: options.disableCache ? 0 : 15 * 60 * 1000,
    gcTime: options.disableCache ? 0 : undefined,
    refetchOnMount: options.disableCache ? 'always' : true,
    // WHY: No keepPreviousData — show skeleton on every data change.
    // Old data showing silently made the app feel broken.
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 9.4: Run test to verify it passes**

```bash
cd client && npx vitest run src/hooks/useReportQuery.test.ts
```

Expected: **PASS** (2 tests).

- [ ] **Step 9.5: Commit**

```bash
git add client/src/hooks/useReportQuery.ts client/src/hooks/useReportQuery.test.ts
git commit -m "feat(useReportQuery): add disableCache option (skip TanStack cache)"
```

---

## Task 10: Widget config schema + grv-log opt-in

**Files:**
- Modify: `client/src/config/pages.ts:12-18` (`WidgetConfigSchema`) and `:37-44` (grv-log widget entry)
- Modify: `client/src/config/pages.test.ts` (extend existing tests)

Add `disableCache` to the Zod schema and set it `true` on the grv-log widget. This is the config side of the wiring; `ReportTableWidget` consumes it in Task 11.

- [ ] **Step 10.1: Write the failing test**

Read the existing `client/src/config/pages.test.ts` first to find the right place to append. Then append:

```ts
describe('grv-log widget disableCache', () => {
  it('is set to true on the grv-log widget', () => {
    const receivingLog = pages.find((p) => p.id === 'receiving-log')!;
    const grvLogWidget = receivingLog.widgets.find((w) => w.id === 'grv-log')!;
    expect(grvLogWidget.disableCache).toBe(true);
  });
});
```

If `pages` isn't already imported in the test, add `import { pages } from './pages';` at the top.

- [ ] **Step 10.2: Run test to verify it fails**

```bash
cd client && npx vitest run src/config/pages.test.ts
```

Expected: **FAIL** — `grvLogWidget.disableCache` is `undefined`. May also fail at TS compile if the schema doesn't include the field.

- [ ] **Step 10.3: Write minimal implementation**

In `client/src/config/pages.ts`, extend `WidgetConfigSchema` (lines 12–18):

```ts
const WidgetConfigSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  type: z.enum(['table']),  // WHY: Expand this enum as we add widget types
  title: z.string(),
  colSpan: z.number().min(1).max(12).default(12),
  // WHY: When true, ReportTableWidget passes disableCache:true to useReportQuery,
  // flipping TanStack to staleTime:0 + refetchOnMount:'always'. Pairs with the
  // server-side ReportConfig.disableCache flag.
  disableCache: z.boolean().optional(),
});
```

In the same file, add `disableCache: true` to the grv-log widget entry (lines 37–44):

```ts
widgets: [
  {
    id: 'grv-log',
    reportId: 'grv-log',
    type: 'table',
    title: 'GRV Log — Goods Receiving Vouchers',
    colSpan: 12,
    disableCache: true,
  },
],
```

- [ ] **Step 10.4: Run test to verify it passes**

```bash
cd client && npx vitest run src/config/pages.test.ts
```

Expected: **PASS**.

- [ ] **Step 10.5: Commit**

```bash
git add client/src/config/pages.ts client/src/config/pages.test.ts
git commit -m "feat(pages): set disableCache:true on grv-log widget"
```

---

## Task 11: Wire widget config → hook in `ReportTableWidget`

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

The widget currently receives only `reportId` as a prop. It needs `disableCache` too. The cleanest fix is to look up the widget config inside `ReportTableWidget` (via `pages.ts`) rather than threading a new prop through every caller — the widget already knows its `reportId`, and the same `reportId` appears in exactly one widget across all pages.

This is the only step in the plan without a behavioral test — it's a pure pass-through. End-to-end coverage comes from the manual verification steps in the spec.

- [ ] **Step 11.1: Add the lookup helper**

In `client/src/config/pages.ts`, append (after the `pages` export):

```ts
// WHY: ReportTableWidget needs to read per-widget overrides like disableCache.
// A reportId appears in exactly one widget across all pages, so a flat lookup
// is unambiguous.
export function findWidgetByReportId(reportId: string): { disableCache?: boolean } | undefined {
  for (const page of pages) {
    const w = page.widgets.find((widget) => widget.reportId === reportId);
    if (w) return w;
  }
  return undefined;
}
```

- [ ] **Step 11.2: Use it in the widget**

In `client/src/components/widgets/ReportTableWidget.tsx`:

Add the import near the other config imports (after line 38 `countActiveFilters`):

```ts
import { findWidgetByReportId } from '../../config/pages';
```

Change the `useReportQuery` call (lines 51–55):

```ts
// BEFORE:
const query = useReportQuery(reportId, {
  filterGroup: debouncedGroup,
  page,
  pageSize: 50,
});

// AFTER:
// WHY: Per-widget disableCache opt-in (set on grv-log in pages.ts) flows
// through to the hook so TanStack treats every search as always-fresh.
const widgetConfig = findWidgetByReportId(reportId);
const query = useReportQuery(
  reportId,
  { filterGroup: debouncedGroup, page, pageSize: 50 },
  { disableCache: widgetConfig?.disableCache },
);
```

- [ ] **Step 11.3: Verify TS compiles and the full client suite is green**

```bash
cd client && npx tsc -b --noEmit
cd client && npm test -- --run
```

Expected: both green.

- [ ] **Step 11.4: Commit**

```bash
git add client/src/config/pages.ts client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat(widget): thread per-widget disableCache to useReportQuery"
```

---

## Task 12: Final pre-deploy gate

- [ ] **Step 12.1: Full type-check, both sides**

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/client" && npx tsc -b --noEmit
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/server" && npx tsc --noEmit
```

Both must exit 0. Any TS error kills the Railway Docker build.

- [ ] **Step 12.2: Full test runs, both sides**

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/server" && npm test
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/client" && npm test -- --run
```

Both must be green.

- [ ] **Step 12.3: Manual smoke (dev server)**

Start both dev servers in separate terminals:

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/server" && npm run dev
```

```bash
cd "/Users/victorproust/Documents/Work/SG Interface/Priority Reports/client" && npm run dev
```

Open http://localhost:5173, navigate to **Food Safety → Receiving Log**. Tail the server logs and confirm:

1. Initial page load shows a `[query] ... cache:miss` style log line.
2. Refreshing the browser triggers another Priority call (no cache hit).
3. Changing a date filter triggers another Priority call.
4. The default date range matches the LA week (use a system clock past LA midnight to confirm).
5. Each row's "Date" column displays the same day Priority shows in the ERP.

- [ ] **Step 12.4: Push to deploy**

Only after Steps 12.1–12.3 are green:

```bash
git push origin main
```

Railway auto-deploys via the Dockerfile. Then run the post-deploy verification in the spec ([2026-05-26-grv-log-refresh-and-la-timezone-design.md](../specs/2026-05-26-grv-log-refresh-and-la-timezone-design.md) — "Verification" section) on https://priority-reports-production.up.railway.app AND in the Airtable iframe.

---

## File summary

| # | Path | Change |
|---|------|--------|
| Task 1 | `shared/utils/timezone.ts` | **NEW** — `LA_TIMEZONE`, `nowInLA()` |
| Task 1 | `shared/utils/timezone.test.ts` | **NEW** |
| Task 2 | `shared/utils/timezone.ts` | + `formatPriorityCalendarDate()` |
| Task 2 | `shared/utils/timezone.test.ts` | + 3 tests |
| Task 3 | `client/src/config/filterConstants.ts` | `new Date()` → `nowInLA()` |
| Task 3 | `client/src/config/filterConstants.test.ts` | **NEW** |
| Task 4 | `client/src/utils/formatters.ts` | `formatDate` delegates to `formatPriorityCalendarDate` |
| Task 4 | `client/src/utils/formatters.test.ts` | **NEW** |
| Task 5 | `server/src/config/reportRegistry.ts` | + `disableCache?: boolean` on `ReportConfig` |
| Task 6 | `server/src/routes/query.ts` | gate `cache.get`/`cache.set` |
| Task 6 | `server/tests/queryDisableCache.test.ts` | **NEW** |
| Task 7 | `server/src/reports/grvLog.ts` | `disableCache: true`; remove `subformCache`; simplify `enrichRows` |
| Task 7 | `server/tests/grvLogReport.test.ts` | **NEW** |
| Task 8 | `server/src/index.ts` | export `warmCache`; skip disableCache reports; use `nowInLA()` |
| Task 8 | `server/tests/warmCache.test.ts` | **NEW** |
| Task 9 | `client/src/hooks/useReportQuery.ts` | + `options` param |
| Task 9 | `client/src/hooks/useReportQuery.test.ts` | **NEW** |
| Task 10 | `client/src/config/pages.ts` | + schema field; set `disableCache: true` on grv-log widget |
| Task 10 | `client/src/config/pages.test.ts` | + 1 test |
| Task 11 | `client/src/config/pages.ts` | + `findWidgetByReportId()` helper |
| Task 11 | `client/src/components/widgets/ReportTableWidget.tsx` | thread `disableCache` to `useReportQuery` |
