// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/airtableSnapshotBatch.test.ts
// PURPOSE: Tests for snapshotExtendedItemsBatch — chunked OR() search,
//          create/update partition, 10-per-request writes, daysExtended
//          accumulation, search-failure skip.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/config/environment', () => ({
  env: { AIRTABLE_TOKEN: 'test-token' },
}));

import { snapshotExtendedItemsBatch, snapshotExtendedItem } from '../src/services/airtableSnapshots';
import { F } from '../src/services/airtableShortDated';
import type { RowData } from '../src/services/airtableShortDated';

const mockFetch = vi.fn();

function sampleRowData(overrides: Partial<RowData> = {}): RowData {
  return {
    partNumber: 'RM001', partDescription: 'Sugar', balance: 50,
    unit: 'KG', value: 125, purchasePrice: 2.5, vendor: 'Acme',
    perishable: 'Yes', brand: 'BrandX', family: 'Sweet',
    expiryDate: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function searchResponse(records: Array<{ id: string; lot: string; daysExtended?: number }>) {
  return {
    ok: true,
    json: async () => ({
      records: records.map((r) => ({
        id: r.id,
        fields: { [F.lotNumber]: r.lot, [F.daysExtended]: r.daysExtended ?? 0 },
      })),
    }),
  };
}

const okResponse = { ok: true, json: async () => ({ records: [] }) };

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('snapshotExtendedItemsBatch', () => {
  it('searches once, then PATCHes existing and POSTs new records', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([{ id: 'recA', lot: 'LOTA', daysExtended: 5 }]))
      .mockResolvedValue(okResponse);

    await snapshotExtendedItemsBatch([
      { serialName: 'LOTA', rowData: sampleRowData(), newExpiryDate: '2026-04-08T00:00:00Z', days: 7 },
      { serialName: 'LOTB', rowData: sampleRowData(), newExpiryDate: '2026-04-08T00:00:00Z', days: 7 },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    const searchUrl = mockFetch.mock.calls[0][0] as string;
    expect(searchUrl).toContain('filterByFormula=');
    expect(decodeURIComponent(searchUrl)).toContain(`OR({${F.lotNumber}}="LOTA",{${F.lotNumber}}="LOTB")`);

    const patchCall = mockFetch.mock.calls[1];
    expect(patchCall[1].method).toBe('PATCH');
    const patchBody = JSON.parse(patchCall[1].body);
    expect(patchBody.records).toHaveLength(1);
    expect(patchBody.records[0].id).toBe('recA');
    // WHY: daysExtended accumulates on update (5 existing + 7 new).
    expect(patchBody.records[0].fields[F.daysExtended]).toBe(12);
    expect(patchBody.records[0].fields[F.newExpiryDate]).toBe('2026-04-08');
    // WHY: originalExpiryDate must NOT be overwritten on update.
    expect(patchBody.records[0].fields).not.toHaveProperty(F.originalExpiryDate);

    const postCall = mockFetch.mock.calls[2];
    expect(postCall[1].method).toBe('POST');
    const postBody = JSON.parse(postCall[1].body);
    expect(postBody.records).toHaveLength(1);
    expect(postBody.records[0].fields[F.lotNumber]).toBe('LOTB');
    expect(postBody.records[0].fields[F.originalExpiryDate]).toBe('2026-04-01');
    expect(postBody.records[0].fields[F.daysExtended]).toBe(7);
    expect(postBody.records[0].fields[F.vendor]).toBe('Acme');
  });

  it('splits writes into batches of 10 records', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValue(okResponse);

    const items = Array.from({ length: 25 }, (_, i) => ({
      serialName: `LOT${i}`, rowData: sampleRowData(), newExpiryDate: '2026-04-08T00:00:00Z', days: 7,
    }));
    await snapshotExtendedItemsBatch(items);

    // 1 search (25 < 30 chunk) + 3 POST batches (10/10/5)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    const batchSizes = mockFetch.mock.calls.slice(1).map(
      (c) => JSON.parse(c[1].body).records.length,
    );
    expect(batchSizes).toEqual([10, 10, 5]);
  }, 10_000);

  it('chunks the existence search at 30 lots per OR() call', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValue(okResponse);

    const items = Array.from({ length: 65 }, (_, i) => ({
      serialName: `LOT${i}`, rowData: sampleRowData(), newExpiryDate: '2026-04-08T00:00:00Z', days: 7,
    }));
    await snapshotExtendedItemsBatch(items);

    // 3 searches (30/30/5) + 7 POST batches (ceil(65/10))
    expect(mockFetch).toHaveBeenCalledTimes(10);
    const searchCalls = mockFetch.mock.calls.slice(0, 3);
    for (const call of searchCalls) {
      expect(call[0]).toContain('filterByFormula=');
    }
  }, 15_000);

  it('skips lots whose search chunk failed instead of creating duplicates', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

    await snapshotExtendedItemsBatch([
      { serialName: 'LOTA', rowData: sampleRowData(), newExpiryDate: '2026-04-08T00:00:00Z', days: 7 },
    ]);

    // Only the failed search — no writes for unverifiable lots.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('snapshotExtendedItem (batch-of-1 wrapper)', () => {
  it('delegates to the batch path', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValue(okResponse);

    await snapshotExtendedItem('LOTZ', sampleRowData(), '2026-04-08T00:00:00Z', 3);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const postBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(postBody.records[0].fields[F.lotNumber]).toBe('LOTZ');
    expect(postBody.records[0].fields[F.daysExtended]).toBe(3);
  });

  it('does not throw when Airtable unavailable — warns naming the lot', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await snapshotExtendedItem('LOT001', sampleRowData(), '2026-04-08T00:00:00Z', 7);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('LOT001'));
    warnSpy.mockRestore();
  });

  it('handles undefined rowData — does not crash on property access', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValue(okResponse);

    await expect(
      snapshotExtendedItem('LOT001', undefined, '2026-04-08T00:00:00Z', 7),
    ).resolves.not.toThrow();
  });

  it('includes typecast: true in write bodies', async () => {
    mockFetch
      .mockResolvedValueOnce(searchResponse([]))
      .mockResolvedValue(okResponse);

    await snapshotExtendedItem('LOT001', sampleRowData(), '2026-04-08T00:00:00Z', 7);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.typecast).toBe(true);
  });
});
