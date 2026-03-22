// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/columns/ColumnRow.test.tsx
// PURPOSE: Tests for ColumnRow — toggle behavior, locked state,
//          and disabled button accessibility.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ColumnRow from './ColumnRow';
import type { ManagedColumn } from '../../hooks/useColumnManager';

// WHY: ColumnRow uses useSortable from dnd-kit which requires DndContext.
// We mock useSortable to isolate toggle/disabled behavior from drag logic.
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => undefined } },
}));

const visibleColumn: ManagedColumn = { key: 'col1', label: 'Column One', visible: true };

describe('ColumnRow', () => {
  it('calls onToggle when clicked and not locked', () => {
    const onToggle = vi.fn();
    render(
      <ColumnRow column={visibleColumn} isLocked={false} isDragDisabled={false} onToggle={onToggle} />,
    );
    const toggle = screen.getByRole('button', { name: /hide column one/i });
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle when clicked and locked', () => {
    const onToggle = vi.fn();
    render(
      <ColumnRow column={visibleColumn} isLocked={true} isDragDisabled={false} onToggle={onToggle} />,
    );
    const toggle = screen.getByRole('button', { name: /hide column one/i });
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });

  // WHY: This is the key accessibility fix. Without `disabled`, a locked
  // button can still be activated via keyboard (Tab + Enter/Space).
  // The button should have the HTML disabled attribute when locked.
  it('toggle button has disabled attribute when locked', () => {
    const onToggle = vi.fn();
    render(
      <ColumnRow column={visibleColumn} isLocked={true} isDragDisabled={false} onToggle={onToggle} />,
    );
    const toggle = screen.getByRole('button', { name: /hide column one/i });
    expect(toggle).toBeDisabled();
  });

  it('toggle button is NOT disabled when not locked', () => {
    const onToggle = vi.fn();
    render(
      <ColumnRow column={visibleColumn} isLocked={false} isDragDisabled={false} onToggle={onToggle} />,
    );
    const toggle = screen.getByRole('button', { name: /hide column one/i });
    expect(toggle).not.toBeDisabled();
  });
});
