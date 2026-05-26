// ═══════════════════════════════════════════════════════════════
// FILE: shared/utils/timezone.ts
// PURPOSE: Treat all user-facing dates as America/Los_Angeles calendar dates.
//          Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is
//          semantically a calendar day, not a UTC instant.
// USED BY: client/src/config/filterConstants.ts,
//          client/src/utils/formatters.ts,
//          server/src/index.ts (cache warming)
// EXPORTS: LA_TIMEZONE, nowInLA, formatPriorityCalendarDate
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
  // WHY: Defensive against runtimes that use the h24 hour cycle (where
  // midnight reads as '24' instead of '00'). en-US on Node ≥ 12 uses h23
  // so this branch is currently inert — kept so a future cycle change
  // doesn't silently produce an invalid ISO string.
  const hour = get('hour') === '24' ? '00' : get('hour');
  // WHY: DST fall-back hour (01:xx PST on the first Sun of November) is
  // ambiguous — two UTC instants map to the same LA wall clock. Intl
  // resolves to the post-rollback reading, which we accept as canonical.
  return new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}:${get('second')}`,
  );
}

// WHY: Parses 'YYYY-MM-DD...' as a calendar date (ignores the UTC time),
// so the rendered day never shifts based on the browser's timezone.
// Priority stores CURDATE as 'YYYY-MM-DDT00:00:00Z' but the value is a
// calendar day, not a UTC instant — formatting it through new Date(str)
// + browser-local Intl drops a day everywhere west of UTC.
const calendarDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

// WHY: Regex anchors the expected 'YYYY-MM-DD' prefix. Returning the raw
// input on a mismatch (instead of silently rendering 'Invalid Date') keeps
// any malformed Priority value debuggable from the dashboard rather than
// obscured by a misleading formatter output.
const CALENDAR_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatPriorityCalendarDate(dateStr: string): string {
  const match = CALENDAR_DATE_PREFIX.exec(dateStr);
  if (!match) return dateStr;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return calendarDateFormatter.format(new Date(y, m - 1, d));
}
