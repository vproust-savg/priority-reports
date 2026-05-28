# Customer Returns Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Customer Returns" tab under Food Safety that pulls returns from Priority's `DOCUMENTS_N` entity, parses HTML remarks into 4 structured fields, and lets users download per-row attachments from `EXTFILES_SUBFORM`.

**Architecture:** New report registers itself in `reportRegistry` (mirroring `grv-log`) and is served by the existing `/api/v1/reports/:reportId` endpoint. A new `/api/v1/attachments/:entity/:docNo/:type/:filename` endpoint proxies file bytes from Priority on demand. The frontend gets one new page entry in `pages.ts` (auto-creates the tab and route) and one new cell component for the paperclip-download UI. No changes to the existing GRV Log report.

**Tech Stack:** Express + TypeScript (server), React 19 + Vite + Tailwind v4 (client), Vitest (both), TanStack Query v5, Zod, Priority OData REST API.

**Spec:** see `/Users/victorproust/.claude/plans/we-want-to-create-valiant-blanket.md` (sections: Context, Final Design, TDD Test List, Files to Create/Modify, Pre-Implementation Verification, End-to-End Verification, Out of Scope).

---

## Task 0 Findings (executed 2026-05-27 — overrides original assumptions)

The pre-flight Priority API checks (Task 0) discovered the EXTFILES schema differs from the plan's original assumptions. **All later tasks (especially 4, 5, 6, 8) must use the corrected field names below — not the original `FILENAME`/`EXTFILENAME` assumption.**

**DOCUMENTS_N composite key:** `DOCNO` + `TYPE` ✓ confirmed.
**Subforms present:** `DOCUMENTSTEXT_SUBFORM` (single-entity, HTML remarks) AND `EXTFILES_SUBFORM` (collection, attachments) ✓ confirmed.
**TYPE filter:** Not needed — all sampled rows are `TYPE='N'`. Doc number prefix is `RT` (e.g., `RT26000014`). `IVNUM` is often null on returns; UI should render `null` as empty/em-dash.

**EXTFILES_SUBFORM fields (CORRECTED):**

| Field | Type | What it actually is |
|---|---|---|
| `EXTFILEDES` | string (32 char) | **Filename label** (often truncated by Priority — e.g. "Screen Shot 2026-05-13 at 12.47.") |
| `EXTFILENUM` | integer | **Attachment number** — unique key within the document, used for direct integer-key subform access (Pattern B) |
| `SUFFIX` | string (4 char) | File extension (e.g. `"png"`, `"pdf"`) |
| `EXTFILENAME` | string (80 char per metadata, in practice unlimited) | **Base64 data URI of the file bytes** — e.g. `"data:image/png;base64,..."`. The metadata description says "File Path" but the actual content is the binary payload. |
| `FILESIZE` | int (read-only) | Size in bytes |
| `CURDATE` | datetime | Creation date |

**Display filename = `EXTFILEDES + "." + SUFFIX`** — e.g., `"Photo of Bag" + "." + "png" = "Photo of Bag.png"`.

**Direct integer-key access works (Pattern B):**

```
GET /DOCUMENTS_N(DOCNO='RT26000013',TYPE='N')/EXTFILES_SUBFORM(1)?$select=EXTFILENAME
→ 200 with the single attachment's data URI
```

This is more efficient than `$filter=EXTFILEDES eq '...'` — use it in the attachment download route.

### Concrete overrides per task

- **Task 4 (transformRow):** The `attachments` array element shape is `{ num: number; filename: string; sizeBytes?: number }` — NOT `{ filename: string }`. Compute `filename = EXTFILEDES + '.' + SUFFIX`. Keep `num` (the integer `EXTFILENUM`) so the frontend can build the download URL.
- **Task 5 (enrichRows):** The EXTFILES metadata fetch must use `$select=EXTFILEDES,EXTFILENUM,SUFFIX,FILESIZE` (NOT `$select=FILENAME`).
- **Task 6 (attachments route):** URL becomes `/api/v1/attachments/:entity/:docNo/:type/:extfilenum`. The `:extfilenum` param is a positive integer (`/^\d+$/`), NOT a filename. The route fetches via integer-key subform path `DOCUMENTS_N(DOCNO='X',TYPE='Y')/EXTFILES_SUBFORM(N)?$select=EXTFILEDES,SUFFIX,EXTFILENAME` and derives `filename = EXTFILEDES + '.' + SUFFIX` for the Content-Disposition header. Decode the base64 from `EXTFILENAME` field.
- **Task 8 (AttachmentsCell):** Props receive `value: Array<{ num: number; filename: string }> | null`. The download URL is `/api/v1/attachments/DOCUMENTS_N/${docNo}/${type}/${num}` (integer at the end). Display text is `filename`.
- **Task 9 (widget integration):** The renderer passes `row.docNo` and `row.type` through to `AttachmentsCell` as before.

### Sample data used for verification
- DOCNO `RT26000013`, TYPE `N`, Customer `C7835` (Proper Hotel - DTLA), CURDATE 2026-05-19 — has 2 attachments (EXTFILENUM 1 "Photo of Bag.png", EXTFILENUM 2 "Screen Shot 2026-05-13 at 12.47.png").
- Use this row for backend smoke tests in Task 11.

---

## Pre-flight (NOT TDD-gated — investigation only, before any code)

### Task 0: Verify DOCUMENTS_N shape against Priority

**Why:** Three assumptions in the spec must be confirmed before writing tests with concrete shapes. If any differ, update the spec and re-derive the tests.

**Files:** none — pure investigation. Output goes to scratchpad notes.

- [ ] **Step 1: Fetch DOCUMENTS_N metadata**

Run (replace `<API_URL>` with the value from `.env.local` `PRIORITY_API_URL`, and use the basic-auth creds from the same file):

```bash
curl -u "$PRIORITY_USER:$PRIORITY_PASS" \
  -H 'IEEE754Compatible: true' \
  -H 'Content-Type: application/json' \
  "$PRIORITY_API_URL/GetMetadataFor(entity='DOCUMENTS_N')"
```

Expected (confirm before continuing):
- The entity's key set lists `DOCNO` AND `TYPE`.
- Navigation properties include both `DOCUMENTSTEXT_SUBFORM` and `EXTFILES_SUBFORM`.

If either subform name differs, edit `specs/plan-13-customer-returns.md` (this file) AND `specs/spec-13-customer-returns.md` (if you copy the spec) before continuing.

- [ ] **Step 2: Fetch a sample DOCUMENTS_N row to see TYPE values**

```bash
curl -u "$PRIORITY_USER:$PRIORITY_PASS" \
  -H 'IEEE754Compatible: true' \
  "$PRIORITY_API_URL/DOCUMENTS_N?\$select=DOCNO,TYPE,CDES,CURDATE,CUSTNAME,IVNUM&\$top=10&\$orderby=CURDATE%20desc"
```

Expected: rows with `TYPE` values. If all sampled rows share one TYPE value (e.g., `'CR'` or `'N'`), no TYPE filter needed. If TYPE varies and only some types are "customer returns", note the correct TYPE value(s) — the `buildQuery` task will need a TYPE filter.

- [ ] **Step 3: Fetch one EXTFILES_SUBFORM to confirm field names**

Pick a `DOCNO` and `TYPE` from Step 2 that has attachments (try a few if needed):

```bash
curl -u "$PRIORITY_USER:$PRIORITY_PASS" \
  -H 'IEEE754Compatible: true' \
  "$PRIORITY_API_URL/DOCUMENTS_N(DOCNO='<DOCNO>',TYPE='<TYPE>')/EXTFILES_SUBFORM"
```

Confirm the exact field names. The spec assumes `FILENAME` and `EXTFILENAME`. If different (e.g., `EXT_FILENAME`, `FILE_DATA`), record the actual names — the tests in Suites 2, 3, and 5 must use them.

- [ ] **Step 4: Confirm metadata-only $select works on the subform**

```bash
curl -u "$PRIORITY_USER:$PRIORITY_PASS" \
  -H 'IEEE754Compatible: true' \
  "$PRIORITY_API_URL/DOCUMENTS_N(DOCNO='<DOCNO>',TYPE='<TYPE>')/EXTFILES_SUBFORM?\$select=FILENAME"
```

Expected: response contains only filenames (no base64 binary). If `$select` is ignored and binaries come back anyway, escalate — the design needs revising (the metadata fetch on every page load would be too heavy).

- [ ] **Step 5: Record findings**

Append a short note to the top of this plan listing: confirmed subform names, confirmed field names, TYPE filter required (yes/no, and which value). Then proceed to Task 1.

---

## Implementation Tasks (each task is RED → GREEN → COMMIT)

> **TDD discipline:** Every production line is preceded by a failing test that was *observed* failing for the correct reason (missing module / function / mismatched value). If a test passes immediately after writing, delete it and rewrite from the wished-for API — passing-immediately proves nothing.

### Task 1: Extend `querySubform` to accept an optional `$select`

