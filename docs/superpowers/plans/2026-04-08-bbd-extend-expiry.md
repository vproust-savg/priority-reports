# BBD Extend Expiry Date — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lot number column, days-extended column, per-row extend button, and bulk extend toolbar button to the BBD report — the dashboard's first write operation to Priority ERP.

**Architecture:** Backend adds `httpsPatch` to the Priority HTTP layer, an extend route for the write flow, and enrichment logic for fetching extension history. Frontend adds a reusable Modal component, custom cell renderers, and two modal forms (single + bulk extend) orchestrated by a `useBBDExtend` hook.

**Tech Stack:** Express + Zod (backend validation), TanStack Query v5 `useMutation` (frontend), Framer Motion (modal animation), Priority oData API (EXPDSERIAL + EXPDEXT subform)

**Spec:** `docs/superpowers/specs/2026-04-08-bbd-extend-expiry-design.md`

**Skills:** Use `/test-driven-development`, `/priority-erp-api`, `/frontend-design`, `/verification-before-completion`

---

## Task 1: Add Lot Number and Days Extended columns to BBD report

**Files:**
- Modify: `server/src/reports/bbdReport.ts`

- [ ] **Step 1: Add `serialName` column at index 0 and `daysExtended` column after `expiryDate`**

In `server/src/reports/bbdReport.ts`, replace the columns array (lines 19-33):

```ts
const columns: ColumnDefinition[] = [
  { key: 'serialName', label: 'Lot Number', type: 'string' },
  { key: 'partNumber', label: 'Part Number', type: 'string' },
  { key: 'partDescription', label: 'Part Description', type: 'string' },
  { key: 'balance', label: 'Balance', type: 'number' },
  { key: 'unit', label: 'Unit', type: 'string' },
  { key: 'value', label: 'Value', type: 'currency' },
  { key: 'receivingDate', label: 'Recv. Date', type: 'date' },
  { key: 'expiryDate', label: 'Expir. Date', type: 'date' },
  { key: 'daysExtended', label: 'Days Ext.', type: 'number' },
  { key: 'daysUntilExpiry', label: 'Days Left', type: 'number' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'perishable', label: 'Perishable', type: 'string' },
  { key: 'brand', label: 'Brand', type: 'string' },
  { key: 'family', label: 'Family', type: 'string' },
];
```

- [ ] **Step 2: Add `daysExtended` to `transformRow` output**

In the `transformRow` function, add `daysExtended` to the return object. It reads from a module-level `extensionMap` (populated by `fetchExtensionData`, added in the next step). After line 121 (`serialName: raw.SERIALNAME ?? '',`), add:

```ts
    daysExtended: extensionMap.get((raw.SERIALNAME as string)?.trim()) ?? 0,
```

- [ ] **Step 3: Add `extensionMap` module-level variable and `fetchExtensionData` function**

Add after the `familyLookupMap` declaration (line 78):

```ts
// WHY: Extension data from EXPDSERIAL/EXPDEXT_SUBFORM. Built once by
// fetchFilters() via fetchExtensionData(), read by transformRow().
let extensionMap: Map<string, number> = new Map();
```

Add the `buildExtensionMap` pure function and `fetchExtensionData` async function before `fetchFilters`:

```ts
// --- Extension Data Helpers ---

interface ExpdExtRecord {
  RENEWDATE: string;
  EXPIRYDATE: string;
}

interface ExpdSerialRecord {
  SERIALNAME: string;
  EXPDEXT_SUBFORM?: ExpdExtRecord[];
}

// WHY: Pure function extracted for testability. Calculates total days
// extended per lot from EXPDSERIAL + EXPDEXT_SUBFORM response data.
export function buildExtensionMap(records: ExpdSerialRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const record of records) {
    const extensions = record.EXPDEXT_SUBFORM ?? [];
    const totalDays = extensions.reduce((sum, ext) => {
      const renewDate = new Date(ext.RENEWDATE).getTime();
      const newExpiry = new Date(ext.EXPIRYDATE).getTime();
      const days = Math.round((newExpiry - renewDate) / (1000 * 60 * 60 * 24));
      return sum + (days > 0 ? days : 0);
    }, 0);
    map.set(record.SERIALNAME.trim(), totalDays);
  }
  return map;
}

// WHY: Fetches extension history for all lots from EXPDSERIAL with $expand.
// Uses raw URL concatenation for $expand (not searchParams.set) because
// Priority's OData parser chokes on form-encoded nested syntax.
async function fetchExtensionData(): Promise<void> {
  try {
    const config = getPriorityConfig();
    const baseUrl = `${config.baseUrl}EXPDSERIAL?$select=SERIALNAME`;
    // WHY: $expand must be appended raw — searchParams.set encodes () → %28%29
    const url = `${baseUrl}&$expand=EXPDEXT_SUBFORM($select=RENEWDATE,EXPIRYDATE)&$top=2000`;
    const response = await fetchWithRetry(url);
    const parsed = JSON.parse(response.body);
    const records = (parsed.value ?? []) as ExpdSerialRecord[];
    extensionMap = buildExtensionMap(records);
  } catch (err) {
    console.warn('[bbd] EXPDSERIAL fetch failed, Days Ext. column will show 0:', err instanceof Error ? err.message : err);
    extensionMap = new Map();
  }
}
```

