// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/reports.ts
// PURPOSE: Report metadata endpoints (/list) + explicit 404 stub for
//          the retired legacy data route. Data queries live in
//          routes/query.ts (POST /:reportId/query).
// USED BY: index.ts (mounted at /api/v1/reports)
// EXPORTS: createReportsRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import { reportRegistry } from '../config/reportRegistry';

// WHY: Import report definitions so they self-register into reportRegistry.
// reports.ts is the ONLY module importing customerReturns — removing these
// imports would silently drop that report from every route.
import '../reports/grvLog';
import '../reports/bbdReport';
import '../reports/customerReturns';

export function createReportsRouter(): Router {
  const router = Router();

  // GET /list — returns array of available report IDs + names
  router.get('/list', (_req, res) => {
    const reports = Array.from(reportRegistry.entries()).map(([id, config]) => ({
      id,
      name: config.name,
    }));
    res.json({ reports });
  });

  // WHY: Legacy data route retired 2026-08-03 (env-toggle spec §7) — it
  // bypassed the environment override, env-scoped caching, and
  // disableCache. POST /:reportId/query replaced it in Spec 02; zero
  // callers remained. Explicit 404 because in production the SPA
  // catch-all would otherwise answer old API URLs with index.html.
  router.get('/:reportId', (req, res) => {
    res.status(404).json({
      error: `Route retired — use POST /api/v1/reports/${req.params.reportId}/query`,
    });
  });

  return router;
}
