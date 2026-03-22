# Spec 02a — Backend: Priority API Client + GRV Log Report

> **Session scope:** ~1 hour Claude Code work (backend session only)
> **Date:** 2026-03-20
> **Status:** Ready to build
> **Parallel with:** spec-02b-frontend-real-data.md (frontend session)

---

## 1. Overview

### 1.1 What We're Building

Connect the Express backend to the real Priority ERP oData API and serve the first real report: **GRV Log** (Goods Receiving Vouchers — incoming material inspection log). Replace the mock data service with live Priority data.

The GRV Log report queries `DOCUMENTS_P`, expands `DOCUMENTSTEXT_SUBFORM` to get HTML remarks, parses the HTML into structured inspection fields (driver ID, temperatures, conditions), and returns them as typed table columns.

### 1.2 Scope of This Spec

1. Priority API client with environment switching (UAT / Production)
2. HTML remarks parser — extracts structured fields from `DOCUMENTSTEXT_SUBFORM`
3. Report registry — code-defined report configs (entity, query, columns, parser)
4. GRV Log report endpoint with date, vendor, and status filters
5. Update Airtable API Reports table (Claude Status, Comments, record comment)
6. Remove mock data service

### 1.3 Out of Scope

- Frontend changes (Spec 02b — parallel session)
- Advanced AND/OR filter builder (Spec 03+)
- Additional reports beyond GRV Log (future specs)
- Airtable-driven report definitions (reports are code-defined)
- Line items / `TRANSORDER_P` sub-form (not needed for this report)

### 1.4 Contract with Frontend (Spec 02b)

The backend and frontend specs share this API contract. The backend must serve this shape; the frontend will consume it.

**Endpoint:** `GET /api/v1/reports/:reportId`

**Query params (all optional):**
| Param | Type | Example | Purpose |
|-------|------|---------|---------|
| `from` | ISO date string | `2026-03-01` | Filter: GRVs on or after this date |
| `to` | ISO date string | `2026-03-20` | Filter: GRVs on or before this date |
| `vendor` | string | `V00001` | Filter: GRVs from this vendor code (`SUPNAME` in Priority) |
| `status` | string | `Received` | Filter: GRVs with this status |
| `page` | number | `1` | Pagination page (default: 1) |
| `pageSize` | number | `50` | Records per page (default: 50) |

**Response shape:** Same `ApiResponse<T>` envelope from Spec 01. **The canonical shape is in `shared/types/api.ts` — do not modify it.** Summary:
```typescript
{
  meta: { reportId, reportName, generatedAt, cache: 'hit' | 'miss', executionTimeMs, source },
  columns: ColumnDefinition[],
  data: Record<string, unknown>[],
  pagination: { page, pageSize, totalCount, totalPages }
}
```

**New endpoint:** `GET /api/v1/reports/:reportId/filters`

Returns the available filter values for a report (populated from actual data):
```typescript
{
  meta: { reportId, generatedAt },
  filters: {
    vendors: Array<{ value: string, label: string }>,   // e.g. [{value: "V00001", label: "Internal Use"}]
    statuses: Array<{ value: string, label: string }>    // e.g. [{value: "Received", label: "Received"}]
  }
}
```

---

## 2. Architecture

### 2.1 New Files

| File | Purpose |
|------|---------|
| `server/src/config/priority.ts` | Priority API environment config (UAT/Prod URL switching) |
| `server/src/services/priorityClient.ts` | HTTP client for Priority oData API |
| `server/src/services/htmlParser.ts` | Parse HTML remarks into structured key-value pairs |
| `server/src/config/reportRegistry.ts` | Code-defined report configs (entity, query, columns, parser) |
| `server/src/reports/grvLog.ts` | GRV Log report definition (columns, query builder, parser config) |
| `server/src/routes/filters.ts` | `/api/v1/reports/:reportId/filters` endpoint |

### 2.2 Modified Files

| File | Change |
|------|--------|
| `server/src/config/environment.ts` | Add Priority UAT/Prod env vars, Airtable token |
| `server/src/routes/reports.ts` | Replace mock data calls with report registry + Priority client. Update `/list` endpoint to iterate over report registry instead of `MOCK_REPORTS`. Add `vendor` and `status` to `QueryParamsSchema`. |
| `server/src/services/cache.ts` | Update `buildCacheKey` to include `vendor` and `status` filter params |
| `server/src/index.ts` | Mount filters route |
| `shared/types/filters.ts` | **New file:** `FilterOption` and `FiltersResponse` types |
| `shared/types/index.ts` | Re-export new filter types |

