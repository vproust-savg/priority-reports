# Spec 02a — Backend Real Data: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Express backend to Priority ERP oData API and serve the GRV Log report with real data, replacing mock data entirely.

**Architecture:** A Priority HTTP client sends OData queries to Priority ERP. A report registry maps report IDs to config objects (entity, columns, query builder, row transformer). The GRV Log report expands `DOCUMENTSTEXT_SUBFORM` and parses HTML remarks into 7 structured inspection fields. All responses use the existing `ApiResponse<T>` envelope.

**Tech Stack:** Express 5, TypeScript strict, Zod validation, Vitest, Upstash Redis cache

**Spec:** `specs/spec-02a-backend-real-data.md`

**Mandatory code rules:** Read `CLAUDE.md` before writing any code. Every file needs an intent block, WHY comments on non-obvious decisions, max 150 lines per file.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `shared/types/filters.ts` | NEW — `FilterOption`, `FilterValues`, `FiltersResponse` types |
| `shared/types/index.ts` | MOD — re-export filters |
| `server/src/config/environment.ts` | MOD — add `AIRTABLE_TOKEN` |
| `server/src/config/priority.ts` | NEW — Priority API env config (UAT/Prod switching) |
| `server/src/services/priorityClient.ts` | NEW — HTTP client for Priority oData |
| `server/src/services/htmlParser.ts` | NEW — Parse HTML remarks into key-value fields |
| `server/src/config/reportRegistry.ts` | NEW — Report config interface + registry Map |
| `server/src/reports/grvLog.ts` | NEW — GRV Log report definition (columns, query, transform) |
| `server/src/routes/reports.ts` | MOD — replace mock data with registry + Priority client |
| `server/src/routes/filters.ts` | NEW — `/api/v1/reports/:reportId/filters` endpoint |
| `server/src/services/cache.ts` | MOD — add vendor/status to `buildCacheKey` |
| `server/src/index.ts` | MOD — mount filters router |
| `server/src/services/mockData.ts` | DELETE |
| `server/tests/htmlParser.test.ts` | NEW — unit tests for HTML parser |
| `.env.example` | MOD — add `AIRTABLE_TOKEN` placeholder |

---

### Task 1: Shared Filter Types

**Files:**
- Create: `shared/types/filters.ts`
- Modify: `shared/types/index.ts`

- [ ] **Step 1: Create `shared/types/filters.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for report filter dropdowns and filter state.
//          Used by both backend (to build filter responses) and
//          frontend (to manage filter UI state).
// USED BY: routes/filters.ts, FilterBar.tsx, ReportTableWidget.tsx
// EXPORTS: FilterOption, FilterValues, FiltersResponse
// ═══════════════════════════════════════════════════════════════

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterValues {
  from: string;
  to: string;
  vendor: string;
  status: string;
}

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
  };
}
```

- [ ] **Step 2: Update `shared/types/index.ts`**

Add one line after the existing exports:

```typescript
export * from './filters';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add shared/types/filters.ts shared/types/index.ts
git commit -m "feat: add shared filter types (FilterOption, FilterValues, FiltersResponse)"
```

---

### Task 2: Priority Environment Config

**Files:**
- Create: `server/src/config/priority.ts`
- Modify: `server/src/config/environment.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add `AIRTABLE_TOKEN` to environment schema**

In `server/src/config/environment.ts`, add this field to `EnvSchema` after the Upstash Redis section:

```typescript
  // Airtable (for report status updates)
  AIRTABLE_TOKEN: optionalString,
```

- [ ] **Step 2: Update `.env.example`**

Add at the end:

```env

# Airtable (for report status updates)
AIRTABLE_TOKEN=
```

- [ ] **Step 3: Create `server/src/config/priority.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/priority.ts
// PURPOSE: Priority API configuration with environment switching.
//          Reads PRIORITY_ENV to select UAT or Production credentials.
//          Same host and ini file for both — only company code differs.
// USED BY: services/priorityClient.ts
// EXPORTS: getPriorityConfig, PriorityConfig
// ═══════════════════════════════════════════════════════════════