Add the imports at the top of the file:

```ts
import { fetchWithRetry } from '../services/priorityHttp';
import { getPriorityConfig } from '../config/priority';
```

- [ ] **Step 4: Call `fetchExtensionData` in `fetchFilters`**

In `fetchFilters`, add `fetchExtensionData()` to the `Promise.all` call. Replace lines 171-194:

```ts
async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  const [suppliersData, spec4Data, familyData] = await Promise.all([
    queryPriority('SUPPLIERS', {
      $select: 'SUPDES',
      $orderby: 'SUPDES',
      $top: 1000,
    }),
    queryPriority('SPEC4VALUES', {
      $select: 'SPECVALUE',
      $orderby: 'SPECVALUE',
      $top: 500,
    }).catch((err) => {
      console.warn('[bbd] SPEC4VALUES fetch failed, brands dropdown will be empty:', err instanceof Error ? err.message : err);
      return { value: [] };
    }),
    queryPriority('FAMILY_LOG', {
      $select: 'FAMILYNAME,FAMILYDESC',
      $orderby: 'FAMILYDESC',
      $top: 500,
    }),
  ]);

  // WHY: Fetch extension data in parallel with filter processing.
  // Not in the Promise.all above because it uses fetchWithRetry directly
  // (different from queryPriority). Fires concurrently with the filter building below.
  const extensionPromise = fetchExtensionData();
```

Then at the end of `fetchFilters`, before the `return` statement, add:

```ts
  // WHY: Wait for extension data to be populated before transformRow runs.
  await extensionPromise;

  return { vendors, brands, families, perishables, statuses };
```

- [ ] **Step 5: Update excelStyle columnWidths**

In the `reportRegistry.set` call, update `excelStyle.columnWidths` to include the new columns:

```ts
    columnWidths: {
      serialName: 12,
      partNumber: 14,
      partDescription: 28,
      balance: 8,
      unit: 6,
      value: 10,
      receivingDate: 11,
      expiryDate: 11,
      daysExtended: 8,
      daysUntilExpiry: 8,
      status: 12,
      vendor: 18,
      perishable: 10,
      brand: 14,
      family: 14,
    },
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add server/src/reports/bbdReport.ts
git commit -m "feat: add Lot Number and Days Extended columns to BBD report"
```

---

## Task 2: Write tests for `buildExtensionMap`

**Files:**
- Create: `server/src/reports/bbdReport.test.ts`

- [ ] **Step 1: Write the test file**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/bbdReport.test.ts
// PURPOSE: Tests for buildExtensionMap — the pure function that
//          calculates total extension days per lot.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildExtensionMap } from './bbdReport';

