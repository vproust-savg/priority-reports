// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ReportSubTabs.test.tsx
// PURPOSE: Tests for ReportSubTabs component.
// USED BY: Vitest
// EXPORTS: (none)
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ReportSubTabs from './ReportSubTabs';

// WHY: Framer Motion layout animations need a mock to avoid errors in JSDOM.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { layoutId, layout, ...rest } = props;
      return <div data-layout-id={layoutId as string} {...rest}>{children}</div>;
    },
  },
  LayoutGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

const defaultProps = {
  activeTab: 'active' as const,
  onTabChange: vi.fn(),
};

describe('ReportSubTabs', () => {
  it('renders both "Active" and "Extended" tab labels', () => {
    render(<ReportSubTabs {...defaultProps} />);
    expect(screen.getByText('Active')).toBeDefined();
    expect(screen.getByText('Extended')).toBeDefined();
  });

  it('applies active styling to Active tab when activeTab is "active"', () => {
    render(<ReportSubTabs {...defaultProps} activeTab="active" />);
    const activeButton = screen.getByText('Active').closest('button');
    expect(activeButton?.className).toContain('font-semibold');
  });

  it('applies active styling to Extended tab when activeTab is "extended"', () => {
    render(<ReportSubTabs {...defaultProps} activeTab="extended" />);
    const extendedButton = screen.getByText('Extended').closest('button');
    expect(extendedButton?.className).toContain('font-semibold');
  });

  it('does not apply active styling to inactive tab', () => {
    render(<ReportSubTabs {...defaultProps} activeTab="active" />);
    const extendedButton = screen.getByText('Extended').closest('button');
    expect(extendedButton?.className).not.toContain('font-semibold');
    expect(extendedButton?.className).toContain('font-medium');
  });

  it('calls onTabChange with "extended" when Extended tab clicked', () => {
    const onTabChange = vi.fn();
    render(<ReportSubTabs {...defaultProps} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Extended'));
    expect(onTabChange).toHaveBeenCalledWith('extended');
  });

  it('calls onTabChange with "active" when Active tab clicked', () => {
    const onTabChange = vi.fn();
    render(<ReportSubTabs {...defaultProps} activeTab="extended" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Active'));
    expect(onTabChange).toHaveBeenCalledWith('active');
  });

  it('does not call onTabChange if already-active tab clicked', () => {
    const onTabChange = vi.fn();
    render(<ReportSubTabs {...defaultProps} activeTab="active" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('Active'));
    expect(onTabChange).not.toHaveBeenCalled();
  });

  it('shows extendedCount badge when count > 0', () => {
    render(<ReportSubTabs {...defaultProps} extendedCount={12} />);
    expect(screen.getByText('(12)')).toBeDefined();
  });

  it('does not show badge when count is 0', () => {
    render(<ReportSubTabs {...defaultProps} extendedCount={0} />);
    expect(screen.queryByText('(0)')).toBeNull();
  });

  it('does not show badge when count is undefined', () => {
    render(<ReportSubTabs {...defaultProps} />);
    expect(screen.queryByText(/\(\d+\)/)).toBeNull();
  });

  it('badge text matches extendedCount value', () => {
    render(<ReportSubTabs {...defaultProps} extendedCount={42} />);
    expect(screen.getByText('(42)')).toBeDefined();
  });

  it('tab buttons have implicit button role — keyboard accessible', () => {
    render(<ReportSubTabs {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
  });

  it('renders without crashing when extendedCount is 1000', () => {
    render(<ReportSubTabs {...defaultProps} extendedCount={1000} />);
    expect(screen.getByText('(1000)')).toBeDefined();
  });
});