**Why:** The existing `querySubform(entity, keyParts, subformName)` does not support `$select`. The Customer Returns enrichRows needs metadata-only EXTFILES fetches (filename only, no base64 binary). This is an additive backwards-compatible change: existing GRV Log calls keep working unchanged.

**Files:**
- Modify: `server/src/services/priorityClient.ts` (around line 77)
- Test: `server/tests/querySubformSelect.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Create `server/tests/querySubformSelect.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/querySubformSelect.test.ts
// PURPOSE: Verify querySubform forwards optional $select to the URL.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

// WHY: Stub the HTTP layer. We test URL composition, not network.
const fetchSpy = vi.fn();
vi.mock('../src/services/fetchWithRetry', () => ({
  fetchWithRetry: (...args: unknown[]) => fetchSpy(...args),
}));

// WHY: Provide minimal Priority config so getPriorityConfig() returns synchronously.
vi.mock('../src/config/environment', () => ({
  env: {
    PRIORITY_API_URL: 'https://example.test/odata/Priority/tabc.ini/co/',
    PRIORITY_USER: 'u',
    PRIORITY_PASS: 'p',
    NODE_ENV: 'test',
  },
}));

import { querySubform } from '../src/services/priorityClient';

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue({ status: 200, body: JSON.stringify({ value: [] }) });
});

