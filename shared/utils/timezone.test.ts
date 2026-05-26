// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.test.ts
// PURPOSE: Tests for LA-timezone date utilities.
// USED BY: Vitest (both server and client suites)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { nowInLA } from './timezone';

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
