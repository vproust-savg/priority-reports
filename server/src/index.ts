// ═══════════════════════════════════════════════════════════════
// FILE: server/src/index.ts
// PURPOSE: Express entry point. Mounts all routes, configures CORS
//          and JSON parsing. In production, serves the React client.
// USED BY: npm run dev, npm start, tests (imports app)
// EXPORTS: app
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './config/environment';
import { createCacheProvider } from './services/cache';
import { createHealthRouter } from './routes/health';
import { createQueryRouter } from './routes/query';
import { createReportsRouter } from './routes/reports';
import { createFiltersRouter } from './routes/filters';
import { createExportRouter } from './routes/export';
import { logStartup } from './services/logger';
import { getMonday, getSunday, toISODate } from '../../shared/utils/weekUtils';

const app = express();

app.use(cors());
app.use(express.json());

const cache = createCacheProvider();

// Mount API routes
// WHY: Query router before reports router — more specific path first.
app.use('/api/v1/health', createHealthRouter(cache));
app.use('/api/v1/reports', createQueryRouter(cache));
app.use('/api/v1/reports', createReportsRouter(cache));
app.use('/api/v1/reports', createFiltersRouter(cache));
app.use('/api/v1/reports', createExportRouter());

// WHY: In production, Express serves the built React app.
// In development, Vite's dev server handles the frontend.
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../../client/dist')));

  // WHY: SPA catch-all — React Router handles client-side routing.
  // Without this, direct URL access to /overview returns 404.
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../../../client/dist/index.html'));
  });
}

export { app };

// WHY: Pre-cache the default view (current week) so the first user
// sees data instantly instead of waiting 3-5s on cold load.
async function warmCache() {
  const monday = getMonday(new Date());
  const sunday = getSunday(monday);

  const body = {
    filterGroup: {
      id: 'warmup',
      conjunction: 'and' as const,
      conditions: [{
        id: 'warmup-date',
        field: 'date',
        operator: 'isInWeek' as const,
        value: toISODate(monday),
        valueTo: toISODate(sunday),
      }],
      groups: [],
    },
    page: 1,
    pageSize: 50,
  };

  // WHY: Hit our own endpoint via HTTP to reuse all query logic
  // (OData translation, enrichment, caching). Simpler than
  // extracting and calling the handler function directly.
  const port = env.PORT;
  try {
    const response = await fetch(`http://localhost:${port}/api/v1/reports/grv-log/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { meta: { cache: string; executionTimeMs: number }; data: unknown[] };
    console.log(`[warmup] Pre-cached current week: ${data.data.length} rows in ${data.meta.executionTimeMs}ms`);
  } catch (err) {
    console.warn('[warmup] Cache warming failed:', err);
  }
}

// WHY: Only start listening when run directly (not when imported by tests).
const isDirectRun = require.main === module ||
  process.argv[1]?.includes('tsx');

if (isDirectRun) {
  app.listen(env.PORT, async () => {
    const cacheConnected = await cache.isConnected();
    logStartup({
      port: env.PORT,
      environment: env.NODE_ENV,
      cacheStatus: cacheConnected ? 'connected' : 'disconnected',
    });
    console.log(`Server running on http://localhost:${env.PORT}`);
    // WHY: Fire-and-forget — don't block server readiness on cache warming
    warmCache();
  });
}
