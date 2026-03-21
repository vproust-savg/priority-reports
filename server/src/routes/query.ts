// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /api/v1/reports/:reportId/query endpoint.
//          Accepts a FilterGroup tree, translates server-side
//          conditions to OData, fetches from Priority, returns
//          same ApiResponse envelope as the GET endpoint.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildQueryCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { logApiCall } from '../services/logger';
import { QueryRequestSchema } from './querySchemas';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';

export function createQueryRouter(cache: CacheProvider): Router {
  const router = Router();

  router.post('/:reportId/query', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    let body;
    try {
      body = QueryRequestSchema.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: 'Invalid request body', details: err });
      return;
    }

    const cacheKey = buildQueryCacheKey(reportId, body);

    // WHY: Compute odataFilter before cache check so both log calls
    // (cache hit + cache miss) can include it for Railway debugging.
    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });
    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    const cached = await cache.get<ApiResponse>(cacheKey);
    if (cached) {
      logApiCall({
        level: 'info', event: 'query_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
        odataFilter: odataFilter ?? 'none',
      });
      res.json(cached);
      return;
    }

    let priorityData;
    try {
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $orderby: baseParams.$orderby,
        $filter: odataFilter,
        $top: body.pageSize,
        $skip: (body.page - 1) * body.pageSize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[query] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // WHY: Some reports need sub-form data that can't use $expand.
    // enrichRows fetches sub-forms individually before transformRow parses them.
    let rawRows = priorityData.value;
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
      }
    }
    const rows = rawRows.map(report.transformRow);

    const pageSize = body.pageSize;
    const isLastPage = rows.length < pageSize;
    const totalCount = isLastPage
      ? (body.page - 1) * pageSize + rows.length
      : (body.page - 1) * pageSize + rows.length + 1;

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
        page: body.page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
      columns: report.columns,
    };

    cache.set(cacheKey, response, 300).catch(() => {});

    logApiCall({
      level: 'info', event: 'query_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });

    res.json(response);
  });

  return router;
}
