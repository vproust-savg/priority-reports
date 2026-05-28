// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/customerReturns.ts
// PURPOSE: Customer Returns report. Queries DOCUMENTS_N, fetches
//          DOCUMENTSTEXT_SUBFORM (remarks) AND EXTFILES_SUBFORM
//          (attachment metadata) per row. Parses HTML remarks into
//          4 structured fields. Exposes attachments as a metadata
//          list — file bytes are fetched on-demand via the
//          /api/v1/attachments route.
// USED BY: routes/reports.ts (side-effect import — added in Task 5)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';

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
