// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.test.ts
// PURPOSE: Validates page config integrity — every page references
//          a valid department, unique IDs, valid paths.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { pages } from './pages';
import { departments } from './departments';

describe('pages config', () => {
  it('has at least one page', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it('every page has unique id', () => {
    const ids = pages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every page references a valid department', () => {
    const deptIds = new Set(departments.map((d) => d.id));
    for (const page of pages) {
      expect(deptIds.has(page.department)).toBe(true);
    }
  });

  it('every page path starts with /', () => {
    for (const page of pages) {
      expect(page.path).toMatch(/^\//);
    }
  });

  it('every department has at least one page', () => {
    for (const dept of departments) {
      const deptPages = pages.filter((p) => p.department === dept.id);
      expect(deptPages.length).toBeGreaterThan(0);
    }
  });
});
