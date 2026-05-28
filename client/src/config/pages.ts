// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.ts
// PURPOSE: Defines which widgets appear on which pages and in what layout.
//          This is the ONLY file you edit to rearrange the dashboard.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: DepartmentLayout.tsx (for nav tabs), PageRenderer (for widget grid)
// EXPORTS: pages, findWidgetByReportId
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const WidgetConfigSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  type: z.enum(['table']),  // WHY: Expand this enum as we add widget types
  title: z.string(),
  colSpan: z.number().min(1).max(12).default(12),
  // WHY: When true, ReportTableWidget passes disableCache:true to
  // useReportQuery, flipping TanStack to staleTime:0 + refetchOnMount:'always'.
  // Pairs with the server-side ReportConfig.disableCache flag.
  disableCache: z.boolean().optional(),
});

const PageConfigSchema = z.object({
  id: z.string(),
  department: z.string(),
  name: z.string(),
  path: z.string(),
  widgets: z.array(WidgetConfigSchema),
});

// WHY: Validate at import time. If someone adds a widget with a typo
// in the type field, the app fails immediately with a clear Zod error
// instead of silently rendering nothing.
export const pages = z.array(PageConfigSchema).parse([
  {
    id: 'receiving-log',
    department: 'food-safety',
    name: 'Receiving Log',
    path: '/receiving-log',
    widgets: [
      {
        id: 'grv-log',
        reportId: 'grv-log',
        type: 'table',
        title: 'GRV Log — Goods Receiving Vouchers',
        colSpan: 12,
        disableCache: true,
      },
    ],
  },
  {
    id: 'customer-returns',
    department: 'food-safety',
    name: 'Customer Returns',
    path: '/customer-returns',
    widgets: [
      {
        id: 'customer-returns',
        reportId: 'customer-returns',
        type: 'table',
        title: 'Customer Returns',
        colSpan: 12,
        disableCache: true,
      },
    ],
  },
  {
    id: 'bbd',
    department: 'purchasing',
    name: 'BBD — Best By Dates',
    path: '/bbd',
    widgets: [
      {
        id: 'bbd',
        reportId: 'bbd',
        type: 'table',
        title: 'BBD — Best By Dates',
        colSpan: 12,
      },
    ],
  },
]);

// WHY: ReportTableWidget needs to read per-widget overrides like disableCache.
// A reportId appears in exactly one widget across all pages, so a flat lookup
// is unambiguous.
export function findWidgetByReportId(reportId: string): { disableCache?: boolean } | undefined {
  for (const page of pages) {
    const w = page.widgets.find((widget) => widget.reportId === reportId);
    if (w) return w;
  }
  return undefined;
}
