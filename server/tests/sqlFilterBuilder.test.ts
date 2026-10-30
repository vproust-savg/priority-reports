// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/sqlFilterBuilder.test.ts
// PURPOSE: Tests buildSqlWhere (FilterGroup -> parameterized Postgres WHERE).
//          Covers every operator per type, injection safety, LIKE escaping,
//          group nesting, param numbering, and a parity table proving text,
//          enum and number filters select the same rows as
//          applyServerClientFilters.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildSqlWhere } from '../src/services/sqlFilterBuilder';
import { applyServerClientFilters } from '../src/services/serverClientFilter';
import type { FilterCondition, FilterGroup, FilterOperator, ColumnFilterMeta } from '@shared/types';

const columns: ColumnFilterMeta[] = [
  { key: 'vendor', label: 'Vendor', filterType: 'text', filterLocation: 'server', sqlColumn: 'vendor' },
  { key: 'status', label: 'Status', filterType: 'enum', filterLocation: 'server', sqlColumn: 'status' },
  { key: 'qty', label: 'Qty', filterType: 'number', filterLocation: 'server', sqlColumn: 'qty' },
  { key: 'cost', label: 'Cost', filterType: 'currency', filterLocation: 'server', sqlColumn: 'cost' },
  { key: 'date', label: 'Date', filterType: 'date', filterLocation: 'server', sqlColumn: 'receipt_date' },
  { key: 'noSql', label: 'No SQL', filterType: 'text', filterLocation: 'server' },
  { key: 'badIdent', label: 'Bad', filterType: 'text', filterLocation: 'server', sqlColumn: 'x"; drop table t; --' },
];

let nextId = 0;
function cond(field: string, operator: FilterOperator, value = '', valueTo?: string): FilterCondition {
  return { id: `c${nextId++}`, field, operator, value, ...(valueTo !== undefined ? { valueTo } : {}) };
}
function group(
  conditions: FilterCondition[], conjunction: 'and' | 'or' = 'and', groups: FilterGroup[] = [],
): FilterGroup {
  return { id: `g${nextId++}`, conjunction, conditions, groups };
}
function build(c: FilterCondition) {
  return buildSqlWhere(group([c]), columns);
}

const T = `lower(coalesce("vendor", ''))`;

describe('text and enum operators', () => {
  it('equals', () => {
    expect(build(cond('vendor', 'equals', 'Acme'))).toEqual({ clause: `${T} = lower($1)`, params: ['Acme'] });
  });
  it('notEquals', () => {
    expect(build(cond('vendor', 'notEquals', 'Acme'))).toEqual({ clause: `${T} <> lower($1)`, params: ['Acme'] });
  });
  it('contains', () => {
    expect(build(cond('vendor', 'contains', 'ac'))).toEqual({
      clause: `${T} LIKE '%' || lower($1) || '%' ESCAPE '\\'`, params: ['ac'],
    });
  });
  it('notContains', () => {
    expect(build(cond('vendor', 'notContains', 'ac'))).toEqual({
      clause: `${T} NOT LIKE '%' || lower($1) || '%' ESCAPE '\\'`, params: ['ac'],
    });
  });
  it('startsWith', () => {
    expect(build(cond('vendor', 'startsWith', 'ac'))).toEqual({
      clause: `${T} LIKE lower($1) || '%' ESCAPE '\\'`, params: ['ac'],
    });
  });
  it('endsWith', () => {
    expect(build(cond('vendor', 'endsWith', 'me'))).toEqual({
      clause: `${T} LIKE '%' || lower($1) ESCAPE '\\'`, params: ['me'],
    });
  });
  it('isEmpty takes no param', () => {
    expect(build(cond('vendor', 'isEmpty'))).toEqual({
      clause: `btrim(coalesce("vendor", '')) = ''`, params: [],
    });
  });
  it('isNotEmpty takes no param', () => {
    expect(build(cond('vendor', 'isNotEmpty'))).toEqual({
      clause: `btrim(coalesce("vendor", '')) <> ''`, params: [],
    });
  });
  it('enum columns use the same case-insensitive rule', () => {
    expect(build(cond('status', 'equals', 'Final'))).toEqual({
      clause: `lower(coalesce("status", '')) = lower($1)`, params: ['Final'],
    });
  });
  it('skips a text condition with an empty value', () => {
    expect(build(cond('vendor', 'equals', ''))).toEqual({ clause: undefined, params: [] });
  });
  it('skips number operators on a text column', () => {
    expect(build(cond('vendor', 'greaterThan', '5'))).toEqual({ clause: undefined, params: [] });
  });
});