### 2.3 Deleted Files

| File | Reason |
|------|--------|
| `server/src/services/mockData.ts` | Replaced by real Priority data |

---

## 3. Priority API Client

### 3.1 Environment Config (`server/src/config/priority.ts`)

```typescript
// Reads PRIORITY_ENV to select UAT or Production credentials.
// Only the company code differs between environments.
// Same host, same ini file, same credentials.

interface PriorityConfig {
  baseUrl: string;      // Full URL including company code
  username: string;
  password: string;
  env: 'uat' | 'production';
}
```

**Environment variables (`.env`):**
```env
PRIORITY_ENV=uat

PRIORITY_UAT_BASE_URL=https://us.priority-connect.online/odata/Priority/tabc8cae.ini/a012226/
PRIORITY_UAT_USERNAME=SGAPI
PRIORITY_UAT_PASSWORD=••••••••

PRIORITY_PROD_BASE_URL=https://us.priority-connect.online/odata/Priority/tabc8cae.ini/PROD_COMPANY/
PRIORITY_PROD_USERNAME=SGAPI
PRIORITY_PROD_PASSWORD=••••••••
```

**Logic:** If `PRIORITY_ENV=uat`, use `PRIORITY_UAT_*` vars. If `PRIORITY_ENV=production`, use `PRIORITY_PROD_*` vars.

### 3.2 HTTP Client (`server/src/services/priorityClient.ts`)

A thin wrapper around `fetch` for Priority oData requests.

**Required headers on EVERY request:**
```
Content-Type: application/json
IEEE754Compatible: true
Prefer: odata.maxpagesize=1000
Authorization: Basic {base64(username:password)}
```

> **`Prefer: odata.maxpagesize=1000`** ensures Priority returns up to 1000 records per page. Without it, Priority may silently truncate results.

> **`IEEE754Compatible: true` is CRITICAL.** Without it, numeric values may be returned incorrectly. Always include it.

**Methods:**
```typescript
// Query an entity with OData params
query(entity: string, params: ODataParams): Promise<PriorityResponse>

// ODataParams shape:
interface ODataParams {
  $select?: string;
  $filter?: string;
  $expand?: string;
  $top?: number;
  $skip?: number;
  $orderby?: string;
}
```

**Error handling:**
- 401 → log "Priority auth failed", throw
- 404 → return empty result set (not an error for queries)
- 429 → log warning, retry with exponential backoff (max 3 retries)
- 500+ → log error, retry once, then throw

**Rate limiting:** Priority allows 100 calls/minute. Add a simple delay (200ms) between requests. No need for a sophisticated rate limiter at this scale.

### 3.3 Text Sub-Forms — Use `$expand`

Text sub-forms (like `DOCUMENTSTEXT_SUBFORM`) return **404 when accessed directly**. Use `$expand` on the parent query instead:

```
GET /DOCUMENTS_P?$filter=DOCNO eq 'GR26000488'&$expand=DOCUMENTSTEXT_SUBFORM
```

The sub-form data comes back nested inside each parent record:
```json
{
  "DOCUMENTSTEXT_SUBFORM": {
    "TEXT": "<style>...</style><p>HTML content</p>",
    "APPEND": null,
    "SIGNATURE": null
  }
}
```

> **Note:** `DOCUMENTSTEXT_SUBFORM` is a single-entity sub-form (Pattern A), so it returns as an object, not an array. However, verify against the actual UAT response — if it returns as an array, use the first element.

---

## 4. HTML Remarks Parser

### 4.1 The Problem

Priority stores GRV inspection data as free-text HTML in the Remarks sub-form. The HTML contains structured key-value pairs embedded in styled tags:

```html
<style>.ExternalClass{...}</style>
<p>Driver ID : Test line 1<br>
Licence Plate : Test line 2</p>
<div>Truck Temp. °F (dry if ambient) : Test line 3<br>
Product Surface Temp. °F : Test line 4</div>
...
```

### 4.2 Parser Logic (`server/src/services/htmlParser.ts`)

