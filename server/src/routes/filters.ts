// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Dispatches to report.fetchFilters() when available.
//          Falls back to hardcoded GRV Log logic when absent.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createFiltersRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { queryPriority } from '../services/priorityClient';
import { getReport } from '../config/reportRegistry';
import type { FiltersResponse, FilterOption } from '@shared/types';

// WHY: Ensure report definitions are registered even if filters.ts
// loads before reports.ts. Node module cache prevents double-registration.
import '../reports/grvLog';
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

    const cacheKey = `filters:${reportId}`;
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
        filters = await report.fetchFilters();
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
        vendorData = await queryPriority(report.entity, {
          $select: 'SUPNAME,CDES',
          $orderby: 'CDES',
          $top: 1000,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[filters] Priority fetch failed: ${message}`);
        res.status(502).json({ error: `Failed to fetch filters: ${message}` });
        return;
      }

      const vendorSet = new Set<string>();
      for (const row of vendorData.value) {
        const name = row.CDES as string;
        if (name) vendorSet.add(name);
      }

      const vendors: FilterOption[] = Array.from(vendorSet)
        .map((name) => ({ value: name, label: name }))
        .sort((a, b) => a.label.localeCompare(b.label));

      const statuses: FilterOption[] = [
        { value: 'Received', label: 'Received' },
        { value: 'Cancelled', label: 'Cancelled' },
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

    // WHY: Cache filter options for 5 min — they change infrequently
    cache.set(cacheKey, response, 300).catch((err) => {
      console.warn(`[filters] Cache write failed for ${cacheKey}:`, err);
    });

    res.json(response);
  });

  return router;
}
