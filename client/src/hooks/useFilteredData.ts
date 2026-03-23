// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useFilteredData.ts
// PURPOSE: Computes filtered and paginated display data from the
//          active dataset. Extracted from ReportTableWidget to
//          keep it under 200 lines.
// USED BY: ReportTableWidget
// EXPORTS: useFilteredData
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { applyAllFilters, applyClientFilters } from '../utils/clientFilter';
import type { FilterGroup, ColumnFilterMeta } from '@shared/types';

const CLIENT_PAGE_SIZE = 50;

interface FilteredDataResult {
  displayData: Record<string, unknown>[];
  totalCount: number;
  totalPages: number;
}

interface UseFilteredDataParams {
  allRows: Record<string, unknown>[];
  debouncedGroup: FilterGroup;
  filterColumns: ColumnFilterMeta[];
  page: number;
  isBaseReady: boolean;
  hasClientFilters: boolean;
  serverPagination: { totalCount: number; totalPages: number } | undefined;
}

export function useFilteredData({
  allRows, debouncedGroup, filterColumns, page,
  isBaseReady, hasClientFilters, serverPagination,
}: UseFilteredDataParams): FilteredDataResult {
  return useMemo(() => {
    if (isBaseReady || hasClientFilters) {
      // WHY: Base dataset has ALL rows — apply ALL non-date filters client-side.
      // Phase 1 with client filters uses the same client-side path.
      const filtered = isBaseReady
        ? applyAllFilters(allRows, debouncedGroup, filterColumns)
        : applyClientFilters(allRows, debouncedGroup, filterColumns);
      return {
        displayData: filtered.slice((page - 1) * CLIENT_PAGE_SIZE, page * CLIENT_PAGE_SIZE),
        totalCount: filtered.length,
        totalPages: Math.ceil(filtered.length / CLIENT_PAGE_SIZE),
      };
    }
    // Phase 1 without client-side filters — server handles pagination
    return {
      displayData: allRows,
      totalCount: serverPagination?.totalCount ?? 0,
      totalPages: serverPagination?.totalPages ?? 0,
    };
  }, [allRows, debouncedGroup, filterColumns, page, isBaseReady, hasClientFilters, serverPagination]);
}
