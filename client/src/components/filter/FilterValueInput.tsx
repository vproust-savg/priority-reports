// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/filter/FilterValueInput.tsx
// PURPOSE: Renders the appropriate input widget based on the column's
//          filterType. Handles between/isBetween dual-input layout.
// USED BY: FilterConditionRow.tsx
// EXPORTS: FilterValueInput
// ═══════════════════════════════════════════════════════════════

import type { ColumnFilterMeta, FilterOperator, FilterOption, FiltersResponse } from '@shared/types';
import { FILTER_INPUT_CLASS } from '../../config/filterConstants';

interface FilterValueInputProps {
  column: ColumnFilterMeta;
  operator: FilterOperator;
  value: string;
  valueTo?: string;
  onChange: (value: string, valueTo?: string) => void;
  filterOptions: FiltersResponse['filters'] | undefined;
  filterOptionsLoading: boolean;
}

export default function FilterValueInput({
  column, operator, value, valueTo, onChange, filterOptions, filterOptionsLoading,
}: FilterValueInputProps) {
  const isBetweenOp = operator === 'between' || operator === 'isBetween';

  // WHY: Cast to generic record — column.enumKey is a string key
  // into the filters object (e.g., 'vendors', 'warehouses')
  const enumOptions: FilterOption[] = column.enumKey && filterOptions
    ? (filterOptions as Record<string, FilterOption[]>)[column.enumKey] ?? []
    : [];

  if (column.filterType === 'enum') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={filterOptionsLoading}
        className={`${FILTER_INPUT_CLASS} min-w-[140px] ${
          filterOptionsLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <option value="">{filterOptionsLoading ? 'Loading...' : 'Select...'}</option>
        {enumOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }

  if (column.filterType === 'date') {
    if (isBetweenOp) {
      return (
        <div className="flex items-center gap-1">
          <input type="date" value={value} onChange={(e) => onChange(e.target.value, valueTo)}
            className={`${FILTER_INPUT_CLASS} w-36`} />
          <span className="text-xs text-slate-400 px-1">and</span>
          <input type="date" value={valueTo ?? ''} onChange={(e) => onChange(value, e.target.value)}
            className={`${FILTER_INPUT_CLASS} w-36`} />
        </div>
      );
    }
    return (
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        className={`${FILTER_INPUT_CLASS} w-36`} />
    );
  }

  if (column.filterType === 'number' || column.filterType === 'currency') {
    const step = column.filterType === 'currency' ? '0.01' : '1';
    if (isBetweenOp) {
      return (
        <div className="flex items-center gap-1">
          <input type="number" step={step} value={value}
            onChange={(e) => onChange(e.target.value, valueTo)}
            placeholder="Min" className={`${FILTER_INPUT_CLASS} w-28`} />
          <span className="text-xs text-slate-400 px-1">and</span>
          <input type="number" step={step} value={valueTo ?? ''}
            onChange={(e) => onChange(value, e.target.value)}
            placeholder="Max" className={`${FILTER_INPUT_CLASS} w-28`} />
        </div>
      );
    }
    return (
      <input type="number" step={step} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..." className={`${FILTER_INPUT_CLASS} w-32`} />
    );
  }

  // Default: text
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder="Enter text..." className={`${FILTER_INPUT_CLASS} min-w-[140px]`} />
  );
}
