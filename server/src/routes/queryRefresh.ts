// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/queryRefresh.ts
// PURPOSE: POST /api/v1/reports/:reportId/refresh — invalidates all
//          cached queries for a report. Extracted verbatim from
//          query.ts (2026-08-03) to keep that file under the
//          250-line ceiling.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRefreshRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { getReport } from '../config/reportRegistry';

export function createQueryRefreshRouter(cache: CacheProvider): Router {
  const router = Router();

  // WHY: Refresh endpoint invalidates ALL cached queries for a report.
  // Uses prefix-based deletion so every filter combination is cleared.
  // Also invokes the report's optional clearMemoryCache hook for any
  // per-report in-memory state that needs flushing alongside Redis.
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    getReport(reportId)?.clearMemoryCache?.();
    try {
      const deleted = await cache.invalidateByPrefix(`query:${reportId}:`);
      console.log(`[query] Refreshed cache for ${reportId}: ${deleted} keys deleted`);
      res.json({ message: `Cache refreshed for ${reportId}`, keysDeleted: deleted });
    } catch (err) {
      console.warn(`[query] Cache refresh failed for ${reportId}:`, err);
      // WHY: Still return success — the client will refetch regardless
      res.json({ message: `Cache refresh attempted for ${reportId}` });
    }
  });

  return router;
}
