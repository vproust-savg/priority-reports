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
