// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/NavTabs.test.tsx
// PURPOSE: Tests NavTabs active-state matching — exact match,
//          trailing slash, and similar-prefix false positive.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavTabs from './NavTabs';
import type { PageConfig } from '@shared/types';

const mockPages: PageConfig[] = [
  {
    id: 'bbd',
    department: 'purchasing',
    name: 'BBD',
    path: '/purchasing/bbd',
    widgets: [],
  },
  {
    id: 'bbd-archive',
    department: 'purchasing',
    name: 'BBD Archive',
    path: '/purchasing/bbd-archive',
    widgets: [],
  },
];

function renderNavTabs(currentPath: string) {
  return render(
    <MemoryRouter initialEntries={[currentPath]}>
      <NavTabs pages={mockPages} currentPath={currentPath} />
    </MemoryRouter>,
  );
}

describe('NavTabs active state', () => {
  it('highlights exact path match', () => {
    renderNavTabs('/purchasing/bbd');
    const link = screen.getByText('BBD').closest('a');
    // WHY: Active tab now uses white text (on dark pill)
    expect(link?.className).toContain('text-white');
  });

  it('highlights path with trailing slash', () => {
    renderNavTabs('/purchasing/bbd/');
    const link = screen.getByText('BBD').closest('a');
    expect(link?.className).toContain('text-white');
  });

  it('does NOT highlight similar prefix path', () => {
    // '/purchasing/bbd-archive' should NOT highlight '/purchasing/bbd'
    renderNavTabs('/purchasing/bbd-archive');
    const bbdLink = screen.getByText('BBD').closest('a');
    expect(bbdLink?.className).not.toContain('text-white');
    // But it SHOULD highlight 'BBD Archive'
    const archiveLink = screen.getByText('BBD Archive').closest('a');
    expect(archiveLink?.className).toContain('text-white');
  });

  it('shows no active tab when path matches nothing', () => {
    renderNavTabs('/purchasing/nonexistent');
    const bbdLink = screen.getByText('BBD').closest('a');
    const archiveLink = screen.getByText('BBD Archive').closest('a');
    expect(bbdLink?.className).not.toContain('text-white');
    expect(archiveLink?.className).not.toContain('text-white');
  });
});
