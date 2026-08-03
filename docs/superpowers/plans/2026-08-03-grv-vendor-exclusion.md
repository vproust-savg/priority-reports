# GRV Log Vendor V8491 Exclusion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **This repo:** subagents cannot reliably read this iCloud-backed repo — execute inline in the controller session (superpowers:executing-plans).

**Goal:** Hard-exclude vendor `SUPNAME 'V8491'` (Petrovich Caviar) from the GRV Log report — table, export, and dropdown — with no OR-group bypass and no stale-cache leak.

**Architecture:** Seed the exclusion into grvLog's base `$filter` (single source: exported constant). A new `combineFilters()` helper parenthesizes the base+UI filter merge in both query and export routes (Codex finding 1). The export cache key gains the base filter as key material so pre-deploy pages self-invalidate (finding 2). Verification uses the exact `SUPNAME` predicate against Priority (finding 3).

**Tech Stack:** Express + TypeScript (strict), Vitest, Priority OData, Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-08-03-grv-vendor-exclusion-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/services/odataFilterBuilder.ts` | Modify | Add `combineFilters()` export |
| `server/src/services/odataFilterBuilder.test.ts` | Create | `combineFilters` unit tests (OR-bypass case) |
| `server/src/routes/query.ts` | Modify | Use `combineFilters` (line 81) |
| `server/src/routes/export.ts` | Modify | Use `combineFilters` (line 59); pass base filter to cache key (line 72) |
| `server/src/reports/grvLog.ts` | Modify | Export `EXCLUDED_VENDOR_SUPNAME`; seed exclusion in `buildQuery` |
| `server/src/reports/grvLog.test.ts` | Create | buildQuery exclusion tests |
| `server/src/services/cache.ts` | Modify | `buildExportCacheKey` gains optional `baseFilter` param |
| `server/src/services/cache.test.ts` | Create | Cache-key versioning tests |
| `server/src/routes/filters.ts` | Modify | Skip V8491 in vendor dropdown |

All commits go to `main` but are **NOT pushed** until Task 6's hold point — pushing deploys production via Railway.

---

### Task 1: `combineFilters` helper

**Files:**
- Modify: `server/src/services/odataFilterBuilder.ts`
- Test: `server/src/services/odataFilterBuilder.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/src/services/odataFilterBuilder.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/odataFilterBuilder.test.ts
// PURPOSE: Tests for combineFilters — parenthesized merge that
//          prevents OR groups from bypassing a report's base filter.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { combineFilters } from './odataFilterBuilder';

