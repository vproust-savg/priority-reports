// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.ts
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P, then
//          fetches DOCUMENTSTEXT_SUBFORM per row (two-step pattern).
//          Parses HTML remarks into 7 structured inspection fields.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { querySubform } from '../services/priorityClient';
import { parseGrvRemarks } from '../services/htmlParser';

// WHY: OData string literals use single quotes. A bare quote in a value
// breaks the query. Doubling escapes it: O'Brien → O''Brien.
// Zod regex blocks quotes today, but this is defense in depth.
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

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

const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME', enumKey: 'vendors' },
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', odataField: 'TOWARHSNAME', enumKey: 'warehouses' },
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

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${escapeODataString(filters.vendor)}'`);
  if (filters.status) conditions.push(`STATDES eq '${escapeODataString(filters.status)}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    // WHY: TYPE included because DOCUMENTS_P has composite key (DOCNO + TYPE),
    // needed to fetch sub-forms in the enrichRows step.
    $select: 'DOCNO,TYPE,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
}

// WHY: Priority's $expand truncates responses on DOCUMENTS_P (CloudFront
// drops connection mid-body). Two-step fetch: get rows, then fetch each
// text sub-form individually. Batched in groups of 10 for rate limit safety.
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

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  const subform = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | null;
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
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
});
