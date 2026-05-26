// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.ts
// PURPOSE: Treat all user-facing dates as America/Los_Angeles calendar dates.
//          Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is
//          semantically a calendar day, not a UTC instant.
// USED BY: client/src/config/filterConstants.ts,
//          client/src/utils/formatters.ts,
//          server/src/index.ts (cache warming)
// EXPORTS: LA_TIMEZONE, nowInLA
// ═══════════════════════════════════════════════════════════════

export const LA_TIMEZONE = 'America/Los_Angeles';

// WHY: Returns a Date whose .getFullYear/.getMonth/.getDate/.getDay return
// the LA-local values. Lets existing weekUtils math (which uses local Date
// methods) compute the LA week without rewriting weekUtils itself.
export function nowInLA(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  // WHY: 'hour' can come back as '24' in en-US 24-hour formatting at midnight;
  // normalize to '00' so the ISO string is parseable.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`,
  );
}