1. Strip `<style>` blocks entirely
2. Strip all HTML tags, converting `<br>` to newlines first
3. Decode HTML entities (`&nbsp;` → space, `&amp;` → `&`)
4. Split on newlines
5. For each line, split on `:` (first occurrence only) to get key-value pairs
6. Match keys to known field names using a fuzzy/normalized lookup

**Known fields to extract:**

| Raw Key (from HTML) | Column Name | Column Type |
|---------------------|-------------|-------------|
| `Driver ID` | Driver ID Checked | `string` |
| `Licence Plate` | License Plate | `string` |
| `Truck Temp. °F (dry if ambient)` | Truck Temp °F | `string` |
| `Product Surface Temp. °F` | Product Temp °F | `string` |
| `Condition of Product (accept/reject)` | Product Condition | `string` |
| `Condition of Truck (accept/reject)` | Truck Condition | `string` |
| `Comments` | Comments | `string` |

**Edge cases:**
- Missing fields → return `null` for that column
- Extra/unknown fields → ignore them
- Empty remarks → return all `null` columns
- No `DOCUMENTSTEXT_SUBFORM` on the record → return all `null` columns

### 4.3 Testing

The HTML parser is the most complex logic in this spec. It MUST have unit tests covering:
- Normal HTML with all 7 fields present
- HTML with missing fields
- HTML with extra whitespace/entities
- Empty/null input
- The actual HTML from the UAT test record (`GR26000488`)

---

## 5. Report Registry

### 5.1 Report Config Shape (`server/src/config/reportRegistry.ts`)

```typescript
interface ReportConfig {
  id: string;                        // e.g. 'grv-log'
  name: string;                      // e.g. 'GRV Log'
  entity: string;                    // Priority entity name, e.g. 'DOCUMENTS_P'
  columns: ColumnDefinition[];       // Column definitions for the response
  buildQuery: (filters: ReportFilters) => ODataParams;  // Builds the OData query
  transformRow: (raw: Record<string, unknown>) => Record<string, unknown>;  // Transforms Priority data to table row
}

interface ReportFilters {
  from?: string;    // ISO date
  to?: string;      // ISO date
  vendor?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}
```

**Registry pattern:** A simple `Map<string, ReportConfig>` exported from the file. The reports route looks up the report by ID and delegates to its config.

### 5.2 GRV Log Report Definition (`server/src/reports/grvLog.ts`)

**Priority query:**
```
GET /DOCUMENTS_P
  ?$select=DOCNO,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN
  &$expand=DOCUMENTSTEXT_SUBFORM
  &$filter=CURDATE ge 2026-03-01T00:00:00Z and CURDATE le 2026-03-20T00:00:00Z
  &$orderby=CURDATE desc
  &$top=50
  &$skip=0
```

**Filters → OData `$filter` mapping:**
| Filter | OData expression |
|--------|-----------------|
| `from` | `CURDATE ge {from}T00:00:00Z` |
| `to` | `CURDATE le {to}T23:59:59Z` |
| `vendor` | `SUPNAME eq '{vendor}'` (WHY: filter on vendor code, not description) |
| `status` | `STATDES eq '{status}'` |

Multiple filters are combined with ` and `.

**Zod validation:** Add `vendor` and `status` to the existing `QueryParamsSchema` in `reports.ts` with safe string validation (e.g., `z.string().optional()`) to prevent OData injection.

**Pagination count:** Priority may not support `$count=true`. If the total count is unavailable, set `totalCount` to the length of the returned data when fewer records than `pageSize` are returned (indicating last page). Otherwise, estimate as `skip + data.length + 1` to indicate more pages exist.

**Columns:**

| Column Key | Header | Type | Source |
|------------|--------|------|--------|
| `date` | Date | `date` | `CURDATE` |
| `docNo` | GRV # | `string` | `DOCNO` |
| `vendor` | Vendor | `string` | `CDES` (vendor description) |
| `warehouse` | Warehouse | `string` | `TOWARHSDES` |
| `status` | Status | `string` | `STATDES` |
| `total` | Total | `currency` | `TOTPRICE` |
| `driverId` | Driver ID | `string` | Parsed from remarks |
| `licensePlate` | License Plate | `string` | Parsed from remarks |
| `truckTemp` | Truck Temp °F | `string` | Parsed from remarks |
| `productTemp` | Product Temp °F | `string` | Parsed from remarks |
| `productCondition` | Product Condition | `string` | Parsed from remarks |
| `truckCondition` | Truck Condition | `string` | Parsed from remarks |
| `comments` | Comments | `string` | Parsed from remarks |
| `receivedBy` | Received By | `string` | `OWNERLOGIN` |

