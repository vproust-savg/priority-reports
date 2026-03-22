// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/odataFilterBuilder.test.ts
// PURPOSE: Tests for OData filter string generation from FilterGroup
//          trees. Covers all operators, edge cases, and safety checks.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildODataFilter, escapeODataString } from '../src/services/odataFilterBuilder';
import type { FilterGroup, FilterCondition, ColumnFilterMeta } from '@shared/types';

const COLUMNS: ColumnFilterMeta[] = [
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', odataField: 'CURDATE' },
  { key: 'vendor', label: 'Vendor', filterType: 'enum', filterLocation: 'server', odataField: 'SUPNAME', enumKey: 'vendors' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', odataField: 'STATDES', enumKey: 'statuses' },
  { key: 'total', label: 'Total', filterType: 'currency', filterLocation: 'server', odataField: 'TOTPRICE' },
  { key: 'docNo', label: 'GRV #', filterType: 'text', filterLocation: 'server', odataField: 'DOCNO' },
  { key: 'driverId', label: 'Driver ID', filterType: 'text', filterLocation: 'client' },
];

function makeGroup(
  conditions: FilterCondition[],
  conjunction: 'and' | 'or' = 'and',
  groups: FilterGroup[] = [],
): FilterGroup {
  return { id: 'root', conjunction, conditions, groups };
}

function makeCond(
  field: string, operator: string, value = '', valueTo?: string,
): FilterCondition {
  return { id: 'c1', field, operator: operator as FilterCondition['operator'], value, valueTo };
}

describe('escapeODataString', () => {
  it('doubles single quotes', () => {
    expect(escapeODataString("O'Brien")).toBe("O''Brien");
  });
  it('handles multiple quotes', () => {
    expect(escapeODataString("it's a 'test'")).toBe("it''s a ''test''");
  });
  it('returns unchanged string without quotes', () => {
    expect(escapeODataString('ACME Corp')).toBe('ACME Corp');
  });
});

describe('text/enum operators', () => {
  it('builds equals for text', () => {
    const group = makeGroup([makeCond('docNo', 'equals', 'GRV-001')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("DOCNO eq 'GRV-001'");
  });
  it('builds notEquals for enum', () => {
    const group = makeGroup([makeCond('status', 'notEquals', 'Received')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES ne 'Received'");
  });
  it('builds isEmpty for text', () => {
    const group = makeGroup([makeCond('docNo', 'isEmpty')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("DOCNO eq ''");
  });
  it('builds isNotEmpty for enum', () => {
    const group = makeGroup([makeCond('vendor', 'isNotEmpty')]);
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME ne ''");
  });
  it('escapes quotes in values', () => {
    const group = makeGroup([makeCond('vendor', 'equals', "O'Brien")]);
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'O''Brien'");
  });
});

describe('date operators', () => {
  it('builds isBefore with T00:00:00Z suffix', () => {
    const group = makeGroup([makeCond('date', 'isBefore', '2026-01-15')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE lt 2026-01-15T00:00:00Z');
  });
  it('builds isAfter', () => {
    const group = makeGroup([makeCond('date', 'isAfter', '2026-02-20')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE gt 2026-02-20T00:00:00Z');
  });
  it('builds isOnOrBefore with T23:59:59Z suffix', () => {
    const group = makeGroup([makeCond('date', 'isOnOrBefore', '2026-03-10')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE le 2026-03-10T23:59:59Z');
  });
  it('builds isOnOrAfter', () => {
    const group = makeGroup([makeCond('date', 'isOnOrAfter', '2026-03-10')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-03-10T00:00:00Z');
  });
  it('builds isBetween as ge/le range', () => {
    const group = makeGroup([makeCond('date', 'isBetween', '2026-01-01', '2026-01-31')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-01-01T00:00:00Z and CURDATE le 2026-01-31T23:59:59Z');
  });
  it('builds isInWeek same as isBetween', () => {
    const group = makeGroup([makeCond('date', 'isInWeek', '2026-03-16', '2026-03-22')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ge 2026-03-16T00:00:00Z and CURDATE le 2026-03-22T23:59:59Z');
  });
  it('returns undefined for invalid date format', () => {
    const group = makeGroup([makeCond('date', 'isBefore', 'not-a-date')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('returns undefined for inverted date range', () => {
    const group = makeGroup([makeCond('date', 'isBetween', '2026-12-31', '2026-01-01')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
});

describe('numeric operators', () => {
  it('builds greaterThan', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', '100')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE gt 100');
  });
  it('builds lessThan', () => {
    const group = makeGroup([makeCond('total', 'lessThan', '50')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE lt 50');
  });
  it('builds between as ge/le range', () => {
    const group = makeGroup([makeCond('total', 'between', '10', '200')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE ge 10 and TOTPRICE le 200');
  });
  it('builds greaterOrEqual', () => {
    const group = makeGroup([makeCond('total', 'greaterOrEqual', '100')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE ge 100');
  });
  it('builds lessOrEqual', () => {
    const group = makeGroup([makeCond('total', 'lessOrEqual', '50')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE le 50');
  });
  it('returns undefined for NaN value', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', 'abc')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('returns undefined for inverted numeric range', () => {
    const group = makeGroup([makeCond('total', 'between', '200', '10')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
});

describe('conjunctions', () => {
  it('joins AND conditions with "and"', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('status', 'equals', 'Received'),
    ], 'and');
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME' and STATDES eq 'Received'");
  });
  it('joins OR conditions with "or"', () => {
    const group = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('status', 'equals', 'Cancelled'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES eq 'Received' or STATDES eq 'Cancelled'");
  });
});

describe('client-side skipping', () => {
  it('skips client-only columns', () => {
    const group = makeGroup([makeCond('driverId', 'equals', '123')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips client-only operators (contains)', () => {
    const group = makeGroup([makeCond('vendor', 'contains', 'ACM')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips conditions with unknown field', () => {
    const group = makeGroup([makeCond('unknown', 'equals', 'x')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips empty conditions (no field)', () => {
    const group = makeGroup([makeCond('', 'equals', 'x')]);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('filters only server-side conditions in AND group', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('driverId', 'contains', '123'),
    ], 'and');
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME'");
  });
});

describe('OR-group safety (isFullyServerSide)', () => {
  it('skips entire OR group with any client-side condition', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('driverId', 'equals', '123'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('skips entire OR group with client-only operator', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('docNo', 'contains', 'GRV'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('keeps OR group when fully server-side', () => {
    const group = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('status', 'equals', 'Cancelled'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBe("STATDES eq 'Received' or STATDES eq 'Cancelled'");
  });
});

describe('nested groups', () => {
  it('wraps nested group in parentheses', () => {
    const group = makeGroup(
      [makeCond('vendor', 'equals', 'ACME')],
      'and',
      [makeGroup([
        makeCond('status', 'equals', 'Received'),
        makeCond('status', 'equals', 'Cancelled'),
      ], 'or')],
    );
    group.groups[0].id = 'nested';
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME' and (STATDES eq 'Received' or STATDES eq 'Cancelled')");
  });
  it('skips nested OR group with client-side conditions', () => {
    const group = makeGroup(
      [makeCond('vendor', 'equals', 'ACME')],
      'and',
      [makeGroup([
        makeCond('status', 'equals', 'Received'),
        makeCond('driverId', 'equals', '123'),
      ], 'or')],
    );
    group.groups[0].id = 'nested';
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME'");
  });
});
