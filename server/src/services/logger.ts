// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/logger.ts
// PURPOSE: Structured JSON logger for Railway log aggregation.
//          Future AI tools can analyze these logs to find slow queries.
// USED BY: routes/reports.ts, index.ts
// EXPORTS: logApiCall, logStartup
// ═══════════════════════════════════════════════════════════════

export function logApiCall(entry: {
  level: 'info' | 'warn' | 'error';
  event: string;
  reportId: string;
  durationMs: number;
  cacheHit: boolean;
  rowCount?: number;
  statusCode: number;
}): void {
  // WHY: Structured JSON logs so Railway captures them as searchable fields.
  console.log(JSON.stringify({ ...entry, timestamp: new Date().toISOString() }));
}

export function logStartup(entry: {
  port: number;
  environment: string;
  cacheStatus: string;
}): void {
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_start',
    ...entry,
    timestamp: new Date().toISOString(),
  }));
}
