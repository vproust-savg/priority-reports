// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/customerReturnsSupabase.ts
// PURPOSE: Customer Returns report backed by the Supabase view
//          priority_reports.customer_returns_log (one row per return line,
//          remarks already parsed and masked, file list as jsonb). Twin of
//          customer-returns; hard-scoped to Final returns like the original.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: transformCustomerReturnSupabaseRow, buildReturnsHistoryFloorWarnings,
//          CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterGroup, FilterOption } from '@shared/types';
import { reportRegistry } from '../config/reportRegistry';
import { querySupabase } from '../services/supabaseDb';
import { buildSqlWhere } from '../services/sqlFilterBuilder';
import { staysOnOrAfterFloor } from '../services/historyFloorWarnings';
import { formatQuantityUnit } from '../services/customerReturnsLineItems';

// WHY: Same keys, order and types as customer-returns so the widget, the
// attachments cell and the fallback Excel behave identically. Only the
// invoiceNum label differs: the view's ivnum is the credit memo (header IVNUM
// is empty on every return in Priority, so the old column was always blank).
const columns: ColumnDefinition[] = [
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'docNo', label: 'Doc #', type: 'string', copyable: true },
  { key: 'customerId', label: 'Customer ID', type: 'string', copyable: true },
  { key: 'customerName', label: 'Customer Name', type: 'string' },
  { key: 'invoiceNum', label: 'Credit Memo #', type: 'string', copyable: true },
  { key: 'requestedBy', label: 'Requested By', type: 'string' },
  { key: 'requestMethod', label: 'Request Method', type: 'string' },
  { key: 'returnDetails', label: 'Return Details', type: 'string' },
  { key: 'foodSafetyConcern', label: 'Food Safety Concern', type: 'string' },
  { key: 'attachments', label: 'Attachments', type: 'string' },
  { key: 'sku', label: 'SKU', type: 'string', copyable: true },
  { key: 'itemName', label: 'Item Name', type: 'string' },
  { key: 'quantity', label: 'Quantity', type: 'string' },
  { key: 'returnCode', label: 'Return Code', type: 'string' },
  { key: 'returnReason', label: 'Return Reason', type: 'string' },
  { key: 'lotNumber', label: 'Lot Number', type: 'string', copyable: true },
  { key: 'expDate', label: 'Exp. Date', type: 'date' },
];

// WHY: Every filter runs in SQL (filterLocation 'server'), unlike customer-returns
// where remark and line-item filters ran in memory: the view already holds them as
// columns. sqlColumn names the view column; it is the only thing interpolated into SQL.
const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', sqlColumn: 'curdate' },
  { key: 'docNo', label: 'Doc #', filterType: 'text', filterLocation: 'server', sqlColumn: 'docno' },
  { key: 'customerId', label: 'Customer ID', filterType: 'enum', filterLocation: 'server', sqlColumn: 'custname', enumKey: 'customers' },
  { key: 'customerName', label: 'Customer Name', filterType: 'text', filterLocation: 'server', sqlColumn: 'cdes' },
  { key: 'invoiceNum', label: 'Credit Memo #', filterType: 'text', filterLocation: 'server', sqlColumn: 'ivnum' },
  { key: 'requestedBy', label: 'Requested By', filterType: 'text', filterLocation: 'server', sqlColumn: 'requested_by' },
  { key: 'requestMethod', label: 'Request Method', filterType: 'text', filterLocation: 'server', sqlColumn: 'request_method' },
  { key: 'returnDetails', label: 'Return Details', filterType: 'text', filterLocation: 'server', sqlColumn: 'return_details' },
  { key: 'foodSafetyConcern', label: 'Food Safety Concern', filterType: 'text', filterLocation: 'server', sqlColumn: 'food_safety_concern' },
  { key: 'sku', label: 'SKU', filterType: 'text', filterLocation: 'server', sqlColumn: 'partname' },
  { key: 'itemName', label: 'Item Name', filterType: 'text', filterLocation: 'server', sqlColumn: 'pdes' },
  { key: 'returnCode', label: 'Return Code', filterType: 'enum', filterLocation: 'server', sqlColumn: 'retreasoncode', enumKey: 'returnCodes' },
  { key: 'returnReason', label: 'Return Reason', filterType: 'enum', filterLocation: 'server', sqlColumn: 'retreasondes', enumKey: 'returnReasons' },
  { key: 'lotNumber', label: 'Lot Number', filterType: 'text', filterLocation: 'server', sqlColumn: 'toserialname' },
  { key: 'expDate', label: 'Exp. Date', filterType: 'date', filterLocation: 'server', sqlColumn: 'exp_date' },
];

