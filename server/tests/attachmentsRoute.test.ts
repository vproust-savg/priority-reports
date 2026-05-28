// ═══════════════════════════════════════════════════════════════
// FILE: server/tests/attachmentsRoute.test.ts
// PURPOSE: HTTP-level tests for /api/v1/attachments via supertest.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/services/priorityClient', async (orig) => {
  const actual = (await orig()) as object;
  return {
    ...actual,
    queryPriority: vi.fn(),
  };
});

import { app } from '../src/index';
import { queryPriority } from '../src/services/priorityClient';

const PDF_B64 = Buffer.from('%PDF-1.4 fake', 'utf8').toString('base64');
const JPEG_B64 = Buffer.from('FAKEJPEG', 'utf8').toString('base64');

beforeEach(() => {
  vi.mocked(queryPriority).mockReset();
});

describe('GET /api/v1/attachments/:entity/:docNo/:type/:extfilenum', () => {
  it('returns 200 with bytes and correct headers for a valid request', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [
        {
          EXTFILEDES: 'invoice',
          SUFFIX: 'pdf',
          EXTFILENAME: `data:application/pdf;base64,${PDF_B64}`,
          EXTFILENUM: 1,
        },
      ],
    });

    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT26000050/N/1');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="invoice.pdf"');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.toString('utf8')).toBe('%PDF-1.4 fake');
  });

  it('derives Content-Type and filename suffix correctly for JPEG', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [
        {
          EXTFILEDES: 'photo',
          SUFFIX: 'jpg',
          EXTFILENAME: `data:image/jpeg;base64,${JPEG_B64}`,
          EXTFILENUM: 2,
        },
      ],
    });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT26000050/N/2');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['content-disposition']).toBe('attachment; filename="photo.jpg"');
  });

  it('returns filename without dot when SUFFIX is missing', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [
        {
          EXTFILEDES: 'noext',
          SUFFIX: null,
          EXTFILENAME: `data:application/octet-stream;base64,${PDF_B64}`,
          EXTFILENUM: 3,
        },
      ],
    });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT26000050/N/3');
    expect(res.headers['content-disposition']).toBe('attachment; filename="noext"');
  });

  it('rejects entity not in allowlist with 400', async () => {
    const res = await request(app).get('/api/v1/attachments/LOGPART/abc/x/1');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/entity/i);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('rejects non-integer extfilenum with 400', async () => {
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT1/N/abc');
    expect(res.status).toBe(400);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('rejects docNo containing single quote with 400 (OData injection guard)', async () => {
    const res = await request(app).get("/api/v1/attachments/DOCUMENTS_N/X'Y/N/1");
    expect(res.status).toBe(400);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('rejects unsafe type with 400', async () => {
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT1/N..%2F/1');
    expect(res.status).toBe(400);
    expect(queryPriority).not.toHaveBeenCalled();
  });

  it('returns 404 when Priority returns no records', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({ value: [] });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT26000050/N/999');
    expect(res.status).toBe(404);
  });

  it('returns 502 when Priority throws', async () => {
    vi.mocked(queryPriority).mockRejectedValueOnce(new Error('boom'));
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT26000050/N/1');
    expect(res.status).toBe(502);
    expect(res.body.error).toBeDefined();
  });

  it('returns 502 when EXTFILENAME is malformed (not a data URI)', async () => {
    vi.mocked(queryPriority).mockResolvedValueOnce({
      value: [{ EXTFILEDES: 'x', SUFFIX: 'pdf', EXTFILENAME: 'NOT_A_DATA_URI', EXTFILENUM: 1 }],
    });
    const res = await request(app).get('/api/v1/attachments/DOCUMENTS_N/RT1/N/1');
    expect(res.status).toBe(502);
  });
});
