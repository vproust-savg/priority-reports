// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/customerReturns.ts
// PURPOSE: Customer Returns report. ONE query against DOCUMENTS_N that
//          $expands all three subforms — TRANSORDER_N_SUBFORM (line
//          items), DOCUMENTSTEXT_SUBFORM (HTML remarks) and
//          EXTFILES_SUBFORM (attachment metadata). Explodes into one row
//          per line item, parses remarks into 4 fields, exposes
//          attachments as metadata (bytes fetched on-demand via
//          /api/v1/attachments). No per-document enrichment — scales to
//          any volume because it is a single API call.
// USED BY: routes/reports.ts (side-effect import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { parseCustomerReturnsRemarks } from '../services/customerReturnsParser';
import { queryPriority } from '../services/priorityClient';
import {
  explodeReturnRows,
  lineItemFields,
  collectReturnFilterOptions,
} from '../services/customerReturnsLineItems';
import type { FilterOption } from '@shared/types';

// WHY: All three subforms expand inline on the parent query. Nested $selects
// keep each to the fields we display (line items would otherwise return 30+
// fields). DOCUMENTSTEXT is the HTML remarks blob; EXTFILES is attachment
// metadata only (bytes fetched on-demand). $expand needs the parent key
// (DOCNO,TYPE) in the parent $select or Priority aborts the response stream.
const SUBFORM_EXPAND = [
  'TRANSORDER_N_SUBFORM($select=PARTNAME,PDES,TQUANT,TUNITNAME,RETREASONCODE,RETREASONDES,TOSERIALNAME,Y_2301_0_ESH)',
  'DOCUMENTSTEXT_SUBFORM($select=TEXT)',
  'EXTFILES_SUBFORM($select=EXTFILEDES,EXTFILENUM,SUFFIX,FILESIZE)',
].join(',');

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
  // WHY: Line-item columns (one row per returned SKU after explodeRows).
  { key: 'sku', label: 'SKU', type: 'string', copyable: true },
  { key: 'itemName', label: 'Item Name', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'string' },
  { key: 'returnCode', label: 'Return Code', type: 'string' },
  { key: 'returnReason', label: 'Return Reason', type: 'string' },
  { key: 'lotNumber', label: 'Lot Number', type: 'string', copyable: true },
  { key: 'expDate', label: 'Exp. Date', type: 'date' },
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
  // WHY: Line-item filters are client-located — these fields come from the
  // exploded TRANSORDER_N_SUBFORM, not the parent OData query, so they're
  // matched in-memory by applyServerClientFilters over the full fetched month.
  { key: 'sku', label: 'SKU', filterType: 'text', filterLocation: 'client' },
  { key: 'itemName', label: 'Item Name', filterType: 'text', filterLocation: 'client' },
  { key: 'returnCode', label: 'Return Code', filterType: 'enum', filterLocation: 'client', enumKey: 'returnCodes' },
  { key: 'returnReason', label: 'Return Reason', filterType: 'enum', filterLocation: 'client', enumKey: 'returnReasons' },
  { key: 'lotNumber', label: 'Lot Number', filterType: 'text', filterLocation: 'client' },
  { key: 'expDate', label: 'Exp. Date', filterType: 'date', filterLocation: 'client' },
];

