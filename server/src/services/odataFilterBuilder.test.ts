// ═══════════════════════════════════════════════════════════════
// FILE: server/src/services/odataFilterBuilder.test.ts
// PURPOSE: Tests for combineFilters — parenthesized merge that
//          prevents OR groups from bypassing a report's base filter.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { combineFilters } from './odataFilterBuilder';

describe('combineFilters', () => {
  it('parenthesizes both parts so OR groups cannot bypass the base filter', () => {
    expect(
      combineFilters("SUPNAME ne 'V8491'", "STATDES eq 'Received' or DOCNO eq 'X'"),
    ).toBe("(SUPNAME ne 'V8491') and (STATDES eq 'Received' or DOCNO eq 'X')");
  });

  it('returns a single present part unwrapped', () => {
    expect(combineFilters("SUPNAME ne 'V8491'", undefined)).toBe("SUPNAME ne 'V8491'");
    expect(combineFilters(undefined, 'CURDATE ge 2026-07-27T00:00:00Z')).toBe(
      'CURDATE ge 2026-07-27T00:00:00Z',
    );
  });

  it('returns undefined when no parts are present', () => {
    expect(combineFilters(undefined, undefined)).toBeUndefined();
  });
});
