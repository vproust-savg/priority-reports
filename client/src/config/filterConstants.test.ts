// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.test.ts
// PURPOSE: Tests for filter builder factories — specifically that
//          the default week filter is anchored to LA time.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

// WHY: Mock nowInLA BEFORE importing filterConstants so the module
// picks up the mocked binding. vi.mock is hoisted by Vitest.
vi.mock('@shared/utils/timezone', () => ({
  LA_TIMEZONE: 'America/Los_Angeles',
  nowInLA: vi.fn(),
  formatPriorityCalendarDate: vi.fn(),
}));

import { createDefaultFilterGroup } from './filterConstants';
import { nowInLA } from '@shared/utils/timezone';

describe('createDefaultFilterGroup', () => {
  it("returns LA's Monday-Sunday range from nowInLA()", () => {
    // Sunday May 24, 2026 in LA-local components.
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 24));

    const group = createDefaultFilterGroup();
    const condition = group.conditions[0];

    expect(condition.field).toBe('date');
    expect(condition.operator).toBe('isInWeek');
    expect(condition.value).toBe('2026-05-18');     // Monday of that LA week
    expect(condition.valueTo).toBe('2026-05-24');   // Sunday of that LA week
    expect(nowInLA).toHaveBeenCalled();
  });
});
