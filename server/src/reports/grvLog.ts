// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLog.ts
// PURPOSE: GRV Log report definition. Queries DOCUMENTS_P with
//          $expand to fetch DOCUMENTSTEXT_SUBFORM inline (single call).
//          Parses HTML remarks into 7 structured inspection fields.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { parseGrvRemarks } from '../services/htmlParser';
import { escapeODataString } from '../services/odataFilterBuilder';

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

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);
  if (filters.vendor) conditions.push(`SUPNAME eq '${escapeODataString(filters.vendor)}'`);
  if (filters.status) conditions.push(`STATDES eq '${escapeODataString(filters.status)}'`);

  const pageSize = filters.pageSize ?? 50;
  const page = filters.page ?? 1;

  return {
    // WHY: $expand fetches DOCUMENTSTEXT_SUBFORM inline — no separate
    // enrichRows step needed. Verified working with MAXAPILINES=50,000.
    $select: 'DOCNO,CURDATE,SUPNAME,CDES,STATDES,TOTPRICE,TOWARHSDES,OWNERLOGIN',
    $expand: 'DOCUMENTSTEXT_SUBFORM($select=TEXT)',
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    $top: pageSize,
    $skip: (page - 1) * pageSize,
  };
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
  // WHY: Maps GRV Log Excel template columns (A-M) to transformRow output fields.
  // Columns B (Time) and F (Driver Name) are omitted — no data field exists.
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
    },
    fontSize: 8,
  },
});
