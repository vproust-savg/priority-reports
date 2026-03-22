// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/querySchemas.ts
// PURPOSE: Zod validation schemas for the POST /query endpoint.
//          Extracted from query.ts to keep files under 150 lines.
// USED BY: routes/query.ts, routes/exportSchemas.ts
// EXPORTS: QueryRequestSchema, FilterGroupSchema
// ═══════════════════════════════════════════════════════════════

import { z } from 'zod';
import type { FilterGroup } from '@shared/types';

const FilterConditionSchema = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.enum([
    'equals', 'notEquals', 'isEmpty', 'isNotEmpty',
    'contains', 'notContains', 'startsWith', 'endsWith',
    'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isInWeek',
    'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'between',
  ]),
  value: z.string().default(''),
  valueTo: z.string().optional(),
});

// WHY: z.lazy for recursive type — FilterGroup contains FilterGroup[]
// WHY: .max() limits prevent abuse — UI allows 1 nesting level, but we
// cap at 10 groups / 50 conditions for defense-in-depth.
export const FilterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    id: z.string(),
    conjunction: z.enum(['and', 'or']),
    conditions: z.array(FilterConditionSchema).max(50),
    groups: z.array(FilterGroupSchema).max(10),
  }),
);

export const QueryRequestSchema = z.object({
  filterGroup: FilterGroupSchema,
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(1000).default(50),
  // WHY: Base mode fetches all rows for the date range, caches longer,
  // and lets the frontend apply non-date filters client-side instantly.
  baseMode: z.boolean().optional().default(false),
});