describe('combineFilters', () => {
  it('parenthesizes both parts so OR groups cannot bypass the base filter', () => {
    expect(
      combineFilters("SUPNAME ne 'V8491'", "STATDES eq 'Received' or DOCNO eq 'X'"),
    ).toBe("(SUPNAME ne 'V8491') and (STATDES eq 'Received' or DOCNO eq 'X')");
  });

  it('returns a single present part unwrapped', () => {
    expect(combineFilters("SUPNAME ne 'V8491'", undefined)).toBe("SUPNAME ne 'V8491'");
    expect(combineFilters(undefined, 'CURDATE ge 2026-07-27T00:00:00Z')).toBe(
      'CURDATE ge 2026-07-27T00:00:00Z',
    );
  });

  it('returns undefined when no parts are present', () => {
    expect(combineFilters(undefined, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/odataFilterBuilder.test.ts`
Expected: FAIL — `combineFilters` is not exported.

- [ ] **Step 3: Implement `combineFilters`**

In `server/src/services/odataFilterBuilder.ts`, append at the end of the file:

```ts
// WHY: OData 'and' binds tighter than 'or'. Merging a base filter with a
// top-level OR group without parentheses leaks rows: base and A or B
// == (base and A) or B — any row matching B bypasses the base filter.
// Wrap every part so the base filter constrains the whole expression.
export function combineFilters(...parts: (string | undefined)[]): string | undefined {
  const present = parts.filter((p): p is string => Boolean(p));
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  return present.map((p) => `(${p})`).join(' and ');
}
```

Update the file's intent block `EXPORTS:` line to:
`// EXPORTS: buildODataFilter, escapeODataString, combineFilters`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/services/odataFilterBuilder.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/services/odataFilterBuilder.ts server/src/services/odataFilterBuilder.test.ts
git commit -m "feat(odata): combineFilters parenthesizes base+UI filter merge"
```

---

### Task 2: Wire `combineFilters` into query and export routes

**Files:**
- Modify: `server/src/routes/query.ts` (import block + line 81)
- Modify: `server/src/routes/export.ts` (import block + line 59)

- [ ] **Step 1: Update query.ts**

Change the import (line 16):

```ts
import { buildODataFilter, combineFilters } from '../services/odataFilterBuilder';
```

Replace line 81 (keep the WHY comment above it, lines 79-80):

```ts
const combinedFilter = combineFilters(baseParams.$filter, odataFilter);
```

- [ ] **Step 2: Update export.ts**

Change the import (line 15):

```ts
import { buildODataFilter, combineFilters } from '../services/odataFilterBuilder';
```

Replace line 59 (keep the WHY comment, lines 57-58):

```ts
const combinedFilter = combineFilters(baseParams.$filter, odataFilter);
```

- [ ] **Step 3: Typecheck and run full test suite**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: clean typecheck; all tests pass (no behavior change yet — grv-log's base `$filter` is still `undefined`, and single-part merge output is identical to the old join).

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/query.ts server/src/routes/export.ts
git commit -m "fix(routes): parenthesized filter merge closes OR-group bypass"
```

---

### Task 3: V8491 exclusion in grvLog `buildQuery`

**Files:**
- Modify: `server/src/reports/grvLog.ts`
- Test: `server/src/reports/grvLog.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/grvLog.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.test.ts
// PURPOSE: Tests the V8491 (Petrovich Caviar) hard exclusion in
//          grv-log's base query — business rule, 2026-08-03.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { reportRegistry } from '../config/reportRegistry';
import './grvLog';

const report = reportRegistry.get('grv-log');
if (!report) throw new Error('grv-log not registered');

describe('grv-log buildQuery vendor exclusion', () => {
  it('always excludes V8491 even with no other filters', () => {
    const params = report.buildQuery({ page: 1, pageSize: 50 });
    expect(params.$filter).toBe("SUPNAME ne 'V8491'");
  });

  it('ANDs the exclusion with date filters', () => {
    const params = report.buildQuery({
      from: '2026-07-27', to: '2026-08-02', page: 1, pageSize: 50,
    });
    expect(params.$filter).toBe(
      "SUPNAME ne 'V8491' and CURDATE ge 2026-07-27T00:00:00Z and CURDATE le 2026-08-02T23:59:59Z",
    );
  });

  it('keeps pagination math unchanged', () => {
    const params = report.buildQuery({ page: 3, pageSize: 50 });
    expect(params.$top).toBe(50);
    expect(params.$skip).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/reports/grvLog.test.ts`
Expected: FAIL — `$filter` is `undefined` (first test) since no exclusion exists yet.

- [ ] **Step 3: Implement the exclusion**

In `server/src/reports/grvLog.ts`, insert above `function buildQuery` (after the `filterColumns` array):

```ts
// WHY: Petrovich Caviar floods DOCUMENTS_P with GRVs (46% of week
// 2026-07-27 rows) and is out of scope for the food-safety receiving log
// (business rule, Victor 2026-08-03). Seeded into the base $filter so no
// UI filter combination can reveal it — query.ts and export.ts AND
// baseParams.$filter into every fetch via combineFilters (parenthesized).
// SUPNAME (stable vendor code), not CDES (renamable display name).
export const EXCLUDED_VENDOR_SUPNAME = 'V8491';
```

In `buildQuery`, replace the first line and the `$filter` return line:

```ts
const conditions: string[] = [`SUPNAME ne '${EXCLUDED_VENDOR_SUPNAME}'`];
```

and in the returned object (conditions is now never empty):

```ts
$filter: conditions.join(' and '),
```

Update the intent block `EXPORTS:` line to:
`// EXPORTS: EXCLUDED_VENDOR_SUPNAME (used by routes/filters.ts)`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run src/reports/grvLog.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/grvLog.ts server/src/reports/grvLog.test.ts
git commit -m "feat(grv-log): hard-exclude vendor V8491 in base query filter"
```

---

### Task 4: Export cache key versioning

**Files:**
- Modify: `server/src/services/cache.ts:49-52`
- Modify: `server/src/routes/export.ts:72`
- Test: `server/src/services/cache.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `server/src/services/cache.test.ts`:

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/cache.test.ts
// PURPOSE: Tests export cache key versioning — a changed base
//          $filter must never serve pages cached under the old one.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildExportCacheKey } from './cache';
import type { FilterGroup } from '@shared/types';

const group: FilterGroup = { id: 'root', conjunction: 'and', conditions: [], groups: [] };

describe('buildExportCacheKey base-filter versioning', () => {
  it('produces different keys when the base filter differs', () => {
    const before = buildExportCacheKey('grv-log', group, 0);
    const after = buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'");
    expect(after).not.toBe(before);
  });

  it('is stable for identical base filters', () => {
    expect(buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'")).toBe(
      buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'"),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/services/cache.test.ts`
Expected: FAIL — first test: keys are identical (4th argument is ignored; TS may also error on arity, which is the same failure signal).

- [ ] **Step 3: Implement key versioning**

In `server/src/services/cache.ts`, replace `buildExportCacheKey` (lines 49-52):

```ts
// WHY: baseFilter in the key material self-versions the export cache —
// pages cached before a report's base $filter changed (e.g. the V8491
// exclusion, 2026-08-03) can never be served afterward. Old keys age out
// via the 15-minute TTL; no manual invalidation step to forget.
export function buildExportCacheKey(
  reportId: string,
  filterGroup: FilterGroup,
  page: number,
  baseFilter?: string,
): string {
  const filterHash = JSON.stringify(stripIds(filterGroup));
  return `export:${reportId}:p${page}:s5000:bf${baseFilter ?? ''}:${filterHash}`;
}
```

In `server/src/routes/export.ts`, line 72, pass the base filter:

```ts
const cacheKey = buildExportCacheKey(reportId, body.filterGroup, page, baseParams.$filter);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: clean typecheck; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/cache.ts server/src/services/cache.test.ts server/src/routes/export.ts
git commit -m "fix(export): version cache keys by base filter (rollout safety)"
```

---

### Task 5: Vendor dropdown skip

**Files:**
- Modify: `server/src/routes/filters.ts:18` (import) and `:74-78` (loop)

- [ ] **Step 1: Convert side-effect import to named import**

Line 16-19 currently reads:

```ts
// WHY: Ensure report definitions are registered even if filters.ts
// loads before reports.ts. Node module cache prevents double-registration.
import '../reports/grvLog';
import '../reports/bbdReport';
```

Change the grvLog line (named import still runs the module side effect):

```ts
import { EXCLUDED_VENDOR_SUPNAME } from '../reports/grvLog';
```

- [ ] **Step 2: Skip the excluded vendor in the collection loop**

The loop at lines 74-78 becomes:

```ts
const vendorSet = new Set<string>();
for (const row of vendorData.value) {
  // WHY: Excluded vendor must not be offered as a filter option — its
  // rows are already hidden by grv-log's base $filter (V8491 exclusion).
  if (row.SUPNAME === EXCLUDED_VENDOR_SUPNAME) continue;
  const name = row.CDES as string;
  if (name) vendorSet.add(name);
}
```

- [ ] **Step 3: Typecheck and full test suite**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: clean; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/filters.ts
git commit -m "feat(grv-log): drop excluded vendor V8491 from dropdown options"
```

---

### Task 6: Pre-deploy verification — then HOLD for Victor

**Files:** none (verification only). **Do not `git push` before the hold point is cleared.**

- [ ] **Step 1: Exact-predicate probes against Priority (Codex finding 3)**

Confirm the URL join first: check how `server/src/services/priorityClient.ts` (or `priorityHttp.ts`) appends the entity to the base URL, then run baseline + exclusion probes, 3× each. Credentials come from the repo-root `.env` — never echo their values:

```bash
cd "$(git rev-parse --show-toplevel)" && set -a && source .env && set +a && \
for variant in baseline exclusion; do
  if [ "$variant" = "exclusion" ]; then
    FILTER="SUPNAME ne 'V8491' and CURDATE ge 2026-07-27T00:00:00Z and CURDATE le 2026-08-02T23:59:59Z and STATDES ne 'Canceled'"
  else
    FILTER="CURDATE ge 2026-07-27T00:00:00Z and CURDATE le 2026-08-02T23:59:59Z and STATDES ne 'Canceled'"
  fi
  for i in 1 2 3; do
    curl -sS --get -o /dev/null -w "$variant run $i: HTTP %{http_code} | total %{time_total}s\n" \
      --max-time 300 -u "$PRIORITY_PROD_USERNAME:$PRIORITY_PROD_PASSWORD" \
      -H 'Prefer: odata.maxpagesize=49900' -H 'IEEE754Compatible: true' \
      --data-urlencode "\$select=DOCNO,TYPE,ORDNAME,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN" \
      --data-urlencode "\$filter=$FILTER" \
      --data-urlencode "\$orderby=CURDATE desc" \
      --data-urlencode "\$top=50" \
      "$PRIORITY_PROD_BASE_URL/DOCUMENTS_P"
    sleep 2
  done
done
```

Expected: all HTTP 200. Record the six timings in the spec's evidence section. (These measure the main query only — the enrichment cost is unchanged by this feature.)

- [ ] **Step 2: Full pre-deploy checklist (per CLAUDE.md + railway-deploy skill)**

The change adds test files and touches Express routes — consult the `railway-deploy` skill's guardrails. Then:

```bash
cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit && npm test
```

Expected: both typechecks clean, all tests pass. Also confirm no compiled `@shared` require/import leaks: check `server/dist` after `npm run build` — only `.js` `require`/`import` of `@shared` is a real failure (`.d.ts`/comment hits are false positives, per project memory).

- [ ] **Step 3: HOLD — confirm deploy with Victor**

Pushing to `main` auto-deploys production via Railway. Report probe timings and test results, then ask Victor for go-ahead before `git push`.

---

### Task 7: Deploy and post-deploy verification

- [ ] **Step 1: Push (after hold cleared)**

```bash
git push origin main
```

- [ ] **Step 2: Detect the new deploy (read-only discriminating probe)**

`/api/health` has no build marker (project memory). The discriminator: page 1 of the default-week query contains **zero** Petrovich Caviar rows only after the new build serves traffic. Poll every ~60s until flipped (Railway builds take a few minutes):

```bash
curl -sS -X POST 'https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/query' \
  -H 'Content-Type: application/json' --max-time 300 \
  -d '{"page":1,"pageSize":50,"filterGroup":{"id":"root","conjunction":"and","conditions":[{"id":"c1","field":"date","operator":"isInWeek","value":"2026-07-27","valueTo":"2026-08-02"},{"id":"c2","field":"status","operator":"notEquals","value":"Canceled"}],"groups":[]}}' \
  | jq '{rows: (.data|length), caviar: ([.data[] | select(.vendor == "Petrovich Caviar")] | length), ms: .meta.executionTimeMs}'
```

Expected after deploy: `caviar: 0`.

- [ ] **Step 3: Timed re-probes and OR-bypass check**

Run the Step 2 command 3×, ~1 min apart; record `ms` values in the spec (compare with pre-deploy 11.4s baseline). Then the OR-bypass regression (top-level OR group; must return zero caviar rows):

```bash
curl -sS -X POST 'https://priority-reports-production.up.railway.app/api/v1/reports/grv-log/query' \
  -H 'Content-Type: application/json' --max-time 300 \
  -d '{"page":1,"pageSize":50,"filterGroup":{"id":"root","conjunction":"or","conditions":[{"id":"c1","field":"status","operator":"equals","value":"Received"},{"id":"c2","field":"status","operator":"equals","value":"In Progress"}],"groups":[]}}' \
  | jq '[.data[] | select(.vendor == "Petrovich Caviar")] | length'
```

Expected: `0`.

- [ ] **Step 4: Export spot-check and Airtable embed**

Trigger one Excel export for the default week via the production API and confirm no Petrovich Caviar rows in the file. Then Victor (or a browser check) confirms the Receiving Log loads at the Airtable Interface page "Reports > Food Safety" — iframe behavior can differ from the direct URL (CLAUDE.md).

- [ ] **Step 5: Close out**

Update the spec's Status line to `Implemented (2026-08-03)` with measured post-deploy numbers; commit:

```bash
git add docs/superpowers/specs/2026-08-03-grv-vendor-exclusion-design.md
git commit -m "docs(grv): mark vendor-exclusion spec implemented with measured results"
git push origin main
```

---

## Self-Review Notes

- **Spec coverage:** Design §1 → Task 3; §2 → Tasks 1-2; §3 → Task 4; §4 → Task 5; §5 → Tasks 1, 3, 4; §6 honored (no extra scope). Verification §2 → Task 6 Step 1; §3 → Task 6 Step 2; §4-5 → Task 7.
- **Follow-up (explicitly out of scope):** retry-storm hardening (in-flight query dedupe / client retry caps) — new spec after post-deploy measurement.
