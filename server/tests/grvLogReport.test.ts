// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/grvLogReport.test.ts
// PURPOSE: Verify grv-log opts into disableCache, that enrichRows
//          no longer reuses a per-document remarks cache between calls,
//          and that buildQuery hard-excludes vendor V8491 (business rule).
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

describe('grv-log buildQuery vendor exclusion', () => {
  it('always excludes V8491 even with no other filters', () => {
    const report = reportRegistry.get('grv-log')!;
    const params = report.buildQuery({ page: 1, pageSize: 50 });
    expect(params.$filter).toBe("SUPNAME ne 'V8491'");
  });

  it('ANDs the exclusion with date filters', () => {
    const report = reportRegistry.get('grv-log')!;
    const params = report.buildQuery({
      from: '2026-07-27', to: '2026-08-02', page: 1, pageSize: 50,
    });
    expect(params.$filter).toBe(
      "SUPNAME ne 'V8491' and CURDATE ge 2026-07-27T00:00:00Z and CURDATE le 2026-08-02T23:59:59Z",
    );
  });

  it('keeps pagination math unchanged', () => {
    const report = reportRegistry.get('grv-log')!;
    const params = report.buildQuery({ page: 3, pageSize: 50 });
    expect(params.$top).toBe(50);
    expect(params.$skip).toBe(100);
  });
});

describe('grv-log env override opt-in', () => {
  it('sets allowEnvOverride: true (only report that honors the toggle)', () => {
    expect(reportRegistry.get('grv-log')!.allowEnvOverride).toBe(true);
  });
});

describe('grv-log enrichRows abort', () => {
  it('stops issuing sub-form batches once the signal aborts', async () => {
    const report = reportRegistry.get('grv-log')!;
    const rows = Array.from({ length: 20 }, (_, i) => ({
      DOCNO: `D${i}`, TYPE: 'P',
    })) as Record<string, unknown>[];

    const controller = new AbortController();
    vi.mocked(querySubform).mockClear();
    vi.mocked(querySubform).mockImplementation(async () => {
      controller.abort(); // fires during batch 1
      return { TEXT: '<p>x</p>' };
    });

    const result = await report.enrichRows!(rows, controller.signal);

    // Batch 1 (10 parallel calls) was already launched; batch 2 must not start.
    expect(vi.mocked(querySubform).mock.calls.length).toBe(10);
    expect(result).toHaveLength(20); // partially-enriched rows still returned

    vi.mocked(querySubform).mockReset();
    vi.mocked(querySubform).mockResolvedValue({ TEXT: '<p>fake remarks</p>' });
  });

  it('runs all batches when no signal is given', async () => {
    const report = reportRegistry.get('grv-log')!;
    const rows = Array.from({ length: 20 }, (_, i) => ({
      DOCNO: `D${i}`, TYPE: 'P',
    })) as Record<string, unknown>[];
    vi.mocked(querySubform).mockClear();
    vi.mocked(querySubform).mockResolvedValue({ TEXT: '<p>fake remarks</p>' });

    await report.enrichRows!(rows);
    expect(vi.mocked(querySubform).mock.calls.length).toBe(20);
  });
});
