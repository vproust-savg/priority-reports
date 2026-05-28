// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/querySubformSelect.test.ts
// PURPOSE: Verify querySubform forwards optional $select to the URL.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchSpy = vi.fn();

// WHY: Mock priorityHttp so we capture the URL without real HTTPS calls.
vi.mock('../src/services/priorityHttp', () => ({
  fetchWithRetry: (...args: unknown[]) => fetchSpy(...args),
  extractErrorMessage: vi.fn().mockReturnValue('mock error'),
}));

// WHY: Mock priority config so getPriorityConfig() returns a known base URL.
vi.mock('../src/config/priority', () => ({
  getPriorityConfig: () => ({
    baseUrl: 'https://example.test/odata/Priority/tabc.ini/co/',
    username: 'u',
    password: 'p',
    env: 'uat',
  }),
}));

import { querySubform } from '../src/services/priorityClient';

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue({ status: 200, body: JSON.stringify({ value: [] }) });
});

describe('querySubform with optional $select', () => {
  it('omits $select when not provided', async () => {
    await querySubform('DOCUMENTS_N', { DOCNO: 'X', TYPE: 'Y' }, 'EXTFILES_SUBFORM');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe(
      "https://example.test/odata/Priority/tabc.ini/co/DOCUMENTS_N(DOCNO='X',TYPE='Y')/EXTFILES_SUBFORM",
    );
  });

  it('appends $select when provided', async () => {
    await querySubform(
      'DOCUMENTS_N',
      { DOCNO: 'X', TYPE: 'Y' },
      'EXTFILES_SUBFORM',
      { select: 'EXTFILEDES,EXTFILENUM,SUFFIX' },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toBe(
      "https://example.test/odata/Priority/tabc.ini/co/DOCUMENTS_N(DOCNO='X',TYPE='Y')/EXTFILES_SUBFORM?$select=EXTFILEDES,EXTFILENUM,SUFFIX",
    );
  });

  it('still escapes single quotes in key values', async () => {
    await querySubform(
      'DOCUMENTS_N',
      { DOCNO: "A'B", TYPE: 'N' },
      'EXTFILES_SUBFORM',
      { select: 'EXTFILEDES' },
    );
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("DOCNO='A''B'");
    expect(url).toContain('?$select=EXTFILEDES');
  });
});

describe('querySubform response shape', () => {
  // WHY: Regression guard — querySubform previously collapsed multi-record
  // collection responses to value[0], silently dropping additional records.
  // The bug surfaced on Customer Returns' EXTFILES_SUBFORM where rows have
  // 2+ attachments and only the first reached the UI. The fix preserves the
  // { value: [...] } shape; this test pins that behavior.
  it('preserves the full value array for multi-record collection sub-forms', async () => {
    fetchSpy.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({
        '@odata.context': 'https://example.test/$metadata#X',
        value: [
          { EXTFILENUM: 1, EXTFILEDES: 'a' },
          { EXTFILENUM: 2, EXTFILEDES: 'b' },
          { EXTFILENUM: 3, EXTFILEDES: 'c' },
        ],
      }),
    });

    const result = await querySubform(
      'DOCUMENTS_N',
      { DOCNO: 'X', TYPE: 'N' },
      'EXTFILES_SUBFORM',
    );

    expect(result).toEqual({
      value: [
        { EXTFILENUM: 1, EXTFILEDES: 'a' },
        { EXTFILENUM: 2, EXTFILEDES: 'b' },
        { EXTFILENUM: 3, EXTFILEDES: 'c' },
      ],
    });
  });

  it('preserves an empty value array for empty collections', async () => {
    fetchSpy.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({ '@odata.context': 'https://example.test/$metadata#X', value: [] }),
    });

    const result = await querySubform(
      'DOCUMENTS_N',
      { DOCNO: 'X', TYPE: 'N' },
      'EXTFILES_SUBFORM',
    );

    expect(result).toEqual({ value: [] });
  });

  it('returns single-entity sub-forms with fields at the top level (no value wrapper)', async () => {
    fetchSpy.mockResolvedValueOnce({
      status: 200,
      body: JSON.stringify({
        '@odata.context': 'https://example.test/$metadata#X/$entity',
        TEXT: '<p>hello</p>',
        APPEND: null,
        SIGNATURE: null,
      }),
    });

    const result = await querySubform(
      'DOCUMENTS_P',
      { DOCNO: 'GR1', TYPE: 'P' },
      'DOCUMENTSTEXT_SUBFORM',
    );

    expect(result).toEqual({
      TEXT: '<p>hello</p>',
      APPEND: null,
      SIGNATURE: null,
    });
  });
});
