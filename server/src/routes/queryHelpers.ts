// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/queryHelpers.ts
// PURPOSE: Helper functions for the POST /query endpoint.
//          Extracted to keep query.ts under 200 lines.
// USED BY: routes/query.ts
// EXPORTS: CLIENT_FILTER_MAX_FETCH, hasClientOnlyConditions,
//          resolveEnvOverride, createClientDisconnectAbort
// ═══════════════════════════════════════════════════════════════

import type { Response } from 'express';
import type { FilterGroup, ColumnFilterMeta, PriorityEnvironment } from '@shared/types';
import type { ReportConfig } from '../config/reportRegistry';
import { env } from '../config/environment';

// WHY: When request has client-only filter conditions, the server can't
// rely on OData $top for accurate pagination because post-enrichment
// filtering reduces the row count. Fetch up to this many rows, filter,
// then paginate server-side.
export const CLIENT_FILTER_MAX_FETCH = 500;

const CLIENT_ONLY_OPS = new Set(['contains', 'notContains', 'startsWith', 'endsWith']);

// WHY: Recursively checks nested groups — a client-only condition
// inside a nested OR group must still trigger post-enrichment filtering.
export function hasClientOnlyConditions(
  filterGroup: FilterGroup,
  filterColumns: ColumnFilterMeta[],
): boolean {
  for (const c of filterGroup.conditions) {
    if (!c.field) continue;
    const col = filterColumns.find((fc) => fc.key === c.field);
    if (col?.filterLocation === 'client' || CLIENT_ONLY_OPS.has(c.operator)) return true;
  }
  for (const g of filterGroup.groups) {
    if (hasClientOnlyConditions(g, filterColumns)) return true;
  }
  return false;
}

// WHY: Honor the UAT/Live toggle only for opted-in reports (grv-log).
// requestedEnv drives the ALS scope (undefined = no scope, boot env);
// resolvedEnv (requested ?? boot) keys caches and stamps provenance.
export function resolveEnvOverride(
  report: ReportConfig,
  environment: PriorityEnvironment | undefined,
): { requestedEnv: PriorityEnvironment | undefined; resolvedEnv: PriorityEnvironment } {
  const requestedEnv = report.allowEnvOverride ? environment : undefined;
  return { requestedEnv, resolvedEnv: requestedEnv ?? env.PRIORITY_ENV };
}

// WHY: Stop enrichment mid-run when the client is gone (env toggle
// switch, unmount, reload) — each grv-log load costs ~51 Priority calls
// against the shared 95/min budget. res 'close' with an unfinished
// response = client disconnected (normal completion has writableEnded).
export function createClientDisconnectAbort(res: Response): AbortController {
  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abortController.abort();
  });
  return abortController;
}