describe('number and currency operators', () => {
  const N = `coalesce("qty", 0)`;
  it.each([
    ['equals', '='], ['notEquals', '<>'], ['greaterThan', '>'], ['lessThan', '<'],
    ['greaterOrEqual', '>='], ['lessOrEqual', '<='],
  ] as const)('%s binds a number', (op, sql) => {
    expect(build(cond('qty', op, '5.5'))).toEqual({ clause: `${N} ${sql} $1`, params: [5.5] });
  });
  it('between binds both bounds', () => {
    expect(build(cond('qty', 'between', '1', '9'))).toEqual({
      clause: `${N} BETWEEN $1 AND $2`, params: [1, 9],
    });
  });
  it('currency columns behave like number columns', () => {
    expect(build(cond('cost', 'greaterThan', '10'))).toEqual({
      clause: `coalesce("cost", 0) > $1`, params: [10],
    });
  });
  it('skips NaN values', () => {
    expect(build(cond('qty', 'greaterThan', 'abc'))).toEqual({ clause: undefined, params: [] });
    expect(build(cond('qty', 'between', '1', 'x'))).toEqual({ clause: undefined, params: [] });
    expect(build(cond('qty', 'between', '1'))).toEqual({ clause: undefined, params: [] });
  });
  it('skips between when lo > hi', () => {
    expect(build(cond('qty', 'between', '9', '1'))).toEqual({ clause: undefined, params: [] });
  });
  // WHY: a text-cast on a numeric column would be a Postgres type error, so
  // emptiness on numbers is a NULL test (matches the JS filter: only null/undefined is empty).
  it('isEmpty / isNotEmpty on a number column test NULL', () => {
    expect(build(cond('qty', 'isEmpty'))).toEqual({ clause: `"qty" IS NULL`, params: [] });
    expect(build(cond('qty', 'isNotEmpty'))).toEqual({ clause: `"qty" IS NOT NULL`, params: [] });
  });
  it('skips text operators on a number column', () => {
    expect(build(cond('qty', 'contains', '5'))).toEqual({ clause: undefined, params: [] });
  });
});

describe('date operators (odataFilterBuilder semantics: inclusive day bounds)', () => {
  const D = `"receipt_date"`;
  it.each([
    ['equals', '='], ['notEquals', '<>'], ['isBefore', '<'], ['isAfter', '>'],
    ['isOnOrBefore', '<='], ['isOnOrAfter', '>='],
  ] as const)('%s', (op, sql) => {
    expect(build(cond('date', op, '2026-10-05'))).toEqual({
      clause: `${D} ${sql} $1::date`, params: ['2026-10-05'],
    });
  });
  it.each(['isBetween', 'isInWeek'] as const)('%s is an inclusive range', (op) => {
    expect(build(cond('date', op, '2026-10-05', '2026-10-11'))).toEqual({
      clause: `${D} BETWEEN $1::date AND $2::date`, params: ['2026-10-05', '2026-10-11'],
    });
  });
  it('accepts a single-day range', () => {
    expect(build(cond('date', 'isBetween', '2026-10-05', '2026-10-05')).clause).toBeDefined();
  });
  it('isEmpty / isNotEmpty test NULL', () => {
    expect(build(cond('date', 'isEmpty'))).toEqual({ clause: `${D} IS NULL`, params: [] });
    expect(build(cond('date', 'isNotEmpty'))).toEqual({ clause: `${D} IS NOT NULL`, params: [] });
  });
  it('skips a bad format', () => {
    expect(build(cond('date', 'equals', '10/05/2026'))).toEqual({ clause: undefined, params: [] });
    expect(build(cond('date', 'isBetween', '2026-10-05', 'nope'))).toEqual({ clause: undefined, params: [] });
    expect(build(cond('date', 'isBetween', '2026-10-05'))).toEqual({ clause: undefined, params: [] });
  });
  it('skips an inverted range', () => {
    expect(build(cond('date', 'isBetween', '2026-10-11', '2026-10-05'))).toEqual({ clause: undefined, params: [] });
  });
  it('skips text operators on a date column', () => {
    expect(build(cond('date', 'contains', '2026'))).toEqual({ clause: undefined, params: [] });
  });
});

