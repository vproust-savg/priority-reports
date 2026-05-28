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
