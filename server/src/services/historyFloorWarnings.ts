// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/historyFloorWarnings.ts
// PURPOSE: Shared check for the Supabase-backed reports, whose views only
//          hold rows from a backfill date on. Says whether a filter provably
//          stays at or after that date, so the report can skip its warning.
// USED BY: reports/grvLogSupabase.ts, reports/customerReturnsSupabase.ts
// EXPORTS: staysOnOrAfterFloor
// ═══════════════════════════════════════════════════════════════

import type { FilterGroup } from '@shared/types';

// WHY: Only operators whose first value is a lower bound (or an exact day) can
// prove the result stays at or after the floor. isBefore/isOnOrBefore never can.
const FLOOR_SAFE_OPERATORS = new Set(['isOnOrAfter', 'isAfter', 'isBetween', 'isInWeek', 'equals']);

// WHY: True only when the filter provably stays inside the held range. An 'or' root or a
// date condition nested in a sub-group could still reach earlier dates, so those count as
// unsafe. ISO dates compare correctly as strings (a datetime value sorts after its date).
export function staysOnOrAfterFloor(group: FilterGroup, floor: string): boolean {
  return (
    group.conjunction === 'and' &&
    group.conditions.some(
      (condition) =>
        condition.field === 'date' &&
        FLOOR_SAFE_OPERATORS.has(condition.operator) &&
        condition.value >= floor,
    )
  );
}
