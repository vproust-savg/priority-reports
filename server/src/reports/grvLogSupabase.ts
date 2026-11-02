// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLogSupabase.ts
// PURPOSE: GRV Log report backed by the Supabase view
//          priority_reports.grv_receiving_log (one row per GRV, remarks
//          already parsed, vendor V8491 already excluded). Twin of grv-log.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: transformGrvSupabaseRow, toTttCheck, buildHistoryFloorWarnings,
//          refreshGrvSource, GRV_SUPABASE_HISTORY_FLOOR
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterGroup, FilterOption } from '@shared/types';
import { reportRegistry } from '../config/reportRegistry';
import type { RefreshOutcome } from '../config/reportRegistry';
import { GRV_LOG_SHEET_NAME } from './grvLog';
import { querySupabase } from '../services/supabaseDb';
import { buildSqlWhere } from '../services/sqlFilterBuilder';
import { staysOnOrAfterFloor } from '../services/historyFloorWarnings';

// WHY: Same columns as grv-log (labels, order, copyable). TTT Check comes from the
// Temp Tracker Included answer (toTttCheck); the Accepted answer is not shown
// (Victor's team template, 2026-11-02).
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
  { key: 'tttCheck', label: 'TTT Check', type: 'string' },
  { key: 'comments', label: 'Comments', type: 'string' },
  { key: 'receivedBy', label: 'Received By', type: 'string' },
];

// WHY: Every column filters in SQL (filterLocation 'server'), unlike grv-log where
// remark-derived columns filter in the client. The view already holds parsed
// remarks, so Postgres can filter them all and the client never needs the full set.
// sqlColumn names the view column; it is the only thing interpolated into SQL.
const filterColumns: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', sqlColumn: 'curdate' },
  { key: 'receivingTime', label: 'Receiving Time', filterType: 'text', filterLocation: 'server', sqlColumn: 'receiving_time' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', sqlColumn: 'docno' },
  { key: 'poNumber', label: 'PO #', filterType: 'text', filterLocation: 'server', sqlColumn: 'ordname' },
  // WHY: vendor_name (display name), not supname (code), matches what the table shows
  // and what fetchFilters lists in the dropdown.
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', sqlColumn: 'vendor_name', enumKey: 'vendors' },
  { key: 'warehouse', label: 'Warehouse', filterType: 'enum', filterLocation: 'server', sqlColumn: 'towarhsdes', enumKey: 'warehouses' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', sqlColumn: 'statdes', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', sqlColumn: 'totprice' },
  { key: 'driverId', label: 'Driver ID', filterType: 'text', filterLocation: 'server', sqlColumn: 'driver_id' },
  { key: 'licensePlate', label: 'License Plate', filterType: 'text', filterLocation: 'server', sqlColumn: 'license_plate' },
  { key: 'truckTemp', label: 'Truck Temp °F', filterType: 'text', filterLocation: 'server', sqlColumn: 'truck_temp' },
  { key: 'productTemp', label: 'Product Temp °F', filterType: 'text', filterLocation: 'server', sqlColumn: 'product_temp' },
  { key: 'productCondition', label: 'Product Condition', filterType: 'text', filterLocation: 'server', sqlColumn: 'product_condition' },
  { key: 'truckCondition', label: 'Truck Condition', filterType: 'text', filterLocation: 'server', sqlColumn: 'truck_condition' },
  // WHY: A dropdown, not text: the table shows Accept / Not Accepted but the view
  // holds Yes / No, so each option's value is the raw answer and its label the shown word.
  { key: 'tttCheck', label: 'TTT Check', filterType: 'enum', filterLocation: 'server', sqlColumn: 'temp_tracker_included', enumKey: 'tttChecks' },
  { key: 'comments', label: 'Comments', filterType: 'text', filterLocation: 'server', sqlColumn: 'comments' },
  { key: 'receivedBy', label: 'Received By', filterType: 'text', filterLocation: 'server', sqlColumn: 'ownerlogin' },
];

