// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/pages.test.ts
// PURPOSE: Validates page config integrity — every page references
//          a valid department, unique IDs, valid paths.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { pages, findWidgetByReportId } from './pages';
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

describe('env toggle config', () => {
  it('grv-log widget enables the env toggle', () => {
    const grv = pages.flatMap((p) => p.widgets).find((w) => w.reportId === 'grv-log');
    expect(grv?.envToggle).toBe(true);
  });
});
