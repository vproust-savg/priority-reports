// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/filterConstants.test.ts
// PURPOSE: Tests for filter builder factories — specifically that
//          the default week filter is anchored to LA time, and that
//          customer-returns defaults to the current calendar month.
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

  it("returns LA's Monday-Sunday range from nowInLA() for default reports", () => {
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

  it("grv-log gets the same default week range (unchanged by customer-returns branch)", () => {
    vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 15)); // May 15

    const group = createDefaultFilterGroup('grv-log');
    const condition = group.conditions[0];

    expect(condition.operator).toBe('isInWeek');
    expect(condition.field).toBe('date');
  });

  describe('customer-returns', () => {
    it("defaults from the first day of the current LA month to today (mid-month)", () => {
      // WHY: Pin to May 15 2026 — a mid-month date. Verifies first-of-month
      // computation (May 1) and that 'to' is today (May 15), not end-of-month.
      vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 15)); // May 15, 2026

      const group = createDefaultFilterGroup('customer-returns');
      const condition = group.conditions[0];

      expect(condition.field).toBe('date');
      expect(condition.operator).toBe('isBetween');
      expect(condition.value).toBe('2026-05-01');    // first of May
      expect(condition.valueTo).toBe('2026-05-15');  // today
    });

    it("defaults correctly on the first day of the month", () => {
      // WHY: Edge case — from and to should both be the first when today IS the first.
      vi.mocked(nowInLA).mockReturnValue(new Date(2026, 4, 1)); // May 1, 2026

      const group = createDefaultFilterGroup('customer-returns');
      const condition = group.conditions[0];

      expect(condition.value).toBe('2026-05-01');
      expect(condition.valueTo).toBe('2026-05-01');
    });

    it("handles month boundaries correctly (January)", () => {
      vi.mocked(nowInLA).mockReturnValue(new Date(2026, 0, 20)); // Jan 20, 2026

      const group = createDefaultFilterGroup('customer-returns');
      const condition = group.conditions[0];

      expect(condition.value).toBe('2026-01-01');
      expect(condition.valueTo).toBe('2026-01-20');
    });
  });
});
