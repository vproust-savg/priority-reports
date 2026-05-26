// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.test.ts
// PURPOSE: Tests for LA-timezone date utilities.
// USED BY: Vitest (both server and client suites)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { nowInLA, formatPriorityCalendarDate } from './timezone';

describe('nowInLA', () => {
  beforeAll(() => { vi.useFakeTimers(); });
  afterAll(() => { vi.useRealTimers(); });

  it('returns LA-local components when UTC clock is past LA midnight rollover', () => {
    // 2026-05-23T04:00:00Z is 21:00 PDT on Friday May 22 in LA (PDT = UTC-7).
    vi.setSystemTime(new Date('2026-05-23T04:00:00Z'));
    const d = nowInLA();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);       // May (0-indexed)
    expect(d.getDate()).toBe(22);
    expect(d.getDay()).toBe(5);         // Friday
  });

  it('returns LA-local components when UTC is the next LA day', () => {
    // 2026-05-23T08:00:00Z is 01:00 PDT on Saturday May 23 in LA.
    vi.setSystemTime(new Date('2026-05-23T08:00:00Z'));
    const d = nowInLA();
    expect(d.getDate()).toBe(23);
    expect(d.getDay()).toBe(6);         // Saturday
  });

  it('handles the LA midnight boundary cleanly', () => {
    // 2026-05-23T07:00:00Z is exactly 00:00 PDT on Saturday May 23 in LA.
    vi.setSystemTime(new Date('2026-05-23T07:00:00Z'));
    const d = nowInLA();
    expect(d.getDate()).toBe(23);
    expect(d.getDay()).toBe(6);
    expect(d.getHours()).toBe(0);
  });
});

describe('formatPriorityCalendarDate', () => {
  it('renders a Priority CURDATE as the literal calendar day', () => {
    expect(formatPriorityCalendarDate('2026-05-22T00:00:00Z')).toBe('May 22, 2026');
  });

  it('handles single-digit months and days', () => {
    expect(formatPriorityCalendarDate('2026-01-05T00:00:00Z')).toBe('Jan 5, 2026');
  });

  it('ignores the time portion entirely', () => {
    // Same calendar day regardless of T-suffix.
    expect(formatPriorityCalendarDate('2026-05-22T23:59:59Z')).toBe('May 22, 2026');
  });

  it('handles year boundary crossings', () => {
    expect(formatPriorityCalendarDate('2025-12-31T00:00:00Z')).toBe('Dec 31, 2025');
    expect(formatPriorityCalendarDate('2026-01-01T00:00:00Z')).toBe('Jan 1, 2026');
  });

  it('returns malformed input unchanged instead of rendering "Invalid Date"', () => {
    expect(formatPriorityCalendarDate('')).toBe('');
    expect(formatPriorityCalendarDate('not-a-date')).toBe('not-a-date');
  });
});
