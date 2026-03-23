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
  { key: 'quantity', label: 'Quantity', filterType: 'number', filterLocation: 'server', odataField: 'QUANT' },
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

describe('date equals/notEquals', () => {
  it('builds equals with T00:00:00Z suffix', () => {
    const group = makeGroup([makeCond('date', 'equals', '2026-01-15')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE eq 2026-01-15T00:00:00Z');
  });
  it('builds notEquals with T00:00:00Z suffix', () => {
    const group = makeGroup([makeCond('date', 'notEquals', '2026-01-15')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('CURDATE ne 2026-01-15T00:00:00Z');
  });
});

describe('number type operators', () => {
  it.each([
    ['equals', '42', 'QUANT eq 42'],
    ['notEquals', '42', 'QUANT ne 42'],
    ['greaterThan', '100', 'QUANT gt 100'],
    ['lessThan', '5', 'QUANT lt 5'],
    ['greaterOrEqual', '10', 'QUANT ge 10'],
    ['lessOrEqual', '50', 'QUANT le 50'],
  ])('builds %s', (op, val, expected) => {
    expect(buildODataFilter(makeGroup([makeCond('quantity', op, val)]), COLUMNS)).toBe(expected);
  });
  it('builds between as ge/le range', () => {
    const group = makeGroup([makeCond('quantity', 'between', '10', '20')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('QUANT ge 10 and QUANT le 20');
  });
});

describe('isEmpty/isNotEmpty for non-text/enum types', () => {
  it.each([
    ['date', 'isEmpty'], ['date', 'isNotEmpty'],
    ['quantity', 'isEmpty'], ['quantity', 'isNotEmpty'],
    ['total', 'isEmpty'], ['total', 'isNotEmpty'],
  ] as const)('returns undefined for %s %s', (field, op) => {
    expect(buildODataFilter(makeGroup([makeCond(field, op)]), COLUMNS)).toBeUndefined();
  });
});

describe('missing valueTo edge cases', () => {
  it.each([
    ['date', 'isBetween', '2026-01-01'],
    ['date', 'isInWeek', '2026-03-16'],
    ['total', 'between', '10'],
  ] as const)('returns undefined for %s %s missing valueTo', (field, op, val) => {
    expect(buildODataFilter(makeGroup([makeCond(field, op, val)]), COLUMNS)).toBeUndefined();
  });
});

describe('numeric edge cases', () => {
  it('handles zero value', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', '0')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE gt 0');
  });
  it('handles negative number', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', '-5')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE gt -5');
  });
  it('handles float', () => {
    const group = makeGroup([makeCond('total', 'greaterThan', '10.5')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE gt 10.5');
  });
  it('builds currency equals', () => {
    const group = makeGroup([makeCond('total', 'equals', '99.99')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE eq 99.99');
  });
  it('builds currency notEquals', () => {
    const group = makeGroup([makeCond('total', 'notEquals', '0')]);
    expect(buildODataFilter(group, COLUMNS)).toBe('TOTPRICE ne 0');
  });
});

describe('text edge cases', () => {
  it('handles ampersand in value', () => {
    expect(buildODataFilter(makeGroup([makeCond('docNo', 'equals', 'A&B')]), COLUMNS)).toBe("DOCNO eq 'A&B'");
  });
  it('handles backslash in value', () => {
    expect(buildODataFilter(makeGroup([makeCond('docNo', 'equals', 'A\\B')]), COLUMNS)).toBe("DOCNO eq 'A\\B'");
  });
  it.each(['notContains', 'startsWith', 'endsWith'])('skips %s', (op) => {
    expect(buildODataFilter(makeGroup([makeCond('docNo', op, 'GRV')]), COLUMNS)).toBeUndefined();
  });
  it('builds text notEquals', () => {
    expect(buildODataFilter(makeGroup([makeCond('docNo', 'notEquals', 'GRV-001')]), COLUMNS)).toBe("DOCNO ne 'GRV-001'");
  });
  it('builds text isNotEmpty', () => {
    expect(buildODataFilter(makeGroup([makeCond('docNo', 'isNotEmpty')]), COLUMNS)).toBe("DOCNO ne ''");
  });
});

describe('complex nesting', () => {
  it('handles AND → OR → AND nesting', () => {
    const innerAnd = makeGroup([makeCond('status', 'equals', 'Cancelled')], 'and');
    innerAnd.id = 'nested2';
    const orChild = makeGroup(
      [makeCond('status', 'equals', 'Received')],
      'or',
      [innerAnd],
    );
    orChild.id = 'nested1';
    const group = makeGroup([makeCond('vendor', 'equals', 'ACME')], 'and', [orChild]);
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME' and (STATDES eq 'Received' or (STATDES eq 'Cancelled'))");
  });
  it('handles multiple nested OR groups in parent AND', () => {
    const orGroup1 = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('status', 'equals', 'Cancelled'),
    ], 'or');
    orGroup1.id = 'nested1';
    const orGroup2 = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('vendor', 'equals', 'Beta'),
    ], 'or');
    orGroup2.id = 'nested2';
    const group = makeGroup([], 'and', [orGroup1, orGroup2]);
    expect(buildODataFilter(group, COLUMNS)).toBe("(STATDES eq 'Received' or STATDES eq 'Cancelled') and (SUPNAME eq 'ACME' or SUPNAME eq 'Beta')");
  });
  it('returns undefined for empty group', () => {
    const group = makeGroup([], 'and', []);
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('returns undefined when all conditions are client-side in AND group', () => {
    const group = makeGroup([
      makeCond('driverId', 'equals', '123'),
      makeCond('driverId', 'equals', '456'),
    ], 'and');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
});

describe('OR group safety — additional', () => {
  it('skips OR with unknown field in conditions', () => {
    const group = makeGroup([
      makeCond('vendor', 'equals', 'ACME'),
      makeCond('unknownField', 'equals', 'x'),
    ], 'or');
    expect(buildODataFilter(group, COLUMNS)).toBeUndefined();
  });
  it('parent AND keeps own conditions, skips mixed child OR', () => {
    const mixedOr = makeGroup([
      makeCond('status', 'equals', 'Received'),
      makeCond('driverId', 'equals', '123'),
    ], 'or');
    mixedOr.id = 'nested1';
    const group = makeGroup(
      [makeCond('vendor', 'equals', 'ACME')],
      'and',
      [mixedOr],
    );
    expect(buildODataFilter(group, COLUMNS)).toBe("SUPNAME eq 'ACME'");
  });
});
