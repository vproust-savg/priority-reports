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
    isPending: boolean;   // TanStack Query v5 naming (was `isLoading` in v4)
    error: Error | null;
    reset: () => void;
  };
}
```

**Implementation:** Uses `useMutation` from TanStack Query v5. This is the first mutation hook in the codebase — existing hooks are all `useQuery` (read-only). The closest structural analog is `useExport.ts` (plain `fetch` + `useState`), but `useMutation` is preferred here because it provides automatic cache invalidation via `onSuccess`.

**Cache invalidation:** On success, calls `queryClient.invalidateQueries({ queryKey: ['report', 'bbd'] })`. This is a prefix-based invalidation that matches all BBD query variants regardless of filter/pagination params. The same pattern is already used in `ReportTableWidget.tsx` line 73–84 (the refresh handler).

**Test wrapper pattern:** Tests wrap the hook in a `QueryClientProvider` with a test `QueryClient` configured with `retry: false`:
```ts
const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
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

**New Priority HTTP function required:** `priorityHttp.ts` currently only has `httpsGet` (using Node's `https.get`). The extend endpoint needs PATCH support. Add `httpsPatch(url: string, body: unknown): Promise<HttpsResponse>` to `priorityHttp.ts`, using `https.request` with `method: 'PATCH'`. Must include the same auth + `IEEE754Compatible` headers as `httpsGet`, plus `Content-Type: application/json` and the JSON body.

**Sequential processing:** Items processed one at a time. Two Priority API calls per item (GET + PATCH). The existing `priorityRateLimit.ts` already enforces `MIN_SPACING_MS = 200` between all calls to `fetchWithRetry` — no manual `setTimeout` needed between items. For 50 items = 100 calls at ~200ms each = ~20 seconds.

**File:** `server/src/services/priorityHttp.ts` (add `httpsPatch`), `server/src/routes/extend.ts` (new route)

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

**Line count concern:** `ReportTableWidget.tsx` is already 227 lines (over the CLAUDE.md 200-line limit). Adding modal state + cellRenderers + callbacks would push it to ~269 lines. **Solution:** Extract a `useBBDExtend` hook that owns all BBD-specific write logic.

**New file: `client/src/hooks/useBBDExtend.ts`**

Encapsulates:
- `extendModal` state
- `handleExtendClick(row)`, `handleBulkExtend()`, `handleExtendSuccess()` callbacks
- `cellRenderers` memo
- `useExtendExpiry()` hook usage

Returns: `{ extendModal, cellRenderers, handleExtendClick, handleBulkExtend, handleExtendSuccess, closeModal }`

`ReportTableWidget` calls the hook and spreads its values into JSX. The modal render blocks (~15 lines) stay in the widget since they're JSX. After extraction, the widget stays at ~244 lines — just inside the threshold.

**State additions (inside `useBBDExtend`):**
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

Tests are written **before** implementation (red-green-refactor). Each test file covers one unit. Patterns follow exactly the existing codebase conventions discovered in `useSortManager.test.ts`, `TableToolbar.test.tsx`, `SortPanel.test.tsx`, and `SortRuleRow.test.tsx`.

### 11.0 Test Infrastructure & Patterns

**Imports (client component tests):**
```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
```

**Imports (client hook tests):**
```ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
```

**Imports (server tests):**
```ts
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
```

**Test QueryClient wrapper** (shared pattern for mutation hook tests):
```ts
const createTestQueryClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const queryClientWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    {children}
  </QueryClientProvider>
);
```

**Fetch mocking** (for API calls — no MSW in the project):
```ts
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve(new Response(
    JSON.stringify({ results: [{ serialName: 'LOT123', success: true }] }),
    { status: 200 }
  ))
));
```

**defaultProps pattern** (from `TableToolbar.test.tsx` — used for all component tests):
```ts
const defaultProps = { /* all required props with vi.fn() callbacks */ };
render(<Component {...defaultProps} propOverride={value} />);
```

**Assertion patterns:**
- Element exists: `expect(screen.getByText('Extend')).toBeTruthy()`
- Element absent: `expect(screen.queryByText('text')).toBeNull()`
- Role query: `screen.getByRole('button', { name: /extend/i })`
- CSS class: `expect(button.className).toContain('text-primary')`
- Disabled: `expect(button).toBeDisabled()`
- Callback: `expect(onExtend).toHaveBeenCalledTimes(1)`

**Note:** `@testing-library/user-event` is NOT installed. Use `fireEvent` for all interactions.

### 11.1 Hook Tests

**`client/src/hooks/useExtendExpiry.test.ts`**

Uses `renderHook` + `waitFor` + mock `fetch` + `QueryClientProvider` wrapper. First mutation hook test in the codebase.

| Test Case | What it verifies |
|-----------|-----------------|
| Returns `isPending: false` initially | Initial state (v5 naming) |
| Sets `isPending: true` during mutation | Loading state |
| Calls `POST /api/v1/reports/bbd/extend` with correct body | API contract — method, URL, headers, JSON body |
| Returns results array on success | Happy path response shape |
| Handles network error gracefully | Error state populated |
| Resets error state via `reset()` | State cleanup |
| Invalidates `['report', 'bbd']` query on success | Cache invalidation — table auto-refreshes |

**Mocking approach:** `vi.stubGlobal('fetch', mockFn)`. Wrap hook in `queryClientWrapper`. Use `waitFor()` for async assertions. Reset mocks via `vi.clearAllMocks()` in `beforeEach`.

**`client/src/hooks/useBBDExtend.test.ts`**

| Test Case | What it verifies |
|-----------|-----------------|
| Returns null `extendModal` initially | Initial state |
| `handleExtendClick(row)` sets modal type to 'single' with row data | Single-row modal open |
| `handleBulkExtend()` sets modal type to 'bulk' | Bulk modal open |
| `closeModal()` sets `extendModal` to null | Modal close |
| `handleExtendSuccess()` closes modal | Success cleanup |
| Returns `cellRenderers` with `expiryDate` key when reportId is 'bbd' | BBD-specific renderer |
| Returns `undefined` cellRenderers when reportId is not 'bbd' | Non-BBD reports unaffected |

### 11.2 Component Tests

**`client/src/components/cells/ExpiryDateCell.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Renders formatted date text | `screen.getByText(/Apr 15, 2026/)` |
| Renders Extend button | `screen.getByRole('button', { name: /extend/i })` |
| Calls `onExtend` when button clicked | `fireEvent.click` → `expect(onExtend).toHaveBeenCalledTimes(1)` |
| Stops event propagation on click | Mock `stopPropagation` on event, verify it's called |
| Renders gracefully with null date value | No crash, shows empty or dash |

**`client/src/components/modals/Modal.test.tsx`**

| Test Case | What it verifies |
|-----------|-----------------|
| Renders children when `isOpen` is true | Children visible in DOM |
| Does not render when `isOpen` is false | `queryByText` returns null |
| Calls `onClose` on backdrop click | `fireEvent.click(backdrop)` → callback fired |
| Calls `onClose` on Escape key | `fireEvent.keyDown(document, { key: 'Escape' })` → callback fired |
| Does NOT call `onClose` when `preventClose` is true (backdrop) | Backdrop click ignored |
| Does NOT call `onClose` when `preventClose` is true (Escape) | Escape key ignored |
| Renders title in header | `screen.getByText(title)` |
| Applies custom `maxWidth` class | Check rendered element className |

**`client/src/components/modals/ExtendExpiryModal.test.tsx`**

Needs `queryClientWrapper` since it uses `useExtendExpiry` internally. Mock `fetch` for API calls.

| Test Case | What it verifies |
|-----------|-----------------|
| Displays lot number, part name, current expiry as read-only | `screen.getByText('LOT123')`, etc. |
| Defaults days input to 7 | `screen.getByRole('spinbutton')` has value "7" |
| Computes new expiry date when days change | `fireEvent.change(input, { target: { value: '14' } })` → new date text updates |
| Shows confirmation summary on Extend click | `fireEvent.click(extendBtn)` → confirmation text appears |
| Returns to form on Back click from confirmation | Back button → form fields visible again |
| Calls extend mutation on Confirm | `fireEvent.click(confirmBtn)` → `fetch` called with correct body |
| Shows success message after API success | `waitFor` → "Extended successfully" text |
| Shows error with retry option after API failure | Mock fetch rejection → error text + Retry button |
| Disables form inputs during submission | Buttons + input disabled while `isPending` |

**`client/src/components/modals/BulkExtendModal.test.tsx`**

Needs `queryClientWrapper`. Uses factory helper for mock rows:

```ts
const makeRows = (count: number) => Array.from({ length: count }, (_, i) => ({
  serialName: `LOT${i}`, partNumber: `PART${i}`, partDescription: `Desc ${i}`,
  expiryDate: '2026-04-15T00:00:00Z', status: i % 2 === 0 ? 'expired' : '',
}));
```

| Test Case | What it verifies |
|-----------|-----------------|
| Renders all rows from props | `screen.getAllByRole('checkbox')` has correct length |
| Select all checkbox selects all rows | `fireEvent.click(selectAll)` → all checkboxes checked |
| Select all checkbox deselects all when all selected | Toggle behavior |
| Individual checkbox toggles one row | Single checkbox click |
| Submit button shows selected count | "Extend 5 items" text |
| Submit button disabled when none selected | `expect(button).toBeDisabled()` |
| Days input defaults to 7 and is shared | Single input, value "7" |
| New expiry column updates when days change | Change days → all computed dates update |
| Shows spinner during submission | `fireEvent.click(submitBtn)` → spinner visible |
| Shows partial success/failure summary | Mock mixed results → "10/12 succeeded" text |
| Applies expired row background color | Check className contains `bg-red-50` for expired rows |

### 11.3 Server Tests

**`server/src/routes/extend.test.ts`**

First server-side test file. Uses Zod schema validation tests (unit) + mocked Priority API functions (integration). `supertest` available in devDependencies for endpoint-level tests.

| Test Case | What it verifies |
|-----------|-----------------|
| Rejects empty body | `ExtendRequestSchema.safeParse({})` → `success: false` |
| Rejects invalid serialName with injection chars | `safeParse({ items: [{ serialName: "'; DROP--", days: 7 }] })` → `success: false` |
| Accepts valid serialName with spaces/hyphens | `safeParse({ items: [{ serialName: "LOT 123-A", days: 7 }] })` → `success: true` |
| Rejects days = 0 or negative | Range validation |
| Rejects days > 365 | Range validation |
| Rejects more than 100 items | Array max length |
| Processes single item — GET lookup + PATCH write | Mock `httpsGet` + `httpsPatch`, verify both called with correct URLs |
| Returns `success: false` when EXPDSERIAL returns 404 | Mock 404 response → item in results has `success: false` |
| Returns `success: false` when PATCH fails | Mock PATCH error → item has `error` message from `extractErrorMessage` |
| Processes multiple items and returns per-item results | 3 items (2 success, 1 fail) → results array has 3 entries |
| Uses ISO 8601 date format with Z suffix | Verify PATCH body contains `"2026-04-22T00:00:00Z"` format |

**Mocking approach:** Mock `httpsGet` and `httpsPatch` from `priorityHttp.ts` via `vi.mock('../services/priorityHttp')`. No real Priority API calls in tests.

**`server/src/services/priorityHttp.test.ts`** (new — for the `httpsPatch` function)

| Test Case | What it verifies |
|-----------|-----------------|
| Sends PATCH method with JSON body | Correct `https.request` options |
| Includes IEEE754Compatible header | Required header present |
| Includes Basic Auth header | Auth from `getPriorityConfig()` |
| Returns parsed JSON response | Response body parsing |
| Handles non-2xx status codes | Error propagation |

### 11.4 Test Count Target

| Area | Test files | Estimated cases |
|------|-----------|----------------|
| Hooks | 2 | ~14 |
| Components | 4 | ~35 |
| Server | 2 | ~16 |
| **Total** | **8** | **~65** |

## 12. File Summary

### New Files (10)

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `client/src/components/modals/Modal.tsx` | ~70 | Reusable modal base (portal, backdrop, animation, focus) |
| `client/src/components/modals/ExtendExpiryModal.tsx` | ~150 | Single-row extend form + confirmation + state machine |
| `client/src/components/modals/BulkExtendModal.tsx` | ~180 | Multi-select list + shared days + progress tracking |
| `client/src/components/cells/ExpiryDateCell.tsx` | ~30 | Custom cell renderer — date + Extend button |
| `client/src/hooks/useExtendExpiry.ts` | ~50 | TanStack mutation hook for extend API (`useMutation` from TanStack Query v5) |
| `client/src/hooks/useBBDExtend.ts` | ~60 | BBD-specific extend orchestration — modal state, cellRenderers, callbacks. Extracted to keep ReportTableWidget under 200 lines. |
| `server/src/routes/extend.ts` | ~120 | POST endpoint — lookup + deep PATCH flow |
| 6 test files | ~400 total | TDD test suite (see Section 11) |

### Modified Files (6)

| File | Change |
|------|--------|
| `server/src/reports/bbdReport.ts` | Add `serialName` column at index 0, add excel width |
| `client/src/components/ReportTable.tsx` | Accept `cellRenderers` prop, thread it through to `ExpandableRow`. In the `columns.map` cell render loop, check `cellRenderers?.[col.key]` before calling `formatCellValue()`. If custom renderer exists, skip `isNegative` class (renderer owns its styling). |
| `client/src/components/widgets/ReportTableWidget.tsx` | Modal state, cell renderer registration, toolbar callback, modal rendering |
| `client/src/components/TableToolbar.tsx` | Add `onBulkExtend` prop + Extend button |
| `server/src/index.ts` | Mount extend route: `app.use('/api/v1/reports', createExtendRouter())` — same pattern as `createSubformRouter()` (no cache param) |
| `server/src/services/priorityHttp.ts` | Add `httpsPatch(url, body)` function for PATCH requests |

## 13. Edge Cases

**EXPDSERIAL lookup fails (404):**
The lot exists in RAWSERIAL but not in EXPDSERIAL — it was never set up for expiry tracking in Priority. Per-row modal shows error message. Bulk modal marks that item as failed, continues processing others.

**Days input validation:**
Must be a positive integer 1–365. Client-side: `type="number"` with `min`/`max` attributes + controlled state. Server-side: Zod `z.number().int().min(1).max(365)`.

**Concurrent modifications:**
If someone extends the same lot in Priority while the modal is open, the server-side flow uses the latest EXPIRYDATE from the lookup (step 1), so the extension is based on current state — not stale modal data.

**Rate limiting:**
Bulk extend with many items could approach Priority's 100 calls/min limit (2 calls per item). The existing `priorityRateLimit.ts` enforces `MIN_SPACING_MS = 200` automatically for every `fetchWithRetry` call — no manual delay needed. The Zod schema caps at 100 items max (200 API calls). At 200ms spacing, 200 calls = ~40 seconds, well under the rate limit.

**Modal interaction guards:**
- Backdrop click and Escape disabled during `submitting` state (`preventClose=true`)
- Submit button disabled while submitting (prevents double-submit)

**OData injection:**
`serialName` validated with `/^[a-zA-Z0-9_\- ]+$/` regex on both client and server (per CLAUDE.md common mistakes).

**Empty table:**
If no BBD data is loaded, the bulk Extend button is still visible but the modal shows an empty list. No special handling needed.

## 14. Performance

**Single-row extend:** 2 API calls (GET + PATCH) — completes in <2 seconds.

**Bulk extend (50 items):** 100 API calls. Rate limiting handled automatically by `priorityRateLimit.ts` (200ms minimum spacing). ~20 seconds total. Spinner + "Extending..." keeps the user informed. No parallel calls.

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
