# BBD Extended Items Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secondary "Extended" tab to the BBD report that shows items whose expiration dates were extended, backed by Airtable snapshot storage with live balance refresh from Priority.

**Architecture:** When a user extends an expiry date, the backend snapshots the item data to Airtable (fire-and-forget). A new GET endpoint reads from Airtable, refreshes balances from Priority, writes updated balances back, and returns the data. The frontend uses sub-tabs to switch between the existing Priority data (Active) and the Airtable data (Extended).

**Tech Stack:** Express + TypeScript backend, Airtable REST API (native fetch), Priority oData API (fetchWithRetry), React 19 + TanStack Query v5 frontend, Framer Motion animations, Vitest + React Testing Library tests.

**Spec:** `docs/superpowers/specs/2026-04-09-bbd-extended-tab-design.md`

---

## Task 1: Create Airtable Table Fields

**Files:**
- No code files — uses Airtable MCP tools to create fields

This task creates all 14 fields in the "Product Lots" table (`tblR550VQRqNgNMNE`) in the "Short-Dated Items" base (`appEIH4f5K3vrKBuy`). The existing Name field (`fldkTERhjx4Nq2Xdj`) is repurposed as "Lot Number".

- [ ] **Step 1: Create all fields using Airtable MCP `create_field` tool**

Create each field one at a time. Record the returned field ID for each. The fields to create:

1. Part Number — `singleLineText`
2. Part Description — `singleLineText`
3. Balance — `number`, precision: 2
4. Unit — `singleLineText`
5. Value — `currency`, symbol: "$", precision: 2
6. Purchase Price — `number`, precision: 2
7. Vendor — `singleLineText`
8. Perishable — `singleSelect`, choices: [{name: "Yes"}, {name: "No"}]
9. Brand — `singleLineText`
10. Family — `singleLineText`
11. Original Expiry Date — `date`, dateFormat: {name: "iso"}
12. New Expiry Date — `date`, dateFormat: {name: "iso"}
13. Days Extended — `number`, precision: 0
14. Extension Date — `dateTime`, dateFormat: {name: "iso"}, timeFormat: {name: "24hour"}, timeZone: "America/New_York"

- [ ] **Step 2: Rename the Name field to "Lot Number"**

Use MCP `update_field` to rename field `fldkTERhjx4Nq2Xdj` from "Name" to "Lot Number".

- [ ] **Step 3: Record all field IDs**

Create a temporary file `docs/airtable-field-ids.md` with all the captured field IDs. These will be hardcoded in Task 2. Example format:

```markdown
# Short-Dated Items — Field IDs
- Lot Number: fldkTERhjx4Nq2Xdj (existing)
- Part Number: fldXXXXXXXXXXXXX
- Part Description: fldXXXXXXXXXXXXX
... (fill in actual IDs from Step 1)
```

- [ ] **Step 4: Delete the 3 empty records in the table**

Use MCP `delete_records` to remove the 3 default empty records from the table.

---

## Task 1.5: Replace Placeholder Field IDs

After Task 1 captures all field IDs, update the `F` constant object in `server/src/services/airtableShortDated.ts` (created in Task 2). Replace every `REPLACE_WITH_ACTUAL_ID` with the actual field ID from `docs/airtable-field-ids.md`. This step must be done before any Airtable I/O functions are tested.

---

## Task 2: Create Airtable Service — Pure Functions

**Files:**
- Create: `server/src/services/airtableShortDated.ts`
- Create: `server/src/services/airtableShortDated.test.ts`

Start with the pure function `mergeBalances` (no I/O, fully testable).

- [ ] **Step 1: Write tests for `mergeBalances`**

```typescript
// server/src/services/airtableShortDated.test.ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/airtableShortDated.test.ts
// PURPOSE: Tests for Airtable Short-Dated Items service — pure
//          functions and mocked I/O operations.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { mergeBalances } from './airtableShortDated';

describe('mergeBalances', () => {
  const makeRow = (overrides = {}) => ({
    _recordId: 'recABC',
    serialName: 'LOT001',
    partNumber: 'RM001',
    partDescription: 'Sugar',
    balance: 50,
    unit: 'KG',
    value: 125,
    purchasePrice: 2.5,
    vendor: 'Acme',
    perishable: 'Yes',
    brand: 'BrandX',
    family: 'Sweeteners',
    originalExpiryDate: '2026-04-01',
    newExpiryDate: '2026-04-08',
    daysExtended: 7,
    extensionDate: '2026-04-01T12:00:00.000Z',
    ...overrides,
  });

  it('updates balance with Priority value when positive', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5 })];
    const priorityMap = new Map([['LOT001', { balance: 75, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(75);
  });

  it('preserves all other fields when merging', () => {
    const rows = [makeRow()];
    const priorityMap = new Map([['LOT001', { balance: 75, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].partNumber).toBe('RM001');
    expect(mergedRows[0].vendor).toBe('Acme');
    expect(mergedRows[0].originalExpiryDate).toBe('2026-04-01');
  });

  it('handles zero balance — does not treat 0 as missing', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5 })];
    const priorityMap = new Map([['LOT001', { balance: 0, purchasePrice: 2.5 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(0);
    expect(mergedRows[0].value).toBe(0);
  });

  it('handles missing Priority data — keeps existing Airtable balance unchanged', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5, value: 125 })];
    const priorityMap = new Map(); // empty — lot not in Priority
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].balance).toBe(50);
    expect(mergedRows[0].value).toBe(125);
  });

  it('recalculates value rounded to 2 decimal places — no floating-point drift', () => {
    const rows = [makeRow({ balance: 0, purchasePrice: 1.1 })];
    const priorityMap = new Map([['LOT001', { balance: 1.1, purchasePrice: 1.1 }]]);
    const { mergedRows } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].value).toBe(1.21); // Not 1.2100000000000002
  });

  it('returns empty changedRecords list when all balances match Airtable values', () => {
    const rows = [makeRow({ balance: 50, purchasePrice: 2.5, value: 125 })];
    const priorityMap = new Map([['LOT001', { balance: 50, purchasePrice: 2.5 }]]);
    const { changedRecords } = mergeBalances(rows, priorityMap);
    expect(changedRecords).toHaveLength(0);
  });

  it('recalculates value as balance x purchasePrice', () => {
    const rows = [makeRow({ balance: 10, purchasePrice: 3 })];
    const priorityMap = new Map([['LOT001', { balance: 20, purchasePrice: 3 }]]);
    const { mergedRows, changedRecords } = mergeBalances(rows, priorityMap);
    expect(mergedRows[0].value).toBe(60);
    expect(changedRecords).toHaveLength(1);
    expect(changedRecords[0].recordId).toBe('recABC');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run src/services/airtableShortDated.test.ts`
