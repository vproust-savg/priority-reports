// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Toolbar row with Filter, Columns, Refresh, and Export buttons.
//          Shows active filter count and hidden column count badges.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { SlidersHorizontal, Columns3, ChevronDown, Download, Loader2, RefreshCw } from 'lucide-react';

interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
  isExporting: boolean;
  onExport: () => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  isExporting, onExport,
  isRefreshing, onRefresh,
}: TableToolbarProps) {
  const hasFilters = activeFilterCount > 0;
  const hasHiddenColumns = hiddenColumnCount > 0;

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
