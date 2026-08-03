// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.ts
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P, then
//          fetches DOCUMENTSTEXT_SUBFORM per row (two-step pattern).
//          Parses HTML remarks into 8 structured inspection fields.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: EXCLUDED_VENDOR_SUPNAME (used by routes/filters.ts)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { querySubform } from '../services/priorityClient';
import { parseGrvRemarks } from '../services/htmlParser';
import { escapeODataString } from '../services/odataFilterBuilder';

const columns: ColumnDefinition[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'receivingTime', label: 'Receiving Time', type: 'string' },
  { key: 'docNo', label: 'GRV #', type: 'string', copyable: true },
  { key: 'poNumber', label: 'PO #', type: 'string', copyable: true },
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

const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'receivingTime', label: 'Receiving Time', filterType: 'text', filterLocation: 'client' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'poNumber', label: 'PO #', filterType: 'text', filterLocation: 'server', odataField: 'ORDNAME' },
  // WHY: odataField must match transformRow output (vendor: raw.CDES) so that
  // client-side filtering in base dataset mode compares the same values.
  // SUPNAME is the vendor code; CDES is the display name shown in the table.
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'CDES', enumKey: 'vendors' },
  // WHY: TOWARHSDES (description) is in $select and matches dropdown values.
  // TOWARHSNAME (code) is not in $select and would cause filter mismatch.
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSDES', enumKey: 'warehouses' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', odataField: 'STATDES', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', odataField: 'TOTPRICE' },
  { key: 'driverId', label: 'Driver ID', filterType: 'text', filterLocation: 'client' },
  { key: 'licensePlate', label: 'License Plate', filterType: 'text', filterLocation: 'client' },
  { key: 'truckTemp', label: 'Truck Temp °F', filterType: 'text', filterLocation: 'client' },
  { key: 'productTemp', label: 'Product Temp °F', filterType: 'text', filterLocation: 'client' },
  { key: 'productCondition', label: 'Product Condition', filterType: 'text', filterLocation: 'client' },
  { key: 'truckCondition', label: 'Truck Condition', filterType: 'text', filterLocation: 'client' },
  { key: 'comments', label: 'Comments', filterType: 'text', filterLocation: 'client' },
  { key: 'receivedBy', label: 'Received By', filterType: 'text', filterLocation: 'server', odataField: 'OWNERLOGIN' },
];

// WHY: Petrovich Caviar floods DOCUMENTS_P with GRVs (46% of week
// 2026-07-27 rows) and is out of scope for the food-safety receiving log
// (business rule, Victor 2026-08-03). Seeded into the base $filter so no
// UI filter combination can reveal it — query.ts and export.ts AND
// baseParams.$filter into every fetch via combineFilters (parenthesized).
// SUPNAME (stable vendor code), not CDES (renamable display name).
export const EXCLUDED_VENDOR_SUPNAME = 'V8491';

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [`SUPNAME ne '${EXCLUDED_VENDOR_SUPNAME}'`];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${escapeODataString(filters.vendor)}'`);
  if (filters.status) conditions.push(`STATDES eq '${escapeODataString(filters.status)}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    // WHY: TYPE included because DOCUMENTS_P has composite key (DOCNO + TYPE),
    // needed to fetch sub-forms in the enrichRows step.
    // ORDNAME = parent purchase order # (PO #) referenced by this GRV.
    $select: 'DOCNO,TYPE,ORDNAME,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN',
    $filter: conditions.join(' and '),
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
}

// WHY: Priority's $expand truncates responses on DOCUMENTS_P (CloudFront
// drops connection mid-body). Two-step fetch: get rows, then fetch each
// text sub-form individually.
// WHY (no cache): grv-log opts into disableCache — receiving operations need
// the latest remarks every time, even if it costs ~50 extra Priority calls
// per page load.
// WHY (batch shape): 10 parallel calls per batch with 200ms between batches.
// Priority's shared limit is 100 calls/min. One full page (50 rows = 5 batches)
// burns ~51 calls in ~1s — over half the per-minute budget. Do NOT lower the
// 200ms delay or raise the batch size without first widening the budget;
// concurrent dashboards + syncs already coexist under this limit.
async function enrichRows(
  rows: Record<string, unknown>[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    // WHY: Client gone (env toggle switch, unmount, reload) — stop burning
    // the shared 95/min Priority budget. Partially-enriched rows are safe:
    // query.ts discards aborted responses and never caches them.
    if (signal?.aborted) return rows;

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

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  const subform = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | null;
  const htmlText = (subform?.TEXT as string) ?? null;
  const remarks = parseGrvRemarks(htmlText);

  return {
    date: raw.CURDATE,
    docNo: raw.DOCNO,
    poNumber: (raw.ORDNAME as string | null | undefined) ?? null,
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
  // WHY: Receiving operations need the latest GRV state and the latest remarks
  // every search — stale data risks shipping the wrong goods. Bypasses Redis
  // query cache AND the per-document remarks fetch is now always live.
  disableCache: true,
  // WHY: Only report with the UAT/Live toggle — some GRV data exists only
  // in Priority UAT and cannot be migrated (Victor, 2026-08-03).
  allowEnvOverride: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
  // WHY: Kept as a no-op so the /refresh route's optional-chain call site stays
  // valid. The remarks cache it used to clear was removed when grv-log adopted
  // disableCache: true.
  clearMemoryCache: () => {},
  // WHY: Maps GRV Log Excel template columns (A-M) to transformRow output fields.
  // Columns B (Time) and F (Driver Name) are hardcoded in the template — left
  // untouched so the existing print layout is unchanged.
  // N and O are appended after the template's last column for poNumber and
  // receivingTime — new fields go at the end so existing letters stay stable.
  exportConfig: {
    mapping: {
      'A': 'date',
      'C': 'docNo',
      'D': 'vendor',
      'E': 'driverId',
      'G': 'licensePlate',
      'H': 'truckTemp',
      'I': 'productTemp',
      'J': 'productCondition',
      'K': 'truckCondition',
      'L': 'receivedBy',
      'M': 'comments',
      'N': 'poNumber',
      'O': 'receivingTime',
    },
    dataStartRow: 5,
  },
  // WHY: Only columns present in exportConfig.mapping get widths applied
  // in template mode. warehouse, status, total are NOT mapped (they don't
  // exist in the GRV Log template) so they are omitted here.
  excelStyle: {
    columnWidths: {
      date: 11,
      docNo: 10,
      vendor: 20,
      driverId: 10,
      licensePlate: 12,
      truckTemp: 8,
      productTemp: 8,
      productCondition: 10,
      truckCondition: 10,
      comments: 22,
      receivedBy: 12,
      poNumber: 12,
      receivingTime: 11,
    },
    fontSize: 8,
  },
});
