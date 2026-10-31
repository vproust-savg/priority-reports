// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/supabaseDb.ts
// PURPOSE: Lazily created node-postgres pool for read-only queries
//          against the Supabase view priority_reports.grv_receiving_log.
// USED BY: GRV Supabase read path (later tasks)
// EXPORTS: SupabaseNotConfiguredError, isSupabaseConfigured,
//          querySupabase, parseDateAsString, buildPoolConfig
// ═══════════════════════════════════════════════════════════════

import pg from 'pg';

import { env } from '../config/environment';
import { SUPABASE_ROOT_CA_2021 } from '../config/supabaseRootCa';
import type { PoolConfig } from 'pg';

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

// WHY: Supavisor ignores statement_timeout sent as a startup parameter (probed
// 2026-10-31: the role default 15s applied), so each new connection runs a SET.
// It is awaited before the connection's first query: pg.Pool's 'connect' event
// cannot be awaited, and a query issued while the SET is in flight is deprecated.
const STATEMENT_TIMEOUT_SQL = 'SET statement_timeout = 10000';
const clientsWithTimeout = new WeakSet<pg.PoolClient>();

async function applyStatementTimeoutOnce(client: pg.PoolClient): Promise<void> {
  if (clientsWithTimeout.has(client)) return;
  clientsWithTimeout.add(client);
  try {
    await client.query(STATEMENT_TIMEOUT_SQL);
  } catch (err) {
    // WHY continue: the role default timeout still applies. Log only the
    // message (never the connection string).
    const message = err instanceof Error ? err.message : String(err);
    console.error('[supabaseDb] SET statement_timeout failed:', message);
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(env.SUPABASE_GRV_DATABASE_URL);
}

// WHY: pg merges parse(connectionString) OVER the Pool options, and any of
// these URL params makes pg-connection-string replace our `ssl` object (with
// `{}` for sslmode=require, which means verify against Node's default CA store
// and fails with SELF_SIGNED_CERT_IN_CHAIN). The Railway variable keeps
// sslmode=require; stripping it here pins verification to Supabase's root.
const SSL_OVERRIDING_URL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

export function buildPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  for (const param of SSL_OVERRIDING_URL_PARAMS) url.searchParams.delete(param);
  return {
    connectionString: url.toString(),
    ssl: { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'priority-reports',
  };
}

// WHY lazy: the URL is optional, so the server must boot without it and only
// fail the GRV read path when it is actually used.
function getPool(connectionString: string): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(buildPoolConfig(connectionString));
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

  let client: pg.PoolClient | undefined;
  try {
    client = await getPool(connectionString).connect();
    await applyStatementTimeoutOnce(client);
    const result = await client.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    // WHY: rewrap with only the message. The connection string is a secret and
    // must never reach logs or API error bodies; pg messages do not include it.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Supabase query failed: ${message}`);
  } finally {
    client?.release();
  }
}
