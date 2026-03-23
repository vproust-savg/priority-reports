// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/bbdReport.ts
// PURPOSE: BBD (Best By Dates) report. Queries RAWSERIAL for items
//          nearing or past expiration. Two-step fetch for balance
//          sub-form. Computes expiration status and filters to
//          flagged items only. Provides dropdown filter values.
// USED BY: config/reportRegistry.ts (auto-registers on import)
// EXPORTS: (none — self-registers into reportRegistry)
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterOption } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';
import type { ReportFilters } from '../config/reportRegistry';
import { reportRegistry } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';

// --- Column Definitions ---

const columns: ColumnDefinition[] = [
  { key: 'partNumber', label: 'Part Number', type: 'string' },
  { key: 'partDescription', label: 'Part Description', type: 'string' },
  { key: 'balance', label: 'Balance', type: 'number' },
  { key: 'unit', label: 'Unit', type: 'string' },
  { key: 'expiryDate', label: 'Expir. Date', type: 'date' },
  { key: 'daysUntilExpiry', label: 'Days Left', type: 'number' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'vendor', label: 'Vendor', type: 'string' },
  { key: 'perishable', label: 'Perishable', type: 'string' },
  { key: 'brand', label: 'Brand', type: 'string' },
  { key: 'family', label: 'Family', type: 'string' },
];

// --- Filter Column Metadata ---

const filterColumns: ColumnFilterMeta[] = [
  { key: 'partNumber', label: 'Part Number', filterType: 'text', filterLocation: 'client' },
  { key: 'partDescription', label: 'Part Description', filterType: 'text', filterLocation: 'client' },
  { key: 'balance', label: 'Balance', filterType: 'number', filterLocation: 'client' },
  { key: 'expiryDate', label: 'Expir. Date', filterType: 'date', filterLocation: 'client' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'client', enumKey: 'vendors' },
  { key: 'perishable', label: 'Perishable', filterType: 'enum', filterLocation: 'client', enumKey: 'perishables' },
  { key: 'brand', label: 'Brand', filterType: 'enum', filterLocation: 'client', enumKey: 'brands' },
  { key: 'family', label: 'Family', filterType: 'enum', filterLocation: 'client', enumKey: 'families' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'client', enumKey: 'statuses' },
];

// --- OData Query Builder ---

// WHY: Computes the 30-day cutoff internally. Ignores from/to from ReportFilters
// (those are GRV Log concepts). All BBD filters are client-side.
function buildQuery(_filters: ReportFilters): ODataParams {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + 30);
  const cutoffIso = cutoffDate.toISOString().split('T')[0] + 'T23:59:59Z';

  return {
    // WHY: QUANT is the lot quantity on RAWSERIAL (TBALANCE lives on the sub-form only).
    // Filtered in $filter to avoid fetching zero-quantity rows (reduces result set dramatically).
    $select: 'PARTNAME,PARTDES,EXPIRYDATE,SUPDES,Y_9966_5_ESH,Y_9952_5_ESH,Y_2074_5_ESH,QUANT,UNITNAME',
    $filter: `EXPIRYDATE le ${cutoffIso} and QUANT gt 0`,
    $orderby: 'EXPIRYDATE asc',
    // WHY: Fetch all matching rows (no server pagination). Post-fetch filtering
    // removes unflagged items, making OData pagination unreliable.
    // Using a high $top. Cursor-based pagination handles MAXAPILINES cap if needed.
    $top: 2000,
    $skip: 0,
  };
}

// --- Family Lookup Cache ---

// WHY: FAMILY_LOG lookup map built once by fetchFilters(), reused by transformRow().
// Maps family code (Y_2074_5_ESH value) -> family description for display.
let familyLookupMap: Map<string, string> = new Map();

// --- Row Transformer ---

function transformRow(raw: Record<string, unknown>): Record<string, unknown> {
  // WHY: QUANT (lot quantity) is fetched directly from RAWSERIAL via $select
  // (and filtered via $filter to only include > 0). No sub-form needed.
  const balance = Number(raw.QUANT ?? 0);

  const expiryRaw = raw.EXPIRYDATE as string | null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  let daysUntilExpiry = 0;
  let status: string | null = null;

  if (expiryRaw) {
    const expiryDate = new Date(expiryRaw);
    expiryDate.setHours(0, 0, 0, 0);
    daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // WHY: Priority returns "Yes"/"No" (not "Y"/"N"). Empty/null treated as non-perishable.
    const isPerishable = (raw.Y_9966_5_ESH as string)?.toUpperCase() === 'YES';

    // WHY: Day 0 (expiry date is today) counts as expired — the best-by date has arrived.
    if (daysUntilExpiry <= 0) {
      status = 'expired';
    } else if (isPerishable && daysUntilExpiry <= 7) {
      status = 'expiring-perishable';
    } else if (!isPerishable && daysUntilExpiry <= 30) {
      status = 'expiring-non-perishable';
    }
  }

  // WHY: Convert family code to description using the cached lookup map.
  const familyCode = (raw.Y_2074_5_ESH as string) ?? '';
  const familyDesc = familyLookupMap.get(familyCode) ?? familyCode;

  return {
    partNumber: raw.PARTNAME,
    partDescription: raw.PARTDES,
    balance,
    unit: raw.UNITNAME ?? '',
    expiryDate: raw.EXPIRYDATE,
    daysUntilExpiry,
    status: status ?? '',
    vendor: raw.SUPDES,
    perishable: (raw.Y_9966_5_ESH as string)?.toUpperCase() === 'YES' ? 'Yes' : 'No',
    brand: raw.Y_9952_5_ESH ?? '',
    family: familyDesc,
  };
}

