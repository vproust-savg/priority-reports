// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/refreshDateRange.ts
// PURPOSE: Validate inclusive date ranges sent to source refreshes.
// USED BY: client refresh date helper and server refresh route
// EXPORTS: RefreshDateRange, RefreshDateRangeResult, parseRefreshDate,
//          validateRefreshDateRange, CALENDAR_DAY_MS
// ═══════════════════════════════════════════════════════════════

export type RefreshDateRange = { from: string; to: string };
export type RefreshDateRangeResult =
  | { range: RefreshDateRange }
  | { reason: 'invalidDates' | 'reversed' | 'tooLong' };

export const CALENDAR_DAY_MS = 86_400_000;

export function parseRefreshDate(value: string): number {
  // WHY: UTC midnight keeps calendar arithmetic independent of DST. Round-trip
  // to catch dates Date.parse normalizes, such as Feb 29 in a non-leap year.
  // PostgreSQL dates start at year 0001 for four-digit AD years.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return NaN;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
    ? timestamp
    : NaN;
}

export function validateRefreshDateRange(from: unknown, to: unknown): RefreshDateRangeResult {
  if (typeof from !== 'string' || typeof to !== 'string') return { reason: 'invalidDates' };
  const span = parseRefreshDate(to) - parseRefreshDate(from);
  if (Number.isNaN(span)) return { reason: 'invalidDates' };
  if (span < 0) return { reason: 'reversed' };
  if (span > 30 * CALENDAR_DAY_MS) return { reason: 'tooLong' };
  return { range: { from, to } };
}
