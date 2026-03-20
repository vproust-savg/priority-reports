// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/filters.ts
// PURPOSE: Returns available filter values for report dropdowns.
//          Vendors are fetched from Priority and deduplicated.
//          Statuses are hardcoded (small known set).
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createFiltersRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { queryPriority } from '../services/priorityClient';
import { getReport } from '../config/reportRegistry';
import type { FiltersResponse, FilterOption } from '@shared/types';

// WHY: No need to import grvLog here — reports.ts already does it,
// and Node's module cache ensures it runs only once.

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
    const cached = await cache.get<FiltersResponse>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    // Fetch distinct vendors from Priority
    // WHY: $top=1000 fetches up to 1000 documents to extract unique vendors.
    // For large datasets, not all vendors may be returned. Acceptable for v1.
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

    // WHY: Deduplicate by SUPNAME — Priority may return duplicates across pages
    const vendorMap = new Map<string, string>();
    for (const row of vendorData.value) {
      const code = row.SUPNAME as string;
      const name = row.CDES as string;
      if (code && name && !vendorMap.has(code)) {
        vendorMap.set(code, name);
      }
    }

    const vendors: FilterOption[] = Array.from(vendorMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const statuses: FilterOption[] = [
      { value: 'Received', label: 'Received' },
      { value: 'Cancelled', label: 'Cancelled' },
    ];

    const response: FiltersResponse = {
      meta: {
        reportId,
        generatedAt: new Date().toISOString(),
      },
      filters: { vendors, statuses },
    };

    // WHY: Cache filter options for 5 min — they change infrequently
    cache.set(cacheKey, response, 300).catch(() => {});

    res.json(response);
  });

  return router;
}
