// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/bbdThresholds.test.ts
// PURPOSE: Tests for the BBD threshold constants and the LA-calendar
//          day math they depend on (classification boundaries, days
//          until expiry, fetch cutoff, "today" in Los Angeles).
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PERISHABLE_WARNING_DAYS,
  NON_PERISHABLE_WARNING_DAYS,
  FETCH_WINDOW_DAYS,
  classifyLot,
  daysUntilExpiry,
  buildExpiryCutoffIso,
  todayInLA,
} from '../src/reports/bbdThresholds';

afterEach(() => {
  vi.useRealTimers();
});

describe('threshold constants', () => {
  it('warns perishable lots at 15 days and non-perishable at 60', () => {
    expect(PERISHABLE_WARNING_DAYS).toBe(15);
    expect(NON_PERISHABLE_WARNING_DAYS).toBe(60);
  });

  it('fetch window is the wider of the two warnings so the query never under-fetches', () => {
    expect(FETCH_WINDOW_DAYS).toBe(60);
  });
});

describe('classifyLot', () => {
  it('expired on day 0 and before', () => {
    expect(classifyLot(0, true)).toBe('expired');
    expect(classifyLot(0, false)).toBe('expired');
    expect(classifyLot(-4, false)).toBe('expired');
  });

  it('perishable: expiring through day 15, unflagged from day 16', () => {
    expect(classifyLot(1, true)).toBe('expiring-perishable');
    expect(classifyLot(15, true)).toBe('expiring-perishable');
    expect(classifyLot(16, true)).toBe('');
  });

  it('non-perishable: expiring through day 60, unflagged from day 61', () => {
    expect(classifyLot(15, false)).toBe('expiring-non-perishable');
    expect(classifyLot(60, false)).toBe('expiring-non-perishable');
    expect(classifyLot(61, false)).toBe('');
  });
});

describe('daysUntilExpiry', () => {
  // WHY: "today" is an LA calendar day expressed as a local-midnight Date.
  const today = new Date(2026, 8, 11); // 2026-09-11

  it('counts whole calendar days from today to the expiry date', () => {
    expect(daysUntilExpiry('2026-09-26T00:00:00Z', today)).toBe(15);
  });

  it('is 0 when the expiry date is today', () => {
    expect(daysUntilExpiry('2026-09-11T00:00:00Z', today)).toBe(0);
  });

  it('is negative for past dates', () => {
    expect(daysUntilExpiry('2026-09-08T00:00:00Z', today)).toBe(-3);
  });

  it('reads the date as a calendar day, never as a UTC instant', () => {
    // WHY: Priority stamps dates T00:00:00Z. West of UTC, parsing that as an
    // instant lands on the previous evening and drops a day.
    expect(daysUntilExpiry('2026-09-12T00:00:00Z', today)).toBe(1);
  });

  it('spans a DST change without drifting', () => {
    // WHY: 2026-11-01 is the fall-back Sunday in Los Angeles (25-hour day).
    expect(daysUntilExpiry('2026-11-05T00:00:00Z', new Date(2026, 9, 30))).toBe(6);
  });
});

describe('buildExpiryCutoffIso', () => {
  it('is FETCH_WINDOW_DAYS after today, at end of day, Z-suffixed', () => {
    expect(buildExpiryCutoffIso(new Date(2026, 8, 11))).toBe('2026-11-10T23:59:59Z');
  });

  it('zero-pads month and day', () => {
    expect(buildExpiryCutoffIso(new Date(2026, 0, 5))).toBe('2026-03-06T23:59:59Z');
  });
});

describe('todayInLA', () => {
  it('is still the previous calendar day when UTC has rolled past midnight but LA has not', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T03:00:00Z')); // 2026-09-11 20:00 in Los Angeles
    const today = todayInLA();
    expect([today.getFullYear(), today.getMonth(), today.getDate()]).toEqual([2026, 8, 11]);
    expect([today.getHours(), today.getMinutes(), today.getSeconds()]).toEqual([0, 0, 0]);
  });
});
