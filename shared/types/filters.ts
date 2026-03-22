// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for the advanced filter engine. FilterGroup is a
//          tree structure with AND/OR groups, one level of nesting.
//          Used by both backend (OData translation) and frontend (UI state).
// USED BY: routes/query.ts, odataFilterBuilder.ts, FilterBuilder.tsx,
//          ReportTableWidget.tsx, routes/filters.ts
// EXPORTS: FilterOperator, FilterCondition, FilterGroup,
//          ColumnFilterType, ColumnFilterMeta, FilterOption,
//          FiltersResponse, QueryRequest
// ═══════════════════════════════════════════════════════════════

// --- Operators ---

// WHY: Grouped by type. The frontend shows different operator sets
// per column type. The backend only translates a subset to OData
// (contains/startsWith/endsWith are NOT supported by Priority OData).
export type FilterOperator =
  // Universal — available for all column types
  | 'equals' | 'notEquals' | 'isEmpty' | 'isNotEmpty'
  // Text — client-side only (Priority OData does not support these)
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  // Date
  | 'isBefore' | 'isAfter' | 'isOnOrBefore' | 'isOnOrAfter' | 'isBetween' | 'isInWeek'
  // Number / Currency
  | 'greaterThan' | 'lessThan' | 'greaterOrEqual' | 'lessOrEqual' | 'between';

// --- Filter Tree ---

export interface FilterCondition {
  id: string;               // UUID for React key
  field: string;             // Column key (e.g., 'vendor', 'date', 'truckTemp')
  operator: FilterOperator;
  value: string;             // Primary value (ISO date, text, number as string)
  valueTo?: string;          // Second value for 'between' / 'isBetween' / 'isInWeek' operators
}

export interface FilterGroup {
  id: string;
  conjunction: 'and' | 'or';
  conditions: FilterCondition[];
  groups: FilterGroup[];     // One level of nesting max (UI enforces this)
}

// --- Column Metadata ---

export type ColumnFilterType = 'text' | 'date' | 'number' | 'currency' | 'enum';

export interface ColumnFilterMeta {
  key: string;                    // Column key, matches ColumnDefinition.key
  label: string;                  // Display label
  filterType: ColumnFilterType;
  filterLocation: 'server' | 'client';
  odataField?: string;            // Priority field name (server-side columns only)
  enumKey?: string;               // Key in FiltersResponse.filters (enum columns only)
}

// --- Filter Options (unchanged from Spec 02) ---

export interface FilterOption {
  value: string;
  label: string;
}

// --- API Shapes ---

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
    warehouses: FilterOption[];
    users: FilterOption[];
  };
  columns: ColumnFilterMeta[];
}

export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
  // WHY: When true, backend fetches ALL rows for the date range with a
  // longer cache TTL. Frontend applies non-date filters client-side for
  // instant filter responses (no network round-trip on filter changes).
  baseMode?: boolean;
}
