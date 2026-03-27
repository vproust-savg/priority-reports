// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/export.ts
// PURPOSE: POST /api/v1/reports/:reportId/export endpoint.
//          Cache-first paginated fetch from Priority, applies
//          client-side filters, generates Excel, streams file.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExportRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { buildExportCacheKey } from '../services/cache';
import { getReport } from '../config/reportRegistry';
import { queryPriority } from '../services/priorityClient';
import { buildODataFilter } from '../services/odataFilterBuilder';
import { applyServerClientFilters } from '../services/serverClientFilter';
import { getTemplate } from '../services/templateService';
import { generateTemplateExcel, generateFallbackExcel } from '../services/excelExporter';
import { logApiCall } from '../services/logger';
import { ExportRequestSchema } from './exportSchemas';

// WHY: Import report definitions so they self-register into reportRegistry.
// Same pattern as query.ts — ensures reports are available when this router loads.
import '../reports/grvLog';
import '../reports/bbdReport';

const ROW_CAP = 100_000;
const PAGE_SIZE = 5000;
const CACHE_TTL = 900; // 15 minutes, matches query cache

// WHY: CacheProvider injected — same pattern as createQueryRouter(cache).
// Enables cache-first fetching: check Redis before hitting Priority API.
export function createExportRouter(cache: CacheProvider): Router {
  const router = Router();

  router.post('/:reportId/export', async (req, res) => {
    const startTime = Date.now();
    const { reportId } = req.params;

    const report = getReport(reportId);
    if (!report) {
      res.status(404).json({ error: `Report not found: ${reportId}` });
      return;
    }

    let body;
    try {
      body = ExportRequestSchema.parse(req.body);
    } catch (err) {
      res.status(400).json({ error: 'Invalid request body', details: err });
      return;
    }

    const baseParams = report.buildQuery({ page: 1, pageSize: PAGE_SIZE });
    const odataFilter = buildODataFilter(body.filterGroup, report.filterColumns);

    // WHY: Merge the report's base $filter (e.g., BBD's EXPIRYDATE cutoff) with
    // UI-generated OData filter. Both are ANDed when present. Same pattern as query.ts.
    const combinedFilter = [baseParams.$filter, odataFilter].filter(Boolean).join(' and ') || undefined;

    // --- Cache-first paginated fetch ---
    const allRawRows: Record<string, unknown>[] = [];
    let page = 0;
    let lastPageSize = 0;
    let truncated = false;
    let cacheHits = 0;

    try {
      while (true) {
        // WHY: Check cache before hitting Priority API. Repeated exports
        // with the same filters are instant (cached 15 min).
        const cacheKey = buildExportCacheKey(reportId, body.filterGroup, page);
        let pageRows: Record<string, unknown>[] | null = null;

        try {
          pageRows = await cache.get<Record<string, unknown>[]>(cacheKey);
        } catch {
          // WHY: Cache read failure is non-fatal — fall through to API fetch
        }

        if (pageRows) {
          cacheHits++;
          allRawRows.push(...pageRows);
          lastPageSize = pageRows.length;
        } else {
          const response = await queryPriority(report.entity, {
            $select: baseParams.$select,
            $expand: baseParams.$expand,
            $orderby: baseParams.$orderby,
            $filter: combinedFilter,
            $top: PAGE_SIZE,
            $skip: page * PAGE_SIZE,
          });

          allRawRows.push(...response.value);
          lastPageSize = response.value.length;

          // WHY: Cache freshly fetched pages so subsequent exports reuse them.
          cache.set(cacheKey, response.value, CACHE_TTL).catch((err) => {
            console.warn(`[export] Cache write failed for ${cacheKey}:`, err);
          });
        }

        if (lastPageSize < PAGE_SIZE) break; // Last page
        if (allRawRows.length >= ROW_CAP) {
          truncated = true;
          break;
        }
        page++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // --- Enrich rows (sub-form fetch, e.g., legacy reports without $expand) ---
    // WHY: Fail the export if enrichment fails — for reports using enrichRows,
    // it populates most columns. Silently continuing would produce a mostly-empty export.
    let enrichedRows = allRawRows;
    if (report.enrichRows) {
      try {
        enrichedRows = await report.enrichRows(allRawRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[export] Sub-form enrichment failed for ${reportId}: ${message}`);
        res.status(502).json({ error: `Sub-form data fetch failed: ${message}` });
        return;
      }
    }

    // --- Transform + post-transform exclusion + client-side filter ---
    let transformedRows = enrichedRows.map(report.transformRow);

    // WHY: Post-transform row exclusion. BBD uses this to remove items
    // with balance <= 0 or without a flagged expiration status. Same as query.ts.
    if (report.filterRows) {
      transformedRows = report.filterRows(transformedRows);
    }

    const filteredRows = applyServerClientFilters(
      transformedRows, body.filterGroup, report.filterColumns,
    );

    // --- Determine export columns (visibility + order from UI) ---
    // WHY: Only applies to fallback mode. Template mode ignores visibility
    // because the template has a fixed layout with baked-in headers.
    let exportColumns = report.columns;
    if (body.visibleColumnKeys && !report.exportConfig) {
      const validKeys = new Set(report.columns.map((c) => c.key));
      const filtered = body.visibleColumnKeys
        .filter((key) => validKeys.has(key))
        .map((key) => report.columns.find((c) => c.key === key)!)
        .filter(Boolean);
      // WHY: If all keys were invalid, fall back to all columns rather
      // than producing an empty export.
      if (filtered.length > 0) exportColumns = filtered;
    }

    // --- Generate Excel ---
    let excelBuffer: Buffer;
    try {
      const template = await getTemplate(reportId);

      if (template && report.exportConfig) {
        excelBuffer = await generateTemplateExcel(
          template, filteredRows, report.exportConfig, report.excelStyle,
        );
      } else {
        excelBuffer = await generateFallbackExcel(
          filteredRows, exportColumns, report.name, report.excelStyle,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Excel generation failed, falling back: ${message}`);
      // WHY: Fallback on template failure — never block the export entirely.
      // Pass excelStyle to fallback too so it stays print-ready.
      try {
        excelBuffer = await generateFallbackExcel(
          filteredRows, exportColumns, report.name, report.excelStyle,
        );
      } catch (fallbackErr) {
        const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error';
        console.error(`[export] Fallback Excel also failed: ${fbMsg}`);
        res.status(500).json({ error: 'Failed to generate Excel file' });
        return;
      }
    }

    // WHY: Filename format matches spec: report name (spaces→hyphens) + today's date.
    // Strip non-ASCII chars (e.g., em dash "—" in "BBD — Best By Dates") because
    // HTTP Content-Disposition headers only allow ASCII (RFC 7230). Node throws
    // ERR_INVALID_CHAR on non-ASCII header values.
    const today = new Date().toISOString().slice(0, 10);
    const safeName = report.name.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, '-').replace(/-{2,}/g, '-');
    const filename = `${safeName}-${today}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // WHY: Binary response can't include JSON metadata. Custom header
    // lets the frontend detect truncation and show a warning toast.
    if (truncated) {
      res.setHeader('X-Export-Truncated', 'true');
    }
    res.send(excelBuffer);

    logApiCall({
      level: 'info', event: 'export', reportId,
      durationMs: Date.now() - startTime, cacheHit: cacheHits > 0,
      rowCount: filteredRows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });
  });

  return router;
}
