// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.test.ts
// PURPOSE: Validates page config integrity — every page references
//          a valid department, unique IDs, valid paths.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { pages, findWidgetByReportId, firstVisiblePage } from './pages';
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

describe('staff report pages', () => {
  it('lists only Receiving Log and Customer Returns', () => {
    expect(pages.map(page => page.id)).toEqual(['receiving-log', 'customer-returns']);
  });

  it.each([
    ['receiving-log', 'grv-log-supabase'],
    ['customer-returns', 'customer-returns-supabase'],
  ])('%s reads and refreshes the Supabase report', (id, reportId) => {
    const page = pages.find(page => page.id === id)!;
    expect(page.path).toBe('/' + id);
    expect(page.department).toBe('food-safety');
    expect(page.widgets.map(widget => widget.reportId)).toEqual([reportId]);
    expect(findWidgetByReportId(reportId)).toMatchObject({
      sourceRefresh: true, clientSidePagination: true, disableCache: true,
    });
  });
});

describe('firstVisiblePage', () => {
  it('skips hidden pages', () => {
    const list = [
      { id: 'a', department: 'd', name: 'A', path: '/a', hiddenFromNav: true, widgets: [] },
      { id: 'b', department: 'd', name: 'B', path: '/b', widgets: [] },
    ];
    expect(firstVisiblePage(list)?.id).toBe('b');
  });

  it('falls back to the first page when every page is hidden', () => {
    const list = [{ id: 'a', department: 'd', name: 'A', path: '/a', hiddenFromNav: true, widgets: [] }];
    expect(firstVisiblePage(list)?.id).toBe('a');
  });

  it('returns undefined for an empty list', () => {
    expect(firstVisiblePage([])).toBeUndefined();
  });

  it('food-safety lands on receiving-log', () => {
    const foodSafety = pages.filter((p) => p.department === 'food-safety');
    expect(firstVisiblePage(foodSafety)?.id).toBe('receiving-log');
  });
});
