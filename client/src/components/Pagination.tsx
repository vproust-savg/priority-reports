// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Pagination.tsx
// PURPOSE: Simple Previous/Next pagination bar with record count.
//          Apple-style pill buttons with subtle primary tint.
// USED BY: ReportTableWidget
// EXPORTS: Pagination
// ═══════════════════════════════════════════════════════════════

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, totalCount, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-gold-subtle)]">
      <span className="text-xs text-[var(--color-text-muted)]">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} results
      </span>
      <div className="flex gap-3">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-hover)] px-3 py-1.5 rounded-[var(--radius-sm)] disabled:text-[var(--color-text-faint)] disabled:bg-transparent transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="text-sm font-medium text-[var(--color-text-primary)] border border-[var(--color-gold-subtle)] hover:bg-[var(--color-gold-hover)] px-3 py-1.5 rounded-[var(--radius-sm)] disabled:text-[var(--color-text-faint)] disabled:bg-transparent transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}