Expected: FAIL — `mergeBalances` does not exist yet.

- [ ] **Step 3: Create `airtableShortDated.ts` with constants and `mergeBalances`**

```typescript
// server/src/services/airtableShortDated.ts
// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/airtableShortDated.ts
// PURPOSE: Airtable CRUD for the Short-Dated Items base. Handles
//          extension snapshots, balance refresh from Priority,
//          and batch writes. Fire-and-forget on write failures.
// USED BY: routes/extend.ts
// EXPORTS: snapshotExtendedItem, fetchExtendedItems,
//          refreshBalancesFromPriority, batchUpdateAirtableBalances,
//          mergeBalances
// ═══════════════════════════════════════════════════════════════

import { env } from '../config/environment';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry } from './priorityHttp';

// --- Airtable Constants ---
// WHY: Field IDs are permanent. Field names can change.
const BASE_ID = 'appEIH4f5K3vrKBuy';
const TABLE_ID = 'tblR550VQRqNgNMNE';
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

// WHY: Replace these placeholder IDs with actual IDs from Task 1 Step 3.
const F = {
  lotNumber: 'fldkTERhjx4Nq2Xdj',       // Name field (existing, repurposed)
  partNumber: 'REPLACE_WITH_ACTUAL_ID',    // Created in Task 1
  partDescription: 'REPLACE_WITH_ACTUAL_ID',
  balance: 'REPLACE_WITH_ACTUAL_ID',
  unit: 'REPLACE_WITH_ACTUAL_ID',
  value: 'REPLACE_WITH_ACTUAL_ID',
  purchasePrice: 'REPLACE_WITH_ACTUAL_ID',
  vendor: 'REPLACE_WITH_ACTUAL_ID',
  perishable: 'REPLACE_WITH_ACTUAL_ID',
  brand: 'REPLACE_WITH_ACTUAL_ID',
  family: 'REPLACE_WITH_ACTUAL_ID',
  originalExpiryDate: 'REPLACE_WITH_ACTUAL_ID',
  newExpiryDate: 'REPLACE_WITH_ACTUAL_ID',
  daysExtended: 'REPLACE_WITH_ACTUAL_ID',
  extensionDate: 'REPLACE_WITH_ACTUAL_ID',
};

// --- Types ---

export interface ExtendedItemRow {
  _recordId: string;
  serialName: string;
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  originalExpiryDate: string;
  newExpiryDate: string;
  daysExtended: number;
  extensionDate: string;
}

export interface RowData {
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  expiryDate: string;
}

interface BalanceUpdate {
  recordId: string;
  balance: number;
  value: number;
}

// --- Pure Functions ---

export function mergeBalances(
  rows: ExtendedItemRow[],
  priorityMap: Map<string, { balance: number; purchasePrice: number }>,
): { mergedRows: ExtendedItemRow[]; changedRecords: BalanceUpdate[] } {
  const changedRecords: BalanceUpdate[] = [];
  const mergedRows = rows.map((row) => {
    const priority = priorityMap.get(row.serialName);
    if (!priority) return row;

    const newBalance = priority.balance;
    const newValue = Math.round(newBalance * row.purchasePrice * 100) / 100;

    if (newBalance !== row.balance) {
      changedRecords.push({ recordId: row._recordId, balance: newBalance, value: newValue });
    }

    return { ...row, balance: newBalance, value: newValue };
  });

  return { mergedRows, changedRecords };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/services/airtableShortDated.test.ts`