describe('querySubform with optional $select', () => {
  it('omits $select when not provided', async () => {
    await querySubform('DOCUMENTS_N', { DOCNO: 'X', TYPE: 'Y' }, 'EXTFILES_SUBFORM');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe(
      "https://example.test/odata/Priority/tabc.ini/co/DOCUMENTS_N(DOCNO='X',TYPE='Y')/EXTFILES_SUBFORM",
    );
  });

  it('appends $select when provided', async () => {
    await querySubform(
      'DOCUMENTS_N',
      { DOCNO: 'X', TYPE: 'Y' },
      'EXTFILES_SUBFORM',
      { select: 'FILENAME' },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe(
      "https://example.test/odata/Priority/tabc.ini/co/DOCUMENTS_N(DOCNO='X',TYPE='Y')/EXTFILES_SUBFORM?$select=FILENAME",
    );
  });

  it('still escapes single quotes in key values', async () => {
    await querySubform(
      'DOCUMENTS_N',
      { DOCNO: "A'B", TYPE: 'CR' },
      'EXTFILES_SUBFORM',
      { select: 'FILENAME' },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("DOCNO='A''B'");
    expect(url).toContain('?$select=FILENAME');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd server && npm test -- querySubformSelect.test
```

Expected: FAIL — either `select` argument is not accepted (TypeScript error) or the URL does not contain `?$select=`.

> If the actual `fetchWithRetry` module path differs (e.g., it's exported from a different file), adjust the `vi.mock` path. The test must mock at the boundary `querySubform` actually calls. Inspect `server/src/services/priorityClient.ts` to find it; if `fetchWithRetry` is defined inline in `priorityClient.ts`, mock `priorityClient` itself instead with a partial mock that preserves `querySubform` and overrides the lower-level function.

- [ ] **Step 3: Implement the change**

In `server/src/services/priorityClient.ts`, edit the `querySubform` signature and body (around lines 77-90):

```typescript
export async function querySubform(
  entity: string,
  keyParts: Record<string, string>,
  subformName: string,
  options: { select?: string } = {},
): Promise<Record<string, unknown> | null> {
  const config = getPriorityConfig();
  const keyStr = Object.entries(keyParts)
    .map(([k, v]) => `${k}='${v.replace(/'/g, "''")}'`)
    .join(',');
  let url = `${config.baseUrl}${entity}(${keyStr})/${subformName}`;
  // WHY: Some sub-forms (EXTFILES_SUBFORM) return heavy binary fields by default.
  // The $select limits the payload to metadata when callers only need filenames.
  if (options.select) {
    url += `?$select=${options.select}`;
  }

  const response = await fetchWithRetry(url);
  // ...rest of the function unchanged
```

Also update the JSDoc/intent comment at the top of the file's `EXPORTS` line if needed.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd server && npm test -- querySubformSelect.test
```

Expected: all 3 tests PASS. Also run the full suite to confirm no regression:

```bash
cd server && npm test
```

Expected: every existing test still passes (especially `grvLogReport.test.ts` which uses `querySubform`).

- [ ] **Step 5: Commit**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports"
git add server/src/services/priorityClient.ts server/tests/querySubformSelect.test.ts
git commit -m "feat(priority-client): add optional \$select to querySubform"
```

---

### Task 2: Customer Returns HTML Remarks Parser

**Why:** Parse Priority's HTML remarks blob into 4 structured fields (`requestedBy`, `requestMethod`, `returnDetails`, `foodSafetyConcern`). Mirrors `htmlParser.ts` exactly — same cleaning pipeline, different `FIELD_MAP` and exported type.

**Files:**
- Create: `server/src/services/customerReturnsParser.ts`
- Test: `server/tests/customerReturnsParser.test.ts`

- [ ] **Step 1: Write all 11 failing tests**

Create `server/tests/customerReturnsParser.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsParser.test.ts
// PURPOSE: Unit tests for Customer Returns HTML remarks parser.
//          Mirrors htmlParser.test.ts structure.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { parseCustomerReturnsRemarks } from '../src/services/customerReturnsParser';

const FULL_HTML = `
<style>.ExternalClass{width:100%}</style>
<p>Requested By : Jean<br>
Request Method (Email, Phone, Text) : Email</p>
<p>Return Details : cheese is moldy<br>
Food Safety Concern (Yes/No) : No</p>
`;

describe('parseCustomerReturnsRemarks', () => {
  it('extracts all 4 fields from full HTML', () => {
    const r = parseCustomerReturnsRemarks(FULL_HTML);
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
    expect(r.returnDetails).toBe('cheese is moldy');
    expect(r.foodSafetyConcern).toBe('No');
  });

  it('returns nulls for missing fields', () => {
    const r = parseCustomerReturnsRemarks('<p>Requested By : Jean</p>');
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
  });

  it('returns all nulls for null input', () => {
    const r = parseCustomerReturnsRemarks(null);
    expect(r.requestedBy).toBeNull();
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
  });

  it('returns all nulls for empty string', () => {
    expect(parseCustomerReturnsRemarks('').requestedBy).toBeNull();
  });

  it('returns all nulls for whitespace-only string', () => {
    expect(parseCustomerReturnsRemarks('   \n  ').requestedBy).toBeNull();
  });

  it('decodes HTML entities and trims whitespace', () => {
    const html = '<p>Requested By&nbsp;:&nbsp; Jean &amp; Co </p>';
    expect(parseCustomerReturnsRemarks(html).requestedBy).toBe('Jean & Co');
  });

  it('handles <br> tags with data attributes', () => {
    const html = 'Requested By : Jean<br data-foo="x">Request Method : Email';
    const r = parseCustomerReturnsRemarks(html);
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
  });

  it('ignores lines without colons', () => {
    const html = '<p>No colon here</p><p>Requested By : Jean</p>';
    expect(parseCustomerReturnsRemarks(html).requestedBy).toBe('Jean');
  });

  it('handles colons inside values', () => {
    const html = '<p>Return Details : Item received at 10:30 AM; moldy</p>';
    expect(parseCustomerReturnsRemarks(html).returnDetails).toBe(
      'Item received at 10:30 AM; moldy',
    );
  });

  it('case-insensitive prefix matching', () => {
    expect(parseCustomerReturnsRemarks('<p>REQUESTED BY : Jean</p>').requestedBy).toBe('Jean');
    expect(parseCustomerReturnsRemarks('<p>requested by : Jean</p>').requestedBy).toBe('Jean');
  });

  it('Food Safety Concern Yes/No values pass through unchanged', () => {
    expect(parseCustomerReturnsRemarks('<p>Food Safety Concern (Yes/No) : Yes</p>').foodSafetyConcern).toBe('Yes');
    expect(parseCustomerReturnsRemarks('<p>Food Safety Concern (Yes/No) : No</p>').foodSafetyConcern).toBe('No');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd server && npm test -- customerReturnsParser.test
```

Expected: ALL FAIL with "Cannot find module '../src/services/customerReturnsParser'".

- [ ] **Step 3: Implement the parser**

Create `server/src/services/customerReturnsParser.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/customerReturnsParser.ts
// PURPOSE: Parses HTML remarks from Priority's DOCUMENTSTEXT_SUBFORM
//          on DOCUMENTS_N into 4 structured Customer Returns fields.
//          Mirrors htmlParser.ts (GRV) — same cleaning pipeline,
//          different FIELD_MAP.
// USED BY: reports/customerReturns.ts
// EXPORTS: parseCustomerReturnsRemarks, CustomerReturnsRemarkFields
// ═══════════════════════════════════════════════════════════════

export interface CustomerReturnsRemarkFields {
  requestedBy: string | null;
  requestMethod: string | null;
  returnDetails: string | null;
  foodSafetyConcern: string | null;
}

// WHY: Match on lowercase prefix to handle label variations and
// inconsistent casing typed by Priority users.
const FIELD_MAP: Array<{ prefix: string; field: keyof CustomerReturnsRemarkFields }> = [
  { prefix: 'requested by', field: 'requestedBy' },
  { prefix: 'request method', field: 'requestMethod' },
  { prefix: 'return details', field: 'returnDetails' },
  { prefix: 'food safety concern', field: 'foodSafetyConcern' },
];

const EMPTY_FIELDS: CustomerReturnsRemarkFields = {
  requestedBy: null,
  requestMethod: null,
  returnDetails: null,
  foodSafetyConcern: null,
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

export function parseCustomerReturnsRemarks(html: string | null): CustomerReturnsRemarkFields {
  if (!html || html.trim() === '') return { ...EMPTY_FIELDS };

  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<br[^>]*\/?>/gi, '\n');
  text = text.replace(/<\/?(p|div)\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  const result: CustomerReturnsRemarkFields = { ...EMPTY_FIELDS };

  for (const line of text.split('\n')) {
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

- [ ] **Step 4: Run tests to verify pass**

```bash
cd server && npm test -- customerReturnsParser.test
```

Expected: ALL 11 PASS.

- [ ] **Step 5: Commit**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports"
git add server/src/services/customerReturnsParser.ts server/tests/customerReturnsParser.test.ts
git commit -m "feat(customer-returns): add HTML remarks parser"
```

---

### Task 3: `buildQuery`, columns, filterColumns (Customer Returns report file — partial)

**Why:** Lock the OData query shape and column metadata. This task creates the report file with column definitions and a stub that registers under the registry — so later tasks (transformRow, enrichRows) can extend it. The transform and enrich functions are no-ops for now; tests in this task only exercise `buildQuery` and the columns array.

**Files:**
- Create: `server/src/reports/customerReturns.ts` (initial — buildQuery + columns + stub registration only)
- Test: `server/tests/customerReturnsBuildQuery.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/customerReturnsBuildQuery.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsBuildQuery.test.ts
// PURPOSE: Unit tests for Customer Returns OData query builder
//          and column definitions.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

// WHY: Side-effect import — registers customer-returns into reportRegistry.
import '../src/reports/customerReturns';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('customer-returns')!;

describe('Customer Returns buildQuery', () => {
  it('$select includes composite key + 4 user fields', () => {
    const q = report.buildQuery({});
    expect(q.$select).toBe('DOCNO,TYPE,CURDATE,CUSTNAME,CDES,IVNUM');
  });

  it('applies CURDATE ge/le when from and to provided', () => {
    const q = report.buildQuery({ from: '2026-05-01', to: '2026-05-27' });
    expect(q.$filter).toContain('CURDATE ge 2026-05-01T00:00:00Z');
    expect(q.$filter).toContain('CURDATE le 2026-05-27T23:59:59Z');
    expect(q.$filter).toContain(' and ');
  });

  it('omits $filter when no filters provided', () => {
    expect(report.buildQuery({}).$filter).toBeUndefined();
  });

  it('escapes single quotes in customer filter', () => {
    // WHY: Reports route may pass a customer filter — must be safe against OData injection.
    const q = report.buildQuery({ vendor: "OBrien" });
    // Customer Returns uses CUSTNAME (not SUPNAME) — but the route's filter keys
    // are shared. The report should NOT crash; either ignores or applies safely.
    // Assert: if applied, it goes through escapeODataString (doubles quotes).
    if (q.$filter) {
      expect(q.$filter).not.toMatch(/[^']'[^']/); // no unescaped single quotes
    }
  });

  it('pagination: $top and $skip respect page/pageSize', () => {
    const q = report.buildQuery({ page: 3, pageSize: 25 });
    expect(q.$top).toBe(25);
    expect(q.$skip).toBe(50);
  });

  it('defaults to page=1, pageSize=50', () => {
    const q = report.buildQuery({});
    expect(q.$top).toBe(50);
    expect(q.$skip).toBe(0);
  });

  it('$orderby is CURDATE desc', () => {
    expect(report.buildQuery({}).$orderby).toBe('CURDATE desc');
  });
});

describe('Customer Returns columns', () => {
  it('has exactly 10 columns with expected keys in order', () => {
    expect(report.columns.map((c) => c.key)).toEqual([
      'date',
      'docNo',
      'customerId',
      'customerName',
      'invoiceNum',
      'requestedBy',
      'requestMethod',
      'returnDetails',
      'foodSafetyConcern',
      'attachments',
    ]);
  });

  it('docNo, customerId, invoiceNum are copyable', () => {
    const c = (key: string) => report.columns.find((x) => x.key === key)!;
    expect(c('docNo').copyable).toBe(true);
    expect(c('customerId').copyable).toBe(true);
    expect(c('invoiceNum').copyable).toBe(true);
  });

  it('attachments column is NOT in filterColumns', () => {
    expect(report.filterColumns.find((f) => f.key === 'attachments')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd server && npm test -- customerReturnsBuildQuery.test
```

Expected: ALL FAIL with "Cannot find module '../src/reports/customerReturns'".

- [ ] **Step 3: Implement buildQuery + columns + stub registration**

Create `server/src/reports/customerReturns.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/customerReturns.ts
// PURPOSE: Customer Returns report. Queries DOCUMENTS_N, fetches
//          DOCUMENTSTEXT_SUBFORM (remarks) AND EXTFILES_SUBFORM
//          (attachment metadata) per row. Parses HTML remarks into
//          4 structured fields. Exposes attachments as a metadata
//          list — file bytes are fetched on-demand via the
//          /api/v1/attachments route.
// USED BY: routes/reports.ts (side-effect import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { escapeODataString } from '../services/odataFilterBuilder';

const columns: ColumnDefinition[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'docNo', label: 'Doc #', type: 'string', copyable: true },
  { key: 'customerId', label: 'Customer ID', type: 'string', copyable: true },
  { key: 'customerName', label: 'Customer Name', type: 'string' },
  { key: 'invoiceNum', label: 'Invoice #', type: 'string', copyable: true },
  { key: 'requestedBy', label: 'Requested By', type: 'string' },
  { key: 'requestMethod', label: 'Request Method', type: 'string' },
  { key: 'returnDetails', label: 'Return Details', type: 'string' },
  { key: 'foodSafetyConcern', label: 'Food Safety Concern', type: 'string' },
  { key: 'attachments', label: 'Attachments', type: 'string' },
];

const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'docNo', label: 'Doc #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'customerId', label: 'Customer ID', filterType: 'enum', filterLocation: 'server', odataField: 'CUSTNAME', enumKey: 'customers' },
  { key: 'customerName', label: 'Customer Name', filterType: 'text', filterLocation: 'server', odataField: 'CDES' },
  { key: 'invoiceNum', label: 'Invoice #', filterType: 'text', filterLocation: 'server', odataField: 'IVNUM' },
  { key: 'requestedBy', label: 'Requested By', filterType: 'text', filterLocation: 'client' },
  { key: 'requestMethod', label: 'Request Method', filterType: 'text', filterLocation: 'client' },
  { key: 'returnDetails', label: 'Return Details', filterType: 'text', filterLocation: 'client' },
  { key: 'foodSafetyConcern', label: 'Food Safety Concern', filterType: 'text', filterLocation: 'client' },
];

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  // WHY: The reports route exposes a generic 'vendor' query param — in this report
  // it filters by CUSTNAME (customer code). Escape via the shared OData helper.
  if (filters.vendor) conditions.push(`CUSTNAME eq '${escapeODataString(filters.vendor)}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    // WHY: TYPE in $select so we can fetch DOCUMENTSTEXT_SUBFORM and
    // EXTFILES_SUBFORM via the (DOCNO='...',TYPE='...') composite key.
    $select: 'DOCNO,TYPE,CURDATE,CUSTNAME,CDES,IVNUM',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
}

// WHY: transformRow + enrichRows arrive in Tasks 4 and 5.
// Stub them here so tests in this task can register the report
// and inspect columns/buildQuery. transformRow returns the raw row
// shape; enrichRows is a no-op pass-through.
reportRegistry.set('customer-returns', {
  id: 'customer-returns',
  name: 'Customer Returns',
  entity: 'DOCUMENTS_N',
  disableCache: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow: (raw) => raw,
  enrichRows: async (rows) => rows,
  clearMemoryCache: () => {},
});
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd server && npm test -- customerReturnsBuildQuery.test
```

Expected: ALL 10 PASS.

> If `ReportFilters` does not include a `vendor` field, drop that condition for now — it's optional and the route accepts `vendor` as a generic filter. The other tests will still pass.

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/customerReturns.ts server/tests/customerReturnsBuildQuery.test.ts
git commit -m "feat(customer-returns): add buildQuery, columns, stub registration"
```

---

### Task 4: `transformRow` (parses remarks + shapes attachments)

**Why:** Convert each raw Priority row (with subform attachments) into the 10-field shape the frontend table consumes. Uses the parser from Task 2.

**Files:**
- Modify: `server/src/reports/customerReturns.ts` (replace `transformRow` stub)
- Test: `server/tests/customerReturnsTransformRow.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/customerReturnsTransformRow.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsTransformRow.test.ts
// PURPOSE: Tests Customer Returns transformRow under all subform shapes.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';

import '../src/reports/customerReturns';
import { getReport } from '../src/config/reportRegistry';

const report = getReport('customer-returns')!;
const t = report.transformRow;

const FULL_ROW = {
  DOCNO: 'CR26000050',
  TYPE: 'CR',
  CURDATE: '2026-05-12T00:00:00Z',
  CUSTNAME: 'C00042',
  CDES: 'Acme Restaurant',
  IVNUM: 'INV-2026-0099',
  DOCUMENTSTEXT_SUBFORM: {
    TEXT: '<p>Requested By : Jean<br>Request Method (Email, Phone, Text) : Email</p><p>Return Details : cheese is moldy<br>Food Safety Concern (Yes/No) : No</p>',
  },
  EXTFILES_SUBFORM: {
    value: [
      { FILENAME: 'invoice.pdf' },
      { FILENAME: 'photo.jpg' },
    ],
  },
};

describe('Customer Returns transformRow', () => {
  it('extracts all 10 fields from row with complete subforms', () => {
    const r = t(FULL_ROW);
    expect(r.date).toBe('2026-05-12T00:00:00Z');
    expect(r.docNo).toBe('CR26000050');
    expect(r.customerId).toBe('C00042');
    expect(r.customerName).toBe('Acme Restaurant');
    expect(r.invoiceNum).toBe('INV-2026-0099');
    expect(r.requestedBy).toBe('Jean');
    expect(r.requestMethod).toBe('Email');
    expect(r.returnDetails).toBe('cheese is moldy');
    expect(r.foodSafetyConcern).toBe('No');
    expect(r.attachments).toEqual([
      { filename: 'invoice.pdf' },
      { filename: 'photo.jpg' },
    ]);
  });

  it('attachments empty array when EXTFILES_SUBFORM is null', () => {
    const r = t({ ...FULL_ROW, EXTFILES_SUBFORM: null });
    expect(r.attachments).toEqual([]);
  });

  it('attachments empty array when EXTFILES_SUBFORM.value is empty', () => {
    const r = t({ ...FULL_ROW, EXTFILES_SUBFORM: { value: [] } });
    expect(r.attachments).toEqual([]);
  });

  it('remarks null when DOCUMENTSTEXT_SUBFORM is null', () => {
    const r = t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: null });
    expect(r.requestedBy).toBeNull();
    expect(r.requestMethod).toBeNull();
    expect(r.returnDetails).toBeNull();
    expect(r.foodSafetyConcern).toBeNull();
    expect(r.docNo).toBe('CR26000050');
    expect(r.customerName).toBe('Acme Restaurant');
    expect(r.attachments).toEqual([
      { filename: 'invoice.pdf' },
      { filename: 'photo.jpg' },
    ]);
  });

  it('remarks null when DOCUMENTSTEXT_SUBFORM.TEXT is null or empty', () => {
    expect(t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: null } }).requestedBy).toBeNull();
    expect(t({ ...FULL_ROW, DOCUMENTSTEXT_SUBFORM: { TEXT: '' } }).requestedBy).toBeNull();
  });

  it('handles missing subform properties without throwing', () => {
    const { DOCUMENTSTEXT_SUBFORM: _d, EXTFILES_SUBFORM: _e, ...bare } = FULL_ROW;
    const r = t(bare);
    expect(r.requestedBy).toBeNull();
    expect(r.attachments).toEqual([]);
  });

  it('customerId and customerName map CUSTNAME / CDES respectively', () => {
    const r = t(FULL_ROW);
    expect(r.customerId).toBe('C00042');
    expect(r.customerName).toBe('Acme Restaurant');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd server && npm test -- customerReturnsTransformRow.test
```

Expected: ALL FAIL — `transformRow` is still the stub `(raw) => raw`, so fields like `r.date`, `r.attachments` are undefined.

- [ ] **Step 3: Implement transformRow**

In `server/src/reports/customerReturns.ts`, REPLACE the stub `transformRow: (raw) => raw` with a real implementation. Add imports at the top of the file:

```typescript
import { parseCustomerReturnsRemarks } from '../services/customerReturnsParser';
```

Add the function above the `reportRegistry.set(...)` call:

```typescript
function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  const textSub = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | null;
  const htmlText = (textSub?.TEXT as string | null | undefined) ?? null;
  const remarks = parseCustomerReturnsRemarks(htmlText);

  const filesSub = raw.EXTFILES_SUBFORM as Record<string, unknown> | null;
  const filesArray = (filesSub?.value as Array<Record<string, unknown>> | undefined) ?? [];
  const attachments = filesArray
    .map((f) => ({ filename: (f.FILENAME as string | null | undefined) ?? null }))
    .filter((a): a is { filename: string } => typeof a.filename === 'string' && a.filename.length > 0);

  return {
    date: raw.CURDATE,
    docNo: raw.DOCNO,
    customerId: raw.CUSTNAME,
    customerName: raw.CDES,
    invoiceNum: raw.IVNUM,
    ...remarks,
    attachments,
  };
}
```

Then update the `reportRegistry.set(...)` block to reference the named function:

```typescript
reportRegistry.set('customer-returns', {
  // ...other fields unchanged
  transformRow,   // <-- replaces the stub
  // ...
});
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd server && npm test -- customerReturnsTransformRow.test
cd server && npm test -- customerReturnsBuildQuery.test
```

Expected: both files PASS. The buildQuery tests must still pass (regression check).

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/customerReturns.ts server/tests/customerReturnsTransformRow.test.ts
git commit -m "feat(customer-returns): add transformRow with remarks + attachments"
```

---

### Task 5: `enrichRows` + register in reports route

**Why:** Fetch BOTH subforms (DOCUMENTSTEXT and EXTFILES metadata) per row, in batches of 10 with 200ms gaps — matching the proven GRV Log throughput pattern. Then wire the report into the reports route via side-effect import.

**Files:**
- Modify: `server/src/reports/customerReturns.ts` (replace `enrichRows` stub)
- Modify: `server/src/routes/reports.ts` (add one import)
- Test: `server/tests/customerReturnsReport.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/customerReturnsReport.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsReport.test.ts
// PURPOSE: Tests Customer Returns registration + enrichRows behavior
//          (parallel two-subform fetch with batching).
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/priorityClient', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    querySubform: vi.fn().mockImplementation((_entity: string, _key: unknown, subform: string) => {
      if (subform === 'DOCUMENTSTEXT_SUBFORM') {
        return Promise.resolve({ TEXT: '<p>fake</p>' });
      }
      if (subform === 'EXTFILES_SUBFORM') {
        return Promise.resolve({ value: [{ FILENAME: 'a.pdf' }] });
      }
      return Promise.resolve(null);
    }),
  };
});

import '../src/reports/customerReturns';
import { reportRegistry } from '../src/config/reportRegistry';
import { querySubform } from '../src/services/priorityClient';

const report = reportRegistry.get('customer-returns')!;

beforeEach(() => {
  vi.mocked(querySubform).mockClear();
});

describe('customer-returns report registration', () => {
  it('registers under id "customer-returns" with entity DOCUMENTS_N', () => {
    expect(report.id).toBe('customer-returns');
    expect(report.entity).toBe('DOCUMENTS_N');
  });

  it('opts into disableCache', () => {
    expect(report.disableCache).toBe(true);
  });

  it('columns array has exactly 10 entries with expected keys', () => {
    expect(report.columns.map((c) => c.key)).toEqual([
      'date',
      'docNo',
      'customerId',
      'customerName',
      'invoiceNum',
      'requestedBy',
      'requestMethod',
      'returnDetails',
      'foodSafetyConcern',
      'attachments',
    ]);
  });

  it('attachments column is NOT in filterColumns', () => {
    expect(report.filterColumns.find((f) => f.key === 'attachments')).toBeUndefined();
  });
});

describe('customer-returns enrichRows', () => {
  const rows = () => [
    { DOCNO: 'CR26000001', TYPE: 'CR' },
    { DOCNO: 'CR26000002', TYPE: 'CR' },
  ];

  it('fetches BOTH DOCUMENTSTEXT and EXTFILES per row', async () => {
    const r = await report.enrichRows!(rows());
    // 2 rows × 2 subforms = 4 querySubform calls
    expect(querySubform).toHaveBeenCalledTimes(4);

    const subformArgs = vi.mocked(querySubform).mock.calls.map((c) => c[2]);
    expect(subformArgs.filter((s) => s === 'DOCUMENTSTEXT_SUBFORM')).toHaveLength(2);
    expect(subformArgs.filter((s) => s === 'EXTFILES_SUBFORM')).toHaveLength(2);

    expect(r[0].DOCUMENTSTEXT_SUBFORM).toEqual({ TEXT: '<p>fake</p>' });
    expect(r[0].EXTFILES_SUBFORM).toEqual({ value: [{ FILENAME: 'a.pdf' }] });
  });

  it('passes $select=FILENAME for EXTFILES_SUBFORM (metadata only)', async () => {
    await report.enrichRows!(rows());

    const extfilesCall = vi.mocked(querySubform).mock.calls.find(
      (c) => c[2] === 'EXTFILES_SUBFORM',
    );
    expect(extfilesCall).toBeDefined();
    expect(extfilesCall![3]).toEqual({ select: 'FILENAME' });
  });

  it('re-fetches on every call (no per-document cache)', async () => {
    await report.enrichRows!(rows());
    await report.enrichRows!(rows());
    // 2 rows × 2 subforms × 2 calls = 8 fetches
    expect(querySubform).toHaveBeenCalledTimes(8);
  });

  it('batches respect 10-row groups with 200ms gap', async () => {
    vi.useFakeTimers();

    const big = Array.from({ length: 15 }, (_, i) => ({
      DOCNO: `CR2600${String(i).padStart(4, '0')}`,
      TYPE: 'CR',
    }));

    const promise = report.enrichRows!(big);
    // First batch (10 rows × 2 subforms = 20 fetches) fires synchronously.
    await Promise.resolve();
    expect(querySubform).toHaveBeenCalledTimes(20);

    // Advance past the 200ms gap; second batch (5 × 2 = 10 fetches) should fire.
    await vi.advanceTimersByTimeAsync(200);
    await promise;
    expect(querySubform).toHaveBeenCalledTimes(30);

    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd server && npm test -- customerReturnsReport.test
```

Expected: most tests fail. `enrichRows` is still the stub `async (rows) => rows`, so it returns rows untouched and never calls `querySubform`.

- [ ] **Step 3: Implement enrichRows**

In `server/src/reports/customerReturns.ts`, add `querySubform` to imports:

```typescript
import { querySubform } from '../services/priorityClient';
```

REPLACE the stub `enrichRows: async (rows) => rows` with a real function. Add above the `reportRegistry.set(...)` call:

```typescript
// WHY: Two-step fetch — DOCUMENTS_N's $expand is assumed broken (mirrors
// DOCUMENTS_P CloudFront abort behavior). Per row we make TWO subform calls
// in parallel: DOCUMENTSTEXT_SUBFORM for HTML remarks, and EXTFILES_SUBFORM
// (metadata-only via $select=FILENAME) for the attachments column.
// WHY (batch shape): 10 rows × 2 subforms = 20 parallel calls per batch,
// 200ms gap. One full 50-row page = 5 batches × 20 = 100 calls in ~1s.
// Priority's per-minute budget is shared at 100/min, so do not lower the
// gap or raise the batch size without coordinating with other dashboards.
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));

    const calls: Promise<unknown>[] = [];
    for (const row of batch) {
      const key = { DOCNO: row.DOCNO as string, TYPE: row.TYPE as string };
      calls.push(
        querySubform('DOCUMENTS_N', key, 'DOCUMENTSTEXT_SUBFORM').then((res) => {
          row.DOCUMENTSTEXT_SUBFORM = res;
        }),
      );
      calls.push(
        querySubform('DOCUMENTS_N', key, 'EXTFILES_SUBFORM', { select: 'FILENAME' }).then((res) => {
          row.EXTFILES_SUBFORM = res;
        }),
      );
    }
    await Promise.all(calls);
  }

  return rows;
}
```

Update `reportRegistry.set(...)` to use the named function:

```typescript
reportRegistry.set('customer-returns', {
  // ...other fields unchanged
  enrichRows,   // <-- replaces the stub
  // ...
});
```

- [ ] **Step 4: Add side-effect import in the reports route**

In `server/src/routes/reports.ts`, add one line after the existing imports (around line 21):

```typescript
import '../reports/customerReturns';
```

Final import block should look like:

```typescript
// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';
import '../reports/bbdReport';
import '../reports/customerReturns';
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd server && npm test -- customerReturnsReport.test
cd server && npm test
```

Expected: customer-returns tests PASS; full suite still green. (The batching test depends on Vitest fake timers; if it flakes, see the troubleshooting note below.)

> **Fake-timer caveat:** If the batching test errors with "timers not faked" or hangs, replace `vi.useFakeTimers()` with `vi.useFakeTimers({ shouldAdvanceTime: false })` or restructure to spy on `setTimeout` directly. The behavior under test is "second batch waits ≥200ms" — pick whichever assertion works in this Vitest version.

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/customerReturns.ts server/src/routes/reports.ts server/tests/customerReturnsReport.test.ts
git commit -m "feat(customer-returns): add enrichRows + register in reports route"
```

---

### Task 6: Attachment download route

**Why:** Provide a server endpoint that proxies one file from `DOCUMENTS_N`'s `EXTFILES_SUBFORM` back to the browser as a downloadable response. Input is validated against a strict regex to prevent OData injection and path traversal.

**Files:**
- Create: `server/src/routes/attachments.ts`
- Modify: `server/src/index.ts` (mount the new router)
- Test: `server/tests/attachmentsRoute.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/tests/attachmentsRoute.test.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/attachmentsRoute.test.ts
// PURPOSE: HTTP-level tests for /api/v1/attachments via supertest.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/services/priorityClient', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    queryPriority: vi.fn(),
  };
});

import { app } from '../src/index';
import { queryPriority } from '../src/services/priorityClient';

const PDF_BYTES = Buffer.from('%PDF-1.4 fake pdf', 'utf8').toString('base64');

beforeEach(() => {
  vi.mocked(queryPriority).mockReset();
});

describe('GET /api/v1/attachments/:entity/:docNo/:type/:filename', () => {
  it('returns 200 with bytes and correct headers for valid request', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [
        { FILENAME: 'test.pdf', EXTFILENAME: `data:application/pdf;base64,${PDF_BYTES}` },
      ],
    });

    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/CR26000050/CR/test.pdf');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="test.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.toString('utf8')).toBe('%PDF-1.4 fake pdf');
  });

  it('rejects entity not in allowlist with 400', async () => {
    const res = await request(app).get('/api/v1/attachments/LOGPART/abc/x/y.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/entity/i);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('rejects unsafe filename with 400', async () => {
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/X/Y/..%2Fetc%2Fpasswd');
    expect(res.status).toBe(400);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('rejects docNo containing single quote with 400', async () => {
    const res = await request(app).get("/api/v1/attachments/DOCUMENTS_N/X'Y/CR/a.pdf");
    expect(res.status).toBe(400);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('returns 404 when Priority finds no file', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({ value: [] });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/CR26000050/CR/missing.pdf');
    expect(res.status).toBe(404);
  });

  it('returns 502 when Priority throws', async () => {
    vi.mocked(queryPriority).mockRejectedValueOnce(new Error('priority down'));
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/CR26000050/CR/test.pdf');
    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();
  });

  it('derives Content-Type from data URI prefix', async () => {
    const jpegBytes = Buffer.from('FAKEJPEGDATA', 'utf8').toString('base64');
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [{ FILENAME: 'pic.jpg', EXTFILENAME: `data:image/jpeg;base64,${jpegBytes}` }],
    });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/X/CR/pic.jpg');
    expect(res.headers['content-type']).toContain('image/jpeg');
  });
});
```

- [ ] **Step 2: Add the supertest dependency if missing**

```bash
cd server && npm ls supertest 2>/dev/null || npm install --save-dev supertest @types/supertest
```

Run tests to confirm failure:

```bash
cd server && npm test -- attachmentsRoute.test
```

Expected: FAIL — the route does not exist yet, so `/api/v1/attachments/*` returns 404 from Express's default handler.

- [ ] **Step 3: Implement the router**

Create `server/src/routes/attachments.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/attachments.ts
// PURPOSE: Proxies file bytes from Priority's EXTFILES_SUBFORM back
//          to the browser as a downloadable attachment.
// USED BY: index.ts (mounted at /api/v1/attachments)
// EXPORTS: createAttachmentsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { queryPriority } from '../services/priorityClient';

// WHY: Allowlist — only entities explicitly listed can be read via this route.
// New report types must add their entity here AFTER confirming the EXTFILES
// subform field names (FILENAME + EXTFILENAME).
const ALLOWED_ENTITIES = new Set(['DOCUMENTS_N']);

// WHY: Strict input pattern — alphanumeric, dot, space, dash, underscore.
// Blocks OData injection (no quotes) AND path traversal (no slash, no dots-dots).
const SAFE_PARAM = /^[a-zA-Z0-9._ -]+$/;

export function createAttachmentsRouter(): Router {
  const router = Router();

  router.get('/:entity/:docNo/:type/:filename', async (req, res) => {
    const { entity, docNo, type, filename } = req.params;

    if (!ALLOWED_ENTITIES.has(entity)) {
      res.status(400).json({ error: `Entity '${entity}' is not allowed.` });
      return;
    }
    if (!SAFE_PARAM.test(docNo) || !SAFE_PARAM.test(type) || !SAFE_PARAM.test(filename)) {
      res.status(400).json({ error: 'Invalid path parameter.' });
      return;
    }

    try {
      // WHY: The subform path is part of the entity URL — we pass it through
      // queryPriority's entity arg so the existing OData URL builder handles it.
      const subformPath = `${entity}(DOCNO='${docNo}',TYPE='${type}')/EXTFILES_SUBFORM`;
      const result = await queryPriority(subformPath, {
        $filter: `FILENAME eq '${filename}'`,
        $select: 'FILENAME,EXTFILENAME',
        $top: 1,
      });

      const record = result.value[0];
      if (!record) {
        res.status(404).json({ error: `File '${filename}' not found.` });
        return;
      }

      const dataUri = record.EXTFILENAME as string | undefined;
      if (!dataUri || !dataUri.startsWith('data:')) {
        res.status(502).json({ error: 'Priority returned no file data.' });
        return;
      }

      // Parse "data:<mime>;base64,<payload>"
      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        res.status(502).json({ error: 'Priority file payload was malformed.' });
        return;
      }
      const [, mime, b64] = match;
      const bytes = Buffer.from(b64, 'base64');

      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(bytes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error.';
      res.status(502).json({ error: `Priority fetch failed: ${msg}` });
    }
  });

  return router;
}
```

- [ ] **Step 4: Mount the router in `index.ts`**

In `server/src/index.ts`, add the import (with the other route imports, around line 20):

```typescript
import { createAttachmentsRouter } from './routes/attachments';
```

And mount it (with the other `app.use(...)` lines, around line 43):

```typescript
app.use('/api/v1/attachments', createAttachmentsRouter());
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd server && npm test -- attachmentsRoute.test
cd server && npm test
```

Expected: 7 attachment tests PASS; full suite still green.

> **If `queryPriority` rejects the subform-as-entity hack** (e.g., its internal URL builder URL-encodes the parens), inspect `priorityClient.ts` and either: (a) add a `rawPath` flag to `queryPriority`, or (b) build the URL inline in `attachments.ts` and call the lower-level fetch helper directly. The test mocks `queryPriority` so this only matters at runtime — adjust during the integration smoke test in Task 10.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/attachments.ts server/src/index.ts server/tests/attachmentsRoute.test.ts server/package.json server/package-lock.json
git commit -m "feat(attachments): add per-row file download endpoint"
```

---

### Task 7: pages.ts entry + page-config tests

**Why:** Adds the new Food Safety tab. Zod validation at import time means a typo here crashes the dev server with a clear error — both tests and runtime catch problems.

**Files:**
- Modify: `client/src/config/pages.ts`
- Test: `client/src/config/pages.test.ts` (extend)

- [ ] **Step 1: Read the existing test file and add new cases**

Open `client/src/config/pages.test.ts` and append these tests (do not delete existing ones):

```typescript
import { describe, it, expect } from 'vitest';
import { pages, findWidgetByReportId } from './pages';

describe('customer-returns page configuration', () => {
  it('customer-returns page exists under food-safety', () => {
    const page = pages.find((p) => p.id === 'customer-returns');
    expect(page).toBeDefined();
    expect(page!.department).toBe('food-safety');
    expect(page!.path).toBe('/customer-returns');
    expect(page!.name).toBe('Customer Returns');
  });

  it('customer-returns has one widget referencing reportId customer-returns', () => {
    const page = pages.find((p) => p.id === 'customer-returns')!;
    expect(page.widgets).toHaveLength(1);
    const w = page.widgets[0];
    expect(w.reportId).toBe('customer-returns');
    expect(w.type).toBe('table');
    expect(w.disableCache).toBe(true);
    expect(w.colSpan).toBe(12);
  });

  it('findWidgetByReportId returns disableCache:true for customer-returns', () => {
    const w = findWidgetByReportId('customer-returns');
    expect(w).toBeDefined();
    expect(w!.disableCache).toBe(true);
  });

  it('Receiving Log and Customer Returns are sibling tabs under food-safety', () => {
    const foodSafetyPages = pages.filter((p) => p.department === 'food-safety');
    const ids = foodSafetyPages.map((p) => p.id);
    expect(ids).toContain('receiving-log');
    expect(ids).toContain('customer-returns');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
cd client && npm test -- pages.test
```

Expected: 4 new tests FAIL — `pages.find(p => p.id === 'customer-returns')` is undefined.

- [ ] **Step 3: Add the page entry**

In `client/src/config/pages.ts`, add a new object to the `pages` array (after the existing `receiving-log` entry, before `bbd`):

```typescript
  {
    id: 'customer-returns',
    department: 'food-safety',
    name: 'Customer Returns',
    path: '/customer-returns',
    widgets: [
      {
        id: 'customer-returns',
        reportId: 'customer-returns',
        type: 'table',
        title: 'Customer Returns',
        colSpan: 12,
        disableCache: true,
      },
    ],
  },
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd client && npm test -- pages.test
```

Expected: all tests pass (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add client/src/config/pages.ts client/src/config/pages.test.ts
git commit -m "feat(customer-returns): add Food Safety tab + page config tests"
```

---

### Task 8: AttachmentsCell component

**Why:** Renders the paperclip + count for the attachments column, with a popover that lists each filename. Click triggers a download via the `/api/v1/attachments/...` URL.

**Files:**
- Create: `client/src/components/widgets/cells/AttachmentsCell.tsx`
- Test: `client/src/components/widgets/cells/AttachmentsCell.test.tsx`

- [ ] **Step 1: Verify directory + check React Testing Library availability**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client"
ls src/components/widgets/cells/ 2>/dev/null || mkdir -p src/components/widgets/cells
npm ls @testing-library/react 2>/dev/null
```

Expected: `@testing-library/react` is installed (used by existing component tests like `NavTabs.test.tsx`). If not, install: `npm install --save-dev @testing-library/react @testing-library/user-event`.

- [ ] **Step 2: Write the failing tests**

Create `client/src/components/widgets/cells/AttachmentsCell.test.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/cells/AttachmentsCell.test.tsx
// PURPOSE: Tests the paperclip + popover + download trigger.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { AttachmentsCell } from './AttachmentsCell';

const ATTACHMENTS = [{ filename: 'invoice.pdf' }, { filename: 'photo.jpg' }];

beforeEach(() => {
  cleanup();
});

describe('AttachmentsCell', () => {
  it('renders nothing visible for empty attachments array', () => {
    const { container } = render(
      <AttachmentsCell value={[]} docNo="CR1" type="CR" />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing visible for null attachments', () => {
    const { container } = render(
      <AttachmentsCell value={null} docNo="CR1" type="CR" />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders paperclip + count for non-empty array', () => {
    render(<AttachmentsCell value={ATTACHMENTS} docNo="CR1" type="CR" />);
    const trigger = screen.getByRole('button', { name: /attachments/i });
    expect(trigger.textContent).toContain('2');
  });

  it('clicking trigger reveals filenames', () => {
    render(<AttachmentsCell value={ATTACHMENTS} docNo="CR1" type="CR" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
  });

  it('clicking a filename triggers a download with the correct URL', () => {
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });

    render(<AttachmentsCell value={ATTACHMENTS} docNo="CR1" type="CR" />);
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    fireEvent.click(screen.getByText('invoice.pdf'));

    expect(clickSpy).toHaveBeenCalled();
    const calls = vi.mocked(document.createElement).mock.calls;
    const anchorCalls = calls.filter(([t]) => t === 'a');
    expect(anchorCalls.length).toBeGreaterThan(0);
    // Inspect the most recent <a> that was created and clicked.
    const lastAnchor = vi.mocked(document.createElement).mock.results
      .map((r) => r.value as HTMLElement)
      .reverse()
      .find((el) => el instanceof HTMLAnchorElement) as HTMLAnchorElement;
    expect(lastAnchor.href).toContain('/api/v1/attachments/DOCUMENTS_N/CR1/CR/invoice.pdf');
    expect(lastAnchor.download).toBe('invoice.pdf');
  });

  it('URL-encodes filenames with spaces or special chars', () => {
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = vi.fn();
      }
      return el;
    });

    render(
      <AttachmentsCell
        value={[{ filename: 'Return Form (1).pdf' }]}
        docNo="CR1"
        type="CR"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    fireEvent.click(screen.getByText('Return Form (1).pdf'));

    const lastAnchor = vi.mocked(document.createElement).mock.results
      .map((r) => r.value as HTMLElement)
      .reverse()
      .find((el) => el instanceof HTMLAnchorElement) as HTMLAnchorElement;
    expect(lastAnchor.href).toContain('Return%20Form%20%281%29.pdf');
  });

  it('closes the popover when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">outside</div>
        <AttachmentsCell value={ATTACHMENTS} docNo="CR1" type="CR" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /attachments/i }));
    expect(screen.getByText('invoice.pdf')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('invoice.pdf')).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

```bash
cd client && npm test -- AttachmentsCell.test
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement the component**

Create `client/src/components/widgets/cells/AttachmentsCell.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/cells/AttachmentsCell.tsx
// PURPOSE: Renders the Attachments column. Paperclip + count
//          trigger; popover lists filenames; click downloads via
//          /api/v1/attachments/DOCUMENTS_N/:docNo/:type/:filename.
// USED BY: ReportTableWidget (registered as the renderer for the
//          'attachments' column key on the customer-returns report)
// EXPORTS: AttachmentsCell, Attachment
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';

export interface Attachment {
  filename: string;
}

interface Props {
  value: Attachment[] | null;
  docNo: string;
  type: string;
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export function AttachmentsCell({ value, docNo, type }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // WHY: Close the popover when the user clicks outside. Mirrors the
  // existing useClickOutside pattern used by ReportTableWidget toolbar.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!value || value.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Attachments (${value.length})`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
      >
        <span aria-hidden>📎</span>
        <span>{value.length}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <ul className="flex flex-col gap-1">
            {value.map((att) => (
              <li key={att.filename}>
                <button
                  type="button"
                  className="w-full truncate text-left text-sm text-slate-700 hover:text-slate-900"
                  onClick={() => {
                    const url = `/api/v1/attachments/DOCUMENTS_N/${docNo}/${type}/${encodeURIComponent(att.filename)}`;
                    triggerDownload(url, att.filename);
                  }}
                >
                  {att.filename}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd client && npm test -- AttachmentsCell.test
```

Expected: all 7 PASS.

> **If the "closes the popover when clicking outside" test fails** because `mousedown` is fired but the handler uses `click`, switch the event handler in the component to `mousedown` (already done above). If React's event system swallows the bubble, use `useClickOutside` from the existing codebase if available.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/widgets/cells/AttachmentsCell.tsx client/src/components/widgets/cells/AttachmentsCell.test.tsx
git commit -m "feat(customer-returns): add AttachmentsCell component"
```

---

### Task 9: Wire AttachmentsCell into ReportTableWidget

**Why:** Tell the table renderer to use `AttachmentsCell` for the `attachments` column. The widget currently registers `CopyableCell` for `copyable: true` columns; we extend the same dispatch logic.

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Find the existing cell-renderer wiring**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client"
grep -n "copyRenderers\|CopyableCell\|columns" src/components/widgets/ReportTableWidget.tsx | head -40
```

Identify where `copyRenderers` is built (the loop that runs over columns and creates a renderer for those with `copyable: true`). This task adds a parallel registration for `key === 'attachments'`.

- [ ] **Step 2: Write a narrow integration test**

Create `client/src/components/widgets/ReportTableWidget.attachments.test.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.attachments.test.tsx
// PURPOSE: Confirms the widget renders AttachmentsCell for the
//          attachments column when row data includes it.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportTableWidget } from './ReportTableWidget';

// WHY: Stub the report query so we control the rendered rows.
vi.mock('../../hooks/useReportQuery', () => ({
  useReportQuery: () => ({
    data: {
      meta: { reportId: 'customer-returns', reportName: 'Customer Returns', generatedAt: '', cache: 'miss', executionTimeMs: 0, source: 'priority-odata' },
      data: [
        {
          date: '2026-05-12T00:00:00Z',
          docNo: 'CR26000050',
          customerId: 'C00042',
          customerName: 'Acme',
          invoiceNum: 'INV-1',
          requestedBy: 'Jean',
          requestMethod: 'Email',
          returnDetails: 'cheese',
          foodSafetyConcern: 'No',
          attachments: [{ filename: 'invoice.pdf' }],
          DOCNO: 'CR26000050', // WHY: AttachmentsCell needs raw composite key
          TYPE: 'CR',
        },
      ],
      pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
      columns: [
        { key: 'docNo', label: 'Doc #', type: 'string', copyable: true },
        { key: 'attachments', label: 'Attachments', type: 'string' },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../config/pages', async (orig) => {
  const actual = (await orig()) as { findWidgetByReportId: unknown };
  return {
    ...actual,
    findWidgetByReportId: () => ({ disableCache: true }),
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ReportTableWidget — attachments column', () => {
  it('renders the paperclip cell when row has attachments', () => {
    render(
      <Wrapper>
        <ReportTableWidget reportId="customer-returns" />
      </Wrapper>,
    );
    // Paperclip emoji + count
    expect(screen.getByText(/📎/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify failure**

```bash
cd client && npm test -- ReportTableWidget.attachments.test
```

Expected: FAIL — paperclip doesn't appear because the widget doesn't dispatch to `AttachmentsCell` for the `attachments` column.

- [ ] **Step 4: Implement the renderer dispatch**

In `ReportTableWidget.tsx`, locate the section where `copyRenderers` (or equivalent) is built. Add a parallel `customRenderers` registration for the `attachments` column. Sketch (exact location depends on the existing structure, which Task 9 Step 1 surfaced):

```typescript
import { AttachmentsCell } from './cells/AttachmentsCell';
// ...

// WHY: Per-column renderers. Build alongside copyRenderers so the same
// table component can dispatch by column key without changing its API.
const customRenderers: Record<string, (value: unknown, row: Record<string, unknown>) => React.ReactNode> = {
  attachments: (value, row) => (
    <AttachmentsCell
      value={(value as { filename: string }[] | null) ?? null}
      docNo={(row.DOCNO as string) ?? (row.docNo as string)}
      type={(row.TYPE as string) ?? ''}
    />
  ),
};
```

Then pass `customRenderers` into the underlying `ReportTable` (or merge it with `copyRenderers` if the existing prop signature only accepts one map). Pick the smallest change that lights up the test.

> **If the existing widget only accepts one renderer map:** rename / extend it to accept multiple, OR merge: `{ ...copyRenderers, ...customRenderers }`. Either way, do not change behavior for any other report — only the `attachments` key gets the new renderer.

- [ ] **Step 5: Confirm `DOCNO` and `TYPE` reach the row**

The frontend table receives rows from `transformRow`, which currently strips `DOCNO`/`TYPE` (it doesn't include them in the output). The AttachmentsCell needs them for the download URL. Two options:

**Option A (preferred):** Surface `docNo` from the existing transformed row (it's already there as `docNo`). For `type`, you must add it to `transformRow`. In `server/src/reports/customerReturns.ts`, add `type: raw.TYPE` to the returned object. Then in the widget renderer, use `row.docNo` and `row.type` (lowercase). Update the test accordingly.

**Option B:** Have `transformRow` retain `DOCNO` and `TYPE` (uppercase) on the row alongside the lowercase fields. Less clean but minimizes ripple.

Pick A. Update Task 4's `transformRow` if you missed it — or apply the change here:

```typescript
// In server/src/reports/customerReturns.ts transformRow return:
return {
  date: raw.CURDATE,
  docNo: raw.DOCNO,
  type: raw.TYPE,           // <-- new
  customerId: raw.CUSTNAME,
  // ...rest unchanged
};
```

Then update `transformRow` tests (Suite 2) to assert `type` is included — re-run them.

Update the widget renderer:

```typescript
attachments: (value, row) => (
  <AttachmentsCell
    value={(value as { filename: string }[] | null) ?? null}
    docNo={row.docNo as string}
    type={row.type as string}
  />
),
```

Update the integration test mock data to use lowercase `docNo` + `type` (not raw uppercase).

- [ ] **Step 6: Run tests to verify pass**

```bash
cd client && npm test -- ReportTableWidget.attachments.test
cd server && npm test
cd client && npm test
```

Expected: all server + client suites green.

- [ ] **Step 7: Exclude `attachments` from Excel export**

Locate the export hook (`client/src/hooks/useExport.ts` or similar). Look for how columns are mapped to spreadsheet columns. Ensure the `attachments` key is filtered out (it's a complex object, not a scalar). If the export hook crashes or writes `[object Object]`, add a one-line filter:

```typescript
const exportableColumns = columns.filter((c) => c.key !== 'attachments');
```

Use this filtered list when building the export rows. Adjust to the existing API of the hook.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx \
        client/src/components/widgets/ReportTableWidget.attachments.test.tsx \
        server/src/reports/customerReturns.ts \
        server/tests/customerReturnsTransformRow.test.ts \
        client/src/hooks/useExport.ts
git commit -m "feat(customer-returns): wire AttachmentsCell into the table widget"
```

---

### Task 10: Default date range = current calendar month

**Why:** When the user lands on Customer Returns, the date filter must default to "first of current month → today". The spec calls for this client-side default.

**Files:**
- Modify: whichever filter-state hook computes the default range (likely `client/src/hooks/useFilterState.ts` or a date-range util in `client/src/utils/`)

- [ ] **Step 1: Find the existing default-range computation**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client"
grep -rn "nowInLA\|defaultDateRange\|getMonday\|first day\|startOfMonth" src/ | head -30
```

Identify the function that returns `{ from, to }` for the initial filter state. Note whether it's report-aware (per-report defaults) or one-size-fits-all.

- [ ] **Step 2: Write a failing test**

If the hook is testable in isolation, write a test like:

```typescript
// Example shape — adjust to actual hook location
import { describe, it, expect, vi } from 'vitest';
import { getDefaultDateRange } from '../utils/defaultDateRange';

describe('getDefaultDateRange', () => {
  it('customer-returns defaults to first-of-month through today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T15:00:00Z'));
    const { from, to } = getDefaultDateRange('customer-returns');
    expect(from).toBe('2026-05-01');
    expect(to).toBe('2026-05-15');
    vi.useRealTimers();
  });

  it('other reports keep their existing default', () => {
    // Capture current behavior to prevent regression for grv-log and bbd.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-15T15:00:00Z'));
    const grv = getDefaultDateRange('grv-log');
    expect(grv.from).toBeDefined();
    expect(grv.to).toBeDefined();
    vi.useRealTimers();
  });
});
```

Adjust to the actual location and signature of the default-range helper. If no such helper exists in isolation, extract one as part of this task — the smallest, narrowest extraction that lets the test run.

- [ ] **Step 3: Run the test to verify failure**

Expected: the function returns the current default (likely last 7 days) for `customer-returns`, not the first-of-month.

- [ ] **Step 4: Implement the per-report override**

Switch the helper on `reportId`. For `customer-returns`, compute first-of-current-month in LA timezone:

```typescript
import { nowInLA } from '@shared/utils/timezone';

export function getDefaultDateRange(reportId: string): { from: string; to: string } {
  const today = nowInLA();
  if (reportId === 'customer-returns') {
    const first = new Date(today);
    first.setDate(1);
    return { from: first.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10) };
  }
  // ...existing logic for other reports
}
```

Confirm `nowInLA()` returns a Date with LA-local calendar values (per the existing `shared/utils/timezone.ts`). If the existing helper uses a different shape (e.g. `getMonday`-style ISO date strings), use the same shape.

- [ ] **Step 5: Run tests to verify pass**

```bash
cd client && npm test
```

Expected: new test passes; no regressions to existing date-range tests or to grv-log behavior.

- [ ] **Step 6: Commit**

```bash
git add client/src/utils/defaultDateRange.ts client/src/utils/defaultDateRange.test.ts \
        client/src/hooks/useFilterState.ts
git commit -m "feat(customer-returns): default date filter to current calendar month"
```

---

### Task 11: End-to-end verification (no new code — checks only)

**Why:** Catch integration issues that unit tests can't see: TypeScript build, real Priority API contract, browser rendering, Excel export.

**Files:** none (verification only).

- [ ] **Step 1: Run both TypeScript builds**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client" && npx tsc -b --noEmit
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/server" && npx tsc --noEmit
```

Expected: both exit with code 0. Any TS error fails the Railway Docker build — fix all errors before continuing.

- [ ] **Step 2: Run the full test suite**

```bash
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/server" && npm test
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client" && npm test
```

Expected: both fully green.

- [ ] **Step 3: Start dev servers**

In two terminals:

```bash
# Terminal A
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/server" && npm run dev
```

```bash
# Terminal B
cd "/Users/victorproust/Documents/Documents - Victor’s MacBook Pro/Work/SG Interface/Priority Reports/client" && npm run dev
```

Wait for Express on `:3001` and Vite on `:5173` to come up cleanly.

- [ ] **Step 4: Backend smoke test (Customer Returns endpoint)**

Pick a date range that contains real customer returns (use today's date and back-fill 30 days):

```bash
curl 'http://localhost:3001/api/v1/reports/customer-returns?from=2026-05-01&to=2026-05-27&page=1&pageSize=10' | jq '.'
```

Verify:
- HTTP 200
- `meta.reportId === 'customer-returns'`
- `data` is an array of objects, each containing all 10 fields including `attachments: [...]` (possibly empty)
- `pagination` is populated

- [ ] **Step 5: Attachment download smoke test**

From the response above, pick a row with non-empty `attachments`. Note its `docNo`, `type`, and a filename. Run:

```bash
curl -i -OJ "http://localhost:3001/api/v1/attachments/DOCUMENTS_N/<DOCNO>/<TYPE>/<FILENAME>"
```

Verify:
- HTTP 200
- `Content-Type` matches the actual file type (e.g., `application/pdf`)
- `Content-Disposition: attachment; filename="..."`
- File saved locally opens correctly

Then test the security path:

```bash
curl -i "http://localhost:3001/api/v1/attachments/LOGPART/X/Y/Z.pdf"        # 400 expected
curl -i "http://localhost:3001/api/v1/attachments/DOCUMENTS_N/X/Y/..%2Fetc%2Fpasswd"  # 400 expected
```

- [ ] **Step 6: Frontend walkthrough**

Open `http://localhost:5173/customer-returns`.

Check:
- "Customer Returns" tab appears next to "Receiving Log" under Food Safety.
- Default date filter shows: from = first of current month, to = today.
- Table renders 10 columns (date, doc #, customer id, customer name, invoice #, 4 parsed remarks fields, attachments).
- Sort by Date, Doc #, Customer Name works.
- Server-side filters (date, customer id, doc #, invoice #) re-query the backend.
- Client-side filters on remarks columns narrow the visible rows without re-querying.
- Rows with attachments show 📎 + count. Click reveals filenames. Click a filename → browser downloads the file.
- Excel export downloads a `.xlsx` with the 9 data columns (no attachments column or count). Headers in row 1.
- Refresh button triggers a fresh fetch (network tab shows a new request, cache header confirms `disableCache`).

- [ ] **Step 7: Airtable iframe smoke check** (after Railway deploy in a later branch / PR)

After merging and Railway has redeployed:
- Open the Airtable Reports interface, navigate to Food Safety → Customer Returns.
- Confirm the iframe loads the tab without contrast issues (text uses `slate-500` minimum per CLAUDE.md).
- Re-check attachment download from inside the iframe — some browsers handle cross-origin downloads differently.

- [ ] **Step 8: Final commit (if any verification fixups were made)**

```bash
git status
git diff
# If there are leftover fixes:
git add -p
git commit -m "fix(customer-returns): post-verification fixups"
```

---

## Self-Review Checklist

After implementing all tasks, audit the work against the spec:

- [ ] **Spec coverage:** Every requirement in `Final Design` has a corresponding task. Specifically:
  - 10-column table ✓ Task 3
  - 4 parsed remarks fields ✓ Task 2
  - DOCUMENTS_N two-step fetch (DOCUMENTSTEXT + EXTFILES) ✓ Task 5
  - Metadata-only $select on EXTFILES ✓ Tasks 1 & 5
  - Attachment download route ✓ Task 6
  - Food Safety tab auto-registers ✓ Task 7
  - AttachmentsCell paperclip + popover ✓ Task 8
  - Renderer dispatch in widget ✓ Task 9
  - Default date range = current calendar month ✓ Task 10
  - disableCache on both client and server ✓ Tasks 3 (server) + 7 (client)
  - Plain Excel export (no template) ✓ default behavior, attachments excluded in Task 9

- [ ] **Placeholder scan:** No "TBD", "TODO", or open-ended steps remain. Every code block compiles. Every command is the actual command. Verify by `grep -nE "TBD|TODO|FIXME|<.+>" specs/plan-13-customer-returns.md` — only the angle-bracketed placeholders in curl example URLs (e.g. `<DOCNO>`) should remain, and those are intended.

- [ ] **Type consistency:** `parseCustomerReturnsRemarks`, `CustomerReturnsRemarkFields`, `AttachmentsCell`, `triggerDownload`, `createAttachmentsRouter` — every name used in a later task is defined in an earlier task with the same spelling.

- [ ] **Test-first discipline:** Every implementation step (Step 3 in each task) is preceded by a "Run test to verify failure" step (Step 2). No production code lands without a watched-failing test.

- [ ] **Frequent commits:** Each task ends with one commit. Eleven tasks = eleven (or fewer, if a task is verification-only) commits, each with a descriptive message.

If any item is unchecked, fix inline and continue.

---

## What this plan does NOT do (out of scope)

- Refactor `htmlParser.ts` to be shared/generic — the user chose the mirror approach.
- Add ZIP bundling for multi-file download — individual downloads only.
- Allow file upload or attachment editing — read-only.
- Build a template-based Excel export — plain export only.
- Modify the GRV Log / Receiving Log report — Customer Returns is purely additive.
- Add automated browser tests — manual walkthrough in Task 11 covers integration.
