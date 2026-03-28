# Sort Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable, multi-column sort panel to the dashboard toolbar — client-side sorting with drag-to-reorder priority, visually consistent with existing Filter and Columns panels.

**Architecture:** New `useSortManager` hook owns sort state + comparator logic. `SortPanel` + `SortRuleRow` components render the UI with `@dnd-kit` drag-and-drop. `TableToolbar` gets a Sort button. `ReportTableWidget` orchestrates everything — pipes data through `sortedData()` before rendering.

**Tech Stack:** React 19, Vitest, React Testing Library, @dnd-kit/core + @dnd-kit/sortable, Framer Motion, Tailwind CSS v4, lucide-react

**Spec:** `docs/superpowers/specs/2026-03-28-sort-panel-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `client/src/hooks/useSortManager.ts` | Sort state (rules CRUD), `sortedData()` comparator, column cleanup |
| `client/src/hooks/useSortManager.test.ts` | Hook tests — CRUD, sorting, nulls, immutability, column cleanup |
| `client/src/components/sort/SortRuleRow.tsx` | Single sort rule row — drag handle, column picker, direction toggle, delete |
| `client/src/components/sort/SortRuleRow.test.tsx` | Row component tests |
| `client/src/components/sort/SortPanel.tsx` | Panel container — dnd-kit context, rule list, add/clear buttons |
| `client/src/components/sort/SortPanel.test.tsx` | Panel component tests |
| `client/src/components/TableToolbar.test.tsx` | Toolbar tests — sort button rendering, badge, toggle |

### Modified Files

| File | Change |
|------|--------|
| `client/src/components/TableToolbar.tsx` | Add Sort button + 3 new props |
| `client/src/components/widgets/ReportTableWidget.tsx` | Wire `useSortManager`, sort panel render, panel mutual exclusivity |

---

## Task 1: `useSortManager` Hook — Tests

**Files:**
- Create: `client/src/hooks/useSortManager.test.ts`

- [ ] **Step 1: Create the test file with CRUD tests**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSortManager.test.ts
// PURPOSE: Tests for useSortManager hook — sort rules CRUD,
//          multi-column sorting, null handling, immutability.
// USED BY: npm test
// ═══════════════════════════════════════════════════════════════

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortManager } from './useSortManager';
import type { ColumnDefinition } from '@shared/types';

const makeColumns = (keys: string[], types?: Record<string, ColumnDefinition['type']>): ColumnDefinition[] =>
  keys.map((key) => ({ key, label: key.toUpperCase(), type: types?.[key] ?? 'string' }));

describe('useSortManager', () => {
  // --- CRUD ---

  it('starts with no sort rules', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    expect(result.current.sortRules).toHaveLength(0);
    expect(result.current.sortCount).toBe(0);
  });

  it('addSort() adds a rule with first column and ascending', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(1);
    expect(result.current.sortRules[0].columnKey).toBe('name');
    expect(result.current.sortRules[0].direction).toBe('asc');
    expect(result.current.sortCount).toBe(1);
  });

  it('addSort(columnKey) adds a rule for the specified column', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    expect(result.current.sortRules[0].columnKey).toBe('price');
  });

  it('addSort skips columns already in use', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(2);
    expect(result.current.sortRules[1].columnKey).toBe('price');
  });

  it('addSort is a no-op when all columns are used', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.addSort());
    expect(result.current.sortRules).toHaveLength(2);
  });

  it('removeSort removes a rule by id', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.removeSort(id));
    expect(result.current.sortRules).toHaveLength(0);
  });

  it('updateSort changes direction', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    expect(result.current.sortRules[0].direction).toBe('desc');
  });

  it('updateSort changes columnKey', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { columnKey: 'price' }));
    expect(result.current.sortRules[0].columnKey).toBe('price');
  });

  it('reorderSorts swaps rule priority', () => {
    const cols = makeColumns(['name', 'price', 'date']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.reorderSorts(0, 1));
    expect(result.current.sortRules[0].columnKey).toBe('price');
    expect(result.current.sortRules[1].columnKey).toBe('name');
  });

  it('clearAll removes all rules', () => {
    const cols = makeColumns(['name', 'price']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    act(() => result.current.clearAll());
    expect(result.current.sortRules).toHaveLength(0);
    expect(result.current.sortCount).toBe(0);
  });

  // --- Sorting ---

  it('sorts strings ascending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('sorts strings descending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ name: 'banana' }, { name: 'apple' }, { name: 'cherry' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['cherry', 'banana', 'apple']);
  });

  it('sorts numbers ascending', () => {
    const cols = makeColumns(['price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.price)).toEqual([10, 20, 30]);
  });

  it('sorts numbers descending', () => {
    const cols = makeColumns(['price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('price'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ price: 30 }, { price: 10 }, { price: 20 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.price)).toEqual([30, 20, 10]);
  });

  it('sorts currency as numbers', () => {
    const cols = makeColumns(['amount'], { amount: 'currency' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('amount'));
    const data = [{ amount: 99.99 }, { amount: 5.50 }, { amount: 42.00 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.amount)).toEqual([5.50, 42.00, 99.99]);
  });

  it('sorts percent as numbers', () => {
    const cols = makeColumns(['rate'], { rate: 'percent' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('rate'));
    const data = [{ rate: 75 }, { rate: 25 }, { rate: 50 }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.rate)).toEqual([25, 50, 75]);
  });

  it('sorts dates chronologically', () => {
    const cols = makeColumns(['date'], { date: 'date' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('date'));
    const data = [{ date: '2026-03-28' }, { date: '2026-01-15' }, { date: '2026-06-01' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.date)).toEqual(['2026-01-15', '2026-03-28', '2026-06-01']);
  });

  it('multi-column sort: primary asc, secondary desc', () => {
    const cols = makeColumns(['category', 'price'], { price: 'number' });
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('category'));
    act(() => result.current.addSort('price'));
    // WHY: Set second rule to desc to test multi-column
    const priceId = result.current.sortRules[1].id;
    act(() => result.current.updateSort(priceId, { direction: 'desc' }));
    const data = [
      { category: 'B', price: 10 },
      { category: 'A', price: 5 },
      { category: 'A', price: 20 },
      { category: 'B', price: 30 },
    ];
    const sorted = result.current.sortedData(data);
    expect(sorted).toEqual([
      { category: 'A', price: 20 },
      { category: 'A', price: 5 },
      { category: 'B', price: 30 },
      { category: 'B', price: 10 },
    ]);
  });

  // --- Null handling ---

  it('null values sort last when ascending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: null }, { name: 'apple' }, { name: 'banana' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', 'banana', null]);
  });

  it('null values sort last when descending', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const id = result.current.sortRules[0].id;
    act(() => result.current.updateSort(id, { direction: 'desc' }));
    const data = [{ name: null }, { name: 'apple' }, { name: 'banana' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['banana', 'apple', null]);
  });

  it('undefined values sort last', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: undefined }, { name: 'apple' }];
    const sorted = result.current.sortedData(data);
    expect(sorted.map((r) => r.name)).toEqual(['apple', undefined]);
  });

  // --- Immutability ---

  it('sortedData does not mutate the input array', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    const data = [{ name: 'banana' }, { name: 'apple' }];
    const original = JSON.stringify(data);
    result.current.sortedData(data);
    expect(JSON.stringify(data)).toBe(original);
  });

  // --- Edge cases ---

  it('sortedData with no rules returns original order', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    const data = [{ name: 'banana' }, { name: 'apple' }];
    const sorted = result.current.sortedData(data);
    expect(sorted).toEqual(data);
  });

  it('sortedData with empty array returns empty array', () => {
    const cols = makeColumns(['name']);
    const { result } = renderHook(() => useSortManager(cols));
    act(() => result.current.addSort('name'));
    expect(result.current.sortedData([])).toEqual([]);
  });

  // --- Column cleanup ---

  it('removes sort rules when their column disappears', () => {
    const cols = makeColumns(['name', 'price']);
    const { result, rerender } = renderHook(
      ({ columns }) => useSortManager(columns),
      { initialProps: { columns: cols } },
    );
    act(() => result.current.addSort('name'));
    act(() => result.current.addSort('price'));
    expect(result.current.sortRules).toHaveLength(2);

    // WHY: Simulate hiding the "price" column — only "name" remains
    rerender({ columns: makeColumns(['name']) });
    expect(result.current.sortRules).toHaveLength(1);
    expect(result.current.sortRules[0].columnKey).toBe('name');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/useSortManager.test.ts`

