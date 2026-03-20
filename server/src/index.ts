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
import { createReportsRouter } from './routes/reports';
import { createFiltersRouter } from './routes/filters';
import { logStartup } from './services/logger';

const app = express();

app.use(cors());
app.use(express.json());

const cache = createCacheProvider();

// Mount API routes
app.use('/api/v1/health', createHealthRouter(cache));
app.use('/api/v1/reports', createReportsRouter(cache));
app.use('/api/v1/reports', createFiltersRouter(cache));

// WHY: In production, Express serves the built React app.
// In development, Vite's dev server handles the frontend.
if (env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../../client/dist')));

  // WHY: SPA catch-all — React Router handles client-side routing.
  // Without this, direct URL access to /overview returns 404.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../../../client/dist/index.html'));
  });
}

export { app };

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
  });
}
