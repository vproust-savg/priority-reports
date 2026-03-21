// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/FilterToolbar.tsx
// PURPOSE: Compact toolbar row with "Filter" toggle button and
//          active filter count badge. Opens/closes the filter panel.
// USED BY: ReportTableWidget
// EXPORTS: FilterToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, ChevronDown } from 'lucide-react';

interface FilterToolbarProps {
  activeFilterCount: number;
  isOpen: boolean;
  onToggle: () => void;
}

export default function FilterToolbar({ activeFilterCount, isOpen, onToggle }: FilterToolbarProps) {
  const hasFilters = activeFilterCount > 0;

  return (
    <div className="px-5 py-2 border-b border-slate-100">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          hasFilters
            ? 'text-primary bg-primary/5 hover:bg-primary/10'
            : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
    </div>
  );
}
