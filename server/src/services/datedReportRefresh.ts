import type { RefreshDateRange } from '@shared/utils/refreshDateRange';
import type { RefreshOutcome } from '../config/reportRegistry';
import { querySupabase } from './supabaseDb';

// SQL identifiers cannot be bound. Only these server-owned pairs enter the SQL.
const REFRESH_FUNCTIONS = {
  grv: { request: 'request_grv_refresh', status: 'grv_refresh_status' },
  return: { request: 'request_return_refresh', status: 'return_refresh_status' },
} as const;

const REFRESH_POLL_INTERVAL_MS = 3_000;
const REFRESH_TIMEOUT_MS = 90_000;

// WHY: type alias (not interface) so it satisfies querySupabase's Record<string, unknown> bound.
type RefreshRow = {
  request_id: string | null;
  status: string;
  reused?: boolean;
};

export interface RefreshDeps {
  query: (sql: string, params: unknown[]) => Promise<RefreshRow[]>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultRefreshDeps: RefreshDeps = {
  query: (sql, params) => querySupabase<RefreshRow>(sql, params),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: Date.now,
};

export function createDatedReportRefresh(source: keyof typeof REFRESH_FUNCTIONS) {
  if (!Object.hasOwn(REFRESH_FUNCTIONS, source)) throw new Error('Unknown refresh source');
  const functions = REFRESH_FUNCTIONS[source];
  return async (
    range: RefreshDateRange,
    signal?: AbortSignal,
    deps: RefreshDeps = defaultRefreshDeps,
  ): Promise<RefreshOutcome> => {
    const [request] = await deps.query(
      `select * from priority_reports.${functions.request}($1::date, $2::date)`,
      [range.from, range.to],
    );
    if (!request) throw new Error(`${functions.request} returned no row`);
    if (request.status === 'busy' || request.request_id === null) return { status: 'busy' };

    // Older RPCs reuse completed jobs briefly. Their rows predate this click.
    if (request.status === 'done') return { status: request.reused === false ? 'done' : 'error' };
    if (request.status === 'error') return { status: 'error' };

    const startedAt = deps.now();
    while (deps.now() - startedAt < REFRESH_TIMEOUT_MS) {
      if (signal?.aborted) return { status: 'timeout' };
      await deps.sleep(REFRESH_POLL_INTERVAL_MS);
      if (signal?.aborted) return { status: 'timeout' };
      // node-postgres returns bigint IDs as strings. Preserve all their digits.
      const [current] = await deps.query(
        `select * from priority_reports.${functions.status}($1)`,
        [request.request_id],
      );
      if (current?.status === 'done' || current?.status === 'error' || current?.status === 'partial') {
        return { status: current.status };
      }
    }
    return { status: 'timeout' };
  };
}