import { env } from './environment';

export interface PriorityConfig {
  baseUrl: string;
  username: string;
  password: string;
  env: 'uat' | 'production';
}

export function getPriorityConfig(): PriorityConfig {
  const isProduction = env.PRIORITY_ENV === 'production';

  const baseUrl = isProduction ? env.PRIORITY_PROD_BASE_URL : env.PRIORITY_UAT_BASE_URL;
  const username = isProduction ? env.PRIORITY_PROD_USERNAME : env.PRIORITY_UAT_USERNAME;
  const password = isProduction ? env.PRIORITY_PROD_PASSWORD : env.PRIORITY_UAT_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error(
      `Missing Priority ${env.PRIORITY_ENV} credentials. Check PRIORITY_${env.PRIORITY_ENV.toUpperCase()}_* env vars.`
    );
  }

  return { baseUrl, username, password, env: env.PRIORITY_ENV };
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/config/priority.ts server/src/config/environment.ts .env.example
git commit -m "feat: add Priority API env config with UAT/Production switching"
```

---

### Task 3: Priority HTTP Client

**Files:**
- Create: `server/src/services/priorityClient.ts`

- [ ] **Step 1: Create `server/src/services/priorityClient.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/priorityClient.ts
// PURPOSE: HTTP client for Priority ERP oData API. Handles auth,
//          required headers, rate limiting, and error handling.
//          All Priority requests go through this client.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: priorityClient, ODataParams, PriorityResponse
// ═══════════════════════════════════════════════════════════════

import { getPriorityConfig } from '../config/priority';

export interface ODataParams {
  $select?: string;
  $filter?: string;
  $expand?: string;
  $top?: number;
  $skip?: number;
  $orderby?: string;
}

export interface PriorityResponse {
  value: Record<string, unknown>[];
}

// WHY: 200ms delay between requests to stay under Priority's 100 calls/minute limit
const RATE_LIMIT_DELAY_MS = 200;
let lastRequestTime = 0;

async function rateLimitDelay(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function buildUrl(entity: string, params: ODataParams): string {
  const config = getPriorityConfig();
  const url = new URL(`${config.baseUrl}${entity}`);

  if (params.$select) url.searchParams.set('$select', params.$select);
  if (params.$filter) url.searchParams.set('$filter', params.$filter);
  if (params.$expand) url.searchParams.set('$expand', params.$expand);
  if (params.$top !== undefined) url.searchParams.set('$top', String(params.$top));
  if (params.$skip !== undefined) url.searchParams.set('$skip', String(params.$skip));
  if (params.$orderby) url.searchParams.set('$orderby', params.$orderby);

  return url.toString();
}

function getHeaders(): Record<string, string> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

  return {
    'Content-Type': 'application/json',
    // WHY: Without IEEE754Compatible, Priority returns incorrect numeric values
    'IEEE754Compatible': 'true',
    // WHY: Without this, Priority may silently truncate results below 1000
    'Prefer': 'odata.maxpagesize=1000',
    'Authorization': `Basic ${auth}`,
  };
}