const VIEW = 'priority_reports.customer_returns_log';

// WHY: Only committed returns belong on the dashboard, same rule as customer-returns.
// The view holds every status, so the rule is applied here. It is a code constant,
// not user input, so it is written into the SQL rather than bound.
const FINAL_ONLY_SQL = "statdes = 'Final'";

// WHY: Fixed column list instead of select *, so a column added to the view later
// cannot leak into responses. tquant::text keeps the numeric as written ("0.05",
// not a float that could print as 0.05000000000000001).
const SELECT_SQL =
  'select docno, type, curdate, custname, cdes, ivnum, requested_by, request_method, ' +
  'return_details, food_safety_concern, files, kline, partname, pdes, tquant::text as tquant, ' +
  `tunitname, retreasoncode, retreasondes, toserialname, exp_date from ${VIEW}`;

// WHY: buildQuery is required by ReportConfig but unused here: fetchRows replaces
// the whole Priority path (query.ts and export.ts skip buildQuery for such reports).
function buildQuery(): Record<string, never> {
  return {};
}

async function fetchRows(
  filterGroup: FilterGroup,
  options: { limit: number },
): Promise<Record<string, unknown>[]> {
  const { clause, params } = buildSqlWhere(filterGroup, filterColumns);
  // WHY: Parentheses keep a user 'or' filter from escaping the Final rule
  // (AND binds tighter than OR).
  const userSql = clause ? ` and (${clause})` : '';
  const limitParam = params.length + 1;
  // WHY: The view has no ORDER BY. kline keeps a return's lines together in order.
  return querySupabase(
    `${SELECT_SQL} where ${FINAL_ONLY_SQL}${userSql} ` +
      `order by curdate desc, docno desc, kline asc limit $${limitParam}`,
    [...params, options.limit],
  );
}

type CustomerOptionRow = { custname: string; cdes: string | null };
type ReturnCodeOptionRow = { code: string; des: string | null };
type ReasonOptionRow = { v: string };

// WHY: Dropdown options come from Final rows only, so none matches zero rows
// (the same guard customer-returns applies to its Priority query). Each option's
// value equals the stored column value so the SQL equals filter matches.
async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  const [customerRows, codeRows, reasonRows] = await Promise.all([
    querySupabase<CustomerOptionRow>(
      `select distinct custname, cdes from ${VIEW} ` +
        `where ${FINAL_ONLY_SQL} and custname is not null and custname <> '' order by cdes, custname`,
      [],
    ),
    querySupabase<ReturnCodeOptionRow>(
      `select distinct retreasoncode as code, retreasondes as des from ${VIEW} ` +
        `where ${FINAL_ONLY_SQL} and retreasoncode is not null and retreasoncode <> '' order by 1`,
      [],
    ),
    querySupabase<ReasonOptionRow>(
      `select distinct retreasondes as v from ${VIEW} ` +
        `where ${FINAL_ONLY_SQL} and retreasondes is not null and retreasondes <> '' order by 1`,
      [],
    ),
  ]);

  // WHY: A code can appear with more than one name or description; the first wins.
  const seenCustomers = new Set<string>();
  const customers: FilterOption[] = [];
  for (const row of customerRows) {
    if (seenCustomers.has(row.custname)) continue;
    seenCustomers.add(row.custname);
    customers.push({ value: row.custname, label: `${row.cdes ?? row.custname} (${row.custname})` });
  }

  const seenCodes = new Set<string>();
  const returnCodes: FilterOption[] = [];
  for (const row of codeRows) {
    if (seenCodes.has(row.code)) continue;
    seenCodes.add(row.code);
    returnCodes.push({ value: row.code, label: row.des ? `${row.code} — ${row.des}` : row.code });
  }

  const returnReasons = reasonRows.map((row) => ({ value: row.v, label: row.v }));
  return { customers, returnCodes, returnReasons };
}