Expected: FAIL — `Cannot find module './useSortManager'`

- [ ] **Step 3: Commit test file**

```bash
git add client/src/hooks/useSortManager.test.ts
git commit -m "test: add useSortManager hook tests (red phase)"
```

---

## Task 2: `useSortManager` Hook — Implementation

**Files:**
- Create: `client/src/hooks/useSortManager.ts`

- [ ] **Step 1: Create the hook**

```ts
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useSortManager.ts
// PURPOSE: Manages multi-column sort state and provides a
//          sortedData() function for client-side sorting.
//          Session-only state — resets on page reload.
// USED BY: ReportTableWidget
// EXPORTS: useSortManager, SortRule (type)
// ═══════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import type { ColumnDefinition } from '@shared/types';

export interface SortRule {
  id: string;
  columnKey: string;
  direction: 'asc' | 'desc';
}

export function useSortManager(columns: ColumnDefinition[]) {
  const [sortRules, setSortRules] = useState<SortRule[]>([]);
  const [isSortPanelOpen, setIsSortPanelOpen] = useState(false);

  // --- Column cleanup ---
  // WHY: When visible columns change (user hides a column), remove sort rules
  // referencing columns that no longer exist. Same defensive pattern as
  // useColumnManager reinitializing on column changes.
  const prevColumnsKey = useRef('');

  useEffect(() => {
    const columnsKey = columns.map((c) => c.key).join(',');
    if (columnsKey === prevColumnsKey.current) return;
    prevColumnsKey.current = columnsKey;
    const validKeys = new Set(columns.map((c) => c.key));
    setSortRules((prev) => {
      const filtered = prev.filter((r) => validKeys.has(r.columnKey));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [columns]);

  // --- CRUD ---

  const addSort = useCallback((columnKey?: string) => {
    setSortRules((prev) => {
      const usedKeys = new Set(prev.map((r) => r.columnKey));
      const targetKey = columnKey && !usedKeys.has(columnKey)
        ? columnKey
        : columns.find((c) => !usedKeys.has(c.key))?.key;
      if (!targetKey) return prev;
      return [...prev, { id: crypto.randomUUID(), columnKey: targetKey, direction: 'asc' }];
    });
  }, [columns]);

  const removeSort = useCallback((id: string) => {
    setSortRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateSort = useCallback((id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => {
    setSortRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    );
  }, []);

  const reorderSorts = useCallback((fromIndex: number, toIndex: number) => {
    setSortRules((prev) => arrayMove(prev, fromIndex, toIndex));
  }, []);

  const clearAll = useCallback(() => {
    setSortRules([]);
  }, []);

  // --- Sorting ---

  const sortedData = useCallback((data: Record<string, unknown>[]): Record<string, unknown>[] => {
    if (sortRules.length === 0 || data.length === 0) return data;

    // WHY: Build a column type lookup once, not per comparison
    const typeMap = new Map(columns.map((c) => [c.key, c.type]));

    return [...data].sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = a[rule.columnKey];
        const bVal = b[rule.columnKey];

        // WHY: Null/undefined sort last regardless of direction
        const aNull = aVal == null;
        const bNull = bVal == null;
        if (aNull && bNull) continue;
        if (aNull) return 1;
        if (bNull) return -1;

        const type = typeMap.get(rule.columnKey) ?? 'string';
        let cmp = 0;

        if (type === 'number' || type === 'currency' || type === 'percent') {
          cmp = Number(aVal) - Number(bVal);
        } else if (type === 'date') {
          cmp = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
        } else {
          cmp = String(aVal).localeCompare(String(bVal));
        }

        if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [sortRules, columns]);

  return {
    sortRules,
    sortedData,
    addSort,
    removeSort,
    updateSort,
    reorderSorts,
    clearAll,
    isSortPanelOpen,
    setIsSortPanelOpen,
    sortCount: sortRules.length,
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd client && npx vitest run src/hooks/useSortManager.test.ts`

