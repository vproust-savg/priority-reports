// ═══════════════════════════════════════════════════════════════
// FILE: client/src/test/setup.ts
// PURPOSE: Vitest global setup — extends expect with DOM matchers.
// USED BY: vitest.config.ts (setupFiles)
// ═══════════════════════════════════════════════════════════════

import '@testing-library/jest-dom/vitest';

// WHY: jsdom doesn't implement matchMedia. Components using useReducedMotion
// (which calls window.matchMedia) need this stub to render in tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
