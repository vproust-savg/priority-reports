// ═══════════════════════════════════════════════════════════════
// FILE: server/src/routes/health.ts
// PURPOSE: Health check endpoint for Railway deployment monitoring.
//          Returns server status, environment, and cache connectivity.
// USED BY: index.ts (mounted at /api/v1/health)
// EXPORTS: healthRouter
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import type { CacheProvider } from '../services/cache';
import { env } from '../config/environment';
import type { HealthResponse } from '@shared/types';

export function createHealthRouter(cache: CacheProvider): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const cacheConnected = await cache.isConnected();

    const response: HealthResponse = {
      status: 'ok',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      cacheStatus: cacheConnected ? 'connected' : 'disconnected',
      version: '1.0.0',
    };

    res.json(response);
  });

  return router;
}
