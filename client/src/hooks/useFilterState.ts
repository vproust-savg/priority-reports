// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFilterState.ts
// PURPOSE: Manages filter group state with 400ms debounce for API
//          calls. Separates immediate UI state from debounced query
//          state to prevent API spam on every keystroke.
// USED BY: ReportTableWidget
// EXPORTS: useFilterState
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import type { FilterGroup } from '@shared/types';
import { createDefaultFilterGroup } from '../config/filterConstants';

// WHY: reportId is passed so createDefaultFilterGroup can return the
// correct initial range per report. Default is undefined (week-based)
// to keep all existing callers working without change.
export function useFilterState(reportId?: string) {
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(() => createDefaultFilterGroup(reportId));
  const [debouncedGroup, setDebouncedGroup] = useState<FilterGroup>(filterGroup);
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // WHY: useEffect is acceptable here — this is a timer/side-effect, not
  // data fetching. TanStack Query handles the actual data fetching.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedGroup(filterGroup), 400);
    return () => clearTimeout(timer);
  }, [filterGroup]);

  const handleFilterChange = (newGroup: FilterGroup) => {
    setFilterGroup(newGroup);
    setPage(1); // WHY: Reset page — current page may not exist in new result set
  };

  return {
    filterGroup,
    debouncedGroup,
    page,
    setPage,
    isFilterOpen,
    setIsFilterOpen,
    handleFilterChange,
  };
}
