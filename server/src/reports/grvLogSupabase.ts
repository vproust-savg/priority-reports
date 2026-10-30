// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/grvLogSupabase.ts
// PURPOSE: GRV Log report backed by the Supabase view
//          priority_reports.grv_receiving_log (one row per GRV, remarks
//          already parsed, vendor V8491 already excluded). Twin of grv-log.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: transformGrvSupabaseRow, buildHistoryFloorWarnings, refreshGrvSource,
//          GRV_SUPABASE_HISTORY_FLOOR
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterGroup, FilterOption } from '@shared/types';
import { reportRegistry } from '../config/reportRegistry';
import type { RefreshOutcome } from '../config/reportRegistry';
import { GRV_LOG_TEMPLATE_RECORD_ID } from './grvLog';
import { querySupabase } from '../services/supabaseDb';
import { buildSqlWhere } from '../services/sqlFilterBuilder';

// WHY: Same columns as grv-log (labels, order, copyable) so the widget and the
// Excel layout look identical. TTT Check is dropped (the view carries the raw
// tracker answers instead) and the two tracker columns follow Truck Condition.
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
  { key: 'tempTrackerIncluded', label: 'Temp Tracker Included', type: 'string' },
  { key: 'tempTrackerAccepted', label: 'Temp Tracker Accepted', type: 'string' },
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
  { key: 'tempTrackerIncluded', label: 'Temp Tracker Included', filterType: 'text', filterLocation: 'server', sqlColumn: 'temp_tracker_included' },
  { key: 'tempTrackerAccepted', label: 'Temp Tracker Accepted', filterType: 'text', filterLocation: 'server', sqlColumn: 'temp_tracker_accepted' },
  { key: 'comments', label: 'Comments', filterType: 'text', filterLocation: 'server', sqlColumn: 'comments' },
  { key: 'receivedBy', label: 'Received By', filterType: 'text', filterLocation: 'server', sqlColumn: 'ownerlogin' },
];

// WHY: Fixed column list instead of select *, so a column added to the view later
// cannot leak into responses. totprice is cast to float8 because node-postgres
// returns numeric as a string; the client expects a JSON number.
const SELECT_SQL =
  'select docno, curdate, receiving_time, ordname, vendor_name, towarhsdes, statdes, ' +
  'totprice::float8 as totprice, driver_id, license_plate, truck_temp, product_temp, ' +
  'product_condition, truck_condition, temp_tracker_included, temp_tracker_accepted, ' +
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
  const [vendors, warehouses, statuses] = await Promise.all([
    fetchDistinctOptions('vendor_name'),
    fetchDistinctOptions('towarhsdes'),
    fetchDistinctOptions('statdes'),
  ]);
  return { vendors, warehouses, statuses };
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
    tempTrackerIncluded: raw.temp_tracker_included ?? null,
    tempTrackerAccepted: raw.temp_tracker_accepted ?? null,
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

// WHY: Only operators whose first value is a lower bound (or an exact day) can
// prove the result stays at or after the floor. isBefore/isOnOrBefore never can.
const FLOOR_SAFE_OPERATORS = new Set(['isOnOrAfter', 'isAfter', 'isBetween', 'isInWeek', 'equals']);

// WHY: Warn unless the filter provably stays inside the held range. An 'or' root or a
// date condition nested in a sub-group could still reach earlier dates, so those warn
// too. ISO dates compare correctly as strings (a datetime value sorts after its date).
export function buildHistoryFloorWarnings(group: FilterGroup): string[] {
  const staysAfterFloor =
    group.conjunction === 'and' &&
    group.conditions.some(
      (condition) =>
        condition.field === 'date' &&
        FLOOR_SAFE_OPERATORS.has(condition.operator) &&
        condition.value >= GRV_SUPABASE_HISTORY_FLOOR,
    );
  return staysAfterFloor ? [] : [HISTORY_FLOOR_WARNING];
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
  name: 'GRV Log (Supabase)',
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
  // WHY: Same template and layout as grv-log. Its TTT Check column P is replaced by
  // Temp Tracker Included (P), and Temp Tracker Accepted is appended as Q so the
  // existing letters stay stable. B and F stay hardcoded in the template.
  exportConfig: {
    templateRecordId: GRV_LOG_TEMPLATE_RECORD_ID,
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
      'P': 'tempTrackerIncluded',
      'Q': 'tempTrackerAccepted',
    },
    dataStartRow: 5,
  },
  // WHY: Only mapped columns get widths in template mode (see grv-log).
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
      tempTrackerIncluded: 12,
      tempTrackerAccepted: 12,
    },
    fontSize: 8,
  },
});
