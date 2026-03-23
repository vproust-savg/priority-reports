// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Pagination.tsx
// PURPOSE: Simple Previous/Next pagination bar with record count.
//          Apple-style pill buttons with subtle primary tint.
// USED BY: ReportTableWidget
// EXPORTS: Pagination
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_STIFF } from '../config/animationConstants';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, totalCount, totalPages, onPageChange }: PaginationProps) {
  const reduced = useReducedMotion();
  const tapAnimation = reduced ? undefined : { scale: 0.97 };

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
      <span className="text-xs text-slate-500">
        Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} results
      </span>
      <div className="flex gap-3">
        <motion.button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          whileTap={tapAnimation} transition={SPRING_STIFF}
          className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
        >
          Previous
        </motion.button>
        <motion.button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          whileTap={tapAnimation} transition={SPRING_STIFF}
          className="text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 px-3 py-1.5 rounded-lg disabled:text-slate-300 disabled:bg-transparent transition-colors"
        >
          Next
        </motion.button>
      </div>
    </div>
  );
}
