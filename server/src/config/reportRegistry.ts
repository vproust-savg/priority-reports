// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/reportRegistry.ts
// PURPOSE: Code-defined report configs. Each report specifies its
//          Priority entity, columns, OData query builder, and row
//          transformer. Adding a report = one file + register here.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: ReportConfig, ReportFilters, reportRegistry, getReport
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';

export interface ReportFilters {
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportConfig {
  id: string;
  name: string;
  entity: string;
  columns: ColumnDefinition[];
  // WHY: Column filter metadata tells the frontend what operators/inputs
  // each column supports and whether filtering happens server-side or client-side.
  filterColumns: ColumnFilterMeta[];
  buildQuery: (filters: ReportFilters) => ODataParams;
  transformRow: (raw: Record<string, unknown>) => Record<string, unknown>;
  // WHY: Priority's $expand truncates responses for some entities (DOCUMENTS_P).
  // Reports that need sub-form data use this to fetch it in a second step.
  enrichRows?: (rows: Record<string, unknown>[]) => Promise<Record<string, unknown>[]>;
}

export const reportRegistry = new Map<string, ReportConfig>();

export function getReport(id: string): ReportConfig | undefined {
  return reportRegistry.get(id);
}
