// ═══════════════════════════════════════════════════════════════
// FILE: server/src/reports/bbdReport.test.ts
// PURPOSE: Tests for buildExtensionMap — the pure function that
//          calculates total extension days per lot.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { buildExtensionMap } from './bbdReport';

describe('buildExtensionMap', () => {
  it('builds map from EXPDSERIAL response', () => {
    const records = [
      {
        SERIALNAME: 'LOT001',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT001')).toBe(7);
  });

  it('sums multiple extension records', () => {
    const records = [
      {
        SERIALNAME: 'LOT002',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
          { RENEWDATE: '2026-04-08T00:00:00Z', EXPIRYDATE: '2026-04-22T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT002')).toBe(21);
  });

  it('returns 0 for lots with empty EXPDEXT_SUBFORM', () => {
    const records = [{ SERIALNAME: 'LOT003', EXPDEXT_SUBFORM: [] }];
    const map = buildExtensionMap(records);
    expect(map.get('LOT003')).toBe(0);
  });

  it('handles missing EXPDEXT_SUBFORM gracefully', () => {
    const records = [{ SERIALNAME: 'LOT004' }];
    const map = buildExtensionMap(records as never[]);
    expect(map.get('LOT004')).toBe(0);
  });

  it('guards against negative day values', () => {
    const records = [
      {
        SERIALNAME: 'LOT005',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-15T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT005')).toBe(0);
  });

  it('trims SERIALNAME for map key', () => {
    const records = [
      {
        SERIALNAME: '  LOT006  ',
        EXPDEXT_SUBFORM: [
          { RENEWDATE: '2026-04-01T00:00:00Z', EXPIRYDATE: '2026-04-08T00:00:00Z' },
        ],
      },
    ];
    const map = buildExtensionMap(records);
    expect(map.get('LOT006')).toBe(7);
  });

  it('returns empty map for empty input', () => {
    const map = buildExtensionMap([]);
    expect(map.size).toBe(0);
  });
});