Expected: ALL PASS

- [ ] **Step 3: Run full test suite to check no regressions**

Run: `cd client && npx vitest run`

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/hooks/useSortManager.ts
git commit -m "feat: add useSortManager hook for multi-column client-side sorting"
```

---

## Task 3: `SortRuleRow` Component — Tests

**Files:**
- Create: `client/src/components/sort/SortRuleRow.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/sort/SortRuleRow.test.tsx`

Expected: FAIL — `Cannot find module './SortRuleRow'`

- [ ] **Step 3: Commit test file**

```bash
git add client/src/components/sort/SortRuleRow.test.tsx
git commit -m "test: add SortRuleRow component tests (red phase)"
```

---

## Task 4: `SortRuleRow` Component — Implementation

**Files:**
- Create: `client/src/components/sort/SortRuleRow.tsx`

- [ ] **Step 1: Create the component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortRuleRow.tsx
// PURPOSE: Single sort rule row — drag handle, column picker,
//          direction toggle, and delete button.
// USED BY: SortPanel
// EXPORTS: SortRuleRow
// ═══════════════════════════════════════════════════════════════

import { GripVertical, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FILTER_INPUT_CLASS } from '../../config/filterConstants';
import type { SortRule } from '../../hooks/useSortManager';
import type { ColumnDefinition } from '@shared/types';

interface SortRuleRowProps {
  rule: SortRule;
  availableColumns: ColumnDefinition[];
  usedColumnKeys: Set<string>;
  onUpdate: (id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => void;
  onRemove: (id: string) => void;
}

export default function SortRuleRow({
  rule, availableColumns, usedColumnKeys, onUpdate, onRemove,
}: SortRuleRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // WHY: Show this rule's own column + any column not used by other rules
  const selectableColumns = availableColumns.filter(
    (c) => c.key === rule.columnKey || !usedColumnKeys.has(c.key),
  );

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 py-1.5 group/row">
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="cursor-grab active:cursor-grabbing p-0.5 text-slate-300 hover:text-slate-400
          opacity-0 group-hover/row:opacity-100 transition-opacity touch-none flex-shrink-0"
      >
        <GripVertical size={14} />
      </button>

      {/* Column picker */}
      <select
        role="combobox"
        value={rule.columnKey}
        onChange={(e) => onUpdate(rule.id, { columnKey: e.target.value })}
        className={`${FILTER_INPUT_CLASS} min-w-[140px]`}
      >
        {selectableColumns.map((col) => (
          <option key={col.key} value={col.key}>{col.label}</option>
        ))}
      </select>

      {/* Direction toggle */}
      <button
        onClick={() => onUpdate(rule.id, { direction: rule.direction === 'asc' ? 'desc' : 'asc' })}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200
          hover:bg-slate-50 text-sm text-slate-600 transition-colors flex-shrink-0"
      >
        {rule.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
        <span>{rule.direction === 'asc' ? 'Asc' : 'Desc'}</span>
      </button>

      {/* Delete button */}
      <button
        onClick={() => onRemove(rule.id)}
        aria-label="Remove sort rule"
        className="ml-1 p-1 text-slate-300 hover:text-red-400 rounded transition-colors flex-shrink-0
          opacity-0 group-hover/row:opacity-100"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/sort/SortRuleRow.test.tsx`

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/components/sort/SortRuleRow.tsx
git commit -m "feat: add SortRuleRow component"
```

---

## Task 5: `SortPanel` Component — Tests

**Files:**
- Create: `client/src/components/sort/SortPanel.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/sort/SortPanel.test.tsx`

Expected: FAIL — `Cannot find module './SortPanel'`

- [ ] **Step 3: Commit test file**

```bash
git add client/src/components/sort/SortPanel.test.tsx
git commit -m "test: add SortPanel component tests (red phase)"
```

---

## Task 6: `SortPanel` Component — Implementation

**Files:**
- Create: `client/src/components/sort/SortPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/sort/SortPanel.tsx
// PURPOSE: Panel container for managing sort rules. Shows
//          drag-reorderable sort rules with add/clear actions.
// USED BY: ReportTableWidget
// EXPORTS: SortPanel
// ═══════════════════════════════════════════════════════════════