// --- Post-Transform Row Exclusion ---

// WHY: Runs after enrichRows + transformRow. Removes items that don't meet
// alert criteria: balance must be > 0 and status must be flagged.
function filterRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const filtered = rows.filter((row) => {
    const balance = Number(row.balance);
    const status = row.status as string;
    return balance > 0 && status !== '';
  });

  // WHY: Sort — expired first (descending by date), then expiring (ascending by date)
  return filtered.sort((a, b) => {
    const statusA = a.status as string;
    const statusB = b.status as string;
    const isExpiredA = statusA === 'expired' ? 0 : 1;
    const isExpiredB = statusB === 'expired' ? 0 : 1;

    if (isExpiredA !== isExpiredB) return isExpiredA - isExpiredB;

    const daysA = Number(a.daysUntilExpiry);
    const daysB = Number(b.daysUntilExpiry);

    // WHY: Expired items sorted by expiry descending (most recently expired first).
    // Expiring items sorted ascending (soonest expiry first).
    if (statusA === 'expired') return daysB - daysA;
    return daysA - daysB;
  });
}

// --- Filter Options Fetcher ---

// WHY: Queries SUPPLIERS, SPEC4VALUES, FAMILY_LOG for dropdown values.
// Also builds the familyLookupMap used by transformRow.
async function fetchFilters(): Promise<Record<string, FilterOption[]>> {
  // Fetch all three lookups in parallel
  const [suppliersData, spec4Data, familyData] = await Promise.all([
    queryPriority('SUPPLIERS', {
      $select: 'SUPDES',
      $orderby: 'SUPDES',
      $top: 1000,
    }),
    queryPriority('SPEC4VALUES', {
      // WHY: Field is SPECVALUE (not SPEC4). Priority metadata confirms
      // the property name on the SPEC4VALUES entity type.
      $select: 'SPECVALUE',
      $orderby: 'SPECVALUE',
      $top: 500,
    }).catch((err) => {
      // WHY: SPEC4VALUES may not have API access enabled. Log warning
      // so it's discoverable, but don't fail the whole filter fetch.
      console.warn('[bbd] SPEC4VALUES fetch failed, brands dropdown will be empty:', err instanceof Error ? err.message : err);
      return { value: [] };
    }),
    queryPriority('FAMILY_LOG', {
      $select: 'FAMILYNAME,FAMILYDESC',
      $orderby: 'FAMILYDESC',
      $top: 500,
    }),
  ]);

  // Vendors — deduplicate
  const vendorSet = new Set<string>();
  for (const row of suppliersData.value) {
    const name = row.SUPDES as string;
    if (name) vendorSet.add(name);
  }
  const vendors: FilterOption[] = Array.from(vendorSet)
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Brands from SPEC4VALUES
  const brandSet = new Set<string>();
  for (const row of spec4Data.value) {
    const val = row.SPECVALUE as string;
    if (val) brandSet.add(val);
  }
  const brands: FilterOption[] = Array.from(brandSet)
    .map((name) => ({ value: name, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Families from FAMILY_LOG — also build the lookup map for transformRow
  const newFamilyMap = new Map<string, string>();
  const families: FilterOption[] = [];
  for (const row of familyData.value) {
    const code = row.FAMILYNAME as string;
    const desc = row.FAMILYDESC as string;
    if (code && desc) {
      newFamilyMap.set(code, desc);
      families.push({ value: desc, label: desc });
    }
  }
  // WHY: Update module-level map atomically. transformRow reads this.
  familyLookupMap = newFamilyMap;

  // Perishable — hardcoded
  const perishables: FilterOption[] = [
    { value: 'Yes', label: 'Yes' },
    { value: 'No', label: 'No' },
  ];

  // Statuses — hardcoded
  const statuses: FilterOption[] = [
    { value: 'expired', label: 'Expired' },
    { value: 'expiring-perishable', label: 'Expiring Soon (Perishable)' },
    { value: 'expiring-non-perishable', label: 'Expiring Soon' },
  ];

  return { vendors, brands, families, perishables, statuses };
}

// --- Self-Registration ---

reportRegistry.set('bbd', {
  id: 'bbd',
  name: 'BBD — Best By Dates',
  entity: 'RAWSERIAL',
  columns,
  filterColumns,
  buildQuery,
  transformRow,
  filterRows,
  fetchFilters,
  rowStyleField: 'status',
  // WHY: BBD fetches all matching rows and filters in code (filterRows).
  // OData pagination is unreliable when post-fetch exclusion removes rows.
  // Frontend handles pagination client-side.
  clientSidePagination: true,
  excelStyle: {
    columnWidths: {
      partNumber: 14,
      partDescription: 28,
      balance: 8,
      unit: 6,
      expiryDate: 11,
      daysUntilExpiry: 8,
      status: 12,
      vendor: 18,
      perishable: 10,
      brand: 14,
      family: 14,
    },
    fontSize: 9,
  },
});
