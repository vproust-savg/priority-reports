// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/customerReturnsReport.test.ts
// PURPOSE: Tests Customer Returns registration + enrichRows behavior
//          (parallel two-subform fetch with batching).
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/priorityClient', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    querySubform: vi.fn().mockImplementation((_entity: string, _key: unknown, subform: string) => {
      if (subform === 'DOCUMENTSTEXT_SUBFORM') {
        return Promise.resolve({ TEXT: '<p>fake</p>' });
      }
      if (subform === 'EXTFILES_SUBFORM') {
        return Promise.resolve({ value: [{ EXTFILEDES: 'a', EXTFILENUM: 1, SUFFIX: 'pdf', FILESIZE: 10 }] });
      }
      return Promise.resolve(null);
    }),
  };
});

import '../src/reports/customerReturns';
import { reportRegistry } from '../src/config/reportRegistry';
import { querySubform } from '../src/services/priorityClient';

const report = reportRegistry.get('customer-returns')!;

beforeEach(() => {
  vi.mocked(querySubform).mockClear();
});

describe('customer-returns registration', () => {
  it('registers under id "customer-returns" with entity DOCUMENTS_N and disableCache:true', () => {
    expect(report.id).toBe('customer-returns');
    expect(report.entity).toBe('DOCUMENTS_N');
    expect(report.disableCache).toBe(true);
  });

  it('attachments column is NOT in filterColumns', () => {
    expect(report.filterColumns.find((f) => f.key === 'attachments')).toBeUndefined();
  });
});

describe('customer-returns enrichRows', () => {
  const rows = () => [
    { DOCNO: 'RT26000001', TYPE: 'N' },
    { DOCNO: 'RT26000002', TYPE: 'N' },
  ];

  it('fetches BOTH DOCUMENTSTEXT and EXTFILES per row', async () => {
    const r = await report.enrichRows!(rows());
    expect(querySubform).toHaveBeenCalledTimes(4);

    const subformArgs = vi.mocked(querySubform).mock.calls.map((c) => c[2]);
    expect(subformArgs.filter((s) => s === 'DOCUMENTSTEXT_SUBFORM')).toHaveLength(2);
    expect(subformArgs.filter((s) => s === 'EXTFILES_SUBFORM')).toHaveLength(2);

    expect(r[0].DOCUMENTSTEXT_SUBFORM).toEqual({ TEXT: '<p>fake</p>' });
    expect(r[0].EXTFILES_SUBFORM).toEqual({
      value: [{ EXTFILEDES: 'a', EXTFILENUM: 1, SUFFIX: 'pdf', FILESIZE: 10 }],
    });
  });

  it('passes metadata-only $select for EXTFILES_SUBFORM (EXTFILEDES,EXTFILENUM,SUFFIX,FILESIZE)', async () => {
    await report.enrichRows!(rows());

    const extfilesCall = vi.mocked(querySubform).mock.calls.find(
      (c) => c[2] === 'EXTFILES_SUBFORM',
    );
    expect(extfilesCall).toBeDefined();
    expect(extfilesCall![3]).toEqual({ select: 'EXTFILEDES,EXTFILENUM,SUFFIX,FILESIZE' });
  });

  it('uses DOCUMENTS_N as the entity for both subform calls', async () => {
    await report.enrichRows!(rows());
    const entities = vi.mocked(querySubform).mock.calls.map((c) => c[0]);
    expect(entities.every((e) => e === 'DOCUMENTS_N')).toBe(true);
  });

  it('uses composite key {DOCNO, TYPE} for every subform fetch', async () => {
    await report.enrichRows!(rows());
    const keyParts = vi.mocked(querySubform).mock.calls.map((c) => c[1] as Record<string, string>);
    for (const k of keyParts) {
      expect(k).toHaveProperty('DOCNO');
      expect(k).toHaveProperty('TYPE');
      expect(['RT26000001', 'RT26000002']).toContain(k.DOCNO);
      expect(k.TYPE).toBe('N');
    }
  });

  it('re-fetches on every call (no per-document cache)', async () => {
    await report.enrichRows!(rows());
    await report.enrichRows!(rows());
    expect(querySubform).toHaveBeenCalledTimes(8);
  });
});