type ViewFile = { extfilenum: number; name: string; suffix: string | null; size: number | null };

// WHY: Dates arrive as raw 'YYYY-MM-DD' strings (supabaseDb parses the date type
// that way); the client expects the midnight-UTC ISO form customer-returns returns.
function toMidnightUtc(value: unknown): string | null {
  return value ? `${value}T00:00:00Z` : null;
}

// WHY: Produces the same row keys as customer-returns. files is jsonb, which
// node-postgres already parses into an array; the attachment download only needs
// num (EXTFILENUM) plus docNo/type, so the masked name is display-only.
export function transformCustomerReturnSupabaseRow(raw: Record<string, unknown>): Record<string, unknown> {
  const files = Array.isArray(raw.files) ? (raw.files as ViewFile[]) : [];
  return {
    date: toMidnightUtc(raw.curdate),
    docNo: raw.docno,
    type: raw.type,
    customerId: raw.custname,
    customerName: raw.cdes,
    invoiceNum: raw.ivnum ?? null,
    requestedBy: raw.requested_by ?? null,
    requestMethod: raw.request_method ?? null,
    returnDetails: raw.return_details ?? null,
    foodSafetyConcern: raw.food_safety_concern ?? null,
    attachments: files.map((file) => ({
      num: file.extfilenum,
      filename: file.suffix ? `${file.name}.${file.suffix}` : file.name,
      sizeBytes: file.size ?? null,
    })),
    sku: raw.partname ?? null,
    itemName: raw.pdes ?? null,
    quantity: formatQuantityUnit(raw.tquant, raw.tunitname),
    returnCode: raw.retreasoncode ?? null,
    returnReason: raw.retreasondes ?? null,
    lotNumber: raw.toserialname ?? null,
    expDate: toMidnightUtc(raw.exp_date),
  };
}

// WHY: Supabase only holds returns from this date (the first Priority backfill).
// Earlier returns live on the Priority-backed Customer Returns page.
export const CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR = '2026-06-29';

const HISTORY_FLOOR_WARNING =
  `This page holds returns from ${CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR} on. ` +
  'For earlier dates, use the Customer Returns page.';

export function buildReturnsHistoryFloorWarnings(group: FilterGroup): string[] {
  return staysOnOrAfterFloor(group, CUSTOMER_RETURNS_SUPABASE_HISTORY_FLOOR) ? [] : [HISTORY_FLOOR_WARNING];
}

// WHY: Self-registration — importing this file adds the report to the registry.
// No explodeRows (the view is already one row per line, and export would run it
// again), no refreshSource (Supabase has no on-demand refresh for returns) and no
// exportConfig (customer-returns exports in fallback mode too).
reportRegistry.set('customer-returns-supabase', {
  id: 'customer-returns-supabase',
  name: 'Customer Returns (Supabase)',
  entity: VIEW,
  disableCache: true,
  // WHY: fetchRows loads the whole filtered set (capped by query.ts); the widget
  // paginates in memory.
  clientSidePagination: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow: transformCustomerReturnSupabaseRow,
  fetchRows,
  fetchFilters,
  // WHY: No-op kept so the /refresh route's optional-chain call site stays valid.
  clearMemoryCache: () => {},
  queryWarnings: buildReturnsHistoryFloorWarnings,
});
