// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/querySchemas.test.ts
// PURPOSE: Tests for Zod validation schemas (QueryRequestSchema,
//          FilterGroupSchema). Covers valid inputs, missing fields,
//          invalid operators, and defensive caps.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { QueryRequestSchema, FilterGroupSchema } from '../src/routes/querySchemas';

function validFilterGroup() {
  return {
    id: 'root',
    conjunction: 'and' as const,
    conditions: [
      { id: 'c1', field: 'vendor', operator: 'equals', value: 'ACME' },
    ],
    groups: [],
  };
}

function validRequest() {
  return {
    filterGroup: validFilterGroup(),
    page: 1,
    pageSize: 50,
  };
}

describe('QueryRequestSchema', () => {
  it('parses a valid request', () => {
    const result = QueryRequestSchema.parse(validRequest());
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.filterGroup.id).toBe('root');
  });

  it('applies default page=1 when omitted', () => {
    const { page, ...rest } = validRequest();
    const result = QueryRequestSchema.parse(rest);
    expect(result.page).toBe(1);
  });

  it('applies default pageSize=50 when omitted', () => {
    const { pageSize, ...rest } = validRequest();
    const result = QueryRequestSchema.parse(rest);
    expect(result.pageSize).toBe(50);
  });

  it('rejects page < 1', () => {
    expect(() => QueryRequestSchema.parse({ ...validRequest(), page: 0 })).toThrow();
  });

  it('rejects pageSize > 1000', () => {
    expect(() => QueryRequestSchema.parse({ ...validRequest(), pageSize: 1001 })).toThrow();
  });

  it('rejects pageSize < 1', () => {
    expect(() => QueryRequestSchema.parse({ ...validRequest(), pageSize: 0 })).toThrow();
  });
});

describe('FilterGroupSchema', () => {
  it('parses a valid filter group', () => {
    const result = FilterGroupSchema.parse(validFilterGroup());
    expect(result.conjunction).toBe('and');
    expect(result.conditions).toHaveLength(1);
  });

  it('rejects missing id on group', () => {
    const group = { ...validFilterGroup() };
    delete (group as any).id;
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('rejects missing id on condition', () => {
    const group = validFilterGroup();
    delete (group.conditions[0] as any).id;
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('rejects invalid operator', () => {
    const group = validFilterGroup();
    (group.conditions[0] as any).operator = 'invalidOp';
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('rejects invalid conjunction', () => {
    const group = { ...validFilterGroup(), conjunction: 'xor' };
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('applies default value="" when value omitted', () => {
    const group = validFilterGroup();
    delete (group.conditions[0] as any).value;
    const result = FilterGroupSchema.parse(group);
    expect(result.conditions[0].value).toBe('');
  });

  it('allows valueTo to be optional', () => {
    const group = validFilterGroup();
    const result = FilterGroupSchema.parse(group);
    expect(result.conditions[0].valueTo).toBeUndefined();
  });

  it('parses valueTo when provided', () => {
    const group = validFilterGroup();
    group.conditions[0].operator = 'between';
    (group.conditions[0] as any).valueTo = '100';
    const result = FilterGroupSchema.parse(group);
    expect(result.conditions[0].valueTo).toBe('100');
  });

  it('rejects > 50 conditions', () => {
    const group = validFilterGroup();
    group.conditions = Array.from({ length: 51 }, (_, i) => ({
      id: `c${i}`, field: 'vendor', operator: 'equals' as const, value: `v${i}`,
    }));
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('allows exactly 50 conditions', () => {
    const group = validFilterGroup();
    group.conditions = Array.from({ length: 50 }, (_, i) => ({
      id: `c${i}`, field: 'vendor', operator: 'equals' as const, value: `v${i}`,
    }));
    expect(() => FilterGroupSchema.parse(group)).not.toThrow();
  });

  it('rejects > 10 nested groups', () => {
    const group = validFilterGroup();
    group.groups = Array.from({ length: 11 }, (_, i) => ({
      id: `g${i}`, conjunction: 'or' as const,
      conditions: [{ id: `c${i}`, field: 'vendor', operator: 'equals' as const, value: 'x' }],
      groups: [],
    }));
    expect(() => FilterGroupSchema.parse(group)).toThrow();
  });

  it('allows exactly 10 nested groups', () => {
    const group = validFilterGroup();
    group.groups = Array.from({ length: 10 }, (_, i) => ({
      id: `g${i}`, conjunction: 'or' as const,
      conditions: [{ id: `c${i}`, field: 'vendor', operator: 'equals' as const, value: 'x' }],
      groups: [],
    }));
    expect(() => FilterGroupSchema.parse(group)).not.toThrow();
  });

  it('supports recursive nesting (group inside group)', () => {
    const group = validFilterGroup();
    group.groups = [{
      id: 'g1', conjunction: 'or' as const,
      conditions: [],
      groups: [{
        id: 'g2', conjunction: 'and' as const,
        conditions: [{ id: 'c2', field: 'vendor', operator: 'equals' as const, value: 'x' }],
        groups: [],
      }],
    }];
    expect(() => FilterGroupSchema.parse(group)).not.toThrow();
  });

  it('accepts all valid operators', () => {
    const operators = [
      'equals', 'notEquals', 'isEmpty', 'isNotEmpty',
      'contains', 'notContains', 'startsWith', 'endsWith',
      'isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isBetween', 'isInWeek',
      'greaterThan', 'lessThan', 'greaterOrEqual', 'lessOrEqual', 'between',
    ];
    for (const op of operators) {
      const group = validFilterGroup();
      group.conditions[0].operator = op as any;
      expect(() => FilterGroupSchema.parse(group)).not.toThrow();
    }
  });
});