// WHY: 429 gets 3 retries with exponential backoff (spec requirement).
// 500+ gets 1 retry with flat delay (transient server errors).
async function fetchWithRetry(url: string, attempt = 0, maxRetries = 3): Promise<Response> {
  await rateLimitDelay();

  const response = await fetch(url, { headers: getHeaders() });

  if (response.status === 401) {
    throw new Error('Priority auth failed — check credentials');
  }

  if (response.status === 429 && attempt < maxRetries) {
    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
    console.warn(`[priority] Rate limited — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return fetchWithRetry(url, attempt + 1, maxRetries);
  }

  if (response.status >= 500 && attempt < 1) {
    console.warn(`[priority] Server error ${response.status} — retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchWithRetry(url, attempt + 1, 1);
  }

  return response;
}

export async function queryPriority(
  entity: string,
  params: ODataParams = {},
): Promise<PriorityResponse> {
  const url = buildUrl(entity, params);
  const response = await fetchWithRetry(url);

  // WHY: 404 on a query means no results, not an error
  if (response.status === 404) {
    return { value: [] };
  }

  if (!response.ok) {
    throw new Error(`Priority query failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { value: data.value ?? [] };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/services/priorityClient.ts
git commit -m "feat: add Priority oData HTTP client with auth, rate limiting, retry"
```

---

### Task 4: HTML Remarks Parser — Tests First

**Files:**
- Create: `server/tests/htmlParser.test.ts`
- Create: `server/src/services/htmlParser.ts`

- [ ] **Step 1: Write the failing tests for `htmlParser`**

Create `server/tests/htmlParser.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/htmlParser.test.ts
// PURPOSE: Unit tests for GRV HTML remarks parser.
//          Tests normal, partial, empty, and real UAT HTML.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseGrvRemarks } from '../src/services/htmlParser';

const FULL_HTML = `
<style>.ExternalClass{width:100%}</style>
<p>Driver ID : John Smith<br>
Licence Plate : ABC-1234</p>
<div>Truck Temp. °F (dry if ambient) : 34<br>
Product Surface Temp. °F : 36</div>
<p>Condition of Product (accept/reject) : accept<br>
Condition of Truck (accept/reject) : accept</p>
<p>Comments : All good</p>
`;

describe('parseGrvRemarks', () => {
  it('extracts all 7 fields from full HTML', () => {
    const result = parseGrvRemarks(FULL_HTML);
    expect(result.driverId).toBe('John Smith');
    expect(result.licensePlate).toBe('ABC-1234');
    expect(result.truckTemp).toBe('34');
    expect(result.productTemp).toBe('36');
    expect(result.productCondition).toBe('accept');
    expect(result.truckCondition).toBe('accept');
    expect(result.comments).toBe('All good');
  });

  it('returns nulls for missing fields', () => {
    const partial = '<p>Driver ID : Jane Doe</p>';
    const result = parseGrvRemarks(partial);
    expect(result.driverId).toBe('Jane Doe');
    expect(result.licensePlate).toBeNull();
    expect(result.truckTemp).toBeNull();
    expect(result.productTemp).toBeNull();
    expect(result.productCondition).toBeNull();
    expect(result.truckCondition).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('returns all nulls for null input', () => {
    const result = parseGrvRemarks(null);
    expect(result.driverId).toBeNull();
    expect(result.licensePlate).toBeNull();
    expect(result.comments).toBeNull();
  });

  it('returns all nulls for empty string', () => {
    const result = parseGrvRemarks('');
    expect(result.driverId).toBeNull();
  });

  it('handles HTML entities and extra whitespace', () => {
    const html = '<p>Driver ID&nbsp;:&nbsp; Test &amp; Value </p>';
    const result = parseGrvRemarks(html);
    expect(result.driverId).toBe('Test & Value');
  });

  it('handles real UAT HTML structure', () => {
    // WHY: This matches the actual HTML from Priority UAT record GR26000488
    const uatHtml = `<style>.ExternalClass {width:100%;}.ExternalClass,.ExternalClass p,.ExternalClass span,.ExternalClass font,.ExternalClass td {line-height: 100%;}</style><p>Driver ID : Test line 1<br>Licence Plate : Test line 2</p><div>Truck Temp. &deg;F (dry if ambient) : Test line 3<br>Product Surface Temp. &deg;F : Test line 4</div><p>Condition of Product (accept/reject) : Test line 5<br>Condition of Truck (accept/reject) : Test line 6</p><p>Comments : Test line 7</p>`;
    const result = parseGrvRemarks(uatHtml);
    expect(result.driverId).toBe('Test line 1');
    expect(result.licensePlate).toBe('Test line 2');
    expect(result.truckTemp).toBe('Test line 3');
    expect(result.productTemp).toBe('Test line 4');
    expect(result.productCondition).toBe('Test line 5');
    expect(result.truckCondition).toBe('Test line 6');
    expect(result.comments).toBe('Test line 7');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/htmlParser.test.ts`
Expected: FAIL — `Cannot find module '../src/services/htmlParser'`

- [ ] **Step 3: Implement the parser**

Create `server/src/services/htmlParser.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/htmlParser.ts
// PURPOSE: Parses HTML remarks from Priority's DOCUMENTSTEXT_SUBFORM
//          into structured key-value fields for the GRV Log report.
//          Priority stores inspection data as styled HTML — this
//          strips tags and extracts known field names.
// USED BY: reports/grvLog.ts
// EXPORTS: parseGrvRemarks, GrvRemarkFields
// ═══════════════════════════════════════════════════════════════

export interface GrvRemarkFields {
  driverId: string | null;
  licensePlate: string | null;
  truckTemp: string | null;
  productTemp: string | null;
  productCondition: string | null;
  truckCondition: string | null;
  comments: string | null;
}

// WHY: Map from normalized key prefixes to output field names.
// Priority HTML uses verbose labels like "Truck Temp. °F (dry if ambient)".
// We match on the start of the key to handle minor label variations.
const FIELD_MAP: Array<{ prefix: string; field: keyof GrvRemarkFields }> = [
  { prefix: 'driver id', field: 'driverId' },
  { prefix: 'licence plate', field: 'licensePlate' },
  { prefix: 'truck temp', field: 'truckTemp' },
  { prefix: 'product surface temp', field: 'productTemp' },
  { prefix: 'condition of product', field: 'productCondition' },
  { prefix: 'condition of truck', field: 'truckCondition' },
  { prefix: 'comments', field: 'comments' },
];

const EMPTY_FIELDS: GrvRemarkFields = {
  driverId: null,
  licensePlate: null,
  truckTemp: null,
  productTemp: null,
  productCondition: null,
  truckCondition: null,
  comments: null,
};

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&deg;/gi, '°')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

export function parseGrvRemarks(html: string | null): GrvRemarkFields {
  if (!html || html.trim() === '') return { ...EMPTY_FIELDS };

  // Strip <style> blocks entirely
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Convert <br> to newlines before stripping tags
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = decodeEntities(text);

  const result: GrvRemarkFields = { ...EMPTY_FIELDS };

  const lines = text.split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const rawKey = line.slice(0, colonIdx).trim().toLowerCase();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (!rawKey || !rawValue) continue;

    for (const { prefix, field } of FIELD_MAP) {
      if (rawKey.startsWith(prefix)) {
        result[field] = rawValue;
        break;
      }
    }
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/htmlParser.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/htmlParser.ts server/tests/htmlParser.test.ts
git commit -m "feat: add GRV HTML remarks parser with unit tests"
```

---

### Task 5: Report Registry + GRV Log Definition

**Files:**
- Create: `server/src/config/reportRegistry.ts`
- Create: `server/src/reports/grvLog.ts`

- [ ] **Step 1: Create `server/src/config/reportRegistry.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/reportRegistry.ts
// PURPOSE: Code-defined report configs. Each report specifies its
//          Priority entity, columns, OData query builder, and row
//          transformer. Adding a report = one file + register here.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: ReportConfig, ReportFilters, reportRegistry, getReport
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';

export interface ReportFilters {
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportConfig {
  id: string;
  name: string;
  entity: string;
  columns: ColumnDefinition[];
  buildQuery: (filters: ReportFilters) => ODataParams;
  transformRow: (raw: Record<string, unknown>) => Record<string, unknown>;
}

export const reportRegistry = new Map<string, ReportConfig>();

export function getReport(id: string): ReportConfig | undefined {
  return reportRegistry.get(id);
}
```

- [ ] **Step 2: Create `server/src/reports/grvLog.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.ts
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P with
//          $expand=DOCUMENTSTEXT_SUBFORM, parses HTML remarks
//          into 7 structured inspection fields. 14 total columns.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { parseGrvRemarks } from '../services/htmlParser';

const columns: ColumnDefinition[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'docNo', label: 'GRV #', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'warehouse', label: 'Warehouse', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'total', label: 'Total', type: 'currency' },
  { key: 'driverId', label: 'Driver ID', type: 'string' },
  { key: 'licensePlate', label: 'License Plate', type: 'string' },
  { key: 'truckTemp', label: 'Truck Temp °F', type: 'string' },
  { key: 'productTemp', label: 'Product Temp °F', type: 'string' },
  { key: 'productCondition', label: 'Product Condition', type: 'string' },
  { key: 'truckCondition', label: 'Truck Condition', type: 'string' },
  { key: 'comments', label: 'Comments', type: 'string' },
  { key: 'receivedBy', label: 'Received By', type: 'string' },
];

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${filters.vendor}'`);
  if (filters.status) conditions.push(`STATDES eq '${filters.status}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    $select: 'DOCNO,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN',
    $expand: 'DOCUMENTSTEXT_SUBFORM',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
}

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  // WHY: DOCUMENTSTEXT_SUBFORM is a single-entity sub-form (object, not array).
  // If Priority returns an array, use the first element.
  let subform = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | undefined;
  if (Array.isArray(subform)) subform = subform[0];

  const htmlText = (subform?.TEXT as string) ?? null;
  const remarks = parseGrvRemarks(htmlText);

  return {
    date: raw.CURDATE,
    docNo: raw.DOCNO,
    vendor: raw.CDES,
    warehouse: raw.TOWARHSDES,
    status: raw.STATDES,
    total: raw.TOTPRICE,
    ...remarks,
    receivedBy: raw.OWNERLOGIN,
  };
}

// WHY: Self-registration — importing this file adds GRV Log to the registry.
// The reports route imports reportRegistry, which triggers this side effect.
reportRegistry.set('grv-log', {
  id: 'grv-log',
  name: 'GRV Log',
  entity: 'DOCUMENTS_P',
  columns,
  buildQuery,
  transformRow,
});
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/config/reportRegistry.ts server/src/reports/grvLog.ts
git commit -m "feat: add report registry + GRV Log report definition"
```

---

### Task 6: Update Cache Key + Reports Route

**Files:**
- Modify: `server/src/services/cache.ts`
- Modify: `server/src/routes/reports.ts`

- [ ] **Step 1: Update `buildCacheKey` in `server/src/services/cache.ts`**

Replace the existing `buildCacheKey` function signature and body:

Old:
```typescript
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 25}:${params.from ?? ''}:${params.to ?? ''}`;
}
```

New:
```typescript
export function buildCacheKey(
  reportId: string,
  params: { page?: number; pageSize?: number; from?: string; to?: string; vendor?: string; status?: string }
): string {
  return `report:${reportId}:p${params.page ?? 1}:s${params.pageSize ?? 25}:${params.from ?? ''}:${params.to ?? ''}:v${params.vendor ?? ''}:st${params.status ?? ''}`;
}
```

- [ ] **Step 2: Rewrite `server/src/routes/reports.ts`**

Replace the entire file to switch from mock data to the report registry + Priority client:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/reports.ts
// PURPOSE: Report data API endpoints. Fetches real Priority data
//          via the report registry. Each report defines its own
//          entity, query, and transform — this route orchestrates.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createReportsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import type { CacheProvider } from '../services/cache';
import { buildCacheKey } from '../services/cache';
import { getReport, reportRegistry } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { logApiCall } from '../services/logger';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

const QueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  // WHY: Default changed from 25 (Spec 01) to 50 — matches frontend ReportTableWidget default
  pageSize: z.coerce.number().min(1).max(1000).default(50),
  from: z.string().optional(),
  to: z.string().optional(),
  // WHY: Regex prevents OData injection — only alphanumeric, dash, underscore allowed
  vendor: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  status: z.string().regex(/^[a-zA-Z0-9_ -]+$/).optional(),
});

export function createReportsRouter(cache: CacheProvider): Router {
  const router = Router();

  // GET /list — returns array of available report IDs + names
  router.get('/list', (_req, res) => {
    const reports = Array.from(reportRegistry.entries()).map(([id, config]) => ({
      id,
      name: config.name,
    }));
    res.json({ reports });
  });

  // GET /:reportId — returns ApiResponse with real Priority data
  router.get('/:reportId', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    // Check cache
    const cached = await cache.get<ApiResponse>(cacheKey);
    if (cached) {
      logApiCall({
        level: 'info', event: 'report_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
      });
      res.json(cached);
      return;
    }

    // Fetch from Priority
    let priorityData;
    try {
      const oDataParams = report.buildQuery(params);
      priorityData = await queryPriority(report.entity, oDataParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[reports] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }
    const rows = priorityData.value.map(report.transformRow);

    // WHY: Priority may not support $count=true. Estimate totalCount:
    // if fewer rows than pageSize, we're on the last page.
    const pageSize = params.pageSize;
    const isLastPage = rows.length < pageSize;
    const totalCount = isLastPage
      ? (params.page - 1) * pageSize + rows.length
      : (params.page - 1) * pageSize + rows.length + 1;

    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
      },
      data: rows,
      pagination: {
        page: params.page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      columns: report.columns,
    };

    // WHY: Fire-and-forget cache write — never block response on cache failure
    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'report_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
    });

    res.json(response);
  });

  // POST /:reportId/refresh — invalidates cache
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    await cache.invalidate(cacheKey);
    res.json({ message: `Cache invalidated for ${reportId}` });
  });

  return router;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/services/cache.ts server/src/routes/reports.ts
git commit -m "feat: replace mock data with Priority API client in reports route"
```

---

### Task 7: Filters Endpoint

**Files:**
- Create: `server/src/routes/filters.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create `server/src/routes/filters.ts`**

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Vendors are fetched from Priority and deduplicated.
//          Statuses are hardcoded (small known set).
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createFiltersRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { queryPriority } from '../services/priorityClient';
import { getReport } from '../config/reportRegistry';
import type { FiltersResponse, FilterOption } from '@shared/types';

// WHY: No need to import grvLog here — reports.ts already does it,
// and Node's module cache ensures it runs only once.

export function createFiltersRouter(cache: CacheProvider): Router {
  const router = Router();

  router.get('/:reportId/filters', async (req, res) => {
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    const cacheKey = `filters:${reportId}`;
    const cached = await cache.get<FiltersResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Fetch distinct vendors from Priority
    // WHY: $top=1000 fetches up to 1000 documents to extract unique vendors.
    // For large datasets, not all vendors may be returned. Acceptable for v1.
    let vendorData;
    try {
      vendorData = await queryPriority(report.entity, {
        $select: 'SUPNAME,CDES',
        $orderby: 'CDES',
        $top: 1000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[filters] Priority fetch failed: ${message}`);
      res.status(502).json({ error: `Failed to fetch filters: ${message}` });
      return;
    }

    // WHY: Deduplicate by SUPNAME — Priority may return duplicates across pages
    const vendorMap = new Map<string, string>();
    for (const row of vendorData.value) {
      const code = row.SUPNAME as string;
      const name = row.CDES as string;
      if (code && name && !vendorMap.has(code)) {
        vendorMap.set(code, name);
      }
    }

    const vendors: FilterOption[] = Array.from(vendorMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const statuses: FilterOption[] = [
      { value: 'Received', label: 'Received' },
      { value: 'Cancelled', label: 'Cancelled' },
    ];

    const response: FiltersResponse = {
      meta: {
        reportId,
        generatedAt: new Date().toISOString(),
      },
      filters: { vendors, statuses },
    };

    // WHY: Cache filter options for 5 min — they change infrequently
    cache.set(cacheKey, response, 300).catch(() => {});

    res.json(response);
  });

  return router;
}
```

- [ ] **Step 2: Mount filters router in `server/src/index.ts`**

Add import after the existing route imports:

```typescript
import { createFiltersRouter } from './routes/filters';
```

Add mount after the existing route mounts (before the production static file section):

```typescript
app.use('/api/v1/reports', createFiltersRouter(cache));
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/filters.ts server/src/index.ts
git commit -m "feat: add filters endpoint for report dropdown population"
```

---

### Task 8: Delete Mock Data + Run All Tests

**Files:**
- Delete: `server/src/services/mockData.ts`

- [ ] **Step 1: Verify no remaining imports of mockData**

Run: `grep -r "mockData" server/src/`
Expected: No results (the reports.ts rewrite in Task 6 removed the import)

- [ ] **Step 2: Delete `server/src/services/mockData.ts`**

```bash
rm server/src/services/mockData.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `cd server && npx vitest run`
Expected: All tests pass (health test + htmlParser tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete mock data service — all reports now use Priority API"
```

---

### Task 9: Manual Smoke Test Against Priority UAT

This task requires real Priority credentials in `.env`. Skip if credentials are not configured.

- [ ] **Step 1: Start the server**

Run: `cd server && npm run dev`
Expected: Server starts on port 3001

- [ ] **Step 2: Test GRV Log endpoint**

Run: `curl -s http://localhost:3001/api/v1/reports/grv-log | head -c 500`
Expected: JSON response with `meta.source: "priority-odata"`, `data` array with GRV records, 14 columns

- [ ] **Step 3: Test with filters**

Run: `curl -s "http://localhost:3001/api/v1/reports/grv-log?from=2026-03-01&to=2026-03-20" | head -c 500`
Expected: Filtered results within date range

- [ ] **Step 4: Test filters endpoint**

Run: `curl -s http://localhost:3001/api/v1/reports/grv-log/filters`
Expected: JSON with `filters.vendors` (array of `{value, label}`) and `filters.statuses`

- [ ] **Step 5: Test health endpoint still works**

Run: `curl -s http://localhost:3001/api/v1/health`
Expected: `{"status":"ok",...}`

- [ ] **Step 6: Test report list endpoint**

Run: `curl -s http://localhost:3001/api/v1/reports/list`
Expected: `{"reports":[{"id":"grv-log","name":"GRV Log"}]}`

---

### Task 10: Airtable Status Update

Use the `/airtable-api` skill for API patterns. This is the final task — only run after everything passes.

- [ ] **Step 1: Update record fields**

Use `PATCH` to update record `recJluOijRUZcZnBS` in table `tblvqv3S31KQhKRU6` in base `appjwOgR4HsXeGIda`:
- Field `fldAAdwPBUQBRQet7` (Claude Status) → `"Backend Built"`
- Field `fld1cKObhpMuz3VYq` (Claude Comments) → `"Priority API client with UAT/Prod switching. HTML parser extracts 7 inspection fields from DOCUMENTSTEXT_SUBFORM. Report registry pattern. Filters endpoint. 6 HTML parser unit tests."`

**NEVER modify `fld88uqAVUuDWUaBQ` (Victor Status) or `fldfGYjvGFcxvGC1K` (Victor Comments).**

- [ ] **Step 2: Add record comment**

`POST /v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6/recJluOijRUZcZnBS/comments`

Body: `{"text": "2026-03-20: Backend endpoint built. Priority entity: DOCUMENTS_P with $expand=DOCUMENTSTEXT_SUBFORM. HTML parser extracts 7 inspection fields. Filters: date range, vendor, status. Cache keys include all filter params. Updated by Claude Code."}`
