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

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${escapeODataString(filters.vendor)}'`);
  if (filters.status) conditions.push(`STATDES eq '${escapeODataString(filters.status)}'`);

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
