// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/exportSchemas.ts
// PURPOSE: Zod validation schema for the POST /export endpoint.
//          Reuses FilterGroupSchema from querySchemas.ts.
// USED BY: routes/export.ts
// EXPORTS: ExportRequestSchema
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import { FilterGroupSchema } from './querySchemas';

export const ExportRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  // WHY: Optional list of visible column keys from the UI. When present,
  // the export only includes these columns in the specified order.
  // Only applies to fallback Excel mode (not template mode).
  visibleColumnKeys: z.array(z.string()).min(1).optional(),
});
