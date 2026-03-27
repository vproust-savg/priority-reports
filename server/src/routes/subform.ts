// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/subform.ts
// PURPOSE: GET /api/v1/reports/:reportId/subform/:rowKey endpoint.
//          Fetches sub-form data from Priority for a single parent row.
//          Used by the frontend for lazy-loaded expandable row details.
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createSubformRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { getReport } from '../config/reportRegistry';
import { getPriorityConfig } from '../config/priority';
import { fetchWithRetry } from '../services/priorityHttp';

// WHY: Import report definitions so they self-register into reportRegistry.
import '../reports/grvLog';
import '../reports/bbdReport';

export function createSubformRouter(): Router {
  const router = Router();

  router.get('/:reportId/subform/:rowKey', async (req, res) => {
    const { reportId, rowKey } = req.params;

    const report = getReport(reportId);
    if (!report || !report.expandConfig) {
      res.status(404).json({ error: `No expandable config for report: ${reportId}` });
      return;
    }

    const { entity } = report;
    const { keyField, subformName } = report.expandConfig;

    try {
      // WHY: Can't use querySubform() — it returns only the first record
      // from multi-record sub-forms (Pattern B). We need the full array
      // (all warehouse balances). Fetch the raw response directly.
      const config = getPriorityConfig();
      const escapedKey = rowKey.replace(/'/g, "''");
      const url = `${config.baseUrl}${entity}(${keyField}='${escapedKey}')/${subformName}`;
      const response = await fetchWithRetry(url);

      if (response.status === 404) {
        res.json({ data: [] });
        return;
      }

      if (response.status < 200 || response.status >= 300) {
        console.error(`[subform] Priority returned ${response.status} for ${url}`);
        res.status(502).json({ error: 'Failed to fetch sub-form data from Priority' });
        return;
      }

      const parsed = JSON.parse(response.body) as { value?: Record<string, unknown>[] };
      res.json({ data: parsed.value ?? [] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[subform] Fetch failed for ${reportId}/${rowKey}: ${message}`);
      res.status(502).json({ error: `Failed to fetch sub-form data: ${message}` });
    }
  });

  return router;
}
