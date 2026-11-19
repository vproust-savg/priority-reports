// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/queryRefresh.ts
// PURPOSE: POST /api/v1/reports/:reportId/refresh — invalidates all
//          cached queries for a report. Reports with refreshSource
//          also sync a validated date range and report its status.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRefreshRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { createClientDisconnectAbort } from './queryHelpers';
import { validateRefreshDateRange } from '../../../shared/utils/refreshDateRange';

const RANGE_ERRORS = {
  invalidDates: 'Refresh requires valid from and to dates in YYYY-MM-DD format',
  reversed: 'Refresh end date (to) must be on or after the start date (from)',
  tooLong: 'Refresh covers at most 31 days',
};

export function createQueryRefreshRouter(cache: CacheProvider): Router {
  const router = Router();

  // WHY: Refresh endpoint invalidates ALL cached queries for a report.
  // Uses prefix-based deletion so every filter combination is cleared.
  // Also invokes the report's optional clearMemoryCache hook for any
  // per-report in-memory state that needs flushing alongside Redis.
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    const report = getReport(reportId);
    const rangeResult = report?.refreshSource
      ? validateRefreshDateRange(req.body?.from, req.body?.to)
      : undefined;
    if (rangeResult && 'reason' in rangeResult) {
      res.status(400).json({ error: RANGE_ERRORS[rangeResult.reason] });
      return;
    }
    report?.clearMemoryCache?.();
    let payload: Record<string, unknown>;
    try {
      const deleted = await cache.invalidateByPrefix(`query:${reportId}:`);
      console.log(`[query] Refreshed cache for ${reportId}: ${deleted} keys deleted`);
      payload = { message: `Cache refreshed for ${reportId}`, keysDeleted: deleted };
    } catch (err) {
      console.warn(`[query] Cache refresh failed for ${reportId}:`, err);
      // WHY: Still return success — the client will refetch regardless
      payload = { message: `Cache refresh attempted for ${reportId}` };
    }
    // WHY: After the cache clear, so the refetch the widget does next sees the
    // synced data. A throw becomes status 'error' (200, never 500) so the
    // widget's notice fires instead of a generic network error.
    if (report?.refreshSource && rangeResult) {
      try {
        const outcome = await report.refreshSource(rangeResult.range, createClientDisconnectAbort(res).signal);
        payload.status = outcome.status;
      } catch (err) {
        console.warn(`[query] refreshSource failed for ${reportId}:`, err instanceof Error ? err.message : err);
        payload.status = 'error';
      }
    }
    res.json(payload);
  });

  return router;
}
