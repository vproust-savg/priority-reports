import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ReportTableWidget from './ReportTableWidget';

// Both mirrored pages use this contract. Keep routing and page definitions out of this test.
vi.mock('../../config/pages', () => ({
  findWidgetByReportId: () => ({ sourceRefresh: true, disableCache: true, clientSidePagination: true }),
}));

const refresh = () => fireEvent.click(screen.getByLabelText('Refresh Date filter range from Priority'));
const exportButton = () => screen.getByRole('button', { name: 'Export' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function rows(docNo: string) {
  return Response.json({
    columns: [{ key: 'docNo', label: 'Document', type: 'string' }],
    data: [{ docNo }],
    meta: {},
    pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
  });
}

function mount(
  reportId: string,
  onQuery: (request: RequestInit) => Promise<Response>,
  onRefresh: () => Promise<Response>,
  onExport?: (request: RequestInit) => Promise<Response>,
) {
  const fetchMock = vi.fn((url: string, request: RequestInit) => {
    if (url.endsWith('/export') && onExport) return onExport(request);
    if (url.endsWith('/filters')) return Promise.resolve(Response.json({
      columns: [{ key: 'date', label: 'Date', filterType: 'date' }], filters: {},
    }));
    if (url.endsWith('/query')) return onQuery(request);
    if (url.endsWith('/refresh')) return onRefresh();
    throw new Error('Unexpected request: ' + url);
  });
  vi.stubGlobal('fetch', fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter>
    <ReportTableWidget reportId={reportId} />
  </MemoryRouter></QueryClientProvider>);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  ['grv-log-supabase', '2026-11-16', '2026-11-22'],
  ['customer-returns-supabase', '2026-11-01', '2026-11-19'],
])('exports saved %s rows on open and waits for the post-commit rows on refresh', async (id, from, to) => {
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  const reload = deferred<Response>();
  const post = deferred<Response>();
  const query = vi.fn().mockResolvedValueOnce(rows('Saved')).mockReturnValueOnce(reload.promise);
  const source = vi.fn(() => post.promise);
  mount(id, query, source);
  await screen.findByText('Saved');
  expect(exportButton()).toBeEnabled();
  expect(source).not.toHaveBeenCalled();
  refresh();
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(from);
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(to);
  expect(exportButton()).toBeDisabled();

  post.resolve(Response.json({ status: 'done' }));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  expect(exportButton()).toBeDisabled();
  expect(screen.queryByText(/Refreshed /i)).toBeNull();
  reload.resolve(rows('Corrected'));
  await screen.findByText('Corrected');
  await waitFor(() => expect(exportButton()).toBeEnabled());
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(new RegExp('Refreshed.*' + from + '.*' + to, 'i'));
  expect(source).toHaveBeenCalledTimes(1);
});

it('replaces a table read that began before the source commit, even on first load', async () => {
  const before = deferred<Response>();
  const query = vi.fn().mockReturnValueOnce(before.promise).mockResolvedValueOnce(rows('Fresh'));
  mount('grv-log-supabase', query, () => Promise.resolve(Response.json({ status: 'done' })));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
  refresh();
  await screen.findByText('Fresh');
  await act(async () => before.resolve(rows('Outdated')));
  expect(screen.queryByText('Outdated')).toBeNull();
  expect(exportButton()).toBeEnabled();
});

it('keeps export locked if the source commits but reloading the table fails', async () => {
  const query = vi.fn().mockResolvedValueOnce(rows('Saved')).mockResolvedValueOnce(new Response(null, { status: 502 }));
  mount('grv-log-supabase', query, () => Promise.resolve(Response.json({ status: 'done' })));
  await screen.findByText('Saved');
  refresh();
  await screen.findByText(/table reload failed/i);
  expect(exportButton()).toBeDisabled();
});

it('identifies the clicked range if the Date filter changes while the request is pending', async () => {
  const post = deferred<Response>();
  const source = vi.fn(() => post.promise);
  vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
  mount('customer-returns-supabase', () => Promise.resolve(rows('Saved')), source);
  await screen.findByText('Saved');
  refresh();
  fireEvent.click(screen.getByLabelText('Filter'));
  const [start] = document.querySelectorAll('input[type=date]');
  fireEvent.change(start, { target: { value: '2026-11-02' } });
  await act(async () => post.resolve(Response.json({ status: 'done' })));
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent('2026-11-01');
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(/date filter changed/i);
  expect(exportButton()).toBeDisabled();
  expect(source).toHaveBeenCalledTimes(1);
});

it.each([
  ['partial', /partially refreshed|incomplete/i],
  ['error', /failed/i],
  ['timeout', /still|completion/i],
  ['busy', /busy|paused/i],
  ['unexpected', /could not confirm/i],
])('keeps export locked after a %s result, including after the saved rows reload', async (status, message) => {
  const source = vi.fn(() => Promise.resolve(Response.json({ status })));
  const query = vi.fn(() => Promise.resolve(rows('Saved')));
  const requests = mount('grv-log-supabase', query, source);
  await screen.findByText('Saved');
  expect(exportButton()).toBeEnabled();
  refresh();
  await waitFor(() => expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(message));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  fireEvent.click(exportButton());
  expect(exportButton()).toBeDisabled();
  expect(requests.mock.calls.some(([url]) => url.endsWith('/export'))).toBe(false);
  expect(source).toHaveBeenCalledTimes(1);
});

it('exports the clicked cross-month filter only after its debounced table finishes loading', async () => {
  const selectedRows = deferred<Response>();
  const query = vi.fn((request: RequestInit) => {
    const date = JSON.parse(String(request.body)).filterGroup.conditions[0];
    return date.value === '2026-10-29' ? selectedRows.promise : Promise.resolve(rows('Opening range'));
  });
  const download = vi.fn(() => Promise.resolve(new Response('workbook')));
  // jsdom does not implement the browser's Blob URL download API.
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL() { return 'blob:workbook'; }
    static override revokeObjectURL() {}
  });
  const link = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const requests = mount('customer-returns-supabase', query,
    () => Promise.resolve(Response.json({ status: 'done' })), download);
  await screen.findByText('Opening range');
  fireEvent.click(screen.getByLabelText('Filter'));
  const [from, to] = document.querySelectorAll('input[type=date]');
  fireEvent.change(from, { target: { value: '2026-10-29' } });
  fireEvent.change(to, { target: { value: '2026-11-03' } });
  refresh();
  const posts = () => requests.mock.calls.filter(([url]) => url.endsWith('/refresh'));
  expect(JSON.parse(String(posts()[0][1].body))).toEqual({ from: '2026-10-29', to: '2026-11-03' });
  await waitFor(() => expect(query.mock.calls.some(([request]) =>
    JSON.parse(String(request.body)).filterGroup.conditions[0].value === '2026-10-29')).toBe(true));
  expect(exportButton()).toBeDisabled();
  selectedRows.resolve(rows('Selected range'));
  await screen.findByText('Selected range');
  expect(exportButton()).toBeEnabled();
  fireEvent.click(exportButton());
  expect(download).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(link).toHaveBeenCalledTimes(1));
  const exportCall = requests.mock.calls.find(([url]) => url.endsWith('/export'))!;
  expect(JSON.parse(String(exportCall[1].body)).filterGroup.conditions).toEqual([
    expect.objectContaining({ field: 'date', value: '2026-10-29', valueTo: '2026-11-03' }),
  ]);
  expect(posts()).toHaveLength(1);
});

