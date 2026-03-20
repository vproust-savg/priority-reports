// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/reports.ts
// PURPOSE: Report data API endpoints. Fetches real Priority data
//          via the report registry. Each report defines its own
//          entity, query, and transform — this route orchestrates.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createReportsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import type { CacheProvider } from '../services/cache';
import { buildCacheKey } from '../services/cache';
import { getReport, reportRegistry } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { logApiCall } from '../services/logger';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

const QueryParamsSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  // WHY: Default changed from 25 (Spec 01) to 50 — matches frontend ReportTableWidget default
  pageSize: z.coerce.number().min(1).max(1000).default(50),
  // WHY: Regex prevents OData injection — only ISO date format allowed
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // WHY: Regex prevents OData injection — only alphanumeric, dash, underscore allowed
  vendor: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional(),
  status: z.string().regex(/^[a-zA-Z0-9_ -]+$/).optional(),
});

export function createReportsRouter(cache: CacheProvider): Router {
  const router = Router();

  // GET /list — returns array of available report IDs + names
  router.get('/list', (_req, res) => {
    const reports = Array.from(reportRegistry.entries()).map(([id, config]) => ({
      id,
      name: config.name,
    }));
    res.json({ reports });
  });

  // GET /:reportId — returns ApiResponse with real Priority data
  router.get('/:reportId', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
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

    // Fetch from Priority
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
    const rows = priorityData.value.map(report.transformRow);

    // WHY: Priority may not support $count=true. Estimate totalCount:
    // if fewer rows than pageSize, we're on the last page.
    const pageSize = params.pageSize;
    const isLastPage = rows.length < pageSize;
    const totalCount = isLastPage
      ? (params.page - 1) * pageSize + rows.length
      : (params.page - 1) * pageSize + rows.length + 1;

    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
      },
      data: rows,
      pagination: {
        page: params.page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      columns: report.columns,
    };

    // WHY: Fire-and-forget cache write — never block response on cache failure
    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'report_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
    });

    res.json(response);
  });

  // POST /:reportId/refresh — invalidates cache
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
    const params = QueryParamsSchema.parse(req.query);
    const cacheKey = buildCacheKey(reportId, params);

    await cache.invalidate(cacheKey);
    res.json({ message: `Cache invalidated for ${reportId}` });
  });

  return router;
}
