// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/formatters.test.ts
// PURPOSE: Tests for the user-facing cell formatters — specifically
//          that formatDate delegates to the calendar-day helper so
//          Priority CURDATE never appears off-by-one.
// USED BY: Vitest (client suite)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

vi.mock('@shared/utils/timezone', () => ({
  // WHY: Sentinel return value lets us prove delegation without TZ tricks.
  formatPriorityCalendarDate: vi.fn((s: string) => `CAL(${s})`),
}));

import { formatDate } from './formatters';
import { formatPriorityCalendarDate } from '@shared/utils/timezone';

describe('formatDate', () => {
  it('delegates to formatPriorityCalendarDate', () => {
    const out = formatDate('2026-05-22T00:00:00Z');
    expect(out).toBe('CAL(2026-05-22T00:00:00Z)');
    expect(formatPriorityCalendarDate).toHaveBeenCalledWith('2026-05-22T00:00:00Z');
  });
});
