// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/supabaseDb.ts
// PURPOSE: Lazily created node-postgres pool for read-only queries
//          against the Supabase view priority_reports.grv_receiving_log.
// USED BY: GRV Supabase read path (later tasks)
// EXPORTS: SupabaseNotConfiguredError, isSupabaseConfigured,
//          querySupabase, parseDateAsString
// ═══════════════════════════════════════════════════════════════

import pg from 'pg';

import { env } from '../config/environment';

// WHY: Postgres `date` (OID 1082) would otherwise be parsed into a JS Date at
// local midnight, which shifts the calendar day when serialized as UTC. The
// view's `curdate` must stay the plain YYYY-MM-DD string.
const POSTGRES_DATE_OID = 1082;

export function parseDateAsString(value: string): string {
  return value;
}

pg.types.setTypeParser(POSTGRES_DATE_OID, parseDateAsString);

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('SUPABASE_GRV_DATABASE_URL is not set');
    this.name = 'SupabaseNotConfiguredError';
  }
}

let pool: pg.Pool | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_GRV_DATABASE_URL);
}

// WHY lazy: the URL is optional, so the server must boot without it and only
// fail the GRV read path when it is actually used.
function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString, // TLS comes from sslmode=require in the URL itself
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 10_000,
      application_name: 'priority-reports',
    });
    // WHY: without a listener an idle-client error (e.g. Supavisor restart)
    // is an unhandled 'error' event and crashes the process.
    pool.on('error', (err) => {
      console.error('[supabaseDb] idle client error:', err.message);
    });
  }
  return pool;
}

export async function querySupabase<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[],
): Promise<T[]> {
  const connectionString = env.SUPABASE_GRV_DATABASE_URL;
  if (!connectionString) throw new SupabaseNotConfiguredError();

  try {
    const result = await getPool(connectionString).query(sql, params);
    return result.rows as T[];
  } catch (err) {
    // WHY: rewrap with only the message. The connection string is a secret and
    // must never reach logs or API error bodies; pg messages do not include it.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Supabase query failed: ${message}`);
  }
}
