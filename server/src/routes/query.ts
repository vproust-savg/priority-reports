// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /query shim — accepts FilterGroup body from the
//          Spec 03b frontend. Ignores filterGroup for now, returns
//          unfiltered data with pagination. Spec 03a will replace
//          this with the full OData filter builder.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { logApiCall } from '../services/logger';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

export function createQueryRouter(cache: CacheProvider): Router {
  const router = Router();

  // POST /:reportId/query — accepts FilterGroup body (Spec 03b frontend).
  // WHY: Shim until Spec 03a adds the full OData filter builder.
  // Ignores filterGroup for now — returns unfiltered data with pagination.
  router.post('/:reportId/query', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    const page = typeof req.body?.page === 'number' ? req.body.page : 1;
    const pageSize = typeof req.body?.pageSize === 'number' ? Math.min(req.body.pageSize, 1000) : 50;

    const params = { page, pageSize };
    const cacheKey = buildCacheKey(reportId, params);

    const cached = await cache.get<ApiResponse>(cacheKey);
    if (cached) {
      logApiCall({
        level: 'info', event: 'report_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
      });
      res.json(cached);
      return;
    }

    let priorityData;
    try {
      const oDataParams = report.buildQuery(params);
      priorityData = await queryPriority(report.entity, oDataParams);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[reports] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    let rawRows = priorityData.value;
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[reports] Sub-form enrichment failed for ${reportId}: ${message}`);
      }
    }
    const rows = rawRows.map(report.transformRow);

    const isLastPage = rows.length < pageSize;
    const totalCount = isLastPage
      ? (page - 1) * pageSize + rows.length
      : (page - 1) * pageSize + rows.length + 1;

    const response: ApiResponse = {
      meta: {
        reportId, reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss', executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
      },
      data: rows,
      pagination: { page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
      columns: report.columns,
    };

    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'report_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
    });

    res.json(response);
  });

  return router;
}
