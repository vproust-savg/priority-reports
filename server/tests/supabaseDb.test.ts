// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/supabaseDb.test.ts
// PURPOSE: Supabase pool wrapper — unconfigured guard, secret-free
//          errors, raw date parsing, idle-client error listener,
//          pinned Supabase root CA, sslmode stripping, and the
//          per-connection statement_timeout SET.
//          pg.Pool is faked; no database is reachable from tests.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import pg from 'pg';

// WHY hoisted: vi.mock factories run before imports; the mutable env and
// fake pool state must exist by then so each test can flip the URL.
const mocks = vi.hoisted(() => ({
  env: { SUPABASE_GRV_DATABASE_URL: undefined as string | undefined },
  queryImpl: { fn: async (_sql: string, _params: unknown[]): Promise<{ rows: unknown[] }> => ({ rows: [] }) },
  onCalls: [] as string[],
  listeners: {} as Record<string, (arg: unknown) => void>,
  poolConfigs: [] as Record<string, unknown>[],
  clientCalls: [] as string[],
  setImpl: { fn: async (): Promise<unknown> => ({}) },
  releaseCount: { n: 0 },
}));

vi.mock('../src/config/environment', () => ({ env: mocks.env }));

// WHY partial mock: `types` must stay real so the 1082 assertion checks the
// actual pg registry, while Pool is replaced so no connection is attempted.
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  class FakePool {
    constructor(config: Record<string, unknown>) { mocks.poolConfigs.push(config); }
    on(event: string, listener: (arg: unknown) => void) {
      mocks.onCalls.push(event);
      mocks.listeners[event] = listener;
      return this;
    }
    // WHY one client per pool: lets a test check the SET runs once per connection.
    private client = {
      query: (sql: string, params?: unknown[]) => {
        mocks.clientCalls.push(sql);
        return sql.startsWith('SET ') ? mocks.setImpl.fn() : mocks.queryImpl.fn(sql, params ?? []);
      },
      release: () => { mocks.releaseCount.n += 1; },
    };
    async connect() { return this.client; }
  }
  return { ...actual, default: { ...actual, Pool: FakePool }, Pool: FakePool };
});

import {
  SupabaseNotConfiguredError,
  isSupabaseConfigured,
  querySupabase,
  parseDateAsString,
  buildPoolConfig,
} from '../src/services/supabaseDb';
import { SUPABASE_ROOT_CA_2021 } from '../src/config/supabaseRootCa';

const SUPABASE_ROOT_FINGERPRINT_256 =
  '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';

describe('supabaseDb', () => {
  beforeEach(() => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = undefined;
    mocks.onCalls.length = 0;
    mocks.poolConfigs.length = 0;
    mocks.clientCalls.length = 0;
    mocks.setImpl.fn = async () => ({});
    mocks.releaseCount.n = 0;
    for (const key of Object.keys(mocks.listeners)) delete mocks.listeners[key];
  });

  it('querySupabase rejects with SupabaseNotConfiguredError when the URL is unset', async () => {
    expect(isSupabaseConfigured()).toBe(false);
    await expect(querySupabase('select 1', [])).rejects.toBeInstanceOf(SupabaseNotConfiguredError);
  });

  it('the error message never contains the connection string', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres';
    mocks.queryImpl.fn = async () => { throw new Error('connect failed'); };
    expect(isSupabaseConfigured()).toBe(true);
    const error = await querySupabase('select 1', []).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Supabase query failed: connect failed');
    expect((error as Error).message).not.toContain('SECRETPW');
  });

  it('date parser returns the raw YYYY-MM-DD string', () => {
    expect(parseDateAsString('2026-10-27')).toBe('2026-10-27');
    expect(pg.types.getTypeParser(1082 as never)).toBe(parseDateAsString);
  });

  it('pool has an error listener', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres';
    mocks.queryImpl.fn = async () => ({ rows: [{ a: 1 }] });
    // WHY fresh module: the pool is a singleton, so an earlier test may already have created it.
    vi.resetModules();
    const fresh = await import('../src/services/supabaseDb');
    const rows = await fresh.querySupabase('select 1', []);
    expect(rows).toEqual([{ a: 1 }]);
    expect(mocks.onCalls).toContain('error');
  });

  it('embedded root CA is the Supabase Root 2021 CA', () => {
    const cert = new crypto.X509Certificate(SUPABASE_ROOT_CA_2021);
    expect(cert.subject).toContain('CN=Supabase Root 2021 CA');
    expect(cert.fingerprint256).toBe(SUPABASE_ROOT_FINGERPRINT_256);
  });

  it('buildPoolConfig strips sslmode and pins verification to the Supabase root', () => {
    const config = buildPoolConfig('postgresql://u:p@h:5432/postgres?sslmode=require&application_name=x');
    expect(config.connectionString).not.toContain('sslmode');
    expect(config.connectionString).toContain('application_name=x');
    expect(config.ssl).toEqual({ ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true });
    expect(config).not.toHaveProperty('statement_timeout');
  });

  it('buildPoolConfig strips every URL param that would override the ssl option', () => {
    const config = buildPoolConfig(
      'postgresql://u:p@h:5432/postgres?sslmode=no-verify&sslrootcert=/x&sslcert=/y&sslkey=/z&uselibpqcompat=true',
    );
    expect(config.connectionString).toBe('postgresql://u:p@h:5432/postgres');
  });

  it('pool sets statement_timeout per connection, not as a startup parameter', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres?sslmode=require';
    mocks.queryImpl.fn = async () => ({ rows: [] });
    vi.resetModules();
    const fresh = await import('../src/services/supabaseDb');
    await fresh.querySupabase('select 1', []);
    expect(mocks.poolConfigs).toHaveLength(1);
    expect(mocks.poolConfigs[0]).not.toHaveProperty('statement_timeout');
    expect(mocks.poolConfigs[0].connectionString).not.toContain('sslmode');
  });

  it('the SET finishes before the first query and runs once per connection', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres';
    mocks.queryImpl.fn = async () => ({ rows: [] });
    vi.resetModules();
    const fresh = await import('../src/services/supabaseDb');
    await fresh.querySupabase('select 1', []);
    await fresh.querySupabase('select 2', []);
    expect(mocks.clientCalls).toEqual(['SET statement_timeout = 10000', 'select 1', 'select 2']);
    expect(mocks.releaseCount.n).toBe(2);
  });

  it('a failed statement_timeout SET is logged without the connection string, and the query still runs', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres?sslmode=require';
    mocks.queryImpl.fn = async () => ({ rows: [{ a: 1 }] });
    mocks.setImpl.fn = async () => { throw new Error('SET refused'); };
    vi.resetModules();
    const fresh = await import('../src/services/supabaseDb');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rows = await fresh.querySupabase('select 1', []);
    expect(rows).toEqual([{ a: 1 }]);
    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toContain('SET refused');
    expect(logged).not.toContain('SECRETPW');
    errorSpy.mockRestore();
  });

  it('a failed query still releases the client', async () => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = 'postgresql://u:SECRETPW@h:5432/postgres';
    mocks.queryImpl.fn = async () => { throw new Error('boom'); };
    vi.resetModules();
    const fresh = await import('../src/services/supabaseDb');
    await expect(fresh.querySupabase('select 1', [])).rejects.toThrow('Supabase query failed: boom');
    expect(mocks.releaseCount.n).toBe(1);
  });
});
