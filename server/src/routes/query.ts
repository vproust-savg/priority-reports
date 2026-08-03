// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/query.ts
// PURPOSE: POST /api/v1/reports/:reportId/query endpoint.
//          Single-phase: OData filter → Priority fetch → enrich →
//          post-enrichment filter (client-only columns) → cache.
//          Honors the GRV UAT/Live env override (allowEnvOverride
//          reports only) and aborts enrichment on client disconnect.
//          (/:reportId/refresh moved to queryRefresh.ts, 2026-08-03.)
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createQueryRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { runWithPriorityEnv } from '../config/priorityEnvContext';
import type { CacheProvider } from '../services/cache';
import { buildQueryCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter, combineFilters } from '../services/odataFilterBuilder';
import { applyServerClientFilters } from '../services/serverClientFilter';
import { logApiCall } from '../services/logger';
import { QueryRequestSchema } from './querySchemas';
import {
  CLIENT_FILTER_MAX_FETCH, hasClientOnlyConditions,
  resolveEnvOverride, createClientDisconnectAbort,
} from './queryHelpers';
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

    const { requestedEnv, resolvedEnv } = resolveEnvOverride(report, body.environment);
    const abortController = createClientDisconnectAbort(res);

    const cacheKey = buildQueryCacheKey(reportId, body, resolvedEnv);
    const cacheTtl = 900; // 15 minutes

    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    let cached: ApiResponse | null = null;
    // WHY: Some reports (grv-log) require always-fresh Priority data. Skip the
    // cache lookup entirely when the report opts out — staleness risk > latency.
    if (!report.disableCache) {
      try {
        cached = await cache.get<ApiResponse>(cacheKey);
      } catch (err) {
        console.warn(`[query] Cache read failed for ${cacheKey}, continuing as miss:`, err);
      }
    }
    if (cached) {
      cached.meta.cache = 'hit';
      cached.meta.executionTimeMs = Date.now() - startTime;
      cached.meta.priorityEnv = resolvedEnv;
      logApiCall({
        level: 'info', event: 'query_fetch', reportId,
        durationMs: Date.now() - startTime, cacheHit: true,
        rowCount: cached.data.length, statusCode: 200,
        odataFilter: odataFilter ?? 'none', environment: resolvedEnv,
      });
      res.json(cached);
      return;
    }

    const hasClientFilters = hasClientOnlyConditions(body.filterGroup, report.filterColumns);
    const baseParams = report.buildQuery({ page: body.page, pageSize: body.pageSize });

    // WHY: Merge the report's base $filter (e.g., BBD's EXPIRYDATE cutoff) with
    // UI-generated OData filter. Both are ANDed when present.
    const combinedFilter = combineFilters(baseParams.$filter, odataFilter);

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
      priorityData = await runWithPriorityEnv(requestedEnv, () => queryPriority(report.entity, {
        $select: baseParams.$select,
        $expand: baseParams.$expand,
        $orderby: baseParams.$orderby,
        $filter: combinedFilter,
        $top: fetchTop,
        $skip: fetchSkip,
      }));
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
        rawRows = await runWithPriorityEnv(requestedEnv, () =>
          report.enrichRows!(rawRows, abortController.signal));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[query] Sub-form enrichment failed for ${reportId}: ${message}`);
        warnings.push('Sub-form data unavailable — some columns may be blank');
      }
    }

    // WHY: Client disconnected mid-enrichment. The response is
    // undeliverable — skip transform/cache/send so partial rows are
    // never cached and no more work runs. 499 = client closed request
    // (log-only status, nothing is sent).
    if (abortController.signal.aborted) {
      logApiCall({
        level: 'info', event: 'query_aborted', reportId,
        durationMs: Date.now() - startTime, cacheHit: false,
        statusCode: 499, environment: resolvedEnv,
      });
      res.end();
      return;
    }
    // WHY: Row explosion (one row per sub-form line item) runs here, after the
    // enrichRows try/catch. It uses the parent's $expand line items, so it still
    // explodes even when enrichRows threw and rawRows fell back to un-enriched
    // parent rows — line-item columns are never blanked by an enrichment failure.
    if (report.explodeRows) {
      rawRows = report.explodeRows(rawRows);
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
        priorityEnv: resolvedEnv,
        rowStyleField: report.rowStyleField,
        // WHY: When the report has expandConfig, pass rowKeyField to the frontend
        // so it knows which row field to use as the expand key. subformName and
        // keyField stay server-side (used by the subform endpoint).
        expandConfig: report.expandConfig
          ? { rowKeyField: report.expandConfig.rowKeyField }
          : undefined,
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

    // WHY: Mirror the read-gate above so disableCache reports never populate Redis.
    if (!report.disableCache) {
      cache.set(cacheKey, response, cacheTtl).catch((err) => {
        console.warn(`[query] Cache write failed for ${cacheKey}:`, err);
      });
    }

    logApiCall({
      level: 'info', event: 'query_fetch', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: rows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none', environment: resolvedEnv,
    });

    res.json(response);
  });

  return router;
}
