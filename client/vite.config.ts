// ═══════════════════════════════════════════════════════════════
// FILE: client/vite.config.ts
// PURPOSE: Vite configuration — React, Tailwind v4, @shared alias,
//          and API proxy to Express in development.
// USED BY: npm run dev, npm run build
// ═══════════════════════════════════════════════════════════════

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // WHY: Proxy API calls to Express in development.
      // In production, Express serves both API and static files.
      '/api': 'http://localhost:3001',
    },
  },
});
