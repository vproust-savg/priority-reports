// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/reportRegistry.ts
// PURPOSE: Code-defined report configs. Each report specifies its
//          Priority entity, columns, OData query builder, and row
//          transformer. Adding a report = one file + register here.
// USED BY: routes/reports.ts, routes/filters.ts
// EXPORTS: ReportConfig, ReportFilters, ExportConfig, ExcelStyle, reportRegistry, getReport
// ═══════════════════════════════════════════════════════════════

import type { ColumnDefinition, ColumnFilterMeta, FilterOption } from '@shared/types';
import type { ODataParams } from '../services/priorityClient';

export interface ReportFilters {
  from?: string;
  to?: string;
  vendor?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ExportConfig {
  // WHY: Maps template column letters to data field keys.
  // The column letter (A, B, C...) is the Excel column in the template.
  // The value is the field key from transformRow output.
  mapping: Record<string, string>;
  // WHY: First data row in the template. Rows above this are headers.
  // Rows below the empty data region are footer (pushed down as data grows).
  dataStartRow: number;
  // WHY: Some templates have multiple sheets. Default: 0 (first sheet).
  sheetIndex?: number;
}

export interface ExcelStyle {
  // WHY: Per-report column widths for print-ready Excel exports.
  // Keys are column keys from transformRow output. Values are Excel character-width units.
  columnWidths: Record<string, number>;
  // WHY: Per-report font size. BBD uses 9pt (11 columns), GRV Log uses 8pt (14 columns).
  // Default: 10 if omitted.
  fontSize?: number;
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
  // WHY: Optional Excel export configuration. When present, the export
  // endpoint uses the Airtable template with this column mapping.
  // When absent, export falls back to a basic Excel with headers + data.
  exportConfig?: ExportConfig;
  // WHY: Post-transform row exclusion. Runs after enrichRows + transformRow.
  // Used by BBD to exclude items with balance <= 0 or non-flagged status.
  // Keeps enrichRows focused on data fetching (consistent with GRV Log pattern).
  filterRows?: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  // WHY: Per-report filter fetching. When absent, filters.ts falls back to
  // hardcoded GRV Log logic. Avoids modifying grvLog.ts for multi-report support.
  fetchFilters?: () => Promise<Record<string, FilterOption[]>>;
  // WHY: When present, query.ts includes this in ResponseMeta so the frontend
  // can apply per-row styling based on the named field's value.
  rowStyleField?: string;
  // WHY: When true, query.ts uses the report's own $filter/$top/$skip from
  // buildQuery() instead of overriding them. All post-fetch rows are returned
  // to the frontend, which handles pagination client-side. Required for reports
  // like BBD where post-fetch filtering (filterRows) makes OData pagination unreliable.
  clientSidePagination?: boolean;
  // WHY: Per-report Excel styling for print-ready exports. Column widths and font size
  // are applied by excelExporter.ts. When absent, fallback uses auto-width and default font.
  excelStyle?: ExcelStyle;
}

export const reportRegistry = new Map<string, ReportConfig>();

export function getReport(id: string): ReportConfig | undefined {
  return reportRegistry.get(id);
}
