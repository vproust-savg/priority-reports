// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableToolbar.tsx
// PURPOSE: Icon-based toolbar matching SG Interface design system.
//          28px round buttons with three visual states (default,
//          active/badge, open). Expandable search bar.
// USED BY: ReportTableWidget
// EXPORTS: TableToolbar
// ═══════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { SlidersHorizontal, Columns3, ArrowUpDown, Download, Loader2, RefreshCw, CalendarClock } from 'lucide-react';

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
  onBulkExtend?: () => void;
  searchTerm?: string;
  onSearch?: (term: string) => void;
  totalRows?: number;
  filteredRows?: number;
}

export default function TableToolbar({
  activeFilterCount, isFilterOpen, onFilterToggle,
  hiddenColumnCount, isColumnPanelOpen, onColumnToggle,
  sortCount, isSortPanelOpen, onSortToggle,
  isExporting, onExport,
  isRefreshing, onRefresh,
  onBulkExtend,
  searchTerm = '', onSearch,
  totalRows, filteredRows,
}: TableToolbarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  /* WHY: Click-outside closes any open panel — matches Sales Dashboard v1 pattern */
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        if (isFilterOpen) onFilterToggle();
        if (isColumnPanelOpen) onColumnToggle();
        if (isSortPanelOpen) onSortToggle();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isFilterOpen, isColumnPanelOpen, isSortPanelOpen, onFilterToggle, onColumnToggle, onSortToggle]);

  const isFiltered = totalRows !== undefined && filteredRows !== undefined && totalRows !== filteredRows;

  return (
    <div ref={barRef} className="sticky top-0 z-10 bg-[var(--color-bg-card)]">
      <div className="flex items-center gap-2 px-[var(--spacing-3xl)] py-[var(--spacing-base)] border-b border-[var(--color-gold-subtle)]">
        {onSearch && <ExpandableSearch searchTerm={searchTerm} onSearch={onSearch} />}

        <ToolbarIcon
          isOpen={isFilterOpen} isActive={activeFilterCount > 0}
          badge={activeFilterCount || null} onClick={onFilterToggle}
          icon={<SlidersHorizontal size={14} />} label="Filter"
        />
        <ToolbarIcon
          isOpen={isColumnPanelOpen} isActive={hiddenColumnCount > 0}
          badge={hiddenColumnCount || null} onClick={onColumnToggle}
          icon={<Columns3 size={14} />} label="Columns"
        />
        <ToolbarIcon
          isOpen={isSortPanelOpen} isActive={sortCount > 0}
          badge={sortCount || null} onClick={onSortToggle}
          icon={<ArrowUpDown size={14} />} label="Sort"
        />

        <div className="flex-1" />

        {isFiltered && (
          <span className="text-[11px] text-[var(--color-text-muted)]">
            {filteredRows} of {totalRows}
          </span>
        )}

        <ToolbarIcon
          isOpen={false} isActive={false} badge={null}
          onClick={onRefresh} spinning={isRefreshing}
          icon={<RefreshCw size={14} />} label="Refresh"
        />
        {onBulkExtend && (
          <ToolbarIcon
            isOpen={false} isActive={false} badge={null}
            onClick={onBulkExtend}
            icon={<CalendarClock size={14} />} label="Extend"
          />
        )}
        <ToolbarIcon
          isOpen={false} isActive={false} badge={null}
          onClick={onExport} spinning={isExporting}
          icon={<Download size={14} />} label="Export"
        />
      </div>
    </div>
  );
}

/* --- Reusable icon button with three visual states --- */

function ToolbarIcon({ isOpen, isActive, badge, icon, spinning, onClick, label }: {
  isOpen: boolean; isActive: boolean; badge: number | null;
  icon: React.ReactNode; spinning?: boolean; onClick?: () => void; label: string;
}) {
  const cls = isOpen
    ? 'bg-[var(--color-gold-primary)] text-white'
    : isActive
    ? 'border border-[var(--color-gold-primary)] text-[var(--color-gold-primary)]'
    : 'border border-[var(--color-gold-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-gold-primary)] hover:text-[var(--color-text-secondary)]';

  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      className={`relative w-7 h-7 rounded-full flex items-center justify-center transition-all duration-150 ${cls}`}
    >
      {spinning ? <Loader2 size={14} className="animate-spin" /> : icon}
      {badge !== null && !isOpen && (
        <span className="absolute -top-1 -right-1 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-[var(--color-gold-primary)] px-0.5 text-[8px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

/* --- Expandable search bar (28px → 180px) --- */

function ExpandableSearch({ searchTerm, onSearch }: { searchTerm: string; onSearch: (term: string) => void }) {
  const [expanded, setExpanded] = useState(!!searchTerm);
  const [local, setLocal] = useState(searchTerm);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(searchTerm); if (!searchTerm) setExpanded(false); }, [searchTerm]);

  function handleChange(value: string) {
    setLocal(value);
    clearTimeout(timerRef.current);
    if (!value) { onSearch(''); return; }
    timerRef.current = setTimeout(() => onSearch(value), 200);
  }

  function handleExpand() {
    setExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleClear() { setLocal(''); onSearch(''); setExpanded(false); }
  function handleBlur() { if (!local) setExpanded(false); }

  return (
    <motion.div
      animate={{ width: expanded ? 180 : 28 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="relative h-7 flex items-center overflow-hidden rounded-full border border-[var(--color-gold-subtle)]"
    >
      <button type="button" onClick={handleExpand}
        className="absolute left-0 w-7 h-7 flex items-center justify-center shrink-0 text-[var(--color-text-muted)]" aria-label="Search">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="6" /><path d="m14 14-3.5-3.5" />
        </svg>
      </button>
      {expanded && (
        <input ref={inputRef} type="text" value={local} onChange={e => handleChange(e.target.value)} onBlur={handleBlur}
          placeholder="Search..." className="w-full h-full bg-transparent pl-8 pr-6 text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none" />
      )}
      {expanded && local && (
        <button type="button" onClick={handleClear}
          className="absolute right-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" aria-label="Clear search">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      )}
    </motion.div>
  );
}
