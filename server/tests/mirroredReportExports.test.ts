// Exercise both registered report layouts and read back the XLSX sent by Express.
// Only the external systems (database, template store, cache and Priority) are replaced.
import ExcelJS from 'exceljs';
import { EventEmitter } from 'node:events';
import { Router, type Request, type Response } from 'express';
import type { ApiResponse } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExportRouter } from '../src/routes/export';
import { createQueryRouter } from '../src/routes/query';
import { createQueryRefreshRouter } from '../src/routes/queryRefresh';
import { createDatedReportRefresh } from '../src/services/datedReportRefresh';
import { querySupabase } from '../src/services/supabaseDb';
import { queryPriority } from '../src/services/priorityClient';
import { getTemplate } from '../src/services/templateService';

vi.mock('../src/services/supabaseDb', () => ({ querySupabase: vi.fn() }));
vi.mock('../src/services/priorityClient', () => ({ queryPriority: vi.fn(), querySubform: vi.fn() }));
vi.mock('../src/services/templateService', () => ({ getTemplate: vi.fn() }));

const range = { from: '2026-10-29', to: '2026-11-03' };
const filterGroup = {
  id: 'root', conjunction: 'and', groups: [],
  conditions: [{ id: 'dates', field: 'date', operator: 'isBetween', value: range.from, valueTo: range.to }],
};

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('rejects an unregistered SQL function pair before querying the database', () => {
  // @ts-expect-error Exercise the runtime allowlist with an invalid report selector.
  expect(() => createDatedReportRefresh('constructor')).toThrow(/unknown refresh source/i);
  expect(querySupabase).not.toHaveBeenCalled();
});

function makeApp() {
  const cache = {
    get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), invalidateByPrefix: vi.fn(), isConnected: vi.fn(),
  };
  const app = Router();
  app.use(createQueryRefreshRouter(cache), createQueryRouter(cache), createExportRouter(cache));
  // Dispatch parsed requests on this fixture's router, and capture the actual XLSX buffer.
  function post<T>(url: string, body: unknown) {
    return new Promise<{ status: number; body: T }>((resolve, reject) => {
      const req = { method: 'POST', url, body } as Request;
      const res = Object.assign(new EventEmitter(), {
        statusCode: 200,
        status(code: number) { this.statusCode = code; return this; },
        setHeader: vi.fn(),
        send(value: T) { resolve({ status: this.statusCode, body: value }); },
        json(value: T) { this.send(value); },
      });
      app(req, res as unknown as Response, (err) => reject(err ?? new Error(`No route for ${url}`)));
    });
  }
  return { post, cache };
}

describe.each([
  { id: 'grv-log-supabase', source: 'grv', view: 'grv_receiving_log', field: 'comments',
    key: 'comments', docColumn: 'C', remarkColumn: 'P', firstRow: 5 },
  { id: 'customer-returns-supabase', source: 'return', view: 'customer_returns_log', field: 'return_details',
    key: 'returnDetails', docColumn: 'B', remarkColumn: 'H', firstRow: 2 },
])('$id', ({ id, source, view, field, key, docColumn, remarkColumn, firstRow }) => {
  it('rejects an invalid range before queueing and reports failure on a valid single-day refresh', async () => {
    const { post } = makeApp();
    const db = vi.mocked(querySupabase);
    expect((await post(`/${id}/refresh`, { from: range.to, to: range.from })).status).toBe(400);
    expect(db).not.toHaveBeenCalled();

    db.mockRejectedValueOnce(new Error('Request failed'));
    const result = await post(`/${id}/refresh`, { from: range.to, to: range.to });
    expect(result).toMatchObject({ status: 200, body: { status: 'error' } });
    expect(db).toHaveBeenCalledExactlyOnceWith(
      `select * from priority_reports.request_${source}_refresh($1::date, $2::date)`, [range.to, range.to],
    );
  });

  it('exports the corrected, cleared and new rows beyond the first screen', async () => {
    const { post, cache } = makeApp();
    if (source === 'grv') {
      const template = new ExcelJS.Workbook();
      const sheet = template.addWorksheet('Form');
      sheet.getCell('A4').value = 'Date';
      sheet.getCell('A8').value = 'Verified By';
      vi.mocked(getTemplate).mockResolvedValue(Buffer.from(await template.xlsx.writeBuffer()));
    }

    const db = vi.mocked(querySupabase);
    const row = (docno: string, curdate: string, remark: string | null) => ({ docno, curdate, [field]: remark });
    const original = [row('D2', range.to, 'Old text'), row('D1', range.from, 'Clear me')];
    const corrected = [row('D3', range.to, 'New'), row('D2', range.to, 'Corrected'), row('D1', range.from, null)];
    async function refresh(requestId: string, committedRows: typeof original) {
      vi.useFakeTimers();
      db.mockResolvedValueOnce([{ request_id: requestId, status: 'pending', reused: false }])
        .mockImplementationOnce(async () => {
          db.mockResolvedValue(committedRows);
          return [{ request_id: requestId, status: 'done' }];
        });
      const completion = post(`/${id}/refresh`, range);
      await vi.advanceTimersByTimeAsync(3000);
      expect(await completion).toMatchObject({ status: 200, body: { status: 'done' } });
      expect(db.mock.calls.slice(-2)).toEqual([
        [`select * from priority_reports.request_${source}_refresh($1::date, $2::date)`, [range.from, range.to]],
        [`select * from priority_reports.${source}_refresh_status($1)`, [requestId]],
      ]);
      vi.useRealTimers();
    }

    async function workbookRows() {
      const response = await post<Buffer>(`/${id}/export`, { filterGroup });
      expect(response.status).toBe(200);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(response.body as unknown as ArrayBuffer);
      const sheet = book.worksheets[0];
      if (source === 'grv') {
        expect(sheet.name).toBe('Inbound Log 2026');
        expect(sheet.getCell('A8').text).toBe('Verified By');
      }
      const rows: string[][] = [];
      for (let index = firstRow; index <= sheet.rowCount; index++) {
        const doc = sheet.getCell(docColumn + index).text;
        if (doc) rows.push([doc, sheet.getCell(remarkColumn + index).text]);
      }
      return rows;
    }

    await refresh('9007199254740993', original);
    expect(await workbookRows()).toEqual([['D2', 'Old text'], ['D1', 'Clear me']]);
    await refresh('9007199254740994', corrected);
    const table = await post<ApiResponse>(`/${id}/query`, { filterGroup, page: 1, pageSize: 1 });
    expect(table.status).toBe(200);
    expect(table.body.pagination).toMatchObject({ totalCount: 3, totalPages: 3 });
    expect(table.body.data.map((r: Record<string, unknown>) => [r.docNo, r[key]]))
      .toEqual([['D3', 'New'], ['D2', 'Corrected'], ['D1', null]]);
    expect(await workbookRows()).toEqual([['D3', 'New'], ['D2', 'Corrected'], ['D1', '']]);

    expect(db).toHaveBeenCalledTimes(7);
    const viewReads = db.mock.calls.filter(([sql]) => sql.includes(`from priority_reports.${view} where`));
    expect(viewReads.map(([, params]) => params)).toEqual([
      [range.from, range.to, 100001], [range.from, range.to, 5001], [range.from, range.to, 100001],
    ]);
    for (const [sql] of viewReads) {
      expect(sql).toContain('"curdate" BETWEEN $1::date AND $2::date');
      if (source === 'return') expect(sql).toContain("where statdes = 'Final' and (");
    }
    expect(queryPriority).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
