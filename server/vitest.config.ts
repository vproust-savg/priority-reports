// ═══════════════════════════════════════════════════════════════
// FILE: server/vitest.config.ts
// PURPOSE: Vitest configuration with @shared path alias mirroring tsconfig.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@shared': resolve(__dirname, '../shared') },
  },
  test: {
    globals: true,
    // WHY: shared/ utilities are consumed by both server and client; running
    // their tests from the server config avoids duplicating a separate test runner.
    include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)', '../shared/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});
