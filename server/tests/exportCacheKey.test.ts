// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/exportCacheKey.test.ts
// PURPOSE: Tests export cache key versioning — a changed base
//          $filter must never serve pages cached under the old one
//          (rollout safety for the V8491 exclusion, 2026-08-03).
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildExportCacheKey } from '../src/services/cache';
import type { FilterGroup } from '@shared/types';

const group: FilterGroup = { id: 'root', conjunction: 'and', conditions: [], groups: [] };

describe('buildExportCacheKey base-filter versioning', () => {
  it('produces different keys when the base filter differs', () => {
    const before = buildExportCacheKey('grv-log', group, 0);
    const after = buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'");
    expect(after).not.toBe(before);
  });

  it('is stable for identical base filters', () => {
    expect(buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'")).toBe(
      buildExportCacheKey('grv-log', group, 0, "SUPNAME ne 'V8491'"),
    );
  });
});
