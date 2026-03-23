// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/export.ts
// PURPOSE: POST /api/v1/reports/:reportId/export endpoint.
//          Fetches ALL filtered rows from Priority (paginated),
//          applies client-side filters, generates Excel, streams file.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createExportRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
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

const ROW_CAP = 5000;
const PAGE_SIZE = 1000;

// WHY: No arguments — unlike createQueryRouter(cache), exports are always
// fresh (never cached). No CacheProvider dependency.
export function createExportRouter(): Router {
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

    // --- Paginated fetch: get ALL matching rows ---
    const allRawRows: Record<string, unknown>[] = [];
    let page = 0;
    let lastPageSize = 0;

    try {
      while (true) {
        const response = await queryPriority(report.entity, {
          $select: baseParams.$select,
          $orderby: baseParams.$orderby,
          $filter: combinedFilter,
          $top: PAGE_SIZE,
          $skip: page * PAGE_SIZE,
        });

        allRawRows.push(...response.value);
        lastPageSize = response.value.length;

        if (lastPageSize < PAGE_SIZE) break; // Last page
        if (allRawRows.length >= ROW_CAP) break; // Hard cap
        page++;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[export] Priority fetch failed for ${reportId}: ${message}`);
      res.status(502).json({ error: `Failed to fetch from Priority: ${message}` });
      return;
    }

    // WHY: Hard cap check — if we hit the cap AND the last page was full,
    // there are more rows we couldn't fetch. Return error instead of
    // silently truncating the export.
    if (allRawRows.length >= ROW_CAP && lastPageSize === PAGE_SIZE) {
      res.status(400).json({
        error: 'Export limited to 5,000 rows. Apply filters to reduce the dataset.',
      });
      return;
    }

    // --- Enrich rows (sub-form fetch, e.g., GRV Log remarks) ---
    // WHY: Fail the export if enrichment fails — for GRV Log, enrichRows
    // populates most columns (driverId, temps, conditions, comments).
    // Silently continuing would produce a mostly-empty export.
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
    res.send(excelBuffer);

    logApiCall({
      level: 'info', event: 'export', reportId,
      durationMs: Date.now() - startTime, cacheHit: false,
      rowCount: filteredRows.length, statusCode: 200,
      odataFilter: odataFilter ?? 'none',
    });
  });

  return router;
}
