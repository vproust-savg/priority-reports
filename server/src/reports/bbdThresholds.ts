// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/bbdThresholds.ts
// PURPOSE: The BBD report's expiry windows and the calendar-day math
//          behind them. "Today" is the Los Angeles calendar day, and
//          Priority EXPIRYDATE values are read as calendar days, so a
//          lot never flips a day early because the server runs on UTC.
// USED BY: reports/bbdReport.ts (buildQuery, transformRow)
// EXPORTS: PERISHABLE_WARNING_DAYS, NON_PERISHABLE_WARNING_DAYS,
//          FETCH_WINDOW_DAYS, BbdStatus, classifyLot, daysUntilExpiry,
//          buildExpiryCutoffIso, todayInLA
// ═══════════════════════════════════════════════════════════════

import { nowInLA } from '../../../shared/utils/timezone';

// WHY: Victor's windows (2026-09-11): perishable food is flagged 15 days
// out, everything else 60 days out. Day 0 counts as expired.
export const PERISHABLE_WARNING_DAYS = 15;
export const NON_PERISHABLE_WARNING_DAYS = 60;

// WHY: Derived, not declared — the OData cutoff must always reach the
// widest warning window or lots would be dropped before classification.
export const FETCH_WINDOW_DAYS = Math.max(PERISHABLE_WARNING_DAYS, NON_PERISHABLE_WARNING_DAYS);

export type BbdStatus = 'expired' | 'expiring-perishable' | 'expiring-non-perishable' | '';

export function classifyLot(daysUntilExpiryCount: number, isPerishable: boolean): BbdStatus {
  if (daysUntilExpiryCount <= 0) return 'expired';
  if (isPerishable) {
    return daysUntilExpiryCount <= PERISHABLE_WARNING_DAYS ? 'expiring-perishable' : '';
  }
  return daysUntilExpiryCount <= NON_PERISHABLE_WARNING_DAYS ? 'expiring-non-perishable' : '';
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CALENDAR_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

// WHY: Priority stamps EXPIRYDATE as 'YYYY-MM-DDT00:00:00Z' but means a
// calendar day. Parsing the prefix into a local-midnight Date keeps the
// day intact on any host timezone; new Date(str) would shift it west of UTC.
function parseCalendarDate(dateStr: string): Date | null {
  const match = CALENDAR_DATE_PREFIX.exec(dateStr);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

// WHY: Local-midnight Date carrying the LA calendar day, so it compares
// directly with parseCalendarDate() results.
export function todayInLA(): Date {
  const la = nowInLA();
  return new Date(la.getFullYear(), la.getMonth(), la.getDate());
}

// WHY: Math.round absorbs the 23/25-hour days around DST changes.
export function daysUntilExpiry(expiryRaw: string, today: Date): number {
  const expiry = parseCalendarDate(expiryRaw);
  if (!expiry) return 0;
  return Math.round((expiry.getTime() - today.getTime()) / MS_PER_DAY);
}

// WHY: Formatted from local getters, not toISOString(), so the cutoff is
// the LA calendar day plus the window on every host timezone.
export function buildExpiryCutoffIso(today: Date): string {
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() + FETCH_WINDOW_DAYS);
  const y = cutoff.getFullYear();
  const m = String(cutoff.getMonth() + 1).padStart(2, '0');
  const d = String(cutoff.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T23:59:59Z`;
}
