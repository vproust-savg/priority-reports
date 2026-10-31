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

describe('grv-log widget disableCache', () => {
  it('is set to true on the grv-log widget', () => {
    const receivingLog = pages.find((p) => p.id === 'receiving-log')!;
    const grvLogWidget = receivingLog.widgets.find((w) => w.id === 'grv-log')!;
    expect(grvLogWidget.disableCache).toBe(true);
  });
});

describe('customer-returns page configuration', () => {
  it('customer-returns page exists under food-safety', () => {
    const page = pages.find((p) => p.id === 'customer-returns');
    expect(page).toBeDefined();
    expect(page!.department).toBe('food-safety');
    expect(page!.path).toBe('/customer-returns');
    expect(page!.name).toBe('Customer Returns');
  });

  it('customer-returns has one widget referencing reportId customer-returns', () => {
    const page = pages.find((p) => p.id === 'customer-returns')!;
    expect(page.widgets).toHaveLength(1);
    const w = page.widgets[0];
    expect(w.reportId).toBe('customer-returns');
    expect(w.type).toBe('table');
    expect(w.disableCache).toBe(true);
    expect(w.colSpan).toBe(12);
  });

  it('findWidgetByReportId returns disableCache:true for customer-returns', () => {
    const w = findWidgetByReportId('customer-returns');
    expect(w).toBeDefined();
    expect(w!.disableCache).toBe(true);
  });

  it('Receiving Log and Customer Returns are sibling tabs under food-safety', () => {
    const foodSafetyPages = pages.filter((p) => p.department === 'food-safety');
    const ids = foodSafetyPages.map((p) => p.id);
    expect(ids).toContain('receiving-log');
    expect(ids).toContain('customer-returns');
  });
});

describe('clientSidePagination mirrors the server opt-in', () => {
  // WHY: The server returns the whole result set for these reports no matter
  // which page is requested. Without the widget flag, every "Next" click
  // changes the query key, misses the Redis cache (keyed by page) and
  // re-pulls Priority — ~30 s per page on BBD (Victor, 2026-09-11).
  it.each(['bbd', 'customer-returns', 'customer-returns-supabase'])('%s widget paginates locally', (reportId) => {
    expect(findWidgetByReportId(reportId)?.clientSidePagination).toBe(true);
  });
});

describe('env toggle config', () => {
  it('grv-log widget enables the env toggle', () => {
    const grv = pages.flatMap((p) => p.widgets).find((w) => w.reportId === 'grv-log');
    expect(grv?.envToggle).toBe(true);
  });
});

describe('receiving-log-supabase hidden page', () => {
  const page = pages.find((p) => p.id === 'receiving-log-supabase');

  it('exists under food-safety, hidden from the nav', () => {
    expect(page).toBeDefined();
    expect(page!.department).toBe('food-safety');
    expect(page!.name).toBe('Receiving Log (Supabase)');
    expect(page!.path).toBe('/receiving-log-supabase');
    expect(page!.hiddenFromNav).toBe(true);
  });

  it('widget has no env toggle and mirrors the server opt-ins', () => {
    expect(page!.widgets).toHaveLength(1);
    const w = page!.widgets[0];
    expect(w.id).toBe('grv-log-supabase');
    expect(w.reportId).toBe('grv-log-supabase');
    expect(w.title).toBe('GRV Log — Goods Receiving Vouchers');
    expect(w.envToggle).toBeUndefined();
    expect(w.disableCache).toBe(true);
    expect(w.clientSidePagination).toBe(true);
    expect(w.sourceRefresh).toBe(true);
  });

  it('the original receiving-log page stays visible and unchanged', () => {
    const old = pages.find((p) => p.id === 'receiving-log')!;
    expect(old.hiddenFromNav).toBeUndefined();
    expect(old.widgets[0].envToggle).toBe(true);
    expect(old.widgets[0].sourceRefresh).toBeUndefined();
  });
});

describe('customer-returns-supabase hidden page', () => {
  const page = pages.find((p) => p.id === 'customer-returns-supabase');

  it('exists under food-safety, hidden from the nav', () => {
    expect(page).toBeDefined();
    expect(page!.department).toBe('food-safety');
    expect(page!.name).toBe('Customer Returns (Supabase)');
    expect(page!.path).toBe('/customer-returns-supabase');
    expect(page!.hiddenFromNav).toBe(true);
  });

  it('widget mirrors the server opt-ins and has no refresh button', () => {
    expect(page!.widgets).toHaveLength(1);
    const w = page!.widgets[0];
    expect(w.id).toBe('customer-returns-supabase');
    expect(w.reportId).toBe('customer-returns-supabase');
    expect(w.type).toBe('table');
    expect(w.title).toBe('Customer Returns');
    expect(w.colSpan).toBe(12);
    expect(w.disableCache).toBe(true);
    expect(w.clientSidePagination).toBe(true);
    expect(w.sourceRefresh).toBeFalsy();
  });

  it('the original customer-returns page stays visible', () => {
    expect(pages.find((p) => p.id === 'customer-returns')!.hiddenFromNav).toBeUndefined();
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