describe('safety and structure', () => {
  it('binds hostile text as a param', () => {
    const hostile = `x'; drop table t; --`;
    const { clause, params } = build(cond('vendor', 'equals', hostile));
    expect(params).toEqual([hostile]);
    expect(clause).not.toContain('drop table');
    expect(clause).not.toContain(hostile);
  });
  it('escapes LIKE wildcards', () => {
    expect(build(cond('vendor', 'contains', '50%_')).params).toEqual(['50\\%\\_']);
  });
  it('escapes backslashes in LIKE values', () => {
    expect(build(cond('vendor', 'startsWith', 'a\\b')).params).toEqual(['a\\\\b']);
  });
  it('does not escape for equals', () => {
    expect(build(cond('vendor', 'equals', '50%_')).params).toEqual(['50%_']);
  });
  it('skips unknown key / missing sqlColumn / bad identifier / empty field', () => {
    for (const field of ['nope', 'noSql', 'badIdent', '']) {
      expect(build(cond(field, 'equals', 'a'))).toEqual({ clause: undefined, params: [] });
    }
  });
  it('rejects an uppercase or digit-leading sqlColumn', () => {
    const bad: ColumnFilterMeta[] = [
      { key: 'a', label: 'A', filterType: 'text', filterLocation: 'server', sqlColumn: 'Vendor' },
      { key: 'b', label: 'B', filterType: 'text', filterLocation: 'server', sqlColumn: '1vendor' },
    ];
    expect(buildSqlWhere(group([cond('a', 'equals', 'x'), cond('b', 'equals', 'x')]), bad).clause).toBeUndefined();
  });
  it('joins conditions with AND / OR', () => {
    const a = cond('vendor', 'equals', 'a');
    const b = cond('qty', 'greaterThan', '1');
    expect(buildSqlWhere(group([a, b], 'and'), columns).clause).toBe(
      `${T} = lower($1) AND coalesce("qty", 0) > $2`,
    );
    expect(buildSqlWhere(group([a, b], 'or'), columns).clause).toBe(
      `${T} = lower($1) OR coalesce("qty", 0) > $2`,
    );
  });
  it('nested or group parenthesized', () => {
    const nested = group([cond('vendor', 'equals', 'a'), cond('vendor', 'equals', 'b')], 'or');
    const root = group([cond('qty', 'greaterThan', '1')], 'and', [nested]);
    expect(buildSqlWhere(root, columns)).toEqual({
      clause: `coalesce("qty", 0) > $1 AND (${T} = lower($2) OR ${T} = lower($3))`,
      params: [1, 'a', 'b'],
    });
  });
  it('drops an empty subgroup and returns undefined for an empty tree', () => {
    expect(buildSqlWhere(group([]), columns)).toEqual({ clause: undefined, params: [] });
    const root = group([cond('qty', 'greaterThan', '1')], 'and', [group([cond('nope', 'equals', 'x')])]);
    expect(buildSqlWhere(root, columns).clause).toBe(`coalesce("qty", 0) > $1`);
  });
  it('skipped conditions do not consume param numbers', () => {
    const root = group([cond('qty', 'greaterThan', 'abc'), cond('vendor', 'equals', 'a')]);
    expect(buildSqlWhere(root, columns)).toEqual({ clause: `${T} = lower($1)`, params: ['a'] });
  });
  it('firstParamIndex offsets numbering', () => {
    const root = group([cond('vendor', 'equals', 'a'), cond('qty', 'between', '1', '2')]);
    expect(buildSqlWhere(root, columns, 3)).toEqual({
      clause: `${T} = lower($3) AND coalesce("qty", 0) BETWEEN $4 AND $5`,
      params: ['a', 1, 2],
    });
  });
});

// ─── Parity with applyServerClientFilters (text, enum, number) ───────────────
// WHY: Dates are excluded on purpose. The JS filter compares '…T00:00:00Z'
// strings against 'YYYY-MM-DD', so its date equals is wrong by design.

type Row = { vendor: string | null; status: string | null; qty: number | null; cost: number | null };
const rows: Row[] = [
  { vendor: 'Acme Foods', status: 'Final', qty: 10, cost: 100.5 },
  { vendor: 'acme foods', status: 'final', qty: 0, cost: 0 },
  { vendor: 'BETA Corp', status: 'Open', qty: 5, cost: 12 },
  { vendor: null, status: null, qty: null, cost: null },
  { vendor: '', status: '', qty: 3, cost: null },
  { vendor: '   ', status: 'Open', qty: -2, cost: -7.25 },
  { vendor: '50%_off Deli', status: 'Final', qty: 7, cost: 7 },
  { vendor: 'Gamma', status: 'Void', qty: 20, cost: 250 },
];

// WHY: filterLocation 'client' makes applyServerClientFilters evaluate every column.
const parityColumns: ColumnFilterMeta[] = columns
  .filter((c) => ['vendor', 'status', 'qty', 'cost'].includes(c.key))
  .map((c) => ({ ...c, filterLocation: 'client' as const }));

// In-test evaluator of the SQL rules as JS predicates. The bound value comes
// from the real buildSqlWhere output, so escaping and number parsing are exercised.
function likeToRegex(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { out += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (ch === '%') { out += '.*'; continue; }
    if (ch === '_') { out += '.'; continue; }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 's');
}