import type { DragEndEvent } from '@dnd-kit/core';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { SortRule } from '../../hooks/useSortManager';
import type { ColumnDefinition } from '@shared/types';
import SortRuleRow from './SortRuleRow';

interface SortPanelProps {
  sortRules: SortRule[];
  columns: ColumnDefinition[];
  onAddSort: () => void;
  onRemoveSort: (id: string) => void;
  onUpdateSort: (id: string, updates: Partial<Pick<SortRule, 'columnKey' | 'direction'>>) => void;
  onReorderSorts: (fromIndex: number, toIndex: number) => void;
  onClearAll: () => void;
}

export default function SortPanel({
  sortRules, columns, onAddSort, onRemoveSort, onUpdateSort, onReorderSorts, onClearAll,
}: SortPanelProps) {
  // WHY: distance: 5 prevents accidental drags when clicking controls
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const usedColumnKeys = new Set(sortRules.map((r) => r.columnKey));
  const allColumnsUsed = usedColumnKeys.size >= columns.length;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = sortRules.findIndex((r) => r.id === active.id);
    const toIndex = sortRules.findIndex((r) => r.id === over.id);
    onReorderSorts(fromIndex, toIndex);
  }

  return (
    <div className="bg-white border-b border-slate-200 px-5 py-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortRules.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          {sortRules.map((rule) => (
            <SortRuleRow
              key={rule.id}
              rule={rule}
              availableColumns={columns}
              usedColumnKeys={usedColumnKeys}
              onUpdate={onUpdateSort}
              onRemove={onRemoveSort}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add sort button */}
      <button
        onClick={onAddSort}
        disabled={allColumnsUsed}
        className="text-xs font-medium text-primary hover:text-primary/70 transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed mt-2"
      >
        + Add sort
      </button>

      {/* Clear all — only visible when rules exist */}
      {sortRules.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={onClearAll}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/sort/SortPanel.test.tsx`

Expected: ALL PASS

- [ ] **Step 3: Run SortRuleRow tests too (regression check)**

Run: `cd client && npx vitest run src/components/sort/`

Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/components/sort/SortPanel.tsx
git commit -m "feat: add SortPanel component with drag-and-drop reordering"
```

---

## Task 7: `TableToolbar` — Tests

**Files:**
- Create: `client/src/components/TableToolbar.test.tsx`
- Modify: `client/src/components/TableToolbar.tsx:9-22,24-29,63`

- [ ] **Step 1: Create toolbar test file**

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/TableToolbar.test.tsx`

Expected: FAIL — `sortCount` prop not recognized / Sort button not rendered

- [ ] **Step 3: Commit test file**

```bash
git add client/src/components/TableToolbar.test.tsx
git commit -m "test: add TableToolbar sort button tests (red phase)"
```

---

## Task 8: `TableToolbar` — Add Sort Button

**Files:**
- Modify: `client/src/components/TableToolbar.tsx`

- [ ] **Step 1: Update the component**

Replace the entire file content with:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Toolbar row with Filter, Columns, Sort, Refresh, and
//          Export buttons. Shows badges for active state.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, Columns3, ArrowUpDown, ChevronDown, Download, Loader2, RefreshCw } from 'lucide-react';

interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
  sortCount: number;
  isSortPanelOpen: boolean;
  onSortToggle: () => void;
  isExporting: boolean;
  onExport: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  sortCount, isSortPanelOpen, onSortToggle,
  isExporting, onExport,
  isRefreshing, onRefresh,
}: TableToolbarProps) {
  const hasFilters = activeFilterCount > 0;
  const hasHiddenColumns = hiddenColumnCount > 0;
  const hasSorts = sortCount > 0;

  const baseClass = 'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors';
  const activeClass = 'text-primary bg-primary/5 hover:bg-primary/10';
  const inactiveClass = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

  return (
    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1">
      <button
        onClick={onFilterToggle}
        className={`${baseClass} ${hasFilters ? activeClass : inactiveClass}`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <button
        onClick={onColumnToggle}
        className={`${baseClass} ${hasHiddenColumns ? activeClass : inactiveClass}`}
      >
        <Columns3 size={16} />
        <span>Columns</span>
        {hasHiddenColumns && <span>({hiddenColumnCount} hidden)</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isColumnPanelOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <button
        onClick={onSortToggle}
        className={`${baseClass} ${hasSorts ? activeClass : inactiveClass}`}
      >
        <ArrowUpDown size={16} />
        <span>Sort</span>
        {hasSorts && <span>({sortCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isSortPanelOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* WHY: Refresh and Export pushed right together */}
      <div className="ml-auto flex items-center gap-1">
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`${baseClass} ${inactiveClass} disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Refresh data (clears cache)"
        >
          <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
        </button>

        <button
          onClick={onExport}
          disabled={isExporting}
          className={`${baseClass} ${inactiveClass} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isExporting
            ? <Loader2 size={16} className="animate-spin" />
            : <Download size={16} />}
          <span>{isExporting ? 'Exporting...' : 'Export'}</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd client && npx vitest run src/components/TableToolbar.test.tsx`

Expected: ALL PASS

- [ ] **Step 3: TypeScript check (will fail until ReportTableWidget is updated)**

Run: `cd client && npx tsc -b --noEmit 2>&1 | head -20`

Expected: Type errors in `ReportTableWidget.tsx` — missing `sortCount`, `isSortPanelOpen`, `onSortToggle` props. This is expected and fixed in Task 9.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TableToolbar.tsx
git commit -m "feat: add Sort button to TableToolbar"
```

---

## Task 9: Wire Everything in `ReportTableWidget`

**Files:**
- Modify: `client/src/components/widgets/ReportTableWidget.tsx`

- [ ] **Step 1: Update ReportTableWidget**

Replace the entire file content with:

```tsx
// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/ReportTableWidget.tsx
// PURPOSE: Report widget — server-side filtering, client-side
//          sorting, column management, expandable rows.
// USED BY: widgetRegistry.ts (registered as 'table' type)
// EXPORTS: ReportTableWidget
// ═══════════════════════════════════════════════════════════════

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useReportQuery } from '../../hooks/useReportQuery';
import { useFiltersQuery } from '../../hooks/useFiltersQuery';
import { useFilterState } from '../../hooks/useFilterState';
import { useColumnManager } from '../../hooks/useColumnManager';
import { useSortManager } from '../../hooks/useSortManager';
import { useExport } from '../../hooks/useExport';
import { AnimatePresence, motion } from 'framer-motion';
import { EASE_FAST } from '../../config/animationConstants';
import TableToolbar from '../TableToolbar';
import FilterBuilder from '../filter/FilterBuilder';
import ColumnManagerPanel from '../columns/ColumnManagerPanel';
import SortPanel from '../sort/SortPanel';
import ReportTable from '../ReportTable';
import Pagination from '../Pagination';
import Toast from '../Toast';
import LoadingToast from '../LoadingToast';
import EmptyState from '../EmptyState';
import ErrorState from '../ErrorState';
import { countActiveFilters } from '../../config/filterConstants';
import { getDetailComponent } from '../../config/detailRegistry';

export default function ReportTableWidget({ reportId }: { reportId: string }) {
  const {
    filterGroup, debouncedGroup, page, setPage,
    isFilterOpen, setIsFilterOpen, handleFilterChange,
  } = useFilterState();

  const filtersQuery = useFiltersQuery(reportId);
  const filterColumns = filtersQuery.data?.columns ?? [];

  const query = useReportQuery(reportId, {
    filterGroup: debouncedGroup,
    page,
    pageSize: 50,
  });

  const {
    managedColumns, visibleColumns, hiddenCount,
    isColumnPanelOpen, setIsColumnPanelOpen,
    toggleColumn, reorderColumns, showAll, hideAll,
  } = useColumnManager(query.data?.columns);

  const {
    sortRules, sortedData, addSort, removeSort, updateSort,
    reorderSorts, clearAll: clearAllSorts,
    isSortPanelOpen, setIsSortPanelOpen, sortCount,
  } = useSortManager(visibleColumns);

  // WHY: Stable reference for useExport dependency — only changes when
  // the actual set of visible column keys changes, not on every render.
  const visibleColumnKeys = useMemo(
    () => visibleColumns.map((c) => c.key),
    [visibleColumns],
  );

  const { isExporting, toast, clearToast, triggerExport } = useExport(
    reportId, debouncedGroup, visibleColumnKeys,
  );
  const filterLoadError = filtersQuery.error;

  // --- Refresh logic ---
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/v1/reports/${reportId}/refresh`, { method: 'POST' });
      if (!res.ok) console.warn(`[refresh] Server returned ${res.status}`);
      await queryClient.invalidateQueries({ queryKey: ['report', reportId] });
    } finally {
      setIsRefreshing(false);
    }
  };

  const data = query.data;
  const displayData = data?.data ?? [];

  // --- Expand state ---
  const expandConfig = data?.meta?.expandConfig;
  const DetailComponent = expandConfig ? getDetailComponent(reportId) : null;

  const [expandedRows, setExpandedRows] = useState<Set<string>>(() => new Set());
  const toggleExpand = useCallback((rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(rowKey) ? next.delete(rowKey) : next.add(rowKey);
      return next;
    });
  }, []);

  // --- Panel mutual exclusivity ---
  // WHY: Only one panel open at a time — opening one closes the others.
  const handleFilterToggle = () => {
    setIsFilterOpen(!isFilterOpen);
    setIsColumnPanelOpen(false);
    setIsSortPanelOpen(false);
  };
  const handleColumnToggle = () => {
    setIsColumnPanelOpen(!isColumnPanelOpen);
    setIsFilterOpen(false);
    setIsSortPanelOpen(false);
  };
  const handleSortToggle = () => {
    setIsSortPanelOpen(!isSortPanelOpen);
    setIsFilterOpen(false);
    setIsColumnPanelOpen(false);
  };

  return (
    <>
      <TableToolbar
        activeFilterCount={countActiveFilters(filterGroup)}
        isFilterOpen={isFilterOpen}
        onFilterToggle={handleFilterToggle}
        hiddenColumnCount={hiddenCount}
        isColumnPanelOpen={isColumnPanelOpen}
        onColumnToggle={handleColumnToggle}
        sortCount={sortCount}
        isSortPanelOpen={isSortPanelOpen}
        onSortToggle={handleSortToggle}
        isExporting={isExporting}
        onExport={triggerExport}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      <AnimatePresence>
        {isFilterOpen && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <FilterBuilder
              filterGroup={filterGroup}
              onChange={handleFilterChange}
              columns={filterColumns}
              filterOptions={filtersQuery.data?.filters}
              filterOptionsLoading={filtersQuery.isLoading}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isColumnPanelOpen && (
          <motion.div
            key="column-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <ColumnManagerPanel
              managedColumns={managedColumns}
              onToggle={toggleColumn}
              onReorder={reorderColumns}
              onShowAll={showAll}
              onHideAll={hideAll}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSortPanelOpen && (
          <motion.div
            key="sort-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={EASE_FAST}
          >
            <SortPanel
              sortRules={sortRules}
              columns={visibleColumns}
              onAddSort={addSort}
              onRemoveSort={removeSort}
              onUpdateSort={updateSort}
              onReorderSorts={reorderSorts}
              onClearAll={clearAllSorts}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {filterLoadError && (
        <div className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50/80 border border-red-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-red-500" />
          <span>Failed to load filter options. Try refreshing the page.</span>
        </div>
      )}

      {data?.warnings && data.warnings.length > 0 && data.warnings.map((msg, i) => (
        <div key={`warn-${i}`} className="flex items-center gap-2 mx-5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50/80 border border-amber-200/60 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 text-amber-500" />
          <span>{msg}</span>
        </div>
      ))}

      {query.isLoading && <LoadingToast />}

      {query.error && <ErrorState onRetry={() => query.refetch()} />}

      {!query.isLoading && !query.error && displayData.length === 0 && <EmptyState />}

      {!query.isLoading && displayData.length > 0 && (
        <>
          <ReportTable
            columns={visibleColumns.length > 0 ? visibleColumns : data!.columns}
            data={sortedData(displayData)}
            rowStyleField={data?.meta?.rowStyleField}
            reportId={reportId}
            expandConfig={expandConfig && DetailComponent ? {
              rowKeyField: expandConfig.rowKeyField,
              DetailComponent,
            } : undefined}
            expandedRows={expandedRows}
            onToggleExpand={toggleExpand}
          />
          <Pagination
            page={page}
            pageSize={50}
            totalCount={data!.pagination.totalCount}
            totalPages={data!.pagination.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      <AnimatePresence>
        {toast && (
          <Toast message={toast.message} variant={toast.variant} onDismiss={clearToast} />
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Run full test suite**

Run: `cd client && npx vitest run`

Expected: ALL PASS

- [ ] **Step 3: TypeScript check**

Run: `cd client && npx tsc -b --noEmit`

Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/widgets/ReportTableWidget.tsx
git commit -m "feat: wire sort panel into ReportTableWidget with panel mutual exclusivity"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full client test suite**

Run: `cd client && npx vitest run`

Expected: ALL PASS — no regressions

- [ ] **Step 2: Run TypeScript checks (both client and server)**

Run: `cd client && npx tsc -b --noEmit && cd ../server && npx tsc --noEmit`

Expected: No errors in either

- [ ] **Step 3: Final commit (if any linting/formatting fixes needed)**

If clean, no commit needed. If fixes were made:

```bash
git add -A
git commit -m "chore: fix lint/formatting issues from sort panel implementation"
```
