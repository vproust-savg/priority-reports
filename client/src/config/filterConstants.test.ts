// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.test.ts
// PURPOSE: Tests for filter builder factories — specifically that
//          the default week filter is anchored to LA time.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// WHY: Mock nowInLA BEFORE importing filterConstants so the module
// picks up the mocked binding. vi.mock is hoisted by Vitest.
// Only nowInLA is stubbed — filterConstants doesn't touch the other
// exports, and stubbing them unused would mask accidental calls.
vi.mock('@shared/utils/timezone', () => ({
  LA_TIMEZONE: 'America/Los_Angeles',
  nowInLA: vi.fn(),
}));

import { createDefaultFilterGroup } from './filterConstants';
import { nowInLA } from '@shared/utils/timezone';

describe('createDefaultFilterGroup', () => {
  // WHY: Pin the real wall clock to a Monday (LA-local) so that if the
  // implementation ever regresses to `new Date()`, the test fails loudly
  // with the wrong week — not silently because real-now and mocked-now
  // happen to fall in the same LA week.
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T16:00:00Z')); // 09:00 PDT Mon May 25
  });
  afterAll(() => { vi.useRealTimers(); });

  it("returns LA's Monday-Sunday range from nowInLA()", () => {
    // Mocked nowInLA returns Sunday May 24 in LA-local components, so the
    // expected week is May 18 (Mon) - May 24 (Sun). The real clock is on
    // May 25 (Mon), which would make a regression produce May 25 - May 31.
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 24));

    const group = createDefaultFilterGroup();
    const condition = group.conditions[0];

    expect(condition.field).toBe('date');
    expect(condition.operator).toBe('isInWeek');
    expect(condition.value).toBe('2026-05-18');     // Monday of mocked LA week
    expect(condition.valueTo).toBe('2026-05-24');   // Sunday of mocked LA week
    expect(nowInLA).toHaveBeenCalled();
  });
});
