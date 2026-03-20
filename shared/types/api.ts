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
}

// WHY: Every endpoint returns this exact shape so the frontend needs
// only ONE response handler. Adding a new report never requires
// new frontend parsing logic.
export interface ApiResponse<T = Record<string, unknown>> {
  meta: ResponseMeta;
  data: T[];
  pagination: PaginationMeta;
  columns: ColumnDefinition[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  environment: string;
  timestamp: string;
  cacheStatus: 'connected' | 'disconnected';
  version: string;
}
