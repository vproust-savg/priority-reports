// ═══════════════════════════════════════════════════════════════
// FILE: client/src/utils/filterDragUtils.test.ts
// PURPOSE: Tests for drag & drop tree manipulation — finding condition
//          containers and moving conditions between groups immutably.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { findConditionContainer, moveConditionInTree } from './filterDragUtils';
import type { FilterGroup, FilterCondition } from '@shared/types';

function makeCond(id: string): FilterCondition {
  return { id, field: 'test', operator: 'equals', value: '' };
}

function makeRoot(): FilterGroup {
  return {
    id: 'root',
    conjunction: 'and',
    conditions: [makeCond('c1'), makeCond('c2')],
    groups: [{
      id: 'g1',
      conjunction: 'or',
      conditions: [makeCond('c3'), makeCond('c4')],
      groups: [],
    }],
  };
}

describe('findConditionContainer', () => {
  it('finds condition in root', () => {
    expect(findConditionContainer(makeRoot(), 'c1')).toBe('root');
  });

  it('finds condition in nested group', () => {
    expect(findConditionContainer(makeRoot(), 'c3')).toBe('g1');
  });

  it('returns null for unknown condition', () => {
    expect(findConditionContainer(makeRoot(), 'c99')).toBeNull();
  });
});

describe('moveConditionInTree', () => {
  it('reorders within root group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c2', 'root', 0);
    expect(result.conditions.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('moves condition from root to nested group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c1', 'g1', 0);
    expect(result.conditions.map((c) => c.id)).toEqual(['c2']);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
  });

  it('moves condition from nested group to root', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c3', 'root', 2);
    expect(result.conditions.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c4']);
  });

  it('returns unchanged root for unknown condition', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c99', 'root', 0);
    expect(result).toBe(root); // Same reference — no mutation
  });

  it('inserts at specific index within nested group', () => {
    const root = makeRoot();
    const result = moveConditionInTree(root, 'c1', 'g1', 1);
    expect(result.groups[0].conditions.map((c) => c.id)).toEqual(['c3', 'c1', 'c4']);
  });

  it('is immutable — does not mutate original', () => {
    const root = makeRoot();
    const original = JSON.stringify(root);
    moveConditionInTree(root, 'c1', 'g1', 0);
    expect(JSON.stringify(root)).toBe(original);
  });
});
