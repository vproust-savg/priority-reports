// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/historyFloorWarnings.test.ts
// PURPOSE: Verify staysOnOrAfterFloor — the shared check behind the
//          Supabase reports' "earlier dates are not here" warning.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import type { FilterCondition, FilterGroup } from '@shared/types';
import { staysOnOrAfterFloor } from '../src/services/historyFloorWarnings';

const FLOOR = '2026-06-29';

function dateCondition(operator: FilterCondition['operator'], value: string, valueTo?: string): FilterCondition {
  return { id: 'c1', field: 'date', operator, value, valueTo };
}

function group(conjunction: 'and' | 'or', conditions: FilterCondition[], groups: FilterGroup[] = []): FilterGroup {
  return { id: 'root', conjunction, conditions, groups };
}

describe('staysOnOrAfterFloor', () => {
  it('is true for an and root starting on or after the floor', () => {
    expect(staysOnOrAfterFloor(group('and', [dateCondition('isOnOrAfter', '2026-07-01')]), FLOOR)).toBe(true);
  });

  it('is false when the start is before the floor', () => {
    expect(staysOnOrAfterFloor(group('and', [dateCondition('isOnOrAfter', '2026-06-01')]), FLOOR)).toBe(false);
  });

  it('is false for an or root', () => {
    expect(staysOnOrAfterFloor(group('or', [dateCondition('isOnOrAfter', '2026-07-01')]), FLOOR)).toBe(false);
  });

  it('is false for isBefore, which has no lower bound', () => {
    expect(staysOnOrAfterFloor(group('and', [dateCondition('isBefore', '2026-12-01')]), FLOOR)).toBe(false);
  });

  it('is false for an empty group', () => {
    expect(staysOnOrAfterFloor(group('and', []), FLOOR)).toBe(false);
  });

  it('is false when the date condition sits only in a sub-group', () => {
    const sub = group('and', [dateCondition('isOnOrAfter', '2026-07-01')]);
    expect(staysOnOrAfterFloor(group('and', [], [sub]), FLOOR)).toBe(false);
  });
});
