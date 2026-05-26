// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvLogReport.test.ts
// PURPOSE: Verify grv-log opts into disableCache AND that enrichRows
//          no longer reuses a per-document remarks cache between calls.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/services/priorityClient', () => ({
  // WHY: We only care about call counts here; return a stable remarks payload.
  querySubform: vi.fn().mockResolvedValue({ TEXT: '<p>fake remarks</p>' }),
  queryPriority: vi.fn(),
}));

import '../src/reports/grvLog'; // side-effect: registers grv-log
import { reportRegistry } from '../src/config/reportRegistry';
import { querySubform } from '../src/services/priorityClient';

describe('grv-log report definition', () => {
  it('opts into disableCache', () => {
    const report = reportRegistry.get('grv-log')!;
    expect(report.disableCache).toBe(true);
  });

  it('enrichRows re-fetches each row on every call (no per-document cache)', async () => {
    const report = reportRegistry.get('grv-log')!;
    expect(report.enrichRows).toBeDefined();

    const rows = [
      { DOCNO: 'GR26000001', TYPE: 'P' },
      { DOCNO: 'GR26000002', TYPE: 'P' },
    ];

    vi.mocked(querySubform).mockClear();
    const firstCall = await report.enrichRows!([...rows]);
    await report.enrichRows!([...rows]);

    // WHY: 2 rows × 2 enrich calls = 4 Priority fetches if the cache is gone.
    expect(querySubform).toHaveBeenCalledTimes(4);
    // WHY: Also verify the fetched payload actually lands on each row, so
    // the test fails if enrichRows ever stops mutating in place.
    expect(firstCall[0].DOCUMENTSTEXT_SUBFORM).toEqual({ TEXT: '<p>fake remarks</p>' });
    expect(firstCall[1].DOCUMENTSTEXT_SUBFORM).toEqual({ TEXT: '<p>fake remarks</p>' });
  });
});
