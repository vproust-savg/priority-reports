// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.ts
// PURPOSE: Defines which widgets appear on which pages and in what layout.
//          This is the ONLY file you edit to rearrange the dashboard.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: Layout.tsx (for nav tabs), PageRenderer (for widget grid)
// EXPORTS: pages
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const WidgetConfigSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  type: z.enum(['table']),  // WHY: Expand this enum as we add widget types
  title: z.string(),
  colSpan: z.number().min(1).max(12).default(12),
});

const PageConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  widgets: z.array(WidgetConfigSchema),
});

// WHY: Validate at import time. If someone adds a widget with a typo
// in the type field, the app fails immediately with a clear Zod error
// instead of silently rendering nothing.
export const pages = z.array(PageConfigSchema).parse([
  {
    id: 'qc',
    name: 'Quality Control',
    path: '/qc',
    widgets: [
      {
        id: 'grv-log',
        reportId: 'grv-log',
        type: 'table',
        title: 'GRV Log — Goods Receiving Vouchers',
        colSpan: 12,
      },
    ],
  },
]);
