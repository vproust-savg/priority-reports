// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.refresh.test.tsx
// PURPOSE: Confirms the widget shows the source-refresh outcome
//          (timeout / error / busy) as an amber notice, shows an
//          "could not be confirmed" notice when the POST fails or
//          its answer is unusable, invalidates the report query
//          whatever happens, and clears the notice on the next click.
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
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFiltersQuery', () => ({
  useFiltersQuery: () => ({ data: { columns: [], filters: {} }, isLoading: false, error: null }),
}));

vi.mock('../../hooks/useExport', () => ({
  useExport: () => ({ isExporting: false, toast: null, clearToast: vi.fn(), triggerExport: vi.fn() }),
}));

vi.mock('../../hooks/useBBDExtend', () => ({
  useBBDExtend: () => ({
    extendModal: null,
    cellRenderers: undefined,
    handleBulkExtend: vi.fn(),
    handleExtendSuccess: vi.fn(),
    closeModal: vi.fn(),
  }),
}));

vi.mock('../../config/pages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/pages')>();
  return {
    ...actual,
    findWidgetByReportId: () => ({ sourceRefresh: true }),
  };
});

const TIMEOUT_TEXT = 'Still refreshing from Priority, so data may update in a minute';
const ERROR_TEXT = 'Refresh from Priority failed; showing the last synced data';
const BUSY_TEXT = 'Priority refresh is paused during the nightly sync (1:45–2:45 AM); try again later';
const UNCONFIRMED_TEXT = 'Refresh could not be confirmed; showing the last synced data';

let queryClient: QueryClient;

function renderWidget() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReportTableWidget reportId="grv-log-supabase" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const REFRESH_LABEL = 'Refresh last 30 days from Priority';

describe('ReportTableWidget — source refresh outcome', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('labels the Refresh button for a sourceRefresh widget', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderWidget();
    expect(screen.getByLabelText(REFRESH_LABEL)).toBeInTheDocument();
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

  it('shows no notice on done, and still invalidates the report query', async () => {
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