Expected: All 7 `mergeBalances` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/services/airtableShortDated.ts server/src/services/airtableShortDated.test.ts
git commit -m "feat(bbd-extended): add mergeBalances pure function with tests"
```

---

## Task 3: Airtable Service — I/O Functions

**Files:**
- Modify: `server/src/services/airtableShortDated.ts`
- Modify: `server/src/services/airtableShortDated.test.ts`

Add the remaining exported functions: `snapshotExtendedItem`, `fetchExtendedItems`, `refreshBalancesFromPriority`, `batchUpdateAirtableBalances`.

- [ ] **Step 1: Add helper function `airtableHeaders`**

Add to `airtableShortDated.ts` after the constants:

```typescript
function airtableHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json',
  };
}
```

- [ ] **Step 2: Add `snapshotExtendedItem`**

Add to `airtableShortDated.ts`:

```typescript
export async function snapshotExtendedItem(
  lotNumber: string,
  rowData: RowData | undefined,
  newExpiryDate: string,
  days: number,
): Promise<void> {
  if (!env.AIRTABLE_TOKEN) {
    console.warn(`[bbd-extended] AIRTABLE_TOKEN not set — skipping snapshot for ${lotNumber}`);
    return;
  }

  // WHY: Search by lot number using filterByFormula with field ID.
  // encodeURIComponent required — same pattern as templateService.ts line 40.
  const filterFormula = encodeURIComponent(`{${F.lotNumber}}="${lotNumber}"`);
  const searchUrl = `${AIRTABLE_URL}?filterByFormula=${filterFormula}`;
  const searchRes = await fetch(searchUrl, { headers: airtableHeaders() });

  if (!searchRes.ok) {
    console.warn(`[bbd-extended] Airtable search failed for ${lotNumber}: ${searchRes.status}`);
    return;
  }

  const searchData = await searchRes.json() as { records: Array<{ id: string; fields: Record<string, unknown> }> };
  const existing = searchData.records[0];
  const extensionDate = new Date().toISOString();
  // WHY: Airtable date fields accept YYYY-MM-DD only (no time component).
  const newExpiryDateOnly = newExpiryDate.split('T')[0];
  const originalExpiryDateOnly = rowData?.expiryDate?.split('T')[0] ?? '';

  if (existing) {
    // WHY: PATCH — update existing record. Do NOT overwrite originalExpiryDate.
    const existingDays = (existing.fields[F.daysExtended] as number) ?? 0;
    const patchBody = {
      records: [{
        id: existing.id,
        fields: {
          [F.newExpiryDate]: newExpiryDateOnly,
          [F.daysExtended]: existingDays + days,
          [F.extensionDate]: extensionDate,
          ...(rowData ? {
            [F.balance]: rowData.balance,
            [F.value]: rowData.value,
            [F.purchasePrice]: rowData.purchasePrice,
          } : {}),
        },
      }],
      typecast: true,
    };
    const patchRes = await fetch(AIRTABLE_URL, {
      method: 'PATCH',
      headers: airtableHeaders(),
      body: JSON.stringify(patchBody),
    });
    if (!patchRes.ok) {
      console.warn(`[bbd-extended] Airtable PATCH failed for ${lotNumber}: ${patchRes.status}`);
    }
  } else {
    // WHY: POST — new record. Set originalExpiryDate only on first insert.
    const postBody = {
      records: [{
        fields: {
          [F.lotNumber]: lotNumber,
          [F.originalExpiryDate]: originalExpiryDateOnly,
          [F.newExpiryDate]: newExpiryDateOnly,
          [F.daysExtended]: days,
          [F.extensionDate]: extensionDate,
          ...(rowData ? {
            [F.partNumber]: rowData.partNumber,
            [F.partDescription]: rowData.partDescription,
            [F.balance]: rowData.balance,
            [F.unit]: rowData.unit,
            [F.value]: rowData.value,
            [F.purchasePrice]: rowData.purchasePrice,
            [F.vendor]: rowData.vendor,
            [F.perishable]: rowData.perishable,
            [F.brand]: rowData.brand,
            [F.family]: rowData.family,
          } : {}),
        },
      }],
      typecast: true,
    };
    const postRes = await fetch(AIRTABLE_URL, {
      method: 'POST',
      headers: airtableHeaders(),
      body: JSON.stringify(postBody),
    });
    if (!postRes.ok) {
      console.warn(`[bbd-extended] Airtable POST failed for ${lotNumber}: ${postRes.status}`);
    }
  }
}
```

- [ ] **Step 3: Add `fetchExtendedItems`**

Add to `airtableShortDated.ts`:

```typescript
export async function fetchExtendedItems(): Promise<ExtendedItemRow[]> {
  if (!env.AIRTABLE_TOKEN) {
    throw new Error('AIRTABLE_TOKEN not set — cannot fetch extended items');
  }

  const allRecords: Array<{ id: string; fields: Record<string, unknown> }> = [];
  let offset: string | undefined;

  // WHY: Airtable returns max 100 records per request. Must paginate
  // with offset cursor until no offset is returned.
  do {
    const url = offset ? `${AIRTABLE_URL}?offset=${offset}` : AIRTABLE_URL;
    const res = await fetch(url, { headers: airtableHeaders() });
    if (!res.ok) throw new Error(`Airtable fetch failed: ${res.status}`);
    const data = await res.json() as {
      records: Array<{ id: string; fields: Record<string, unknown> }>;
      offset?: string;
    };
    allRecords.push(...data.records);
    offset = data.offset;
  } while (offset);

  // WHY: Transform Airtable field IDs to report key names.
  const rows: ExtendedItemRow[] = allRecords.map((rec) => ({
    _recordId: rec.id,
    serialName: (rec.fields[F.lotNumber] as string) ?? '',
    partNumber: (rec.fields[F.partNumber] as string) ?? '',
    partDescription: (rec.fields[F.partDescription] as string) ?? '',
    balance: (rec.fields[F.balance] as number) ?? 0,
    unit: (rec.fields[F.unit] as string) ?? '',
    value: (rec.fields[F.value] as number) ?? 0,
    purchasePrice: (rec.fields[F.purchasePrice] as number) ?? 0,
    vendor: (rec.fields[F.vendor] as string) ?? '',
    // WHY: singleSelect fields return {id, name, color} objects, not plain strings.
    perishable: (rec.fields[F.perishable] as { name: string })?.name ?? '',
    brand: (rec.fields[F.brand] as string) ?? '',
    family: (rec.fields[F.family] as string) ?? '',
    originalExpiryDate: (rec.fields[F.originalExpiryDate] as string) ?? '',
    newExpiryDate: (rec.fields[F.newExpiryDate] as string) ?? '',
    daysExtended: (rec.fields[F.daysExtended] as number) ?? 0,
    extensionDate: (rec.fields[F.extensionDate] as string) ?? '',
  }));

  // WHY: Sort in code by Extension Date descending. Avoids depending
  // on field names in Airtable sort params.
  rows.sort((a, b) => new Date(b.extensionDate).getTime() - new Date(a.extensionDate).getTime());

  return rows;
}
```

- [ ] **Step 4: Add `refreshBalancesFromPriority`**

Add to `airtableShortDated.ts`:

```typescript
const CHUNK_SIZE = 30;

export async function refreshBalancesFromPriority(
  lotNumbers: string[],
): Promise<Map<string, { balance: number; purchasePrice: number }>> {
  if (lotNumbers.length === 0) return new Map();

  const config = getPriorityConfig();
  const resultMap = new Map<string, { balance: number; purchasePrice: number }>();

  // WHY: Chunk to groups of 30 to stay within OData URL length limits.
  // Priority's CloudFront can be finicky with long URLs.
  for (let i = 0; i < lotNumbers.length; i += CHUNK_SIZE) {
    const chunk = lotNumbers.slice(i, i + CHUNK_SIZE);
    const filterParts = chunk.map((sn) => `SERIALNAME eq '${sn.replace(/'/g, "''")}'`);
    const filter = filterParts.join(' or ');
    const url = `${config.baseUrl}RAWSERIAL?$select=SERIALNAME,QUANT,Y_8737_0_ESH&$filter=${encodeURIComponent(filter)}&$top=1000`;

    const response = await fetchWithRetry(url);
    if (response.status < 200 || response.status >= 300) {
      console.warn(`[bbd-extended] Priority balance refresh failed: ${response.status}`);
      continue;
    }

    const parsed = JSON.parse(response.body);
    for (const row of (parsed.value ?? [])) {
      const sn = (row.SERIALNAME as string)?.trim();
      if (sn) {
        resultMap.set(sn, {
          balance: Number(row.QUANT ?? 0),
          purchasePrice: Number(row.Y_8737_0_ESH ?? 0),
        });
      }
    }
  }

  return resultMap;
}
```

- [ ] **Step 5: Add `batchUpdateAirtableBalances`**

Add to `airtableShortDated.ts`:

```typescript
const AIRTABLE_BATCH_SIZE = 10;

