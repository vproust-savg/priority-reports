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
  // WHY: Generic record so each report defines its own filter keys.
  // GRV Log uses 'vendors', 'statuses', etc. BBD uses 'vendors', 'brands', 'families'.
  // FilterValueInput.tsx already looks up by column.enumKey dynamically (line 30-31).
  filters: Record<string, FilterOption[]>;
  columns: ColumnFilterMeta[];
}

export interface QueryRequest {
  filterGroup: FilterGroup;
  page: number;
  pageSize: number;
}
