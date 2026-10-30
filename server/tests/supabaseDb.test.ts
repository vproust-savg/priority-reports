// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/supabaseDb.test.ts
// PURPOSE: Supabase pool wrapper — unconfigured guard, secret-free
//          errors, raw date parsing, idle-client error listener.
//          pg.Pool is faked; no database is reachable from tests.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pg from 'pg';

// WHY hoisted: vi.mock factories run before imports; the mutable env and
// fake pool state must exist by then so each test can flip the URL.
const mocks = vi.hoisted(() => ({
  env: { SUPABASE_GRV_DATABASE_URL: undefined as string | undefined },
  queryImpl: { fn: async (_sql: string, _params: unknown[]): Promise<{ rows: unknown[] }> => ({ rows: [] }) },
  onCalls: [] as string[],
}));

vi.mock('../src/config/environment', () => ({ env: mocks.env }));

// WHY partial mock: `types` must stay real so the 1082 assertion checks the
// actual pg registry, while Pool is replaced so no connection is attempted.
vi.mock('pg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pg')>();
  class FakePool {
    constructor(_config: unknown) {}
    on(event: string) { mocks.onCalls.push(event); return this; }
    query(sql: string, params: unknown[]) { return mocks.queryImpl.fn(sql, params); }
  }
  return { ...actual, default: { ...actual, Pool: FakePool }, Pool: FakePool };
});

import {
  SupabaseNotConfiguredError,
  isSupabaseConfigured,
  querySupabase,
  parseDateAsString,
} from '../src/services/supabaseDb';

describe('supabaseDb', () => {
  beforeEach(() => {
    mocks.env.SUPABASE_GRV_DATABASE_URL = undefined;
    mocks.onCalls.length = 0;
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
});
