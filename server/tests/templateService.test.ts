// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/templateService.test.ts
// PURPOSE: Tests getTemplate: Airtable lookup by record ID (not by
//          Report ID formula), null on missing/404, in-memory caching.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/environment', () => ({
  env: { AIRTABLE_TOKEN: 'test-token' },
}));

import { getTemplate } from '../src/services/templateService';

const TEMPLATE_FIELD_ID = 'fldTbiJ7t4Ldd3cH9';
const TEMPLATE_FIELD_NAME = 'Template';
const RECORD_BASE_URL =
  'https://api.airtable.com/v0/appjwOgR4HsXeGIda/tblvqv3S31KQhKRU6';
const ATTACHMENT_URL = 'https://x/t.xlsx';

// WHY: Like Airtable, key the fields by field ID only when the request asks
// for returnFieldsByFieldId=true; otherwise key them by field name.
function mockAirtableFetch(opts: { attachments?: Array<{ url: string }>; status?: number } = {}) {
  const attachments = opts.attachments ?? [{ url: ATTACHMENT_URL }];
  const status = opts.status ?? 200;
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url === ATTACHMENT_URL) {
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }
    if (status !== 200) return new Response('{}', { status });
    const key = url.includes('returnFieldsByFieldId=true') ? TEMPLATE_FIELD_ID : TEMPLATE_FIELD_NAME;
    const fields = attachments.length > 0 ? { [key]: attachments } : {};
    return new Response(JSON.stringify({ id: 'rec', fields }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('getTemplate', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the record by id, not by formula', async () => {
    const fetchMock = mockAirtableFetch();

    const result = await getTemplate('recJluOijRUZcZnBS');

    expect(fetchMock.mock.calls[0][0]).toBe(
      `${RECORD_BASE_URL}/recJluOijRUZcZnBS?returnFieldsByFieldId=true`,
    );
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('filterByFormula');
    expect(fetchMock.mock.calls[1][0]).toBe(ATTACHMENT_URL);
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('returns null when the record has no template attachment', async () => {
    mockAirtableFetch({ attachments: [] });
    expect(await getTemplate('recNoAttachment0001')).toBeNull();
  });

  it('returns null on a 404', async () => {
    mockAirtableFetch({ status: 404 });
    expect(await getTemplate('recMissing000000001')).toBeNull();
  });

  it('caches by record id', async () => {
    const fetchMock = mockAirtableFetch();

    await getTemplate('recCacheTest0000001');
    await getTemplate('recCacheTest0000001');

    expect(fetchMock).toHaveBeenCalledTimes(2); // one record fetch + one download
  });
});