export async function batchUpdateAirtableBalances(
  updates: BalanceUpdate[],
): Promise<void> {
  if (updates.length === 0 || !env.AIRTABLE_TOKEN) return;

  for (let i = 0; i < updates.length; i += AIRTABLE_BATCH_SIZE) {
    const batch = updates.slice(i, i + AIRTABLE_BATCH_SIZE);
    const body = {
      records: batch.map((u) => ({
        id: u.recordId,
        fields: {
          [F.balance]: u.balance,
          [F.value]: u.value,
        },
      })),
      typecast: true,
    };

    try {
      const res = await fetch(AIRTABLE_URL, {
        method: 'PATCH',
        headers: airtableHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        console.warn(`[bbd-extended] Airtable balance batch update failed: ${res.status}`);
      }
    } catch (err) {
      console.warn('[bbd-extended] Airtable balance batch update error:', err);
    }
  }
}
```

- [ ] **Step 6: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Run existing tests to confirm no regressions**

Run: `cd server && npx vitest run`
Expected: All tests pass (including the mergeBalances tests from Task 2).

- [ ] **Step 8: Commit**

```bash
git add server/src/services/airtableShortDated.ts
git commit -m "feat(bbd-extended): add Airtable service I/O functions"
```

---

## Task 4: Modify Extend Route — POST rowData + GET Extended

**Files:**
- Modify: `server/src/routes/extend.ts`

- [ ] **Step 1: Add rowData to ExtendRequestSchema**

In `server/src/routes/extend.ts`, replace the existing `ExtendRequestSchema` (lines 15-19) with:

```typescript
const RowDataSchema = z.object({
  partNumber: z.string(),
  partDescription: z.string(),
  balance: z.number(),
  unit: z.string(),
  value: z.number(),
  purchasePrice: z.number(),
  vendor: z.string(),
  perishable: z.string(),
  brand: z.string(),
  family: z.string(),
  expiryDate: z.string(),
}).optional();

const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),
    days: z.number().int().min(1).max(365),
    rowData: RowDataSchema,
  })).min(1).max(100),
});
```

- [ ] **Step 2: Add Airtable snapshot import and fire-and-forget write**

Add import at the top of `extend.ts`:

```typescript
import { snapshotExtendedItem } from '../services/airtableShortDated';
```

Add after the `results` loop (after line 100, before `res.json`):

```typescript
    // WHY: Fire-and-forget — snapshot to Airtable after successful Priority extend.
    // Do not await — Airtable failure must not block the response.
    for (const [i, result] of results.entries()) {
      if (result.success && result.newExpiryDate && items[i].rowData) {
        snapshotExtendedItem(
          result.serialName, items[i].rowData!, result.newExpiryDate, items[i].days,
        ).catch((err) => console.warn(`[bbd-extend] Airtable snapshot failed for ${result.serialName}:`, err));
      }
    }