// WHY: Fixed column list instead of select *, so a column added to the view later
// cannot leak into responses. totprice is cast to float8 because node-postgres
// returns numeric as a string; the client expects a JSON number.
const SELECT_SQL =
  'select docno, curdate, receiving_time, ordname, vendor_name, towarhsdes, statdes, ' +
  'totprice::float8 as totprice, driver_id, license_plate, truck_temp, product_temp, ' +
  'product_condition, truck_condition, temp_tracker_included, ' +
  'comments, ownerlogin from priority_reports.grv_receiving_log';

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
  // WHY: The clause comes back unwrapped, so it is the sole WHERE predicate here.
  // If another predicate is ever ANDed with it, wrap the clause in parentheses first.
  const whereSql = clause ? ` where ${clause}` : '';
  const limitParam = params.length + 1;
  return querySupabase(
    `${SELECT_SQL}${whereSql} order by curdate desc, docno desc limit $${limitParam}`,
    [...params, options.limit],
  );
}

// WHY: The view has no vendor/warehouse/status lookup tables, so the dropdown
// options are the distinct values present in the data.
async function fetchDistinctOptions(column: string): Promise<FilterOption[]> {
  // column is a literal from this file (never user input), so interpolation is safe.
  const rows = await querySupabase<{ v: string }>(
    `select distinct ${column} as v from priority_reports.grv_receiving_log ` +
      `where ${column} is not null and ${column} <> '' order by 1`,
    [],
  );
  return rows.map((row) => ({ value: row.v, label: row.v }));
}

async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  const [vendors, warehouses, statuses, trackerAnswers] = await Promise.all([
    fetchDistinctOptions('vendor_name'),
    fetchDistinctOptions('towarhsdes'),
    fetchDistinctOptions('statdes'),
    fetchDistinctOptions('temp_tracker_included'),
  ]);
  const tttChecks = trackerAnswers.map((option) => ({ ...option, label: toTttCheck(option.value) ?? option.value }));
  return { vendors, warehouses, statuses, tttChecks };
}

// WHY: TTT Check shows Accept / Not Accepted for the tracker's Yes / No (Victor,
// 2026-11-02). Anything else — N/A, blank, or free text the sync could not read
// as Yes/No — is shown exactly as the view has it, so no answer is lost.
export function toTttCheck(trackerIncluded: string | null): string | null {
  if (trackerIncluded === 'Yes') return 'Accept';
  if (trackerIncluded === 'No') return 'Not Accepted';
  return trackerIncluded;
}

// WHY: curdate arrives as a raw 'YYYY-MM-DD' string (supabaseDb parses the date
// type that way), and the client expects the same midnight-UTC ISO form grv-log
// returns from Priority. The view's parsed columns are already text or null.
export function transformGrvSupabaseRow(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    date: `${raw.curdate}T00:00:00Z`,
    receivingTime: raw.receiving_time ?? null,
    docNo: raw.docno,
    poNumber: raw.ordname ?? null,
    vendor: raw.vendor_name,
    warehouse: raw.towarhsdes,
    status: raw.statdes,
    total: raw.totprice ?? null,
    driverId: raw.driver_id ?? null,
    licensePlate: raw.license_plate ?? null,
    truckTemp: raw.truck_temp ?? null,
    productTemp: raw.product_temp ?? null,
    productCondition: raw.product_condition ?? null,
    truckCondition: raw.truck_condition ?? null,
    tttCheck: toTttCheck((raw.temp_tracker_included as string | null | undefined) ?? null),
    comments: raw.comments ?? null,
    receivedBy: raw.ownerlogin,
  };
}

// WHY: Supabase only holds GRVs from this date (the first Priority backfill).
// Earlier GRVs live on the Priority-backed Receiving Log page.
export const GRV_SUPABASE_HISTORY_FLOOR = '2026-06-28';

const HISTORY_FLOOR_WARNING =
  `This page holds GRVs from ${GRV_SUPABASE_HISTORY_FLOOR} on. ` +
  'For earlier dates, use the Receiving Log page.';

// WHY: Warn unless the filter provably stays inside the held range (rules in
// staysOnOrAfterFloor, shared with customer-returns-supabase).
export function buildHistoryFloorWarnings(group: FilterGroup): string[] {
  return staysOnOrAfterFloor(group, GRV_SUPABASE_HISTORY_FLOOR) ? [] : [HISTORY_FLOOR_WARNING];
}