**Row transformation:**
1. Take raw Priority record
2. Extract standard fields (`CURDATE`, `DOCNO`, `CDES`, etc.)
3. Pass `DOCUMENTSTEXT_SUBFORM.TEXT` through the HTML parser
4. Merge parsed fields into the row object
5. Return the flat row

### 5.3 Filters Endpoint (`server/src/routes/filters.ts`)

`GET /api/v1/reports/grv-log/filters`

Queries Priority for distinct vendor and status values:
- **Vendors:** `GET /DOCUMENTS_P?$select=SUPNAME,CDES&$orderby=CDES` → deduplicate → return `{ value: SUPNAME, label: CDES }`. The frontend sends `value` (SUPNAME) back as the filter param.
- **Statuses:** Return a hardcoded list: `[{value: "Received", label: "Received"}, {value: "Cancelled", label: "Cancelled"}]`

Results are cached (5 min TTL) since filter options change infrequently.

---

## 6. Airtable Status Update

After the GRV Log report is successfully built and tested, the backend session should update the Airtable API Reports table:

**Table:** `tblvqv3S31KQhKRU6` | **Base:** `appjwOgR4HsXeGIda`
**Record:** `recJluOijRUZcZnBS` (GRV Log)

1. **Update fields:**
   - `Claude Status` (`fldAAdwPBUQBRQet7`) → new status value (e.g., "Built")
   - `Claude Comments` (`fld1cKObhpMuz3VYq`) → brief description of what was built

2. **Add record comment:**
   ```
   POST /v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6/recJluOijRUZcZnBS/comments
   Body: {"text": "2026-03-20: Backend endpoint built. Priority entity: DOCUMENTS_P with $expand=DOCUMENTSTEXT_SUBFORM. HTML parser extracts 7 inspection fields. Filters: date range, vendor, status. Updated by Claude Code."}
   ```

**Environment variable needed:**
```env
AIRTABLE_TOKEN=pat...
```

**NEVER modify `Victor Status` or `Victor Comments` fields.**

---

## 7. Environment Variables Summary

Add these to `.env` (and `.env.example`):

```env
# Priority ERP
PRIORITY_ENV=uat
PRIORITY_UAT_BASE_URL=https://us.priority-connect.online/odata/Priority/tabc8cae.ini/a012226/
PRIORITY_UAT_USERNAME=SGAPI
PRIORITY_UAT_PASSWORD=••••••••
PRIORITY_PROD_BASE_URL=
PRIORITY_PROD_USERNAME=
PRIORITY_PROD_PASSWORD=

# Airtable (for status updates)
AIRTABLE_TOKEN=pat...
```

**`.env.example`** should have placeholder values (no real credentials).

---

## 8. Acceptance Criteria

### Must Pass

- [ ] `GET /api/v1/reports/grv-log` returns real GRV data from Priority UAT
- [ ] Response includes all 14 columns (6 standard + 7 parsed from remarks + receivedBy)
- [ ] HTML remarks are correctly parsed into structured fields
- [ ] Date, vendor, and status filters work via query params
- [ ] `GET /api/v1/reports/grv-log/filters` returns vendor and status options
- [ ] Cache works (second request within TTL is faster and returns `cached: true`)
- [ ] Switching `PRIORITY_ENV=production` would use production credentials (no code changes)
- [ ] Mock data service is deleted
- [ ] All existing endpoints still work (`/api/v1/health`, `/api/v1/reports/list`)
- [ ] HTML parser has unit tests covering normal, edge, and empty cases
- [ ] `cd server && npx tsc --noEmit` passes
- [ ] `cd server && npm test` passes
- [ ] Airtable API Reports record updated (Claude Status, Comments, record comment)

### File Size

- [ ] Every file under 150 lines
- [ ] Intent blocks on all new files
- [ ] WHY comments on non-obvious decisions

---

## 9. Spec Roadmap Update

After this spec, the reports route is no longer serving mock data. The report registry pattern makes it easy to add new reports:

1. Create a report definition file in `server/src/reports/`
2. Register it in `server/src/config/reportRegistry.ts`
3. Done — the route auto-serves it

**Next specs can add reports without touching route code.**
