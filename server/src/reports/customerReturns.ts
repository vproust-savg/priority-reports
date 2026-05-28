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
import { parseCustomerReturnsRemarks } from '../services/customerReturnsParser';
import { querySubform } from '../services/priorityClient';

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

// WHY: DOCUMENTS_N's $expand is broken (mirrors DOCUMENTS_P's CloudFront
// abort behavior). Two-step fetch per row: DOCUMENTSTEXT_SUBFORM for HTML
// remarks AND EXTFILES_SUBFORM (metadata-only via $select=EXTFILEDES,
// EXTFILENUM,SUFFIX,FILESIZE) for the attachments column. File bytes are
// NOT fetched here — the AttachmentsCell triggers a separate request to
// /api/v1/attachments/:entity/:docNo/:type/:extfilenum on click.
// WHY (batch shape): 10 rows × 2 subforms = 20 parallel calls per batch,
// 200ms gap. One full 50-row page = 5 batches × 20 = 100 calls in ~1s.
// Priority's per-minute budget is shared at 100/min; do NOT lower the
// gap or raise the batch size without coordinating with other dashboards.
async function enrichRows(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  const BATCH_SIZE = 10;
  const BATCH_DELAY_MS = 200;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));

    const calls: Promise<unknown>[] = [];
    for (const row of batch) {
      const key = { DOCNO: row.DOCNO as string, TYPE: row.TYPE as string };
      calls.push(
        querySubform('DOCUMENTS_N', key, 'DOCUMENTSTEXT_SUBFORM').then((res) => {
          row.DOCUMENTSTEXT_SUBFORM = res;
        }),
      );
      calls.push(
        querySubform(
          'DOCUMENTS_N',
          key,
          'EXTFILES_SUBFORM',
          { select: 'EXTFILEDES,EXTFILENUM,SUFFIX,FILESIZE' },
        ).then((res) => {
          row.EXTFILES_SUBFORM = res;
        }),
      );
    }
    await Promise.all(calls);
  }

  return rows;
}

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  const textSub = raw.DOCUMENTSTEXT_SUBFORM as Record<string, unknown> | null;
  const htmlText = (textSub?.TEXT as string | null | undefined) ?? null;
  const remarks = parseCustomerReturnsRemarks(htmlText);

  const filesSub = raw.EXTFILES_SUBFORM as Record<string, unknown> | null;
  const filesArray = (filesSub?.value as Array<Record<string, unknown>> | undefined) ?? [];
  const attachments = filesArray
    .map((f) => {
      const desRaw = f.EXTFILEDES;
      if (typeof desRaw !== 'string' || desRaw.length === 0) return null;
      const suffix = f.SUFFIX;
      const filename = typeof suffix === 'string' && suffix.length > 0 ? `${desRaw}.${suffix}` : desRaw;
      const sizeBytes = typeof f.FILESIZE === 'number' ? (f.FILESIZE as number) : null;
      const num = typeof f.EXTFILENUM === 'number' ? (f.EXTFILENUM as number) : null;
      if (num === null) return null;
      return { num, filename, sizeBytes };
    })
    .filter((a): a is { num: number; filename: string; sizeBytes: number | null } => a !== null);

  return {
    date: raw.CURDATE,
    docNo: raw.DOCNO,
    type: raw.TYPE,
    customerId: raw.CUSTNAME,
    customerName: raw.CDES,
    invoiceNum: raw.IVNUM ?? null,
    ...remarks,
    attachments,
  };
}

reportRegistry.set('customer-returns', {
  id: 'customer-returns',
  name: 'Customer Returns',
  entity: 'DOCUMENTS_N',
  disableCache: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  enrichRows,
  clearMemoryCache: () => {},
});
