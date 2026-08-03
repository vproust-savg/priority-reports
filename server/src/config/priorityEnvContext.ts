// ═══════════════════════════════════════════════════════════════
// FILE: server/src/config/priorityEnvContext.ts
// PURPOSE: Request-scoped Priority environment override. A route sets
//          it once; getPriorityConfig() reads it at any async depth,
//          so every Priority call in one request — including
//          enrichRows' batched sub-form fetches — uses one environment.
// USED BY: config/priority.ts, routes/query.ts, routes/export.ts,
//          routes/filters.ts
// EXPORTS: runWithPriorityEnv, getRequestPriorityEnv
// ═══════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from 'node:async_hooks';
import type { PriorityEnvironment } from '@shared/types';

// WHY: ALS (not a module variable) — concurrent requests each get their
// own context; a plain variable would race under parallel Live/UAT loads.
// ALS propagates through await, Promise.all, and timers, which is exactly
// the shape of grvLog's enrichRows batching.
const storage = new AsyncLocalStorage<PriorityEnvironment>();

// WHY: undefined means "no override" — run OUTSIDE any scope so
// getPriorityConfig() falls back to the boot PRIORITY_ENV. Write routes
// (extend) never call this, so writes can never be switched.
export function runWithPriorityEnv<T>(
  env: PriorityEnvironment | undefined,
  fn: () => T,
): T {
  if (!env) return fn();
  return storage.run(env, fn);
}

export function getRequestPriorityEnv(): PriorityEnvironment | undefined {
  return storage.getStore();
}
