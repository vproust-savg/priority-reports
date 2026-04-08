# BBD Extend Expiry Date — Design Spec

## 1. Context & Goal

The BBD (Best By Dates) report shows raw material lots nearing or past expiration. Currently it's read-only — users identify expired lots but must switch to Priority ERP to extend expiration dates. This creates friction and delays, especially when extending multiple lots.

**Goal:** Add three capabilities to the BBD report:
1. **Lot Number column** — make the lot identifier (SERIALNAME) visible as the first table column
2. **Per-row Extend button** — inline "Extend" button next to each expiry date, opening a modal to extend that single lot
3. **Bulk Extend button** — toolbar button opening a modal to select and extend multiple lots at once

This is the dashboard's **first write operation** to Priority ERP. All previous features are read-only.

**Data flow:** React modal → Express endpoint → Priority oData API (EXPDSERIAL entity + EXPDEXT subform)

## 2. Lot Number Column

**Current state:** `bbdReport.ts` already queries `SERIALNAME` from `RAWSERIAL` and `transformRow()` maps it to `serialName`. It's a hidden field used as the expand row key but not displayed as a column.

**Change:** Add `serialName` to the `columns` array at index 0.

**Column definition:**
- Key: `serialName`
- Label: `Lot Number`
- Type: `string`
- Position: first column (before Part Number)

**Excel export:** Add `serialName: 12` to `excelStyle.columnWidths`.

**File:** `server/src/reports/bbdReport.ts`

## 3. Per-Row Extend Button (ExpiryDateCell)

**Placement:** Inline in the Expiry Date cell, right of the formatted date value.

**Rendered output:** `Apr 15, 2026  [Extend]`

**Button styling:**
- `text-xs font-medium text-primary hover:text-primary/80 ml-2`
- Visible on all rows regardless of status
- Subtle — doesn't dominate the date value
- `onClick` stops propagation (prevents triggering row expand)

**Custom cell renderer pattern:**
Currently, `formatCellValue()` returns `{ formatted: string, isNegative: boolean }` and all cells render plain text. For the Expiry Date column in BBD, we need JSX (date + button).

**Implementation:** Add a `cellRenderers` concept to `ReportTable`:
- `ReportTableWidget` can pass a `cellRenderers` map: `Record<string, (value, row) => ReactNode>`
- In `ReportTable`, before calling `formatCellValue()`, check if the column key has a custom renderer
- If yes, call the renderer instead; if no, use the existing `formatCellValue()` path
- The BBD widget registers a renderer for the `expiryDate` column key

**On click:** Opens `ExtendExpiryModal` with the row's `serialName`, current `expiryDate`, `partName`, and `partDescription`.

**File:** `client/src/components/cells/ExpiryDateCell.tsx`

## 4. Toolbar Extend Button

**Placement:** In `TableToolbar`, right side, before the Export button. Inside the `ml-auto` flex group.

**Visual design:**
- Icon: `CalendarClock` (lucide-react, 16px) — represents date extension
- Text: `Extend`
- Uses existing `baseClass` + `inactiveClass` from TableToolbar (same pattern as Filter/Columns/Sort)
- No badge (no persistent state to show)

**On click:** Opens `BulkExtendModal`.

**New props on TableToolbar:**
- `onBulkExtend?: () => void` — callback to open the bulk extend modal
- BBD-specific: only passed when `reportId === 'bbd'`

**File:** `client/src/components/TableToolbar.tsx`

## 5. Modal Base Component

**First modal in the codebase** — establishes a reusable pattern for future write operations.

**Component:** `Modal`

**Props:**
```ts
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;       // default: 'max-w-lg'
  preventClose?: boolean;  // disable backdrop click + Escape during submission
}
```

**Behavior:**
- Portal rendered via `createPortal(content, document.body)` — avoids z-index issues inside the table
- Backdrop: `bg-black/50` with `onClick={onClose}` (disabled when `preventClose`)
- Content panel: `bg-white rounded-2xl shadow-xl` centered with flex (Apple-style 16px radius per CLAUDE.md)
- Close on `Escape` key (disabled when `preventClose`)
- Focus trap: first focusable element receives focus on open
- Animation: Framer Motion — backdrop fades in, content scales up from 95% with `EASE_FAST` preset
- `AnimatePresence` wrapping for exit animation

**File:** `client/src/components/modals/Modal.tsx`

## 6. ExtendExpiryModal (Single Row)