```

- [ ] **Step 3: Add GET `/bbd/extended` route**

Add import at the top of `extend.ts`:

```typescript
import type { ColumnDefinition } from '../../../shared/types/api';
import {
  snapshotExtendedItem,
  fetchExtendedItems,
  refreshBalancesFromPriority,
  mergeBalances,
  batchUpdateAirtableBalances,
} from '../services/airtableShortDated';
```

(Replace the single `snapshotExtendedItem` import from Step 2 with this combined import.)

Add the GET route inside `createExtendRouter()`, before `return router`:

```typescript
  const extendedColumns: ColumnDefinition[] = [
    { key: 'serialName', label: 'Lot Number', type: 'string' },
    { key: 'partNumber', label: 'Part Number', type: 'string' },
    { key: 'partDescription', label: 'Part Description', type: 'string' },
    { key: 'balance', label: 'Balance', type: 'number' },
    { key: 'unit', label: 'Unit', type: 'string' },
    { key: 'value', label: 'Value', type: 'currency' },
    { key: 'vendor', label: 'Vendor', type: 'string' },
    { key: 'perishable', label: 'Perishable', type: 'string' },
    { key: 'brand', label: 'Brand', type: 'string' },
    { key: 'family', label: 'Family', type: 'string' },
    { key: 'originalExpiryDate', label: 'Orig. Expiry', type: 'date' },
    { key: 'newExpiryDate', label: 'New Expiry', type: 'date' },
    { key: 'daysExtended', label: 'Days Ext.', type: 'number' },
    { key: 'extensionDate', label: 'Extended On', type: 'date' },
  ];

  router.get('/bbd/extended', async (_req, res) => {
    try {
      const airtableRows = await fetchExtendedItems();

      if (airtableRows.length === 0) {
        res.json({
          columns: extendedColumns,
          data: [],
          pagination: { totalCount: 0, totalPages: 1, page: 1, pageSize: 0 },
          meta: { source: 'airtable', generatedAt: new Date().toISOString() },
        });
        return;
      }

      const lotNumbers = airtableRows.map((r) => r.serialName);
      let priorityMap = new Map<string, { balance: number; purchasePrice: number }>();
      const warnings: string[] = [];

      try {
        priorityMap = await refreshBalancesFromPriority(lotNumbers);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        warnings.push(`Balance refresh failed: ${msg}`);
      }

      const { mergedRows, changedRecords } = mergeBalances(airtableRows, priorityMap);

      // WHY: Fire-and-forget — update Airtable balances in background.
      if (changedRecords.length > 0) {
        batchUpdateAirtableBalances(changedRecords).catch((err) =>
          console.warn('[bbd-extended] Background balance update failed:', err),
        );
      }

      // WHY: Strip _recordId from response — internal Airtable field, not for the client.
      const data = mergedRows.map(({ _recordId, ...rest }) => rest);

      res.json({
        columns: extendedColumns,
        data,
        pagination: { totalCount: data.length, totalPages: 1, page: 1, pageSize: data.length },
        meta: { source: 'airtable', generatedAt: new Date().toISOString() },
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[bbd-extended] GET /bbd/extended failed:', msg);
      res.status(502).json({ error: `Failed to load extended items: ${msg}` });
    }
  });
```

- [ ] **Step 4: Run TypeScript check**

Run: `cd server && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/extend.ts
git commit -m "feat(bbd-extended): add GET /bbd/extended endpoint and POST rowData support"
```

---

## Task 5: Modify useExtendExpiry — Add rowData to Request Type

**Files:**
- Modify: `client/src/hooks/useExtendExpiry.ts`

- [ ] **Step 1: Expand ExtendRequest type**

In `client/src/hooks/useExtendExpiry.ts`, replace the `ExtendRequest` interface (lines 12-14):

```typescript
export interface RowData {
  partNumber: string;
  partDescription: string;
  balance: number;
  unit: string;
  value: number;
  purchasePrice: number;
  vendor: string;
  perishable: string;
  brand: string;
  family: string;
  expiryDate: string;
}

export interface ExtendRequest {
  items: Array<{ serialName: string; days: number; rowData?: RowData }>;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useExtendExpiry.ts
git commit -m "feat(bbd-extended): add rowData to ExtendRequest type"
```

---

## Task 6: Modify ExtendExpiryModal — Pass rowData

**Files:**
- Modify: `client/src/components/modals/ExtendExpiryModal.tsx`

- [ ] **Step 1: Add `row` prop and pass `rowData` in extend call**

Add `row` to the interface (after line 25):

```typescript
  row?: Record<string, unknown>;
```

Add `row` to the destructured props (line 36):

```typescript
  partDescription, currentExpiryDate, onSuccess, row,
```

Modify the `handleSubmit` function's extend call (line 70). Replace:

```typescript
      const response = await extend({ items: [{ serialName, days }] });
```

With:

```typescript
      const response = await extend({ items: [{ serialName, days, rowData: row ? {
        partNumber: row.partNumber as string,
        partDescription: row.partDescription as string,
        balance: row.balance as number,
        unit: row.unit as string,
        value: row.value as number,
        purchasePrice: row.purchasePrice as number,
        vendor: row.vendor as string,
        perishable: row.perishable as string,
        brand: row.brand as string,
        family: row.family as string,
        expiryDate: row.expiryDate as string,
      } : undefined }] });
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/modals/ExtendExpiryModal.tsx
git commit -m "feat(bbd-extended): pass rowData from ExtendExpiryModal"
```

---

## Task 7: Split BulkExtendModal + Pass rowData

**Files:**
- Create: `client/src/components/modals/BulkExtendRowTable.tsx`
- Modify: `client/src/components/modals/BulkExtendModal.tsx`

- [ ] **Step 1: Create `BulkExtendRowTable.tsx`**

Extract the scrollable table (lines 202-262 of BulkExtendModal) into its own component:

```typescript
// client/src/components/modals/BulkExtendRowTable.tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/BulkExtendRowTable.tsx
// PURPOSE: Scrollable table with sort, selection, and status
//          colors for the bulk extend modal. Extracted to keep
//          BulkExtendModal under 200 lines.
// USED BY: BulkExtendModal
// EXPORTS: BulkExtendRowTable
// ═══════════════════════════════════════════════════════════════

import { ChevronUp, ChevronDown } from 'lucide-react';
import { formatCellValue } from '../../utils/formatters';

// WHY: Same map as ReportTable ROW_STYLE_MAP — duplicated here because
// importing from ReportTable would create a circular dependency.
const STATUS_BG: Record<string, string> = {
  'expired': 'bg-red-50',
  'expiring-perishable': 'bg-orange-50',
  'expiring-non-perishable': 'bg-amber-50',
};

function computeNewDate(currentDate: string, days: number): string {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

interface BulkExtendRowTableProps {
  rows: Array<Record<string, unknown>>;
  selected: Set<string>;
  days: number;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  onHeaderClick: (key: string) => void;
  onToggleRow: (serialName: string) => void;
  isSubmitting: boolean;
}

export default function BulkExtendRowTable({
  rows, selected, days, sortKey, sortDir, onHeaderClick, onToggleRow, isSubmitting,
}: BulkExtendRowTableProps) {
  return (
    <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 sticky top-0">
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider">
            <th className="px-3 py-2 w-8"></th>
            {[
              { key: 'serialName', label: 'Lot Number' },
              { key: 'partNumber', label: 'Part Number' },
              { key: 'partDescription', label: 'Description' },
              { key: 'expiryDate', label: 'Current Expiry' },
            ].map((col) => (
              <th key={col.key} className="px-3 py-2">
                <button
                  onClick={() => onHeaderClick(col.key)}
                  className="flex items-center gap-1 hover:text-slate-700 transition-colors"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === 'asc'
                    ? <ChevronUp size={12} />
                    : <ChevronDown size={12} />)}
                </button>
              </th>
            ))}
            <th className="px-3 py-2">New Expiry</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const sn = row.serialName as string;
            const status = row.status as string;
            const { formatted: currentFmt } = formatCellValue(row.expiryDate, 'date');
            const newDate = computeNewDate(row.expiryDate as string, days);
            const { formatted: newFmt } = formatCellValue(newDate, 'date');
            const bgClass = STATUS_BG[status] ?? '';

            return (
              <tr key={sn} className={`border-b border-slate-100 ${bgClass}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(sn)}
                    onChange={() => onToggleRow(sn)}
                    disabled={isSubmitting}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-3 py-2 font-medium">{sn}</td>
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
  );
}
```

- [ ] **Step 2: Modify `BulkExtendModal.tsx` — use extracted component + add rowData**

Replace `BulkExtendModal.tsx` entirely. Key changes:
1. Remove `STATUS_BG`, `computeNewDate` (now in `BulkExtendRowTable`)
2. Remove the scrollable table JSX (lines 202-262), replaced with `<BulkExtendRowTable />`
3. Modify `handleSubmit` to include `rowData`
4. Remove `ChevronUp`, `ChevronDown` imports (now in `BulkExtendRowTable`)

In `BulkExtendModal.tsx`, replace the import line for icons:

```typescript
import { Loader2 } from 'lucide-react';
```

Remove the `STATUS_BG` constant and `computeNewDate` function (lines 20-37).

Add import for the extracted component:

```typescript
import BulkExtendRowTable from './BulkExtendRowTable';
```

Replace the scrollable table section (the `<div className="max-h-96...">` block) with:

```typescript
            <BulkExtendRowTable
              rows={sortedRows}
              selected={selected}
              days={days}
              sortKey={sortKey}
              sortDir={sortDir}
              onHeaderClick={handleHeaderClick}
              onToggleRow={toggleRow}
              isSubmitting={isSubmitting}
            />
```

Replace the `handleSubmit` body (lines 118-119) — change:

```typescript
      const items = Array.from(selected).map((serialName) => ({ serialName, days }));
```

To:

```typescript
      const items = Array.from(selected).map((serialName) => {
        const row = rows.find((r) => r.serialName === serialName);
        return {
          serialName,
          days,
          rowData: row ? {
            partNumber: row.partNumber as string,
            partDescription: row.partDescription as string,
            balance: row.balance as number,
            unit: row.unit as string,
            value: row.value as number,
            purchasePrice: row.purchasePrice as number,
            vendor: row.vendor as string,
            perishable: row.perishable as string,
            brand: row.brand as string,
            family: row.family as string,
            expiryDate: row.expiryDate as string,
          } : undefined,
        };
      });
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/modals/BulkExtendRowTable.tsx client/src/components/modals/BulkExtendModal.tsx
git commit -m "refactor(bbd-extended): extract BulkExtendRowTable, add rowData to handleSubmit"
```

---

## Task 8: Pass `row` Prop to ExtendExpiryModal

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add `row` prop to ExtendExpiryModal call site**

In `ReportTableWidget.tsx`, find the `<ExtendExpiryModal>` render (line 229-237). Add the `row` prop:

```typescript
      {extendModal?.type === 'single' && extendModal.row && (
        <ExtendExpiryModal
          isOpen
          onClose={closeModal}
          serialName={extendModal.row.serialName as string}
          partName={extendModal.row.partNumber as string}
          partDescription={extendModal.row.partDescription as string}
          currentExpiryDate={extendModal.row.expiryDate as string}
          onSuccess={handleExtendSuccess}
          row={extendModal.row}
        />
      )}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat(bbd-extended): pass row prop to ExtendExpiryModal"
```

---

## Task 9: Extend EmptyState with Custom Props

**Files:**
- Modify: `client/src/components/EmptyState.tsx`

- [ ] **Step 1: Add `message` and `hint` props**

Replace `EmptyState.tsx`:

```typescript
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/EmptyState.tsx
// PURPOSE: Empty state with configurable message and hint.
//          Simple fade-in. Respects reduced motion.
// USED BY: ReportTableWidget, BBDExtendedView
// EXPORTS: EmptyState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_IN, EASE_DEFAULT, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface EmptyStateProps {
  message?: string;
  hint?: string;
}

export default function EmptyState({
  message = 'No results found',
  hint = 'Try adjusting your filters',
}: EmptyStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-8 text-center"
      {...(reduced ? REDUCED_FADE : FADE_IN)}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
    >
      <SearchX size={32} className="text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 text-sm font-medium">{message}</p>
      <p className="text-slate-400 text-xs mt-1">{hint}</p>
    </motion.div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/EmptyState.tsx
git commit -m "feat(bbd-extended): add message and hint props to EmptyState"
```

---

## Task 10: Create useExtendedQuery Hook

**Files:**
- Create: `client/src/hooks/useExtendedQuery.ts`

- [ ] **Step 1: Create the hook**

```typescript
// client/src/hooks/useExtendedQuery.ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useExtendedQuery.ts
// PURPOSE: TanStack Query v5 hook for fetching extended BBD items
//          from GET /api/v1/reports/bbd/extended. Returns Airtable
//          data with live Priority balances.
// USED BY: BBDExtendedView
// EXPORTS: useExtendedQuery, ExtendedResponse
// ═══════════════════════════════════════════════════════════════

import { useQuery } from '@tanstack/react-query';
import type { ColumnDefinition, PaginationMeta } from '@shared/types';

export interface ExtendedResponse {
  columns: ColumnDefinition[];
  data: Record<string, unknown>[];
  pagination: PaginationMeta;
  meta: { source: string; generatedAt: string };
  warnings?: string[];
}

export function useExtendedQuery() {
  return useQuery<ExtendedResponse>({
    queryKey: ['report', 'bbd', 'extended'],
    queryFn: async () => {
      const response = await fetch('/api/v1/reports/bbd/extended');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error ?? `Extended items fetch failed: ${response.status}`);
      }
      return response.json();
    },
    // WHY: 5-minute stale time. Extended data changes only on extension
    // (which triggers invalidation via prefix matching). Window refocus
    // would trigger unnecessary Priority balance refresh calls.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useExtendedQuery.ts
git commit -m "feat(bbd-extended): add useExtendedQuery hook"
```

---

## Task 11: Create ReportSubTabs Component

**Files:**
- Create: `client/src/components/ReportSubTabs.tsx`

- [ ] **Step 1: Create the component**

```typescript
// client/src/components/ReportSubTabs.tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportSubTabs.tsx
// PURPOSE: Sub-tab bar for switching between Active and Extended
//          views within a report widget. Uses Framer Motion pill
//          indicator — same visual pattern as NavTabs.
// USED BY: ReportTableWidget
// EXPORTS: ReportSubTabs (default)
// ═══════════════════════════════════════════════════════════════

import { motion, LayoutGroup } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EASE_DEFAULT } from '../config/animationConstants';

interface ReportSubTabsProps {
  activeTab: 'active' | 'extended';
  onTabChange: (tab: 'active' | 'extended') => void;
  extendedCount?: number;
}

export default function ReportSubTabs({ activeTab, onTabChange, extendedCount }: ReportSubTabsProps) {
  const reduced = useReducedMotion();

  const tabs: Array<{ id: 'active' | 'extended'; label: string }> = [
    { id: 'active', label: 'Active' },
    { id: 'extended', label: 'Extended' },
  ];

  return (
    <LayoutGroup id="sub-tab-group">
      <div className="flex overflow-x-auto px-5 pt-2 pb-0 border-b border-slate-100">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { if (!isActive) onTabChange(tab.id); }}
              className={`relative pb-2 pr-4 text-sm whitespace-nowrap transition-colors duration-150 ${
                isActive ? 'font-semibold text-slate-900' : 'font-medium text-slate-500 hover:text-slate-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="sub-tab-indicator"
                  className="absolute inset-0 bottom-1 bg-white rounded-lg border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                  transition={reduced ? { duration: 0 } : EASE_DEFAULT}
                  layout={!reduced}
                />
              )}
              <span className="relative z-10">
                {tab.label}
                {tab.id === 'extended' && extendedCount != null && extendedCount > 0 && (
                  <span className="font-normal text-slate-500"> ({extendedCount})</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ReportSubTabs.tsx
git commit -m "feat(bbd-extended): add ReportSubTabs component"
```

---

## Task 12: Create BBDExtendedView Component

**Files:**
- Create: `client/src/components/BBDExtendedView.tsx`

- [ ] **Step 1: Create the component**

```typescript
// client/src/components/BBDExtendedView.tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/BBDExtendedView.tsx
// PURPOSE: Extended tab view for the BBD report. Fetches from
//          Airtable via useExtendedQuery, renders ReportTable
//          with no filter/sort/column management (browse-only).
// USED BY: ReportTableWidget (rendered when activeSubTab === 'extended')
// EXPORTS: BBDExtendedView (default)
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useExtendedQuery } from '../hooks/useExtendedQuery';
import ReportTable from './ReportTable';
import Pagination from './Pagination';
import LoadingToast from './LoadingToast';
import ErrorState from './ErrorState';
import EmptyState from './EmptyState';

const PAGE_SIZE = 50;

export default function BBDExtendedView() {
  const query = useExtendedQuery();
  const [page, setPage] = useState(1);

  const data = query.data;
  const allRows = data?.data ?? [];
  const columns = data?.columns ?? [];
  const warnings = data?.warnings;

  // WHY: Client-side pagination — Airtable returns all records.
  const totalPages = Math.ceil(allRows.length / PAGE_SIZE);
  const pagedRows = useMemo(
    () => allRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [allRows, page],
  );

  if (query.isLoading) return <LoadingToast />;
  if (query.error) return <ErrorState onRetry={() => query.refetch()} />;
  if (allRows.length === 0) {
    return (
      <EmptyState
        message="No extended items"
        hint="Items appear here after their expiry date is extended"
      />
    );
  }

  return (
    <>
      {warnings && warnings.length > 0 && warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}
      <ReportTable
        columns={columns}
        data={pagedRows}
        reportId="bbd-extended"
      />
      {totalPages > 1 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={allRows.length}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/BBDExtendedView.tsx
git commit -m "feat(bbd-extended): add BBDExtendedView component"
```

---

## Task 13: Integrate Sub-Tabs in ReportTableWidget

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Add imports and sub-tab state**

Add imports at the top of `ReportTableWidget.tsx`:

```typescript
import ReportSubTabs from '../ReportSubTabs';
import BBDExtendedView from '../BBDExtendedView';
import { useExtendedQuery } from '../../hooks/useExtendedQuery';
```

Add state inside the component (after line 36):

```typescript
  const [activeSubTab, setActiveSubTab] = useState<'active' | 'extended'>('active');
```

Add the extended query for the count badge (after `activeSubTab` state):

```typescript
  // WHY: Fetch extended count for the badge on the Extended tab.
  // Only the count is used here — BBDExtendedView does its own full query.
  const extendedQuery = reportId === 'bbd' ? useExtendedQuery() : null;
  const extendedCount = extendedQuery?.data?.data?.length;
```

Wait — this violates React's rules of hooks (conditional hook call). Instead, always call the hook but only use the result conditionally:

```typescript
  const extendedQuery = useExtendedQuery();
  const extendedCount = reportId === 'bbd' ? extendedQuery?.data?.data?.length : undefined;
```

Actually, `useExtendedQuery` will make a network call even for non-BBD reports. Better approach: make the hook accept an `enabled` parameter. But the spec says to keep it simple. Let's just use the count from `BBDExtendedView` via a callback, or skip the badge count for now and let it show undefined (which hides the badge per the spec). The simplest correct approach:

Add the extended query with `enabled`:

The `useExtendedQuery` hook needs a minor tweak. In `useExtendedQuery.ts`, add an `enabled` option:

Actually, let's keep the hook simple and instead pass the query key approach. The simplest: don't show the count badge from the parent. `BBDExtendedView` already has the data. The count badge on the tab can show after the first load. Let me use a simpler approach:

```typescript
  const [activeSubTab, setActiveSubTab] = useState<'active' | 'extended'>('active');
```

No count badge in the first iteration — the tab just says "Extended". This avoids the conditional hook problem entirely. The spec says `extendedCount` is optional and the badge doesn't show when `undefined`.

- [ ] **Step 2: Add sub-tab rendering and conditional content**

In the JSX return, add `<ReportSubTabs>` before `<TableToolbar>` (after the opening `<>` fragment):

```typescript
      {reportId === 'bbd' && (
        <ReportSubTabs
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
        />
      )}
```

Then wrap the existing content (from `<TableToolbar>` through the modals) in a conditional:

```typescript
      {reportId === 'bbd' && activeSubTab === 'extended' ? (
        <BBDExtendedView />
      ) : (
        <>
          {/* ... all existing content from TableToolbar through Pagination ... */}
        </>
      )}
```

Also update the `onBulkExtend` prop on `<TableToolbar>`:

```typescript
        onBulkExtend={reportId === 'bbd' && activeSubTab === 'active' ? handleBulkExtend : undefined}
```

And conditionally pass `cellRenderers`:

```typescript
            cellRenderers={activeSubTab === 'active' ? cellRenderers : undefined}
```

The modals should render regardless of tab (they're triggered from the Active tab and should stay visible during transition):

```typescript
      {/* Modals — always rendered, controlled by extendModal state */}
      {extendModal?.type === 'single' && extendModal.row && (
        <ExtendExpiryModal ... />
      )}
      {extendModal?.type === 'bulk' && (
        <BulkExtendModal ... />
      )}
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd client && npx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 4: Run both TypeScript builds (pre-deploy check)**

Run: `cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit`
Expected: Both pass cleanly.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat(bbd-extended): integrate sub-tabs and BBDExtendedView in ReportTableWidget"
```

---

## Task 14: Manual Smoke Test

- [ ] **Step 1: Start both dev servers**

Terminal 1: `cd server && npm run dev`
Terminal 2: `cd client && npm run dev`

- [ ] **Step 2: Navigate to BBD report**

Open `http://localhost:5173/purchasing/bbd` in a browser.
Verify: The "Active" and "Extended" sub-tabs appear above the toolbar.

- [ ] **Step 3: Test the Extended tab**

Click "Extended" tab.
Expected: Shows "No extended items" empty state (or data if any extensions have been made).

- [ ] **Step 4: Test extending an item**

Switch to "Active" tab. Click "Extend" on a row. Extend by 7 days. Confirm.
After success, switch to "Extended" tab.
Expected: The extended item appears in the Extended tab.

- [ ] **Step 5: Verify Airtable**

Check the "Short-Dated Items" base in Airtable. The extended item should appear in the "Product Lots" table with all fields populated.

- [ ] **Step 6: Run pre-deploy checks**

```bash
cd client && npx tsc -b --noEmit
cd ../server && npx tsc --noEmit
cd ../server && npx vitest run
```

Expected: All pass.

- [ ] **Step 7: Final commit and push**

```bash
git push origin main
```

---

## Task 15: Write Remaining Backend Tests

**Files:**
- Modify: `server/src/services/airtableShortDated.test.ts`
- Create: `server/src/routes/extend.test.ts`

The spec defines 89 tests. Task 2 wrote 7 (`mergeBalances`). This task adds the remaining 57 backend tests.

Follow the spec Section 9.1 and 9.2 exactly for test case names. Use these mock patterns:

- Airtable calls: `vi.stubGlobal('fetch', vi.fn())` — NOT `vi.mock`. `fetch` is a global.
- Priority calls: `vi.mock('../services/priorityHttp')` — mock at module boundary.
- Restore: `afterEach(() => { vi.restoreAllMocks(); })`

Add to `airtableShortDated.test.ts`: all tests from spec sections `snapshotExtendedItem` (7 tests), `getExtendedItemsWithBalances` (8 tests), `refreshBalancesFromPriority` (5 tests), `batchUpdateAirtableBalances` (4 tests). Note: the spec's `upsertRow` (8 tests) maps to internal logic within `snapshotExtendedItem` — test that function directly with the 8 upsert scenarios.

Create `server/src/routes/extend.test.ts` with all 25 tests from spec Section 9.2. Use express + supertest pattern (add `supertest` as devDependency if needed: `cd server && npm install -D supertest @types/supertest`).

- [ ] **Step 1: Add snapshotExtendedItem, refreshBalancesFromPriority, batchUpdateAirtableBalances, and upsert tests to `airtableShortDated.test.ts`**

Follow the exact test names from spec Section 9.1. Mock `fetch` globally for Airtable calls, mock `../services/priorityHttp` for Priority calls.

- [ ] **Step 2: Create `server/src/routes/extend.test.ts` with all 25 route tests**

Follow spec Section 9.2 exactly. Mock `../services/airtableShortDated` for all Airtable service functions.

- [ ] **Step 3: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/services/airtableShortDated.test.ts server/src/routes/extend.test.ts
git commit -m "test(bbd-extended): add remaining backend tests (57 cases)"
```

---

## Task 16: Write Frontend Tests

**Files:**
- Create: `client/src/components/ReportSubTabs.test.tsx`
- Create: `client/src/hooks/useExtendedQuery.test.ts`

- [ ] **Step 1: Create `ReportSubTabs.test.tsx` with all 13 tests**

Follow spec Section 9.3. Use `render`/`screen`/`fireEvent` from React Testing Library. Use `defaultProps` pattern from existing component tests (`NavTabs.test.tsx`).

- [ ] **Step 2: Create `useExtendedQuery.test.ts` with all 12 tests**

Follow spec Section 9.4. This is the first hook test requiring `QueryClientProvider`. Create a `makeWrapper()` helper:

```typescript
function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

Mock `fetch` with `vi.stubGlobal('fetch', vi.fn())`.

- [ ] **Step 3: Run all client tests**

Run: `cd client && npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Run pre-deploy TypeScript checks**

Run: `cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit`
Expected: Both pass. (Confirms test files are excluded from build per tsconfig.)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ReportSubTabs.test.tsx client/src/hooks/useExtendedQuery.test.ts
git commit -m "test(bbd-extended): add frontend tests (25 cases)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create Airtable fields | MCP tools |
| 1.5 | Replace placeholder field IDs | `airtableShortDated.ts` |
| 2 | mergeBalances pure function + tests | `airtableShortDated.ts/test.ts` |
| 3 | Airtable service I/O functions | `airtableShortDated.ts` |
| 4 | GET/POST route changes | `extend.ts` |
| 5 | useExtendExpiry rowData type | `useExtendExpiry.ts` |
| 6 | ExtendExpiryModal rowData | `ExtendExpiryModal.tsx` |
| 7 | BulkExtendModal split + rowData | `BulkExtendRowTable.tsx`, `BulkExtendModal.tsx` |
| 8 | Pass row prop to modal | `ReportTableWidget.tsx` |
| 9 | EmptyState custom props | `EmptyState.tsx` |
| 10 | useExtendedQuery hook | `useExtendedQuery.ts` |
| 11 | ReportSubTabs component | `ReportSubTabs.tsx` |
| 12 | BBDExtendedView component | `BBDExtendedView.tsx` |
| 13 | ReportTableWidget integration | `ReportTableWidget.tsx` |
| 14 | Manual smoke test | — |
| 15 | Backend tests (57 cases) | `airtableShortDated.test.ts`, `extend.test.ts` |
| 16 | Frontend tests (25 cases) | `ReportSubTabs.test.tsx`, `useExtendedQuery.test.ts` |
