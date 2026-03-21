# Spec 03a-h — Backend: Post-Review Hardening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the backend filter engine with better observability, rate-limit safety, and code deduplication.

**Architecture:** Three independent fixes to existing files. No new files, no new endpoints, no shared-type changes. Each task is independently deployable.

**Tech Stack:** Express + TypeScript, Vitest

> **Session scope:** ~20 min Claude Code work (backend session only)
> **Date:** 2026-03-21
> **Status:** Ready to build
> **Depends on:** Spec 03a (filter engine already built — odataFilterBuilder, query.ts, querySchemas.ts)

---

## 1. Scope

### 1.1 What Changes

1. Remove duplicate `escapeODataString` from `grvLog.ts` — import the exported one from `odataFilterBuilder.ts`
2. Add OData `$filter` string to structured logs — debug filter issues in Railway without manual reproduction
3. Add inter-batch delay to `enrichRows` — respect Priority's 100 calls/min rate limit at high page sizes

### 1.2 Out of Scope

- Frontend changes (see Spec 03b-h)
- New endpoints or shared types
- Pagination accuracy (`$count` support) — future spec
- OR-group UI warning — frontend responsibility (Spec 03b-h)

---

## 2. File Map

| File | Action | What Changes |
|------|--------|-------------|
| `server/src/reports/grvLog.ts` | Modify | Import `escapeODataString` from odataFilterBuilder, delete local copy. Add 200ms inter-batch delay in `enrichRows`. |
| `server/src/services/logger.ts` | Modify | Add optional `odataFilter?: string` field to `logApiCall` entry type. |
| `server/src/routes/query.ts` | Modify | Move `odataFilter` computation before cache check. Pass `odataFilter` to both `logApiCall` calls. |
| `server/src/services/odataFilterBuilder.ts` | No change | Already exports `escapeODataString` (line 13). |

---

## 3. Tasks

### Task 1: Remove duplicate `escapeODataString`

**Files:**
- Modify: `server/src/reports/grvLog.ts:17-22` (delete local function), `:1-16` (add import)

**Current state:** `grvLog.ts` has a local `escapeODataString` (lines 20-22) identical to the exported one in `odataFilterBuilder.ts` (lines 13-15). Used only by the legacy `buildQuery()` function.

- [ ] **Step 1: Add import from odataFilterBuilder**

At the top of `grvLog.ts`, add to imports:
```typescript
import { escapeODataString } from '../services/odataFilterBuilder';
```

- [ ] **Step 2: Delete local `escapeODataString` function**

Remove lines 17-22 (the WHY comment and the function):
```typescript
// DELETE these lines:
// WHY: OData string literals use single quotes. A bare quote in a value
// breaks the query. Doubling escapes it: O'Brien → O''Brien.
// Zod regex blocks quotes today, but this is defense in depth.
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors (existing usage in `buildQuery` still works via the imported function)

- [ ] **Step 4: Run tests**

Run: `cd server && npm test`
Expected: All existing tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "refactor: deduplicate escapeODataString — import from odataFilterBuilder"
```

---

### Task 2: Add OData filter to structured logs

**Files:**
- Modify: `server/src/services/logger.ts:9-17` (add field to type)
- Modify: `server/src/routes/query.ts:45-55,118-122` (pass filter to logs)

**Current state:** `logApiCall` logs `reportId`, `durationMs`, `cacheHit`, `rowCount`, `statusCode` — but NOT the OData `$filter` string. Debugging filter issues in Railway requires manual reproduction.

- [ ] **Step 1: Add `odataFilter` field to logger**

In `logger.ts`, add optional field to the `logApiCall` entry type:
```typescript
export function logApiCall(entry: {
  level: 'info' | 'warn' | 'error';
  event: string;
  reportId: string;
  durationMs: number;
  cacheHit: boolean;
  rowCount?: number;
  statusCode: number;
  odataFilter?: string;   // ← ADD THIS LINE
}): void {
```

- [ ] **Step 2: Move OData filter computation before cache check in query.ts**

Current `query.ts` computes `odataFilter` at line 60, AFTER the cache check (line 46). Move it before the cache check so both log calls (cache hit + cache miss) can include it.

Current order (simplified):
```
line 45: cacheKey = buildQueryCacheKey(...)
line 46: cached = cache.get(cacheKey)
line 47-55: if (cached) { logApiCall(...); return; }
line 59: baseParams = report.buildQuery(...)
line 60: odataFilter = buildODataFilter(...)
```

New order:
```
line 45: cacheKey = buildQueryCacheKey(...)
line NEW: baseParams = report.buildQuery(...)
line NEW: odataFilter = buildODataFilter(...)
line 46: cached = cache.get(cacheKey)
line 47-55: if (cached) { logApiCall(..., odataFilter); return; }
```

Specifically, move these two lines from AFTER the cache check (lines 59-60) to BEFORE it (after `cacheKey`):
```typescript
const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });
const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);
```

- [ ] **Step 3: Pass `odataFilter` to both log calls**

Cache hit log (around line 48):
```typescript
logApiCall({
  level: 'info', event: 'query_fetch', reportId,
  durationMs: Date.now() - startTime, cacheHit: true,
  rowCount: cached.data.length, statusCode: 200,
  odataFilter: odataFilter ?? 'none',           // ← ADD
});
```

Cache miss log (around line 118):
```typescript
logApiCall({
  level: 'info', event: 'query_fetch', reportId,
  durationMs: Date.now() - startTime, cacheHit: false,
  rowCount: rows.length, statusCode: 200,
  odataFilter: odataFilter ?? 'none',           // ← ADD
});
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add server/src/services/logger.ts server/src/routes/query.ts
git commit -m "feat: log OData filter string in query endpoint for Railway debugging"
```

---

### Task 3: Add inter-batch delay to enrichRows

**Files:**
- Modify: `server/src/reports/grvLog.ts:83-103` (add delay between batches)

**Current state:** `enrichRows` fires batches of 10 parallel `querySubform` calls with NO delay between batches. At `pageSize=500` (client-filter mode), that's 50 batches × 10 calls = 500 Priority API calls. Priority allows 100 calls/minute, 15 queued max.

- [ ] **Step 1: Add 200ms delay between batches**

In the `enrichRows` function, add a delay at the start of the loop (skip first batch):
```typescript
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  // WHY: 200ms delay between batches keeps us under Priority's 100 calls/min
  // rate limit. At 10 parallel calls per batch, this limits throughput to
  // ~50 calls/sec burst with ~5 calls/sec sustained average.
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const batch = rows.slice(i, i + BATCH_SIZE);
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run tests**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/src/reports/grvLog.ts
git commit -m "fix: add 200ms inter-batch delay in enrichRows to respect Priority rate limits"
```

---

## 4. Verification

```bash
cd server && npx tsc --noEmit          # TypeScript compiles
cd server && npm test                   # All tests pass
```

Manual check after deploy:
- Apply a filter via the frontend → Railway logs should include `"odataFilter":"SUPNAME eq '...'"` in the structured JSON output
- Large page fetches (pageSize=500) should not trigger Priority 429 errors