**Opened by:** Per-row "Extend" button in ExpiryDateCell.

**Props:**
```ts
interface ExtendExpiryModalProps {
  isOpen: boolean;
  onClose: () => void;
  serialName: string;
  partName: string;
  partDescription: string;
  currentExpiryDate: string;
  onSuccess: () => void;  // triggers table refresh
}
```

**Layout:**
- **Header:** "Extend Expiration Date"
- **Read-only info:** Lot Number, Part Number, Part Description (displayed as label + value pairs)
- **Renew from:** Current expiry date (read-only, pre-filled from row data)
- **Extend by:** Number input, default 7 days, min 1, max 365
- **New expiry date:** Computed display (current + days), updates live as days change
- **Buttons:** "Extend" (primary) + "Cancel" (secondary)

**State machine:**

| State | UI | Actions available |
|-------|-----|-------------------|
| `idle` | Form editable | Edit days, click Extend or Cancel |
| `confirming` | Summary overlay: "Extend lot X from Apr 15 to Apr 22?" | Confirm or Back |
| `submitting` | Spinner on Extend button, inputs disabled, `preventClose=true` | None (wait) |
| `success` | Brief "Extended successfully" message | Auto-closes after 1.5s, calls `onSuccess` |
| `error` | Error message with retry option | Retry or Cancel |

**File:** `client/src/components/modals/ExtendExpiryModal.tsx`

## 7. BulkExtendModal (Multi Row)

**Opened by:** Toolbar "Extend" button.

**Props:**
```ts
interface BulkExtendModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: Array<Record<string, unknown>>;  // all current BBD rows (post-filter, post-sort)
  onSuccess: () => void;
}
```

**Layout:**
- **Header:** "Extend Expiration Dates"
- **Days input:** "Extend by __ days" at the top (default 7, shared for all selected items)
- **Select all checkbox** with count: "Select all (24 items)"
- **Scrollable list** (`max-h-96 overflow-y-auto`) of all BBD rows with columns:

| Element | Source |
|---------|--------|
| Checkbox | Selection toggle |
| Lot Number | `row.serialName` |
| Part Number | `row.partNumber` |
| Part Description | `row.partDescription` (truncated) |
| Current Expiry | `row.expiryDate` (formatted) |
| New Expiry | Computed: current + days (updates live) |

- **Row styling:** Status colors carried over — `bg-red-50` for expired, `bg-orange-50` for expiring-perishable, `bg-amber-50` for expiring-non-perishable
- **Footer:** "Extend X items" button (primary, disabled when none selected) + Cancel
- **Modal width:** `max-w-3xl` (wider than single-row modal to fit the table)

**State machine:** Same as ExtendExpiryModal but with result summary:
- `submitting` state shows: "Extending X items..." with a spinner (single API call, no per-item progress)
- `success` shows: "Extended 12/12 successfully" (or partial: "Extended 10/12 — 2 failed" with failed items listed)
- `error` state shows the error message with retry option

**Selection state:**
- `selectedSerialNames: Set<string>` — tracks which rows are selected
- "Select all" toggles the entire set
- Individual checkboxes toggle single items
- Selected count displayed on the submit button

**File:** `client/src/components/modals/BulkExtendModal.tsx`

## 8. useExtendExpiry Hook

**Purpose:** TanStack mutation hook wrapping the backend API call. Used by both modals.

```ts
interface ExtendRequest {
  items: Array<{ serialName: string; days: number }>;
}

interface ExtendResult {
  serialName: string;
  success: boolean;
  newExpiryDate?: string;
  error?: string;
}

interface ExtendResponse {
  results: ExtendResult[];
}
```

**Hook API:**
```ts
function useExtendExpiry() {
  return {
    extend: (request: ExtendRequest) => Promise<ExtendResponse>;
    isLoading: boolean;
    error: Error | null;
    reset: () => void;
  };
}
```

**Behavior:**
- Calls `POST /api/v1/reports/bbd/extend` with the request body
- On success, invalidates the `['report', 'bbd']` TanStack Query key to refresh the table
- Single-row extend: `items` array has 1 entry
- Bulk extend: the modal calls the hook once with all items. The server processes items sequentially and returns all results in one response. Progress tracking in the UI is estimated (spinner + "Processing...") rather than per-item, since the API is a single request/response. True per-item progress would require SSE or polling — excluded from scope.

**File:** `client/src/hooks/useExtendExpiry.ts`

