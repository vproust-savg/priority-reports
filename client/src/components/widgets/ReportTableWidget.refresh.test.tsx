// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.refresh.test.tsx
// PURPOSE: Check refresh range selection, validation, response handling
//          and the ordering of overlapping manual refreshes.
// USED BY: Vitest
// EXPORTS: none
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReportTableWidget from './ReportTableWidget';

// WHY: Same hook mocks as the attachments test — the widget renders from injected data.
vi.mock('../../hooks/useReportQuery', () => ({
  useReportQuery: () => ({
    data: {
      meta: {
        reportId: 'grv-log-supabase',
        reportName: 'GRV Log',
        generatedAt: '2026-10-30T00:00:00Z',
        cache: 'miss',
        executionTimeMs: 1,
        source: 'supabase',
      },
      data: [{ docNo: 'GRV1' }],
      pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
      columns: [{ key: 'docNo', label: 'Doc #', type: 'string' }],
    },
    isLoading: false,
    isSuccess: true,
    fetchStatus: 'idle',
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFiltersQuery', () => ({
  useFiltersQuery: () => ({
    data: { columns: [{ key: 'date', label: 'Date', filterType: 'date' }], filters: {} },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../hooks/useExport', () => ({
  useExport: () => ({ isExporting: false, toast: null, clearToast: vi.fn(), triggerExport: vi.fn() }),
}));

const TIMEOUT_TEXT = 'Refresh timed out. It may still be running.';
const ERROR_TEXT = 'Priority refresh failed. Try again before exporting.';
const BUSY_TEXT = 'Priority is busy. Try refreshing again later.';
const UNCONFIRMED_TEXT = 'Could not confirm the refresh. Try again before exporting.';

let queryClient: QueryClient;

function renderWidget(reportId = 'grv-log-supabase') {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportTableWidget reportId={reportId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const REFRESH_LABEL = 'Refresh Date filter range from Priority';

function changeDateRange(from: string, to: string) {
  fireEvent.click(screen.getByLabelText('Filter'));
  const operator = screen.getAllByRole<HTMLSelectElement>('combobox').find((select) => select.value === 'isInWeek')!;
  fireEvent.change(operator, { target: { value: 'isBetween' } });
  const [fromInput, toInput] = document.querySelectorAll('input[type="date"]');
  fireEvent.change(fromInput, { target: { value: from } });
  fireEvent.change(toInput, { target: { value: to } });
}

describe('ReportTableWidget — source refresh outcome', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('labels the Refresh button for a sourceRefresh widget', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWidget();
    expect(screen.getByLabelText(REFRESH_LABEL)).toBeInTheDocument();
  });

  it('sends the current LA week by default, even when UTC is already in the next week', async () => {
    vi.setSystemTime(new Date('2026-11-02T03:00:00Z'));
    const fetchMock = vi.fn(() => jsonResponse({ status: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports/grv-log-supabase/refresh', expect.objectContaining({
      body: JSON.stringify({ from: '2026-10-26', to: '2026-11-01' }),
    }));
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1));
  });

  it('posts the current Date filter immediately after an edit', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ status: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();
    changeDateRange('2026-10-01', '2026-10-31');
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports/grv-log-supabase/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: '2026-10-01', to: '2026-10-31' }),
    });
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1));
  });

  it('refuses a 32-day Date filter without sending a refresh', () => {
    const fetchMock = vi.fn(() => jsonResponse({ status: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();
    changeDateRange('2026-10-01', '2026-11-01');
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));

    expect(screen.getByText('Refresh covers at most 31 days; narrow the Date filter')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it('refuses to refresh when the Date filter is missing its end date', () => {
    const fetchMock = vi.fn(() => jsonResponse({ status: 'done' }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();
    changeDateRange('2026-10-01', '');
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));

    expect(screen.getByText('Pick a date range of 31 days or fewer to refresh')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts without a body for a report without a source refresh', async () => {
    const fetchMock = vi.fn(() => jsonResponse({ keysDeleted: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget('grv-log');
    fireEvent.click(screen.getByLabelText('Refresh'));

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/reports/grv-log/refresh', { method: 'POST' });
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log'] }));
  });

  it('shows the timeout notice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ status: 'timeout' })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(TIMEOUT_TEXT)).toBeInTheDocument();
  });

  it('shows the error notice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ status: 'error' })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(ERROR_TEXT)).toBeInTheDocument();
  });

  it('shows the busy notice', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ status: 'busy' })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(BUSY_TEXT)).toBeInTheDocument();
  });

  it('clears failure notices on done and invalidates the report query', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ status: 'done' })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    await waitFor(() =>
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log-supabase'] }),
    );
    expect(screen.queryByText(TIMEOUT_TEXT)).toBeNull();
    expect(screen.queryByText(ERROR_TEXT)).toBeNull();
    expect(screen.queryByText(BUSY_TEXT)).toBeNull();
    expect(screen.queryByText(UNCONFIRMED_TEXT)).toBeNull();
  });

  it('invalidates the report query when the status is not done', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ status: 'error' })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    await screen.findByText(ERROR_TEXT);
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log-supabase'] });
  });

  it('shows the unconfirmed notice when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('not json', { status: 200 }))));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(UNCONFIRMED_TEXT)).toBeInTheDocument();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log-supabase'] });
  });

  it('shows the unconfirmed notice when the body has no recognized status', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse({ cleared: true })));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(UNCONFIRMED_TEXT)).toBeInTheDocument();
  });

  it('shows the unconfirmed notice on a 502 with an HTML body', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response('<html><body>Bad Gateway</body></html>', { status: 502 }))));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(UNCONFIRMED_TEXT)).toBeInTheDocument();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log-supabase'] });
  });

  it('shows the unconfirmed notice when fetch rejects, still invalidates and stops the spinner', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    renderWidget();
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(UNCONFIRMED_TEXT)).toBeInTheDocument();
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['report', 'grv-log-supabase'] });
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull());
  });

  it('clears the earlier notice on the next click, before the new answer arrives', async () => {
    let resolveSecond: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse({ status: 'timeout' }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();

    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(await screen.findByText(TIMEOUT_TEXT)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(screen.queryByText(TIMEOUT_TEXT)).toBeNull();

    resolveSecond(new Response(JSON.stringify({ status: 'done' }), { status: 200 }));
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(TIMEOUT_TEXT)).toBeNull();
  });

  it('ignores a stale answer from an overlapping click and keeps the spinner until the newest click ends', async () => {
    let resolveFirst: (r: Response) => void = () => {};
    let resolveSecond: (r: Response) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveSecond = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    renderWidget();

    // Click 1 and click 2 are both in flight (the button stays clickable while spinning).
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    fireEvent.click(screen.getByLabelText(REFRESH_LABEL));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Click 1 answers late with a failure: no notice, spinner still on for click 2.
    resolveFirst(new Response(JSON.stringify({ status: 'timeout' }), { status: 200 }));
    await waitFor(() => expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(TIMEOUT_TEXT)).toBeNull();
    expect(document.querySelector('.animate-spin')).not.toBeNull();

    // Click 2 answers: its own outcome shows and the spinner stops.
    resolveSecond(new Response(JSON.stringify({ status: 'busy' }), { status: 200 }));
    expect(await screen.findByText(BUSY_TEXT)).toBeInTheDocument();
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(document.querySelector('.animate-spin')).toBeNull());
  });
});
