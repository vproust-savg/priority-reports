// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortRuleRow.test.tsx
// PURPOSE: Tests for SortRuleRow — column picker, direction
//          toggle, delete button behavior.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SortRuleRow from './SortRuleRow';
import type { ColumnDefinition } from '@shared/types';

// WHY: SortRuleRow uses useSortable from dnd-kit. Mock to isolate
// component behavior from drag logic, same pattern as ColumnRow.test.tsx.
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

const allColumns: ColumnDefinition[] = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'date', label: 'Date', type: 'date' },
];

const rule = { id: 'rule-1', columnKey: 'name', direction: 'asc' as const };

describe('SortRuleRow', () => {
  it('renders a column picker with available columns', () => {
    const usedKeys = new Set<string>();
    render(
      <SortRuleRow rule={rule} availableColumns={allColumns} usedColumnKeys={usedKeys}
        onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );
    const select = screen.getByRole('combobox');
    expect(select).toBeTruthy();
    // WHY: All 3 columns available since usedKeys is empty
    expect(select.querySelectorAll('option')).toHaveLength(3);
  });

  it('excludes columns already used by other rules', () => {
    const usedKeys = new Set(['price']);
    render(
      <SortRuleRow rule={rule} availableColumns={allColumns} usedColumnKeys={usedKeys}
        onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    const optionValues = options.map((o) => o.getAttribute('value'));
    // WHY: "price" is used by another rule but "name" is this rule's own column — it stays
    expect(optionValues).toContain('name');
    expect(optionValues).toContain('date');
    expect(optionValues).not.toContain('price');
  });

  it('direction toggle shows "Asc" for ascending rule', () => {
    render(
      <SortRuleRow rule={rule} availableColumns={allColumns} usedColumnKeys={new Set()}
        onUpdate={vi.fn()} onRemove={vi.fn()} />,
    );
    expect(screen.getByText('Asc')).toBeTruthy();
  });

  it('clicking direction toggle calls onUpdate with desc', () => {
    const onUpdate = vi.fn();
    render(
      <SortRuleRow rule={rule} availableColumns={allColumns} usedColumnKeys={new Set()}
        onUpdate={onUpdate} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Asc'));
    expect(onUpdate).toHaveBeenCalledWith('rule-1', { direction: 'desc' });
  });

  it('clicking direction toggle on desc rule calls onUpdate with asc', () => {
    const descRule = { ...rule, direction: 'desc' as const };
    const onUpdate = vi.fn();
    render(
      <SortRuleRow rule={descRule} availableColumns={allColumns} usedColumnKeys={new Set()}
        onUpdate={onUpdate} onRemove={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('Desc'));
    expect(onUpdate).toHaveBeenCalledWith('rule-1', { direction: 'asc' });
  });

  it('delete button calls onRemove', () => {
    const onRemove = vi.fn();
    render(
      <SortRuleRow rule={rule} availableColumns={allColumns} usedColumnKeys={new Set()}
        onUpdate={vi.fn()} onRemove={onRemove} />,
    );
    const deleteBtn = screen.getByRole('button', { name: /remove sort/i });
    fireEvent.click(deleteBtn);
    expect(onRemove).toHaveBeenCalledWith('rule-1');
  });
});
