// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.attachments.test.tsx
// PURPOSE: Confirms the widget renders AttachmentsCell for the
//          attachments column when row data includes it.
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ReportTableWidget from './ReportTableWidget';

// WHY: Mock all hooks that reach the network so the widget renders
// entirely from injected data. The test only verifies the cell renderer.
vi.mock('../../hooks/useReportQuery', () => ({
  useReportQuery: () => ({
    data: {
      meta: {
        reportId: 'customer-returns',
        reportName: 'Customer Returns',
        generatedAt: '2026-05-27T00:00:00Z',
        cache: 'miss',
        executionTimeMs: 1,
        source: 'priority-odata',
      },
      data: [
        {
          date: '2026-05-19T00:00:00Z',
          docNo: 'RT26000013',
          type: 'N',
          customerId: 'C7835',
          customerName: 'Proper Hotel - DTLA',
          invoiceNum: null,
          requestedBy: 'Jean',
          requestMethod: 'Email',
          returnDetails: 'cheese is moldy',
          foodSafetyConcern: 'No',
          attachments: [{ num: 1, filename: 'invoice.pdf' }],
        },
      ],
      pagination: { page: 1, pageSize: 50, totalCount: 1, totalPages: 1 },
      columns: [
        { key: 'docNo', label: 'Doc #', type: 'string', copyable: true },
        { key: 'attachments', label: 'Attachments', type: 'string' },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('../../hooks/useFiltersQuery', () => ({
  useFiltersQuery: () => ({
    data: { columns: [], filters: {} },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('../../hooks/useExport', () => ({
  useExport: () => ({
    isExporting: false,
    toast: null,
    clearToast: vi.fn(),
    triggerExport: vi.fn(),
  }),
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

// WHY: pages.ts is Zod-validated at import time and has no side effects.
// We only need findWidgetByReportId to return disableCache:true so the
// hook options branch is predictable.
vi.mock('../../config/pages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/pages')>();
  return {
    ...actual,
    findWidgetByReportId: () => ({ disableCache: true }),
  };
});

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ReportTableWidget — attachments column', () => {
  it('renders the paperclip cell when a row has attachments', () => {
    render(
      <Wrapper>
        <ReportTableWidget reportId="customer-returns" />
      </Wrapper>,
    );
    // AttachmentsCell renders: aria-label="Attachments (1)"
    expect(screen.getByLabelText(/attachments \(1\)/i)).toBeInTheDocument();
  });
});
