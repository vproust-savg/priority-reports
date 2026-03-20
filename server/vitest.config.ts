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
  test: { globals: true },
});
