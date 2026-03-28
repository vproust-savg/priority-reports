// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortPanel.test.tsx
// PURPOSE: Tests for SortPanel — add/clear buttons, rule list.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SortPanel from './SortPanel';
import type { ColumnDefinition } from '@shared/types';
import type { SortRule } from '../../hooks/useSortManager';

// WHY: SortPanel uses DndContext + SortableContext. Mock dnd-kit
// to isolate panel behavior from drag logic.
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: {},
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

const columns: ColumnDefinition[] = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'price', label: 'Price', type: 'number' },
];

describe('SortPanel', () => {
  it('renders "Add sort" button when no rules exist', () => {
    render(
      <SortPanel sortRules={[]} columns={columns}
        onAddSort={vi.fn()} onRemoveSort={vi.fn()} onUpdateSort={vi.fn()}
        onReorderSorts={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(screen.getByText('+ Add sort')).toBeTruthy();
  });

  it('"Add sort" calls onAddSort', () => {
    const onAddSort = vi.fn();
    render(
      <SortPanel sortRules={[]} columns={columns}
        onAddSort={onAddSort} onRemoveSort={vi.fn()} onUpdateSort={vi.fn()}
        onReorderSorts={vi.fn()} onClearAll={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('+ Add sort'));
    expect(onAddSort).toHaveBeenCalledTimes(1);
  });

  it('"Clear all" is hidden when no rules exist', () => {
    render(
      <SortPanel sortRules={[]} columns={columns}
        onAddSort={vi.fn()} onRemoveSort={vi.fn()} onUpdateSort={vi.fn()}
        onReorderSorts={vi.fn()} onClearAll={vi.fn()} />,
    );
    expect(screen.queryByText('Clear all')).toBeNull();
  });

  it('"Clear all" is visible and calls onClearAll when rules exist', () => {
    const rules: SortRule[] = [{ id: 'r1', columnKey: 'name', direction: 'asc' }];
    const onClearAll = vi.fn();
    render(
      <SortPanel sortRules={rules} columns={columns}
        onAddSort={vi.fn()} onRemoveSort={vi.fn()} onUpdateSort={vi.fn()}
        onReorderSorts={vi.fn()} onClearAll={onClearAll} />,
    );
    const clearBtn = screen.getByText('Clear all');
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('"Add sort" is disabled when all columns are used', () => {
    const rules: SortRule[] = [
      { id: 'r1', columnKey: 'name', direction: 'asc' },
      { id: 'r2', columnKey: 'price', direction: 'asc' },
    ];
    render(
      <SortPanel sortRules={rules} columns={columns}
        onAddSort={vi.fn()} onRemoveSort={vi.fn()} onUpdateSort={vi.fn()}
        onReorderSorts={vi.fn()} onClearAll={vi.fn()} />,
    );
    const addBtn = screen.getByText('+ Add sort');
    expect(addBtn).toBeDisabled();
  });
});
