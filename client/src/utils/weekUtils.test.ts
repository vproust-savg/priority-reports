// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/weekUtils.test.ts
// PURPOSE: Unit tests for week date utility functions.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { getMonday, getSunday, toISODate, formatWeekRange, getCalendarWeeks } from './weekUtils';

describe('getMonday', () => {
  it('returns the same date when given a Monday', () => {
    // 2026-03-16 is a Monday
    const result = getMonday(new Date(2026, 2, 16));
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(16);
  });

  it('returns the preceding Monday when given a Wednesday', () => {
    // 2026-03-18 is a Wednesday → Monday is 2026-03-16
    const result = getMonday(new Date(2026, 2, 18));
    expect(result.getDate()).toBe(16);
  });

  it('returns the Monday 6 days prior when given a Sunday', () => {
    // 2026-03-22 is a Sunday → Monday is 2026-03-16
    const result = getMonday(new Date(2026, 2, 22));
    expect(result.getDate()).toBe(16);
  });

  it('handles month boundary (Sunday in next month)', () => {
    // 2026-04-01 is a Wednesday → Monday is 2026-03-30
    const result = getMonday(new Date(2026, 3, 1));
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(30);
  });

  it('handles year boundary', () => {
    // 2026-01-01 is a Thursday → Monday is 2025-12-29
    const result = getMonday(new Date(2026, 0, 1));
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(29);
  });
});

describe('getSunday', () => {
  it('returns 6 days after Monday', () => {
    const monday = new Date(2026, 2, 16); // March 16
    const result = getSunday(monday);
    expect(result.getDate()).toBe(22); // March 22
  });

  it('handles month boundary', () => {
    const monday = new Date(2026, 2, 30); // March 30
    const result = getSunday(monday);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(5);  // April 5
  });
});

describe('toISODate', () => {
  it('returns YYYY-MM-DD format', () => {
    expect(toISODate(new Date(2026, 2, 16))).toBe('2026-03-16');
  });

  it('pads single-digit month and day', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatWeekRange', () => {
  it('formats same-month week', () => {
    const mon = new Date(2026, 2, 16); // Mar 16
    const sun = new Date(2026, 2, 22); // Mar 22
    expect(formatWeekRange(mon, sun)).toBe('Mar 16–22, 2026');
  });

  it('formats cross-month week', () => {
    const mon = new Date(2026, 2, 30); // Mar 30
    const sun = new Date(2026, 3, 5);  // Apr 5
    expect(formatWeekRange(mon, sun)).toBe('Mar 30 – Apr 5, 2026');
  });

  it('formats cross-year week', () => {
    const mon = new Date(2025, 11, 29); // Dec 29, 2025
    const sun = new Date(2026, 0, 4);   // Jan 4, 2026
    expect(formatWeekRange(mon, sun)).toBe('Dec 29, 2025 – Jan 4, 2026');
  });
});

describe('getCalendarWeeks', () => {
  it('returns exactly 6 rows of 7 dates', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    expect(weeks).toHaveLength(6);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }
  });

  it('first date is always a Monday', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    expect(weeks[0][0].getDay()).toBe(1); // Monday
  });

  it('last date in each row is always a Sunday', () => {
    const weeks = getCalendarWeeks(2026, 2);
    for (const week of weeks) {
      expect(week[6].getDay()).toBe(0); // Sunday
    }
  });

  it('covers the entire displayed month', () => {
    const weeks = getCalendarWeeks(2026, 2); // March 2026
    const allDates = weeks.flat();
    // March 1 and March 31 should be in the grid
    expect(allDates.some((d) => d.getMonth() === 2 && d.getDate() === 1)).toBe(true);
    expect(allDates.some((d) => d.getMonth() === 2 && d.getDate() === 31)).toBe(true);
  });

  it('handles month starting on Monday (June 2026)', () => {
    // June 1, 2026 is a Monday — first row starts on June 1
    const weeks = getCalendarWeeks(2026, 5);
    expect(weeks[0][0].getMonth()).toBe(5); // June
    expect(weeks[0][0].getDate()).toBe(1);
  });

  it('handles month starting on Sunday (March 2026)', () => {
    // March 1, 2026 is a Sunday — first row starts on Feb 23 (Monday)
    const weeks = getCalendarWeeks(2026, 2);
    expect(weeks[0][0].getMonth()).toBe(1); // February
    expect(weeks[0][0].getDate()).toBe(23);
  });

  it('handles February in leap year', () => {
    // Feb 2028 — leap year, Feb 29 exists
    const weeks = getCalendarWeeks(2028, 1);
    const allDates = weeks.flat();
    expect(allDates.some((d) => d.getMonth() === 1 && d.getDate() === 29)).toBe(true);
  });
});
