// ═══════════════════════════════════════════════════════════════
// FILE: shared/types/filters.ts
// PURPOSE: Types for report filter dropdowns and filter state.
//          Used by both backend (to build filter responses) and
//          frontend (to manage filter UI state).
// USED BY: routes/filters.ts, FilterBar.tsx, ReportTableWidget.tsx
// EXPORTS: FilterOption, FilterValues, FiltersResponse
// ═══════════════════════════════════════════════════════════════

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterValues {
  from: string;
  to: string;
  vendor: string;
  status: string;
}

export interface FiltersResponse {
  meta: {
    reportId: string;
    generatedAt: string;
  };
  filters: {
    vendors: FilterOption[];
    statuses: FilterOption[];
  };
}
