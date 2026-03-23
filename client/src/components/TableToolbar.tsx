// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Toolbar row with "Filter" and "Columns" toggle buttons.
//          Shows active filter count and hidden column count badges.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SlidersHorizontal, Columns3, ChevronDown, Download, Loader2 } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_STIFF } from '../config/animationConstants';

interface TableToolbarProps {
  activeFilterCount: number;
  isFilterOpen: boolean;
  onFilterToggle: () => void;
  hiddenColumnCount: number;
  isColumnPanelOpen: boolean;
  onColumnToggle: () => void;
  isExporting: boolean;
  onExport: () => void;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  isExporting, onExport,
}: TableToolbarProps) {
  const reduced = useReducedMotion();
  const tapAnimation = reduced ? undefined : { scale: 0.97 };
  const hasFilters = activeFilterCount > 0;
  const hasHiddenColumns = hiddenColumnCount > 0;

  const baseClass = 'flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors';
  const activeClass = 'text-primary bg-primary/5 hover:bg-primary/10';
  const inactiveClass = 'text-slate-500 hover:text-slate-700 hover:bg-slate-50';

  return (
    <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1">
      {/* Filter button */}
      <motion.button
        onClick={onFilterToggle}
        whileTap={tapAnimation} transition={SPRING_STIFF}
        className={`${baseClass} ${hasFilters ? activeClass : inactiveClass}`}
      >
        <SlidersHorizontal size={16} />
        <span>Filter</span>
        {hasFilters && <span>({activeFilterCount})</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isFilterOpen ? 'rotate-180' : ''}`}
        />
      </motion.button>

      {/* Columns button */}
      <motion.button
        onClick={onColumnToggle}
        whileTap={tapAnimation} transition={SPRING_STIFF}
        className={`${baseClass} ${hasHiddenColumns ? activeClass : inactiveClass}`}
      >
        <Columns3 size={16} />
        <span>Columns</span>
        {hasHiddenColumns && <span>({hiddenColumnCount} hidden)</span>}
        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isColumnPanelOpen ? 'rotate-180' : ''}`}
        />
      </motion.button>

      {/* Export button — action (not a toggle), pushed right */}
      <motion.button
        onClick={onExport}
        disabled={isExporting}
        whileTap={tapAnimation} transition={SPRING_STIFF}
        className={`ml-auto ${baseClass} ${inactiveClass}
          disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isExporting
          ? <Loader2 size={16} className="animate-spin" />
          : <Download size={16} />}
        <span>{isExporting ? 'Exporting...' : 'Export'}</span>
      </motion.button>
    </div>
  );
}
