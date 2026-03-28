// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.test.tsx
// PURPOSE: Tests for TableToolbar — sort button rendering, badge,
//          toggle, and active state.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TableToolbar from './TableToolbar';

// WHY: Provide all required props with sensible defaults
const defaultProps = {
  activeFilterCount: 0,
  isFilterOpen: false,
  onFilterToggle: vi.fn(),
  hiddenColumnCount: 0,
  isColumnPanelOpen: false,
  onColumnToggle: vi.fn(),
  sortCount: 0,
  isSortPanelOpen: false,
  onSortToggle: vi.fn(),
  isExporting: false,
  onExport: vi.fn(),
};

describe('TableToolbar — Sort button', () => {
  it('renders Sort button text', () => {
    render(<TableToolbar {...defaultProps} />);
    expect(screen.getByText('Sort')).toBeTruthy();
  });

  it('shows badge when sortCount > 0', () => {
    render(<TableToolbar {...defaultProps} sortCount={2} />);
    expect(screen.getByText('(2)')).toBeTruthy();
  });

  it('does not show badge when sortCount is 0', () => {
    render(<TableToolbar {...defaultProps} sortCount={0} />);
    expect(screen.queryByText('(0)')).toBeNull();
  });

  it('calls onSortToggle when clicked', () => {
    const onSortToggle = vi.fn();
    render(<TableToolbar {...defaultProps} onSortToggle={onSortToggle} />);
    fireEvent.click(screen.getByText('Sort'));
    expect(onSortToggle).toHaveBeenCalledTimes(1);
  });

  it('applies active styling when sortCount > 0', () => {
    render(<TableToolbar {...defaultProps} sortCount={1} />);
    const sortBtn = screen.getByText('Sort').closest('button');
    expect(sortBtn?.className).toContain('text-primary');
  });

  it('applies inactive styling when sortCount is 0', () => {
    render(<TableToolbar {...defaultProps} sortCount={0} />);
    const sortBtn = screen.getByText('Sort').closest('button');
    expect(sortBtn?.className).toContain('text-slate-500');
  });
});
