// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/reports.ts
// PURPOSE: Report data API endpoints. Serves mock data (Spec 01)
//          or real Priority data (Spec 02+). Every handler follows
//          the same pattern: validate → cache check → fetch → cache → respond.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createReportsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import type { CacheProvider } from '../services/cache';
import { buildCacheKey } from '../services/cache';
import { MOCK_REPORTS } from '../services/mockData';
import { logApiCall } from '../services/logger';
import type { ApiResponse } from '@shared/types';

const QueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(1000).default(25),
  from: z.string().optional(),
  to: z.string().optional(),
});

export function createReportsRouter(cache: CacheProvider): Router {
  const router = Router();

  // GET /list — returns array of available report IDs + names
  router.get('/list', (_req, res) => {
    const reports = Object.entries(MOCK_REPORTS).map(([id, report]) => ({
      id,
      name: report.name,
    }));
    res.json({ reports });
  });

  // GET /:reportId — returns ApiResponse with mock data
  router.get('/:reportId', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = MOCK_REPORTS[reportId];
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    // Check cache
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

    // Paginate mock data
    const startIdx = (params.page - 1) * params.pageSize;
    const pageData = report.data.slice(startIdx, startIdx + params.pageSize);

    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'mock',
      },
      data: pageData,
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        totalCount: report.data.length,
        totalPages: Math.ceil(report.data.length / params.pageSize),
      },
      columns: report.columns,
    };

    // WHY: Fire-and-forget cache write — never block response on cache failure
    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'report_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: pageData.length, statusCode: 200,
    });

    res.json(response);
  });

  // POST /:reportId/refresh — invalidates cache, re-fetches
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    await cache.invalidate(cacheKey);
    res.json({ message: `Cache invalidated for ${reportId}` });
  });

  return router;
}
