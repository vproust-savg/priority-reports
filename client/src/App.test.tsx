// ═══════════════════════════════════════════════════════════════
// FILE: client/src/App.test.tsx
// PURPOSE: Tests routing: the hidden Supabase receiving-log page is
//          reachable by URL, and the department index redirects to
//          the first page that is not hidden.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// WHY: The real PageRenderer mounts ReportTableWidget, which fires network
// queries. Routing is what is under test, so render the widget titles only.
vi.mock('./components/PageRenderer', () => ({
  default: ({ page }: { page: { id: string; widgets: { title: string }[] } }) => (
    <div data-testid={`page-${page.id}`}>{page.widgets.map((w) => w.title).join(' | ')}</div>
  ),
}));

describe('App routing', () => {
  it('serves the hidden Supabase page by URL', () => {
    window.history.pushState({}, '', '/food-safety/receiving-log-supabase');
    render(<App />);
    expect(screen.getByTestId('page-receiving-log-supabase')).toHaveTextContent(
      'GRV Log — Goods Receiving Vouchers',
    );
  });

  it('redirects /food-safety to /food-safety/receiving-log', () => {
    window.history.pushState({}, '', '/food-safety');
    render(<App />);
    expect(window.location.pathname).toBe('/food-safety/receiving-log');
    expect(screen.getByTestId('page-receiving-log')).toBeInTheDocument();
  });
});
