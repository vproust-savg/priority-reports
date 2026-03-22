// ═══════════════════════════════════════════════════════════════
// FILE: client/vitest.config.ts
// PURPOSE: Vitest configuration — jsdom environment, React Testing
//          Library, and @shared alias matching vite.config.ts.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