## 9. Backend Endpoint

**Route:** `POST /api/v1/reports/bbd/extend`

**Request validation (Zod):**
```ts
const ExtendRequestSchema = z.object({
  items: z.array(z.object({
    serialName: z.string().regex(/^[a-zA-Z0-9_\- ]+$/),  // OData injection prevention
    days: z.number().int().min(1).max(365),
  })).min(1).max(100),
});
```

**Per-item server-side flow:**

1. **Lookup:** `GET /EXPDSERIAL(SERIALNAME='${serialName}')` with `$select=SERIALNAME,EXPIRYDATE`
   - If 404 → mark item as failed: "Lot not found in expiration tracking system"
   - Extract `EXPIRYDATE` as the renewal date (RENEWDATE)

2. **Calculate:** `newExpiryDate = currentExpiryDate + days` (add days to the date from step 1)

3. **Write:** Deep PATCH on parent entity (Pattern C from Priority API skill):
   ```json
   PATCH /EXPDSERIAL(SERIALNAME='LOT123')
   {
     "EXPDEXT_SUBFORM": [
       {
         "RENEWDATE": "2026-04-15T00:00:00Z",
         "EXPIRYDATE": "2026-04-22T00:00:00Z"
       }
     ]
   }
   ```
   - `RENEWDATE` = current EXPIRYDATE from lookup (the date we're renewing from)
   - `EXPIRYDATE` = computed new expiry date
   - Date format: ISO 8601 with `Z` suffix (Priority standard, per `/priority-erp-api` Section 18)

4. **Record result:** `{ serialName, success: true/false, newExpiryDate?, error? }`

**Sequential processing:** Items processed one at a time with 200ms delay between calls. Two Priority API calls per item (GET + PATCH). For 50 items = 100 calls at ~300ms spacing = ~30 seconds. Stays well under Priority's 100 calls/min limit.

**Response:**
```json
{
  "results": [
    { "serialName": "LOT123", "success": true, "newExpiryDate": "2026-04-22T00:00:00Z" },
    { "serialName": "LOT456", "success": false, "error": "Lot not found in expiration tracking system" }
  ]
}
```

**Error handling:**
- EXPDSERIAL lookup 404 → item fails, processing continues
- Deep PATCH fails → extract error message (both OData and Priority InterfaceErrors formats per `/priority-erp-api` Section 12), item fails, processing continues
- Partial success is expected — each item is independent
- Request-level errors (malformed body, auth failure) return standard error response

**Priority API headers (per `/priority-erp-api` Section 1):**
- `Content-Type: application/json`
- `IEEE754Compatible: true`
- HTTP Basic Auth (same credentials as existing read operations)

**File:** `server/src/routes/extend.ts`

## 10. Integration in ReportTableWidget

**State additions:**
```ts
const [extendModal, setExtendModal] = useState<{
  type: 'single' | 'bulk';
  row?: Record<string, unknown>;  // for single-row extend
} | null>(null);
```

**Callbacks:**
- `handleExtendClick(row)` → opens single-row modal with row data
- `handleBulkExtend()` → opens bulk modal with all current display data
- `handleExtendSuccess()` → closes modal + invalidates query (auto-refresh)

**Cell renderer registration:**
```ts
const cellRenderers = useMemo(() => {
  if (reportId !== 'bbd') return undefined;
  return {
    expiryDate: (value: unknown, row: Record<string, unknown>) => (
      <ExpiryDateCell
        value={value}
        onExtend={() => handleExtendClick(row)}
      />
    ),
  };
}, [reportId, handleExtendClick]);
```

**Toolbar wiring:**
- Pass `onBulkExtend={handleBulkExtend}` to `TableToolbar` only when `reportId === 'bbd'`

**Modal rendering:**
```tsx
{extendModal?.type === 'single' && (
  <ExtendExpiryModal
    isOpen
    onClose={() => setExtendModal(null)}
    serialName={extendModal.row.serialName}
    ...
    onSuccess={handleExtendSuccess}
  />
)}
{extendModal?.type === 'bulk' && (
  <BulkExtendModal
    isOpen
    onClose={() => setExtendModal(null)}
    rows={sortedDisplayData}
    onSuccess={handleExtendSuccess}
  />
)}
```

**File:** `client/src/components/widgets/ReportTableWidget.tsx`

## 11. TDD Testing Strategy

Tests are written **before** implementation (red-green-refactor). Each test file covers one unit.

### 11.1 Hook Tests

**`client/src/hooks/useExtendExpiry.test.ts`**

Uses `renderHook` + mock `fetch`. Pattern follows `useSortManager.test.ts`.

| Test Case | What it verifies |
|-----------|-----------------|
| Returns `isLoading: false` initially | Initial state |
| Sets `isLoading: true` during mutation | Loading state |
| Calls correct endpoint with correct body | API contract |
| Returns results on success | Happy path |
| Handles network error | Error state |
| Resets error state via `reset()` | State cleanup |
| Invalidates BBD query on success | Cache invalidation |

**Mocking approach:** Mock `fetch` globally (`vi.stubGlobal('fetch', ...)`). Wrap hook in a `QueryClientProvider` with a test `QueryClient`.

### 11.2 Component Tests

**`client/src/components/cells/ExpiryDateCell.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Renders formatted date | Date display |
| Renders Extend button | Button presence |
| Calls `onExtend` when button clicked | Click handler |
| Stops event propagation on click | No row expand trigger |
| Handles null/undefined date value | Edge case |

**`client/src/components/modals/Modal.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Renders children when `isOpen` is true | Open state |
| Does not render when `isOpen` is false | Closed state |
| Calls `onClose` on backdrop click | Backdrop dismiss |
| Calls `onClose` on Escape key | Keyboard dismiss |
| Does NOT call `onClose` when `preventClose` is true | Submission guard |
| Renders title in header | Title display |
| Applies custom `maxWidth` | Width override |

**`client/src/components/modals/ExtendExpiryModal.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Displays lot number, part name, current expiry | Read-only fields |
| Defaults days input to 7 | Default value |
| Computes new expiry date when days change | Live calculation |
| Shows confirmation on Extend click | State: idle → confirming |
| Calls extend mutation on confirm | State: confirming → submitting |
| Shows success message and auto-closes | State: submitting → success |
| Shows error with retry option | State: submitting → error |
| Disables inputs during submission | preventClose behavior |

**`client/src/components/modals/BulkExtendModal.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Renders all rows from props | Row list |
| Select all checkbox selects/deselects all | Bulk selection |
| Individual checkbox toggles one row | Single selection |
| Submit button shows selected count | "Extend 5 items" |
| Submit button disabled when none selected | Validation |
| Days input shared across all items | Shared days |
| New expiry column updates when days change | Live calculation |
| Shows spinner during bulk submission | "Extending X items..." |
| Shows partial success summary | "10/12 succeeded, 2 failed" |
| Applies status row colors | Visual styling |

### 11.3 Server Tests

**`server/src/routes/extend.test.ts`**

First server-side test file. Uses `supertest` (already in devDependencies) + mocked Priority API calls.

| Test Case | What it verifies |
|-----------|-----------------|
| Rejects invalid body (missing items) | Zod validation — 400 |
| Rejects invalid serialName (injection chars) | OData injection prevention — 400 |
| Rejects days outside 1-365 range | Range validation — 400 |
| Processes single item successfully | Happy path — 200 |
| Handles EXPDSERIAL 404 gracefully | Lot not found — partial failure |
| Handles PATCH failure gracefully | Priority error — partial failure |
| Returns per-item results | Response shape |
| Processes multiple items sequentially | Bulk flow |

**Mocking approach:** Mock the Priority API fetch function (the existing `fetchWithRetry` or equivalent). No real API calls in tests.

### 11.4 Test Count Target

| Area | Test files | Estimated cases |
|------|-----------|----------------|
| Hooks | 1 | ~7 |
| Components | 4 | ~30 |
| Server | 1 | ~8 |
| **Total** | **6** | **~45** |

## 12. File Summary

### New Files (8)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `client/src/components/modals/Modal.tsx` | ~70 | Reusable modal base (portal, backdrop, animation, focus) |
| `client/src/components/modals/ExtendExpiryModal.tsx` | ~150 | Single-row extend form + confirmation + state machine |
| `client/src/components/modals/BulkExtendModal.tsx` | ~180 | Multi-select list + shared days + progress tracking |
| `client/src/components/cells/ExpiryDateCell.tsx` | ~30 | Custom cell renderer — date + Extend button |
| `client/src/hooks/useExtendExpiry.ts` | ~50 | TanStack mutation hook for extend API |
| `server/src/routes/extend.ts` | ~120 | POST endpoint — lookup + deep PATCH flow |
| 6 test files | ~350 total | TDD test suite (see Section 11) |

### Modified Files (5)

| File | Change |
|------|--------|
| `server/src/reports/bbdReport.ts` | Add `serialName` column at index 0, add excel width |
| `client/src/components/ReportTable.tsx` | Support `cellRenderers` prop — check before `formatCellValue()` |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modal state, cell renderer registration, toolbar callback, modal rendering |
| `client/src/components/TableToolbar.tsx` | Add `onBulkExtend` prop + Extend button |
| `server/src/routes/reports.ts` | Import and mount extend route |

## 13. Edge Cases

**EXPDSERIAL lookup fails (404):**
The lot exists in RAWSERIAL but not in EXPDSERIAL — it was never set up for expiry tracking in Priority. Per-row modal shows error message. Bulk modal marks that item as failed, continues processing others.

**Days input validation:**
Must be a positive integer 1–365. Client-side: `type="number"` with `min`/`max` attributes + controlled state. Server-side: Zod `z.number().int().min(1).max(365)`.

**Concurrent modifications:**
If someone extends the same lot in Priority while the modal is open, the server-side flow uses the latest EXPIRYDATE from the lookup (step 1), so the extension is based on current state — not stale modal data.

**Rate limiting:**
Bulk extend with many items could approach Priority's 100 calls/min limit (2 calls per item). Sequential processing with 200ms delay keeps us safe up to ~50 items. The Zod schema caps at 100 items max.

**Modal interaction guards:**
- Backdrop click and Escape disabled during `submitting` state (`preventClose=true`)
- Submit button disabled while submitting (prevents double-submit)

**OData injection:**
`serialName` validated with `/^[a-zA-Z0-9_\- ]+$/` regex on both client and server (per CLAUDE.md common mistakes).

**Empty table:**
If no BBD data is loaded, the bulk Extend button is still visible but the modal shows an empty list. No special handling needed.

## 14. Performance

**Single-row extend:** 2 API calls (GET + PATCH) — completes in <2 seconds.

**Bulk extend (50 items):** 100 API calls at ~300ms each = ~30 seconds. Progress indicator keeps the user informed. No parallel calls to avoid Priority rate limit issues.

**Table refresh:** TanStack Query invalidation triggers a single refetch of the BBD report data. The cache is invalidated only on success.

**Modal rendering:** Portal-rendered via `createPortal` — no performance impact on the table. Framer Motion animations use `will-change: transform` for GPU acceleration.

## 15. Priority API Reference

**Entities used:**

| Entity | Purpose | Key | Access |
|--------|---------|-----|--------|
| `EXPDSERIAL` | Expiration date tracking | `SERIALNAME` (string) | GET (lookup) + PATCH (write) |
| `EXPDEXT` | Extension history subform | `KLINE` (int, auto) | Via deep PATCH on parent |

**EXPDSERIAL fields used:**
- `SERIALNAME` — lot identifier (key)
- `EXPIRYDATE` — current expiration date

**EXPDEXT fields written:**
- `RENEWDATE` — the date we're renewing from (= current EXPIRYDATE)
- `EXPIRYDATE` — the new expiration date (= RENEWDATE + days)

**Write pattern:** Deep PATCH on parent (Pattern C from `/priority-erp-api` Section 7). This is the safest approach — works regardless of subform key type. Priority auto-fills `PREVEXPIRYDATE`, `USERLOGIN`, `UDATE`, and `KLINE`.

**Date format:** ISO 8601 with `Z` suffix: `"2026-04-15T00:00:00Z"` (per `/priority-erp-api` Section 18).

**Headers:** `Content-Type: application/json`, `IEEE754Compatible: true`, HTTP Basic Auth.

## 16. Exclusions

- **No date picker for RENEWDATE** — always uses current EXPIRYDATE from Priority (prevents user from entering arbitrary renewal dates)
- **No undo/rollback** — extension history is maintained by Priority in EXPDEXT subform but we don't expose a "revert" action
- **No extension limit enforcement** — EXPDSERIAL has `VALIDITYEXTENSION` (max extensions) and `EXPDCOUNTER` (current count) but we don't check these client-side. Priority enforces limits server-side and returns an error if exceeded.
- **No filtering in bulk modal** — all rows shown, user selects manually. Search/filter within the modal is a future enhancement.
- **No keyboard navigation in bulk modal list** — standard checkbox + tab behavior only
