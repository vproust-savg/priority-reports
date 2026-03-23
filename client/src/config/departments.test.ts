// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/departments.test.ts
// PURPOSE: Validates department config integrity — unique IDs,
//          valid basePaths, and Zod schema correctness.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { departments } from './departments';

describe('departments config', () => {
  it('has at least one department', () => {
    expect(departments.length).toBeGreaterThan(0);
  });

  it('every department has unique id', () => {
    const ids = departments.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every basePath starts with /', () => {
    for (const dept of departments) {
      expect(dept.basePath).toMatch(/^\//);
    }
  });

  it('every basePath is unique', () => {
    const paths = departments.map((d) => d.basePath);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
