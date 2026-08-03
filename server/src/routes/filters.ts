// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Dispatches to report.fetchFilters() when available.
//          Falls back to hardcoded GRV Log logic when absent.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createFiltersRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/environment';
import { runWithPriorityEnv } from '../config/priorityEnvContext';
import type { CacheProvider } from '../services/cache';
import { queryPriority } from '../services/priorityClient';
import { getReport } from '../config/reportRegistry';
import type { FiltersResponse, FilterOption } from '@shared/types';

// WHY: Ensure report definitions are registered even if filters.ts
// loads before reports.ts. Node module cache prevents double-registration.
// (grvLog import is named — still triggers the same registration side effect.)
import { EXCLUDED_VENDOR_SUPNAME } from '../reports/grvLog';
import '../reports/bbdReport';

export function createFiltersRouter(cache: CacheProvider): Router {
  const router = Router();

  router.get('/:reportId/filters', async (req, res) => {
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    // WHY: GET route — the env override arrives as a query parameter.
    // Same contract as the query/export body field (env-toggle spec §4).
    const envParse = z.enum(['production', 'uat']).optional()
      .safeParse(req.query.environment);
    if (!envParse.success) {
      res.status(400).json({ error: 'Invalid environment parameter' });
      return;
    }
    const requestedEnv = report.allowEnvOverride ? envParse.data : undefined;
    const resolvedEnv = requestedEnv ?? env.PRIORITY_ENV;

    // WHY: Env in the key — UAT vendor options must never be served to a
    // Live session (and vice versa). Old un-scoped keys age out via TTL.
    const cacheKey = `filters:${reportId}:${resolvedEnv}`;
    let cached: FiltersResponse | null = null;
    try {
      cached = await cache.get<FiltersResponse>(cacheKey);
    } catch (err) {
      console.warn(`[filters] Cache read failed for ${cacheKey}, continuing as miss:`, err);
    }
    if (cached) {
      res.json(cached);
      return;
    }

    let filters: Record<string, FilterOption[]>;

    if (report.fetchFilters) {
      // WHY: Report defines its own filter fetching logic (BBD, future reports).
      try {
        filters = await runWithPriorityEnv(requestedEnv, () => report.fetchFilters!());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[filters] fetchFilters failed for ${reportId}: ${message}`);
        res.status(502).json({ error: `Failed to fetch filters: ${message}` });
        return;
      }
    } else {
      // WHY: Fallback for GRV Log — hardcoded logic preserved until grvLog.ts
      // is migrated to fetchFilters() in a future cleanup.
      let vendorData;
      try {
        vendorData = await runWithPriorityEnv(requestedEnv, () => queryPriority(report.entity, {
          $select: 'SUPNAME,CDES',
          $orderby: 'CDES',
          $top: 1000,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[filters] Priority fetch failed: ${message}`);
        res.status(502).json({ error: `Failed to fetch filters: ${message}` });
        return;
      }

      const vendorSet = new Set<string>();
      for (const row of vendorData.value) {
        // WHY: Excluded vendor must not be offered as a filter option — its
        // rows are already hidden by grv-log's base $filter (V8491 exclusion).
        if (row.SUPNAME === EXCLUDED_VENDOR_SUPNAME) continue;
        const name = row.CDES as string;
        if (name) vendorSet.add(name);
      }

      const vendors: FilterOption[] = Array.from(vendorSet)
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label));

      // WHY: Values must match Priority's STATDES exactly. Verified against
      // live DOCUMENTS_P on 2026-06-01: 'Received', 'In Progress', 'Canceled'
      // (American single-L). The prior 'Cancelled' (double-L) matched 0 rows,
      // and 'In Progress' was missing entirely.
      const statuses: FilterOption[] = [
        { value: 'Received', label: 'Received' },
        { value: 'In Progress', label: 'In Progress' },
        { value: 'Canceled', label: 'Canceled' },
      ];

      filters = { vendors, statuses, warehouses: [], users: [] };
    }

    const response: FiltersResponse = {
      meta: {
        reportId,
        generatedAt: new Date().toISOString(),
      },
      filters,
      columns: report.filterColumns,
    };

    // WHY: Cache filter options for 1 hour — they are reference/lookup data
    // (supplier names, product families) that change very rarely.
    // The /refresh endpoint can invalidate by prefix if needed.
    cache.set(cacheKey, response, 3600).catch((err) => {
      console.warn(`[filters] Cache write failed for ${cacheKey}:`, err);
    });

    res.json(response);
  });

  return router;
}
