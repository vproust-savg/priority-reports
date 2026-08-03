// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/EnvToggle.test.tsx
// PURPOSE: EnvToggle renders Live/UAT segments, fires onChange with
//          the PriorityEnvironment value, and shows the UAT badge
//          only in UAT mode.
// USED BY: Vitest
// ═══════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EnvToggle from './EnvToggle';

describe('EnvToggle', () => {
  it('renders both segments and marks the active one', () => {
    render(<EnvToggle value="production" onChange={() => {}} />);
    // WHY: getAttribute, not jest-dom's toHaveAttribute — keeps the test
    // independent of whether jest-dom matchers are registered.
    expect(screen.getByRole('button', { name: 'Live' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'UAT' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByText(/test data/i)).toBeNull();
  });

  it('fires onChange with uat and shows the badge in UAT mode', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EnvToggle value="production" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'UAT' }));
    expect(onChange).toHaveBeenCalledWith('uat');

    rerender(<EnvToggle value="uat" onChange={onChange} />);
    expect(screen.getByText(/UAT — test data/)).toBeTruthy();
  });
});
