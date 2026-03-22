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
});