function evaluateSql(row: Row, c: FilterCondition): boolean | undefined {
  const built = buildSqlWhere(group([c]), parityColumns);
  if (!built.clause) return undefined; // skipped condition
  const meta = parityColumns.find((m) => m.key === c.field)!;
  const raw = row[c.field as keyof Row];
  if (meta.filterType === 'number' || meta.filterType === 'currency') {
    const n = raw ?? 0;
    const [a, b] = built.params as number[];
    switch (c.operator) {
      case 'equals': return n === a;
      case 'notEquals': return n !== a;
      case 'greaterThan': return n > a;
      case 'lessThan': return n < a;
      case 'greaterOrEqual': return n >= a;
      case 'lessOrEqual': return n <= a;
      case 'between': return n >= a && n <= b;
      case 'isEmpty': return raw === null;
      case 'isNotEmpty': return raw !== null;
    }
    throw new Error(`unhandled ${c.operator}`);
  }
  const t = ((raw as string | null) ?? '').toLowerCase();
  const p = built.params[0] as string | undefined;
  const lp = p?.toLowerCase();
  switch (c.operator) {
    case 'equals': return t === lp;
    case 'notEquals': return t !== lp;
    case 'contains': return likeToRegex(`%${lp}%`).test(t);
    case 'notContains': return !likeToRegex(`%${lp}%`).test(t);
    case 'startsWith': return likeToRegex(`${lp}%`).test(t);
    case 'endsWith': return likeToRegex(`%${lp}`).test(t);
    case 'isEmpty': return t.trim() === '';
    case 'isNotEmpty': return t.trim() !== '';
  }
  throw new Error(`unhandled ${c.operator}`);
}

function evaluateSqlGroup(row: Row, g: FilterGroup): boolean {
  const results: boolean[] = [];
  for (const c of g.conditions) {
    const r = evaluateSql(row, c);
    if (r !== undefined) results.push(r);
  }
  for (const sub of g.groups) {
    // An all-skipped subgroup yields no SQL part, mirroring buildSqlWhere.
    if (buildSqlWhere(sub, parityColumns).clause) results.push(evaluateSqlGroup(row, sub));
  }
  if (results.length === 0) return true;
  return g.conjunction === 'and' ? results.every(Boolean) : results.some(Boolean);
}

const parityCases: Array<[string, FilterGroup]> = [
  ['text equals ignores case', group([cond('vendor', 'equals', 'ACME FOODS')])],
  ['text notEquals keeps NULL and empty rows', group([cond('vendor', 'notEquals', 'acme foods')])],
  ['text contains', group([cond('vendor', 'contains', 'FOO')])],
  ['text contains with LIKE wildcards', group([cond('vendor', 'contains', '50%_')])],
  ['text contains underscore only matches literally', group([cond('vendor', 'contains', 'a_me')])],
  ['text notContains keeps NULL rows', group([cond('vendor', 'notContains', 'acme')])],
  ['text startsWith', group([cond('vendor', 'startsWith', 'ACME')])],
  ['text endsWith', group([cond('vendor', 'endsWith', 'CORP')])],
  ['text isEmpty covers NULL, empty and blank', group([cond('vendor', 'isEmpty')])],
  ['text isNotEmpty', group([cond('vendor', 'isNotEmpty')])],
  ['enum equals', group([cond('status', 'equals', 'final')])],
  ['enum notEquals keeps NULL', group([cond('status', 'notEquals', 'Final')])],
  ['enum isEmpty', group([cond('status', 'isEmpty')])],
  ['number greaterThan treats NULL as 0', group([cond('qty', 'greaterThan', '-1')])],
  ['number lessThan treats NULL as 0', group([cond('qty', 'lessThan', '1')])],
  ['number greaterOrEqual', group([cond('qty', 'greaterOrEqual', '7')])],
  ['number lessOrEqual', group([cond('cost', 'lessOrEqual', '12')])],
  ['number between', group([cond('qty', 'between', '0', '7')])],
  ['number isEmpty on NULLs', group([cond('qty', 'isEmpty')])],
  ['number isNotEmpty on NULLs', group([cond('cost', 'isNotEmpty')])],
  ['and of text + number', group([cond('vendor', 'contains', 'acme'), cond('qty', 'greaterThan', '5')])],
  ['or of text + enum', group([cond('vendor', 'startsWith', 'beta'), cond('status', 'equals', 'void')], 'or')],
  [
    'nested or group inside and',
    group([cond('qty', 'greaterOrEqual', '0')], 'and', [
      group([cond('status', 'equals', 'open'), cond('vendor', 'isEmpty')], 'or'),
    ]),
  ],
  ['empty value is skipped by both', group([cond('vendor', 'equals', ''), cond('qty', 'greaterThan', '5')])],
];

describe('parity with applyServerClientFilters', () => {
  it.each(parityCases)('%s', (_name, g) => {
    const viaJs = applyServerClientFilters(rows as unknown as Record<string, unknown>[], g, parityColumns);
    const viaSql = rows.filter((r) => evaluateSqlGroup(r, g));
    expect(viaSql).toEqual(viaJs);
  });
});