function buildQuery(filters: ReportFilters): ODataParams {
  const conditions: string[] = [];

  if (filters.from) conditions.push(`CURDATE ge ${filters.from}T00:00:00Z`);
  if (filters.to) conditions.push(`CURDATE le ${filters.to}T23:59:59Z`);

  return {
    // WHY: TYPE in $select so we can fetch DOCUMENTSTEXT_SUBFORM and
    // EXTFILES_SUBFORM via the (DOCNO='...',TYPE='...') composite key.
    // WHY: DOCNO,TYPE are the composite key — REQUIRED in $select for $expand
    // to stream without aborting. CURDATE/CUSTNAME/CDES/IVNUM are display fields.
    $select: 'DOCNO,TYPE,CURDATE,CUSTNAME,CDES,IVNUM',
    // WHY: One query pulls line items + remarks + attachment metadata inline.
    // No per-document enrichment, so the cost is one API call at any volume.
    $expand: SUBFORM_EXPAND,
    $filter: conditions.length > 0 ? conditions.join(' and ') : undefined,
    $orderby: 'CURDATE desc',
    // WHY: clientSidePagination fetches the whole filtered window in one query;
    // the frontend filters/sorts/paginates the exploded rows. $top 5000 covers
    // ~20 months at the expected ~250 returns/month (well under MAXAPILINES).
    // Very wide ranges beyond 5000 returns would truncate — acceptable for the
    // month-default UI; revisit with cursor pagination if that need arises.
    $top: 5000,
    $skip: 0,
  };
}

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  // WHY: Via $expand, DOCUMENTSTEXT_SUBFORM comes back as a single object
  // ({TEXT}); normalize the array form too in case Priority returns a collection.
  const textRaw = raw.DOCUMENTSTEXT_SUBFORM;
  const textSub = (Array.isArray(textRaw) ? textRaw[0] : textRaw) as Record<string, unknown> | null;
  const htmlText = (textSub?.TEXT as string | null | undefined) ?? null;
  const remarks = parseCustomerReturnsRemarks(htmlText);

  // WHY: Via $expand, EXTFILES_SUBFORM is a plain array (the legacy two-step
  // fetch wrapped it as {value:[...]}); accept both shapes defensively.
  const filesRaw = raw.EXTFILES_SUBFORM;
  const filesArray = (
    Array.isArray(filesRaw)
      ? filesRaw
      : ((filesRaw as Record<string, unknown> | null)?.value as Array<Record<string, unknown>> | undefined) ?? []
  ) as Array<Record<string, unknown>>;
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
    // WHY: One line item per exploded row (or all-null when the return has none).
    ...lineItemFields(raw),
  };
}

// WHY: The Customer ID column is an enum filter — the dashboard needs a
// dropdown of available customers. The shared filters route falls back to
// a SUPNAME/CDES query (vendor-shaped) that 400s on DOCUMENTS_N, so we
// provide a per-report fetchFilters that returns unique CUSTNAME/CDES
// pairs from recent returns.
async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  // WHY: One query feeds three dropdowns — customers from the parent, return
  // codes/reasons from the expanded line items. Option `value` must equal the
  // row's stored value so the client `equals` filter matches (returnCode=code,
  // returnReason=description). Derived from data, so only codes/reasons in use
  // appear — complete at this entity's volume (~15 returns).
  const data = await queryPriority('DOCUMENTS_N', {
    // WHY: The parent key (DOCNO,TYPE) MUST be in $select when $expand-ing
    // TRANSORDER_N_SUBFORM — without it Priority aborts the response stream
    // mid-body (HTTP/2 stream error). Confirmed live: key present → 200 OK;
    // key absent → truncated/aborted.
    $select: 'DOCNO,TYPE,CUSTNAME,CDES',
    $expand: 'TRANSORDER_N_SUBFORM($select=RETREASONCODE,RETREASONDES)',
    $orderby: 'CDES',
    $top: 1000,
  });

  const seen = new Set<string>();
  const customers: FilterOption[] = [];
  for (const row of data.value) {
    const code = row.CUSTNAME as string | null | undefined;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const desc = (row.CDES as string | null | undefined) ?? code;
    customers.push({ value: code, label: `${desc} (${code})` });
  }

  const { returnCodes, returnReasons } = collectReturnFilterOptions(data.value);
  return { customers, returnCodes, returnReasons };
}

reportRegistry.set('customer-returns', {
  id: 'customer-returns',
  name: 'Customer Returns',
  entity: 'DOCUMENTS_N',
  disableCache: true,
  // WHY: Returns are low-volume, so fetch the whole filtered month and let the
  // frontend paginate/filter the exploded line-item rows. Required so SKU /
  // return-code client filters match across all returns, not just one page.
  clientSidePagination: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  // WHY: No enrichRows — line items, remarks and attachments all arrive via the
  // single $expand in buildQuery, so there is no per-document fetch step.
  // WHY: Explodes each return into one row per TRANSORDER_N_SUBFORM line item.
  explodeRows: explodeReturnRows,
  fetchFilters,
  clearMemoryCache: () => {},
});