const REFRESH_POLL_INTERVAL_MS = 3_000;
const REFRESH_TIMEOUT_MS = 90_000;

// WHY: type alias (not interface) so it satisfies querySupabase's Record<string, unknown> bound.
type RefreshRow = {
  request_id: string | null;
  status: string;
};

interface RefreshDeps {
  query: (sql: string, params: unknown[]) => Promise<RefreshRow[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultRefreshDeps: RefreshDeps = {
  query: (sql, params) => querySupabase<RefreshRow>(sql, params),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
};

// WHY: Asks the Supabase side to re-read the last 30 days from Priority, then waits
// for it so the widget's refetch sees fresh rows. deps is injected so tests never sleep.
// Errors from querySupabase propagate: the /refresh route turns a throw into status 'error'.
export async function refreshGrvSource(
  signal?: AbortSignal,
  deps: RefreshDeps = defaultRefreshDeps,
): Promise<RefreshOutcome> {
  const [request] = await deps.query('select * from priority_reports.request_grv_refresh()', []);
  // WHY: The SQL function always returns one row; none means something is wrong, and
  // throwing lets the /refresh route report status 'error' instead of a misleading 'busy'.
  if (!request) throw new Error('request_grv_refresh() returned no row');
  // WHY: 'busy' (01:45-02:45 LA) queues nothing and has a null request_id.
  if (request.status === 'busy' || request.request_id === null) {
    return { status: 'busy' };
  }
  // WHY: A reused request (deduplicated within 2 minutes) may already be finished.
  if (request.status === 'done' || request.status === 'error') {
    return { status: request.status };
  }

  const startedAt = deps.now();
  while (deps.now() - startedAt < REFRESH_TIMEOUT_MS) {
    if (signal?.aborted) return { status: 'timeout' };
    await deps.sleep(REFRESH_POLL_INTERVAL_MS);
    if (signal?.aborted) return { status: 'timeout' };
    // WHY: request_id is a bigint, which node-postgres returns as a string; pass it back unchanged.
    const [current] = await deps.query(
      'select * from priority_reports.grv_refresh_status($1)',
      [request.request_id],
    );
    if (current?.status === 'done' || current?.status === 'error') {
      return { status: current.status };
    }
    // No row, pending or running: keep polling until the timeout.
  }
  return { status: 'timeout' };
}

// WHY: Self-registration — importing this file adds the report to the registry.
reportRegistry.set('grv-log-supabase', {
  id: 'grv-log-supabase',
  // WHY: Also the download's file name and the sheet's fallback tab; Victor asked
  // that the file not say Supabase (2026-11-02).
  name: 'GRV Log',
  entity: 'priority_reports.grv_receiving_log',
  // WHY: Receiving needs the latest state every search, same as grv-log.
  disableCache: true,
  // WHY: fetchRows loads the whole filtered set (capped by query.ts); the widget
  // paginates in memory.
  clientSidePagination: true,
  columns,
  filterColumns,
  buildQuery,
  transformRow: transformGrvSupabaseRow,
  fetchRows,
  fetchFilters,
  // WHY: No-op kept so the /refresh route's optional-chain call site stays valid
  // (no in-memory cache exists for this report).
  clearMemoryCache: () => {},
  queryWarnings: buildHistoryFloorWarnings,
  refreshSource: (signal) => refreshGrvSource(signal),
  // WHY: No exportConfig — the export is a plain table of the page's columns, not
  // the paper inspection form (Victor's team template, 2026-11-02). reviewSheet
  // boxes every cell and adds the Reviewed by / Date lines the reviewer signs.
  // Widths are sized for 8pt text so all 17 columns print one US Letter page wide.
  excelStyle: {
    columnWidths: {
      date: 8,
      receivingTime: 8,
      docNo: 10.5,
      poNumber: 10.5,
      vendor: 20,
      warehouse: 20.5,
      status: 8,
      total: 8,
      driverId: 9,
      licensePlate: 11,
      truckTemp: 6,
      productTemp: 6.5,
      productCondition: 8,
      truckCondition: 8,
      tttCheck: 9,
      comments: 14,
      receivedBy: 9,
    },
    fontSize: 8,
    reviewSheet: true,
    sheetName: GRV_LOG_SHEET_NAME,
  },
});
