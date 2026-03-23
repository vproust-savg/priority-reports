// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/departments.ts
// PURPOSE: Defines available departments. Each department gets its own
//          URL path prefix and appears as a separate embeddable page.
//          Zod-validated — app crashes on startup if config is invalid.
// USED BY: App.tsx (for route generation), DepartmentLayout.tsx
// EXPORTS: DepartmentConfig, departments
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';

const DepartmentConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  basePath: z.string(),
});

export type DepartmentConfig = z.infer<typeof DepartmentConfigSchema>;

// WHY: Validate at import time. A typo in a department config crashes
// immediately with a clear Zod error instead of silently breaking routing.
export const departments = z.array(DepartmentConfigSchema).parse([
  { id: 'food-safety', name: 'Food Safety',        basePath: '/food-safety' },
  { id: 'purchasing',  name: 'Purchasing Reports',  basePath: '/purchasing' },
]);
