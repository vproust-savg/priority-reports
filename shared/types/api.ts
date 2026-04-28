// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/api.ts
// PURPOSE: Standardized API response envelope used by ALL endpoints.
//          Every API response has the same shape. No exceptions.
// USED BY: server routes (to build responses), client hooks (to parse responses)
// EXPORTS: ColumnDefinition, PaginationMeta, ResponseMeta, ApiResponse, HealthResponse
// ═══════════════════════════════════════════════════════════════

export interface ColumnDefinition {
  key: string;
  label: string;
  type: 'string' | 'currency' | 'number' | 'date' | 'percent';
  // WHY: When true, the cell renders as a click-to-copy button (uses
  // CopyableCell + widget-level toast). Server declares which columns
  // are identifiers worth copying (e.g., GRV #, PO #, SKU).
  copyable?: boolean;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface ResponseMeta {
  reportId: string;
  reportName: string;
  generatedAt: string;
  cache: 'hit' | 'miss';
  executionTimeMs: number;
  source: 'priority-odata' | 'mock';
  // WHY: When present, ReportTable reads this field from each row to apply
  // per-row CSS classes (e.g., red for expired, orange for expiring-perishable).
  rowStyleField?: string;
  // WHY: When present, the frontend enables expandable rows. rowKeyField tells
  // it which field in the row data holds the unique key for subform fetching.
  expandConfig?: {
    rowKeyField: string;
  };
}

// WHY: Every endpoint returns this exact shape so the frontend needs
// only ONE response handler. Adding a new report never requires
// new frontend parsing logic.
export interface ApiResponse<T = Record<string, unknown>> {
  meta: ResponseMeta;
  data: T[];
  pagination: PaginationMeta;
  columns: ColumnDefinition[];
  warnings?: string[];  // WHY: Degraded data quality indicators (e.g., sub-form fetch failed)
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  environment: string;
  timestamp: string;
  cacheStatus: 'connected' | 'disconnected';
  version: string;
}