describe('buildExtensionMap', () => {
  it('builds map from EXPDSERIAL response', () => {
    const records = [
      {
        SERIALNAME: 'LOT001',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT001')).toBe(7);
  });

  it('sums multiple extension records', () => {
    const records = [
      {
        SERIALNAME: 'LOT002',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
          { RENEWDATE: '2026-04-08T00:00:00Z', EXPIRYDATE: '2026-04-22T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT002')).toBe(21);
  });

  it('returns 0 for lots with empty EXPDEXT_SUBFORM', () => {
    const records = [{ SERIALNAME: 'LOT003', EXPDEXT_SUBFORM: [] }];
    const map = buildExtensionMap(records);
    expect(map.get('LOT003')).toBe(0);
  });

  it('handles missing EXPDEXT_SUBFORM gracefully', () => {
    const records = [{ SERIALNAME: 'LOT004' }];
    const map = buildExtensionMap(records as never[]);
    expect(map.get('LOT004')).toBe(0);
  });

  it('guards against negative day values', () => {
    const records = [
      {
        SERIALNAME: 'LOT005',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-15T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT005')).toBe(0);
  });

  it('trims SERIALNAME for map key', () => {
    const records = [
      {
        SERIALNAME: '  LOT006  ',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT006')).toBe(7);
  });

  it('returns empty map for empty input', () => {
    const map = buildExtensionMap([]);
    expect(map.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd server && npx vitest run src/reports/bbdReport.test.ts`
Expected: All 7 tests pass

- [ ] **Step 3: Commit**

```bash
git add server/src/reports/bbdReport.test.ts
git commit -m "test: add buildExtensionMap unit tests"
```

---

## Task 3: Add `httpsPatch` to Priority HTTP layer

**Files:**
- Modify: `server/src/services/priorityHttp.ts`

- [ ] **Step 1: Add `httpsPatch` function**

Add after `httpsGet` (after line 47):

```ts
// WHY: Extend endpoint needs PATCH support. Uses https.request (not https.get)
// to send a JSON body with PATCH method. Same auth + headers as httpsGet.
function httpsRequest(url: string, method: string, body: unknown): Promise<HttpsResponse> {
  const config = getPriorityConfig();
  const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
  const jsonBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'IEEE754Compatible': 'true',
        'Authorization': `Basic ${auth}`,
        'Content-Length': Buffer.byteLength(jsonBody),
      },
      timeout: 30_000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 500, body: Buffer.concat(chunks).toString('utf-8') });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
    req.write(jsonBody);
    req.end();
  });
}
```

- [ ] **Step 2: Add `patchWithRetry` export function**

Add after `fetchWithRetry`:

```ts
// WHY: Same retry logic as fetchWithRetry but for PATCH requests.
// Used by the extend endpoint to write to Priority.
export async function patchWithRetry(url: string, body: unknown, attempt = 0, maxRetries = 3): Promise<HttpsResponse> {
  await rateLimitDelay();

  const response = await httpsRequest(url, 'PATCH', body);

  if (response.status === 401) {
    throw new Error('Priority auth failed — check credentials');
  }

  if (response.status === 429 && attempt < maxRetries) {
    const errMsg = extractErrorMessage(response.body);
    const delay = Math.pow(2, attempt) * 1000;
    console.warn(`[priority] Rate limited on PATCH (${errMsg}) — retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return patchWithRetry(url, body, attempt + 1, maxRetries);
  }

  if (response.status >= 500 && attempt < 1) {
    const errMsg = extractErrorMessage(response.body);
    console.warn(`[priority] Server error ${response.status} on PATCH (${errMsg}) — retrying once`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return patchWithRetry(url, body, attempt + 1, 1);
  }

  return response;
}
```

- [ ] **Step 3: Update EXPORTS in intent block**

Update line 7:

```ts
// EXPORTS: fetchWithRetry, patchWithRetry, extractErrorMessage, HttpsResponse
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/services/priorityHttp.ts
git commit -m "feat: add patchWithRetry to Priority HTTP layer"
```

---

## Task 4: Create extend route and mount it

**Files:**
- Create: `server/src/routes/extend.ts`
- Modify: `server/src/index.ts`

- [ ] **Step 1: Create the extend route**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/extend.ts
// PURPOSE: POST endpoint for extending expiration dates via the
//          Priority EXPDSERIAL/EXPDEXT_SUBFORM API. Supports
//          single and bulk operations.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExtendRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry, patchWithRetry, extractErrorMessage } from '../services/priorityHttp';
import { logApiCall } from '../services/logger';

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),
    days: z.number().int().min(1).max(365),
  })).min(1).max(100),
});

interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

// WHY: Adds N days to an ISO date string and returns Priority format.
function addDaysToDate(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('.')[0] + 'Z';
}

async function processExtendItem(
  serialName: string, days: number, baseUrl: string,
): Promise<ExtendResult> {
  // Step 1: Look up current expiry date from EXPDSERIAL
  const escapedName = serialName.replace(/'/g, "''");
  const lookupUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')?$select=SERIALNAME,EXPIRYDATE`;

  const lookupResponse = await fetchWithRetry(lookupUrl);

  if (lookupResponse.status === 404) {
    return { serialName, success: false, error: 'Lot not found in expiration tracking system' };
  }

  if (lookupResponse.status < 200 || lookupResponse.status >= 300) {
    const msg = extractErrorMessage(lookupResponse.body);
    return { serialName, success: false, error: `Lookup failed: ${msg}` };
  }

  const lookupData = JSON.parse(lookupResponse.body);
  const currentExpiryDate = lookupData.EXPIRYDATE as string;

  if (!currentExpiryDate) {
    return { serialName, success: false, error: 'No expiry date found on EXPDSERIAL record' };
  }

  // Step 2: Calculate new expiry date
  const newExpiryDate = addDaysToDate(currentExpiryDate, days);

  // Step 3: Deep PATCH — create EXPDEXT record via parent
  const patchUrl = `${baseUrl}EXPDSERIAL(SERIALNAME='${escapedName}')`;
  const patchBody = {
    EXPDEXT_SUBFORM: [{
      RENEWDATE: currentExpiryDate,
      EXPIRYDATE: newExpiryDate,
    }],
  };

  const patchResponse = await patchWithRetry(patchUrl, patchBody);

  if (patchResponse.status < 200 || patchResponse.status >= 300) {
    const msg = extractErrorMessage(patchResponse.body);
    return { serialName, success: false, error: `Extension failed: ${msg}` };
  }

  return { serialName, success: true, newExpiryDate };
}

export function createExtendRouter(): Router {
  const router = Router();

  router.post('/bbd/extend', async (req, res) => {
    const parsed = ExtendRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues });
      return;
    }

    const { items } = parsed.data;
    const config = getPriorityConfig();

    const results: ExtendResult[] = [];
    for (const item of items) {
      const result = await processExtendItem(item.serialName, item.days, config.baseUrl);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;
    logApiCall('bbd-extend', `Extended ${successCount}/${results.length} lots`);

    res.json({ results });
  });

  return router;
}
```

- [ ] **Step 2: Mount the extend route in index.ts**

Add import at line 19 (after subform import):

```ts
import { createExtendRouter } from './routes/extend';
```

Add mount after the subform router (after line 39):

```ts
app.use('/api/v1/reports', createExtendRouter());
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/extend.ts server/src/index.ts
git commit -m "feat: add POST /bbd/extend endpoint for expiry date extension"
```

---

## Task 5: Create Modal base component

**Files:**
- Create: `client/src/components/modals/Modal.tsx`

- [ ] **Step 1: Create the Modal component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/Modal.tsx
// PURPOSE: Reusable modal base — portal-rendered with backdrop,
//          animation, Escape key dismiss, and preventClose guard.
//          First modal in the codebase.
// USED BY: ExtendExpiryModal, BulkExtendModal
// EXPORTS: Modal
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE_FAST } from '../../config/animationConstants';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  preventClose?: boolean;
}

export default function Modal({
  isOpen, onClose, title, children,
  maxWidth = 'max-w-lg', preventClose = false,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // WHY: Focus first focusable element on open for accessibility.
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const focusable = contentRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [isOpen]);

  // WHY: Close on Escape key — disabled during submission (preventClose).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, preventClose, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={EASE_FAST}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={preventClose ? undefined : onClose}
            data-testid="modal-backdrop"
          />

          {/* Content */}
          <motion.div
            ref={contentRef}
            className={`relative bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[85vh] overflow-hidden flex flex-col`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={EASE_FAST}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {!preventClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add client/src/components/modals/Modal.tsx
git commit -m "feat: add reusable Modal base component"
```

---

## Task 6: Create ExpiryDateCell component

**Files:**
- Create: `client/src/components/cells/ExpiryDateCell.tsx`

- [ ] **Step 1: Create the cell component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/cells/ExpiryDateCell.tsx
// PURPOSE: Custom cell renderer for the BBD Expiry Date column.
//          Shows the formatted date with an inline Extend button.
// USED BY: useBBDExtend (registered as cellRenderer for expiryDate)
// EXPORTS: ExpiryDateCell
// ═══════════════════════════════════════════════════════════════

import { formatCellValue } from '../../utils/formatters';

interface ExpiryDateCellProps {
  value: unknown;
  onExtend: () => void;
}

export default function ExpiryDateCell({ value, onExtend }: ExpiryDateCellProps) {
  const { formatted } = formatCellValue(value, 'date');

  return (
    <span className="flex items-center gap-2">
      <span>{formatted}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExtend();
        }}
        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        Extend
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/cells/ExpiryDateCell.tsx
git commit -m "feat: add ExpiryDateCell component with inline Extend button"
```

---

## Task 7: Add `cellRenderers` support to ReportTable

**Files:**
- Modify: `client/src/components/ReportTable.tsx`

- [ ] **Step 1: Add `cellRenderers` prop to `ReportTableProps`**

In `ReportTableProps` (line 34), add:

```ts
  cellRenderers?: Record<string, (value: unknown, row: Record<string, unknown>) => React.ReactNode>;
```

- [ ] **Step 2: Thread `cellRenderers` through to `ExpandableRow`**

Pass `cellRenderers` from `ReportTable` to each `ExpandableRow`. Add to `ExpandableRowProps`:

```ts
  cellRenderers?: Record<string, (value: unknown, row: Record<string, unknown>) => React.ReactNode>;
```

Pass it in the JSX where `ExpandableRow` is rendered.

- [ ] **Step 3: Use `cellRenderers` in the cell rendering loop**

In `ExpandableRow`, replace the cell rendering loop (lines 163-175):

```tsx
        {columns.map((col) => {
          const customRenderer = cellRenderers?.[col.key];
          if (customRenderer) {
            return (
              <td key={col.key} className="px-5 py-3 text-slate-700 whitespace-nowrap">
                {customRenderer(row[col.key], row)}
              </td>
            );
          }
          const { formatted, isNegative } = formatCellValue(row[col.key], col.type);
          return (
            <td
              key={col.key}
              className={`px-5 py-3 text-slate-700 whitespace-nowrap ${
                col.type === 'currency' || col.type === 'number' ? 'text-right tabular-nums' : ''
              } ${isNegative ? 'text-red-500' : ''}`}
            >
              {formatted}
            </td>
          );
        })}
```

- [ ] **Step 4: Add `React` import for ReactNode type**

Ensure `import type { ReactNode } from 'react'` is present, or the type is referenced correctly.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ReportTable.tsx
git commit -m "feat: add cellRenderers support to ReportTable"
```

---

## Task 8: Create `useExtendExpiry` mutation hook

**Files:**
- Create: `client/src/hooks/useExtendExpiry.ts`

- [ ] **Step 1: Create the hook**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendExpiry.ts
// PURPOSE: TanStack Query v5 mutation hook for extending expiry
//          dates via POST /api/v1/reports/bbd/extend. Invalidates
//          the BBD report cache on success.
// USED BY: ExtendExpiryModal, BulkExtendModal (via useBBDExtend)
// EXPORTS: useExtendExpiry, ExtendRequest, ExtendResponse, ExtendResult
// ═══════════════════════════════════════════════════════════════

import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface ExtendRequest {
  items: Array<{ serialName: string; days: number }>;
}

export interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

export interface ExtendResponse {
  results: ExtendResult[];
}

export function useExtendExpiry() {
  const queryClient = useQueryClient();

  const mutation = useMutation<ExtendResponse, Error, ExtendRequest>({
    mutationFn: async (request) => {
      const res = await fetch('/api/v1/reports/bbd/extend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error ?? `Request failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // WHY: Prefix-based invalidation refreshes all BBD query variants
      // (any filter/pagination combo). Same pattern as handleRefresh.
      queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] });
    },
  });

  return {
    extend: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useExtendExpiry.ts
git commit -m "feat: add useExtendExpiry TanStack mutation hook"
```

---

## Task 9: Create `useBBDExtend` orchestration hook

**Files:**
- Create: `client/src/hooks/useBBDExtend.ts`

- [ ] **Step 1: Create the hook**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useBBDExtend.ts
// PURPOSE: BBD-specific extend orchestration — modal state,
//          cellRenderers, and callbacks. Extracted to keep
//          ReportTableWidget under 200 lines.
// USED BY: ReportTableWidget
// EXPORTS: useBBDExtend
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import ExpiryDateCell from '../components/cells/ExpiryDateCell';

interface ExtendModalState {
  type: 'single' | 'bulk';
  row?: Record<string, unknown>;
}

export function useBBDExtend(reportId: string) {
  const [extendModal, setExtendModal] = useState<ExtendModalState | null>(null);

  const handleExtendClick = useCallback((row: Record<string, unknown>) => {
    setExtendModal({ type: 'single', row });
  }, []);

  const handleBulkExtend = useCallback(() => {
    setExtendModal({ type: 'bulk' });
  }, []);

  const closeModal = useCallback(() => {
    setExtendModal(null);
  }, []);

  const handleExtendSuccess = useCallback(() => {
    setExtendModal(null);
  }, []);

  const cellRenderers = useMemo(() => {
    if (reportId !== 'bbd') return undefined;
    return {
      expiryDate: (value: unknown, row: Record<string, unknown>): ReactNode => (
        <ExpiryDateCell
          value={value}
          onExtend={() => handleExtendClick(row)}
        />
      ),
    };
  }, [reportId, handleExtendClick]);

  return {
    extendModal,
    cellRenderers,
    handleExtendClick,
    handleBulkExtend,
    handleExtendSuccess,
    closeModal,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useBBDExtend.ts
git commit -m "feat: add useBBDExtend orchestration hook"
```

---

## Task 10: Create ExtendExpiryModal

**Files:**
- Create: `client/src/components/modals/ExtendExpiryModal.tsx`

- [ ] **Step 1: Create the modal component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/ExtendExpiryModal.tsx
// PURPOSE: Modal for extending a single lot's expiration date.
//          Shows lot info, days input, computed new date,
//          confirmation step, and submit/error states.
// USED BY: ReportTableWidget (via useBBDExtend)
// EXPORTS: ExtendExpiryModal
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { useExtendExpiry } from '../../hooks/useExtendExpiry';
import { formatCellValue } from '../../utils/formatters';

type ModalState = 'idle' | 'confirming' | 'submitting' | 'success' | 'error';

interface ExtendExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  serialName: string;
  partName: string;
  partDescription: string;
  currentExpiryDate: string;
  onSuccess: () => void;
}

function computeNewDate(currentDate: string, days: number): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export default function ExtendExpiryModal({
  isOpen, onClose, serialName, partName,
  partDescription, currentExpiryDate, onSuccess,
}: ExtendExpiryModalProps) {
  const [days, setDays] = useState(7);
  const [state, setState] = useState<ModalState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { extend, reset } = useExtendExpiry();

  const newExpiryDate = computeNewDate(currentExpiryDate, days);
  const { formatted: currentFormatted } = formatCellValue(currentExpiryDate, 'date');
  const { formatted: newFormatted } = formatCellValue(newExpiryDate, 'date');

  // WHY: Reset state when modal opens with new data.
  useEffect(() => {
    if (isOpen) {
      setDays(7);
      setState('idle');
      setErrorMessage('');
      reset();
    }
  }, [isOpen, reset]);

  // WHY: Auto-close after success with brief delay for user to see confirmation.
  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => {
        onSuccess();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, onSuccess]);

  const handleSubmit = async () => {
    setState('submitting');
    try {
      const response = await extend({ items: [{ serialName, days }] });
      const result = response.results[0];
      if (result?.success) {
        setState('success');
      } else {
        setErrorMessage(result?.error ?? 'Extension failed');
        setState('error');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  };

  const isSubmitting = state === 'submitting';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Extend Expiration Date"
      preventClose={isSubmitting}
    >
      <div className="px-6 py-4 space-y-4">
        {state === 'success' ? (
          <div className="text-center py-6">
            <p className="text-lg font-medium text-green-600">Extended successfully</p>
            <p className="text-sm text-slate-500 mt-1">
              {serialName}: {currentFormatted} → {newFormatted}
            </p>
          </div>
        ) : state === 'confirming' ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Extend lot <span className="font-semibold">{serialName}</span> from{' '}
              <span className="font-semibold">{currentFormatted}</span> to{' '}
              <span className="font-semibold">{newFormatted}</span> ({days} days)?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setState('idle')}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Read-only info */}
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="w-32 text-slate-500">Lot Number</span>
                <span className="font-medium text-slate-900">{serialName}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Part Number</span>
                <span className="font-medium text-slate-900">{partName}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Description</span>
                <span className="font-medium text-slate-900">{partDescription}</span>
              </div>
              <div className="flex">
                <span className="w-32 text-slate-500">Current Expiry</span>
                <span className="font-medium text-slate-900">{currentFormatted}</span>
              </div>
            </div>

            {/* Days input */}
            <div className="flex items-center gap-3 pt-2">
              <label htmlFor="extend-days" className="text-sm text-slate-600">Extend by</label>
              <input
                id="extend-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                disabled={isSubmitting}
                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
              />
              <span className="text-sm text-slate-600">days</span>
            </div>

            {/* New expiry */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">New expiry:</span>
              <span className="font-semibold text-slate-900">{newFormatted}</span>
            </div>

            {/* Error message */}
            {state === 'error' && (
              <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setState('confirming')}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {state === 'error' ? 'Retry' : 'Extend'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/modals/ExtendExpiryModal.tsx
git commit -m "feat: add ExtendExpiryModal for single-row expiry extension"
```

---

## Task 11: Create BulkExtendModal

**Files:**
- Create: `client/src/components/modals/BulkExtendModal.tsx`

- [ ] **Step 1: Create the bulk modal component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendModal.tsx
// PURPOSE: Modal for extending multiple lots at once. Shows
//          a selectable list of all BBD rows with shared days
//          input and confirmation flow.
// USED BY: ReportTableWidget (via useBBDExtend)
// EXPORTS: BulkExtendModal
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from './Modal';
import { useExtendExpiry } from '../../hooks/useExtendExpiry';
import { formatCellValue } from '../../utils/formatters';

type ModalState = 'idle' | 'confirming' | 'submitting' | 'done';

// WHY: Same map as ReportTable ROW_STYLE_MAP — duplicated here because
// importing from ReportTable would create a circular dependency.
const STATUS_BG: Record<string, string> = {
  'expired': 'bg-red-50',
  'expiring-perishable': 'bg-orange-50',
  'expiring-non-perishable': 'bg-amber-50',
};

interface BulkExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: Array<Record<string, unknown>>;
  onSuccess: () => void;
}

function computeNewDate(currentDate: string, days: number): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export default function BulkExtendModal({
  isOpen, onClose, rows, onSuccess,
}: BulkExtendModalProps) {
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<ModalState>('idle');
  const [resultSummary, setResultSummary] = useState('');
  const [failedItems, setFailedItems] = useState<Array<{ serialName: string; error: string }>>([]);
  const { extend, reset } = useExtendExpiry();

  // WHY: Reset state when modal opens.
  useEffect(() => {
    if (isOpen) {
      setDays(7);
      setSelected(new Set());
      setState('idle');
      setResultSummary('');
      setFailedItems([]);
      reset();
    }
  }, [isOpen, reset]);

  const allSerialNames = useMemo(
    () => rows.map((r) => r.serialName as string),
    [rows],
  );

  const isAllSelected = selected.size === rows.length && rows.length > 0;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allSerialNames));
    }
  };

  const toggleRow = (serialName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(serialName) ? next.delete(serialName) : next.add(serialName);
      return next;
    });
  };

  const handleSubmit = async () => {
    setState('submitting');
    try {
      const items = Array.from(selected).map((serialName) => ({ serialName, days }));
      const response = await extend({ items });
      const successCount = response.results.filter((r) => r.success).length;
      const failed = response.results
        .filter((r) => !r.success)
        .map((r) => ({ serialName: r.serialName, error: r.error ?? 'Unknown error' }));

      setFailedItems(failed);
      if (failed.length === 0) {
        setResultSummary(`Extended ${successCount}/${response.results.length} successfully`);
      } else {
        setResultSummary(`Extended ${successCount}/${response.results.length} — ${failed.length} failed`);
      }
      setState('done');
    } catch (err) {
      setResultSummary(err instanceof Error ? err.message : 'Network error');
      setFailedItems([]);
      setState('done');
    }
  };

  const isSubmitting = state === 'submitting';

  return (
    <Modal
      isOpen={isOpen}
      onClose={state === 'done' ? () => { onSuccess(); } : onClose}
      title="Extend Expiration Dates"
      maxWidth="max-w-3xl"
      preventClose={isSubmitting}
    >
      <div className="px-6 py-4 space-y-4">
        {state === 'done' ? (
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium text-slate-900">{resultSummary}</p>
            {failedItems.length > 0 && (
              <div className="space-y-1">
                {failedItems.map((item) => (
                  <div key={item.serialName} className="text-xs text-red-700 bg-red-50 px-3 py-1.5 rounded">
                    <span className="font-medium">{item.serialName}:</span> {item.error}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2">
              <button
                onClick={() => { onSuccess(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Days input */}
            <div className="flex items-center gap-3">
              <label htmlFor="bulk-extend-days" className="text-sm text-slate-600">Extend by</label>
              <input
                id="bulk-extend-days"
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                disabled={isSubmitting}
                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
              />
              <span className="text-sm text-slate-600">days</span>
            </div>

            {/* Select all */}
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                disabled={isSubmitting || rows.length === 0}
                className="rounded border-slate-300"
              />
              Select all ({rows.length} items)
            </label>

            {/* Scrollable row list */}
            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
                    <th className="px-3 py-2 w-8"></th>
                    <th className="px-3 py-2">Lot Number</th>
                    <th className="px-3 py-2">Part Number</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2">Current Expiry</th>
                    <th className="px-3 py-2">New Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const serialName = row.serialName as string;
                    const status = row.status as string;
                    const { formatted: currentFmt } = formatCellValue(row.expiryDate, 'date');
                    const newDate = computeNewDate(row.expiryDate as string, days);
                    const { formatted: newFmt } = formatCellValue(newDate, 'date');
                    const bgClass = STATUS_BG[status] ?? '';

                    return (
                      <tr
                        key={serialName}
                        className={`border-b border-slate-100 ${bgClass}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(serialName)}
                            onChange={() => toggleRow(serialName)}
                            disabled={isSubmitting}
                            className="rounded border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-2 font-medium">{serialName}</td>
                        <td className="px-3 py-2">{row.partNumber as string}</td>
                        <td className="px-3 py-2 max-w-[200px] truncate">{row.partDescription as string}</td>
                        <td className="px-3 py-2">{currentFmt}</td>
                        <td className="px-3 py-2 font-medium text-primary">{newFmt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Confirmation */}
            {state === 'confirming' && (
              <div className="px-3 py-2 text-sm text-slate-700 bg-blue-50 border border-blue-200 rounded-lg">
                Extend <span className="font-semibold">{selected.size}</span> lots by <span className="font-semibold">{days}</span> days?
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              {state === 'confirming' ? (
                <>
                  <button
                    onClick={() => setState('idle')}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-2"
                  >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setState('confirming')}
                  disabled={selected.size === 0 || isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                  Extend {selected.size} items
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/modals/BulkExtendModal.tsx
git commit -m "feat: add BulkExtendModal for multi-lot expiry extension"
```

---

## Task 12: Add Extend button to TableToolbar

**Files:**
- Modify: `client/src/components/TableToolbar.tsx`

- [ ] **Step 1: Add `onBulkExtend` prop and import `CalendarClock`**

Add to imports:

```ts
import { SlidersHorizontal, Columns3, ArrowUpDown, ChevronDown, Download, Loader2, RefreshCw, CalendarClock } from 'lucide-react';
```

Add to `TableToolbarProps`:

```ts
  onBulkExtend?: () => void;
```

Add to the destructured props.

- [ ] **Step 2: Add Extend button before Export button**

In the `ml-auto` div (line 84), add the Extend button between Refresh and Export:

```tsx
        {onBulkExtend && (
          <button
            onClick={onBulkExtend}
            className={`${baseClass} ${inactiveClass}`}
          >
            <CalendarClock size={16} />
            <span>Extend</span>
          </button>
        )}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TableToolbar.tsx
git commit -m "feat: add Extend button to TableToolbar"
```

---

## Task 13: Wire everything in ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add imports**

Add after existing imports:

```ts
import { useBBDExtend } from '../../hooks/useBBDExtend';
import ExtendExpiryModal from '../modals/ExtendExpiryModal';
import BulkExtendModal from '../modals/BulkExtendModal';
```

- [ ] **Step 2: Call useBBDExtend hook**

After the `useExport` call (line 68), add:

```ts
  const {
    extendModal, cellRenderers, handleBulkExtend, handleExtendSuccess, closeModal,
  } = useBBDExtend(reportId);
```

- [ ] **Step 3: Pass `onBulkExtend` to TableToolbar**

Add prop to `TableToolbar` (after `onRefresh`):

```ts
        onBulkExtend={reportId === 'bbd' ? handleBulkExtend : undefined}
```

- [ ] **Step 4: Pass `cellRenderers` to ReportTable**

Add prop to `ReportTable`:

```ts
            cellRenderers={cellRenderers}
```

- [ ] **Step 5: Add modal rendering after Toast**

Add before the closing `</>`:

```tsx
      {extendModal?.type === 'single' && extendModal.row && (
        <ExtendExpiryModal
          isOpen
          onClose={closeModal}
          serialName={extendModal.row.serialName as string}
          partName={extendModal.row.partNumber as string}
          partDescription={extendModal.row.partDescription as string}
          currentExpiryDate={extendModal.row.expiryDate as string}
          onSuccess={handleExtendSuccess}
        />
      )}

      {extendModal?.type === 'bulk' && (
        <BulkExtendModal
          isOpen
          onClose={closeModal}
          rows={sortedDisplayData}
          onSuccess={handleExtendSuccess}
        />
      )}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: wire extend modals and cellRenderers into ReportTableWidget"
```

---

## Task 14: Full verification

- [ ] **Step 1: Run server TypeScript build**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Run client TypeScript build**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Run server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass (including new bbdReport.test.ts)

- [ ] **Step 4: Run client tests**

Run: `cd client && npx vitest run`
Expected: All existing tests pass. (New test files for modals/hooks are added in follow-up TDD tasks.)

- [ ] **Step 5: Start dev servers and visually verify**

Run: `cd server && npm run dev` (terminal 1)
Run: `cd client && npm run dev` (terminal 2)

Verify at `http://localhost:5173/purchasing/bbd`:
1. Lot Number column appears as the first column
2. Days Ext. column appears after Expiry Date
3. Each Expiry Date cell shows an inline "Extend" button
4. Toolbar shows an "Extend" button near Export
5. Clicking row-level "Extend" opens the single-row modal
6. Clicking toolbar "Extend" opens the bulk modal
7. Both modals show correct data and the confirmation flow works

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final verification and cleanup for BBD extend feature"
```
