// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/FilterBar.tsx
// PURPOSE: Horizontal filter bar with date range and dropdown filters.
//          Renders inside widget card, above the table. Uses native
//          HTML inputs — no external date picker or dropdown library.
// USED BY: ReportTableWidget
// EXPORTS: FilterBar
// ═══════════════════════════════════════════════════════════════

import type { FiltersResponse, FilterValues } from '@shared/types';

interface FilterBarProps {
  filters: FiltersResponse['filters'] | undefined;
  filtersLoading: boolean;
  values: FilterValues;
  onChange: (values: FilterValues) => void;
}

export default function FilterBar({ filters, filtersLoading, values, onChange }: FilterBarProps) {
  const update = (field: keyof FilterValues, value: string) => {
    onChange({ ...values, [field]: value });
  };

  const labelClass = 'text-xs font-medium text-slate-500 uppercase tracking-wider';
  const inputClass =
    'text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-colors';

  return (
    // WHY: bg-slate-50/60 creates visual separation from table content — matches table header tint
    <div className="flex flex-col lg:flex-row flex-wrap items-start lg:items-end gap-4 px-5 py-4 bg-slate-50/60 border-b border-slate-100">
      <div className="flex flex-col gap-1">
        <label className={labelClass}>From</label>
        <input
          type="date"
          value={values.from}
          onChange={(e) => update('from', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>To</label>
        <input
          type="date"
          value={values.to}
          onChange={(e) => update('to', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Vendor</label>
        <select
          value={values.vendor}
          onChange={(e) => update('vendor', e.target.value)}
          disabled={filtersLoading}
          className={`${inputClass} ${filtersLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">{filtersLoading ? 'Loading...' : 'All Vendors'}</option>
          {filters?.vendors.map((v) => (
            <option key={v.value} value={v.value}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Status</label>
        <select
          value={values.status}
          onChange={(e) => update('status', e.target.value)}
          disabled={filtersLoading}
          className={`${inputClass} ${filtersLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <option value="">{filtersLoading ? 'Loading...' : 'All Statuses'}</option>
          {filters?.statuses.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
