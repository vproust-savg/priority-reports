// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/widget.ts
// PURPOSE: Types for the widget/page configuration system.
//          Pages are composed of widgets. This file defines both.
// USED BY: client/config/pages.ts, PageRenderer, WidgetRenderer
// EXPORTS: WidgetConfig, PageConfig
// ═══════════════════════════════════════════════════════════════

export interface WidgetConfig {
  id: string;           // Unique widget instance ID (e.g., 'overview-sales-table')
  reportId: string;     // Matches a report in the backend mock data or Airtable API Reports
  type: 'table';        // Widget type — only 'table' for Spec 01
  // Future types: 'kpi' | 'chart' | 'download'
  title: string;        // Display title shown in the widget card header
  colSpan: number;      // Grid column span (1-12, where 12 = full width)
}

export interface PageConfig {
  id: string;           // URL-safe page identifier (e.g., 'overview')
  name: string;         // Display name shown in navigation tabs
  path: string;         // URL path (e.g., '/overview')
  icon?: string;        // Lucide icon name (optional, for nav tabs)
  widgets: WidgetConfig[];
}