it('allows an explicit retry after an incomplete refresh and exports only after the retry reloads', async () => {
  const reloaded = deferred<Response>();
  const query = vi.fn()
    .mockResolvedValueOnce(rows('Saved'))
    .mockResolvedValueOnce(rows('Incomplete'))
    .mockReturnValueOnce(reloaded.promise);
  const source = vi.fn()
    .mockResolvedValueOnce(Response.json({ status: 'partial' }))
    .mockResolvedValueOnce(Response.json({ status: 'done' }));
  mount('customer-returns-supabase', query, source);
  await screen.findByText('Saved');
  refresh();
  await screen.findByText('Incomplete');
  expect(screen.getByRole('status', { name: 'Source refresh' })).toHaveTextContent(/incomplete/i);
  expect(exportButton()).toBeDisabled();
  refresh();
  await waitFor(() => expect(query).toHaveBeenCalledTimes(3));
  expect(exportButton()).toBeDisabled();
  reloaded.resolve(rows('Complete'));
  await screen.findByText('Complete');
  expect(exportButton()).toBeEnabled();
  expect(source).toHaveBeenCalledTimes(2);
});

it('exports saved rows on open and keeps that download separate from the next source refresh', async () => {
  const file = deferred<Response>();
  const download = vi.fn(() => file.promise);
  const source = vi.fn(() => Promise.resolve(Response.json({ status: 'done' })));
  mount('customer-returns-supabase', () => Promise.resolve(rows('Saved')), source, download);
  await screen.findByText('Saved');
  fireEvent.click(exportButton());
  expect(download).toHaveBeenCalledTimes(1);
  const refreshButton = screen.getByLabelText('Refresh Date filter range from Priority');
  expect(refreshButton).toBeDisabled();
  fireEvent.click(refreshButton);
  expect(source).not.toHaveBeenCalled();
  file.resolve(new Response(null, { status: 503 }));
  await waitFor(() => expect(refreshButton).toBeEnabled());
});
