// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /api/v1/reports/:reportId/query endpoint.
//          Single-phase: OData filter → Priority fetch → enrich →
//          post-enrichment filter (client-only columns) → cache.
//          POST /:reportId/refresh invalidates all cached queries.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildQueryCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { applyServerClientFilters } from '../services/serverClientFilter';
import { logApiCall } from '../services/logger';
import { QueryRequestSchema } from './querySchemas';
import { CLIENT_FILTER_MAX_FETCH, hasClientOnlyConditions } from './queryHelpers';
import type { ApiResponse } from '@shared/types';

// WHY: Import report definitions so they self-register into reportRegistry
import '../reports/grvLog';
import '../reports/bbdReport';

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
    const cacheTtl = 900; // 15 minutes

    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    let cached: ApiResponse | null = null;
    try {
      cached = await cache.get<ApiResponse>(cacheKey);
    } catch (err) {
      console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
    if (cached) {
      cached.meta.cache = 'hit';
      cached.meta.executionTimeMs = Date.now() - startTime;
      logApiCall({
        level: 'info', event: 'query_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
        odataFilter: odataFilter ?? 'none',
      });
      res.json(cached);
      return;
    }

    const hasClientFilters = hasClientOnlyConditions(body.filterGroup, report.filterColumns);
    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });

    // WHY: Merge the report's base $filter (e.g., BBD's EXPIRYDATE cutoff) with
    // UI-generated OData filter. Both are ANDed when present.
    const combinedFilter = [baseParams.$filter, odataFilter].filter(Boolean).join(' and ') || undefined;

    // WHY: clientSidePagination reports (like BBD) use the report's own $top/$skip
    // because post-fetch filtering (filterRows) makes OData pagination unreliable.
    // Standard reports use query.ts-controlled pagination.
    let fetchTop: number;
    let fetchSkip: number;
    if (report.clientSidePagination) {
      fetchTop = baseParams.$top ?? 2000;
      fetchSkip = baseParams.$skip ?? 0;
    } else {
      fetchTop = hasClientFilters ? CLIENT_FILTER_MAX_FETCH : body.pageSize;
      fetchSkip = hasClientFilters ? 0 : (body.page - 1) * body.pageSize;
    }

    let priorityData;
    try {
      priorityData = await queryPriority(report.entity, {
        $select: baseParams.$select,
        $orderby: baseParams.$orderby,
        $filter: combinedFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[query] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    let rawRows = priorityData.value;
    const warnings: string[] = [];
    if (report.enrichRows) {
      try {
        rawRows = await report.enrichRows(rawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
        warnings.push('Sub-form data unavailable — some columns may be blank');
      }
    }
    let rows = rawRows.map(report.transformRow);

    // WHY: Post-transform row exclusion. BBD uses this to remove items
    // with balance <= 0 or without a flagged expiration status.
    if (report.filterRows) {
      rows = report.filterRows(rows);
    }

    // WHY: Apply post-enrichment filtering for client-only columns.
    // OData can't filter on fields that come from HTML sub-form parsing.
    if (hasClientFilters) {
      rows = applyServerClientFilters(rows, body.filterGroup, report.filterColumns);
    }

    // WHY: Pagination depends on the report's strategy.
    // clientSidePagination: all rows returned, frontend paginates.
    // Standard: server-side pagination with client filter support.
    const totalBeforePagination = rows.length;
    let totalCount: number;

    if (report.clientSidePagination) {
      // WHY: All filtered rows returned to frontend. Frontend handles pagination.
      totalCount = totalBeforePagination;
    } else if (hasClientFilters) {
      const start = (body.page - 1) * body.pageSize;
      rows = rows.slice(start, start + body.pageSize);
      totalCount = totalBeforePagination;
    } else {
      totalCount = rows.length < body.pageSize
        ? (body.page - 1) * body.pageSize + rows.length
        : (body.page - 1) * body.pageSize + rows.length + 1;
    }

    const response: ApiResponse = {
      meta: {
        reportId,
        reportName: report.name,
        generatedAt: new Date().toISOString(),
        cache: 'miss',
        executionTimeMs: Date.now() - startTime,
        source: 'priority-odata',
        rowStyleField: report.rowStyleField,
      },
      data: rows,
      pagination: {
        page: body.page,
        pageSize: body.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / body.pageSize),
      },
      columns: report.columns,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

    cache.set(cacheKey, response, cacheTtl).catch((err) => {
      console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
    });

    logApiCall({
      level: 'info', event: 'query_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });

    res.json(response);
  });

  // WHY: Refresh endpoint invalidates ALL cached queries for a report.
  // Uses prefix-based deletion so every filter combination is cleared.
  router.post('/:reportId/refresh', async (req, res) => {
    const { reportId } = req.params;
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
