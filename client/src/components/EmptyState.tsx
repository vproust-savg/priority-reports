// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/EmptyState.tsx
// PURPOSE: Empty state with configurable message and hint.
//          Simple fade-in. Respects reduced motion.
// USED BY: ReportTableWidget, BBDExtendedView
// EXPORTS: EmptyState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_IN, EASE_DEFAULT, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface EmptyStateProps {
  message?: string;
  hint?: string;
}

export default function EmptyState({
  message = 'No results found',
  hint = 'Try adjusting your filters',
}: EmptyStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-8 text-center"
      {...(reduced ? REDUCED_FADE : FADE_IN)}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
    >
      <SearchX size={32} className="text-slate-300 mx-auto mb-3" />
      <p className="text-slate-500 text-sm font-medium">{message}</p>
      <p className="text-slate-400 text-xs mt-1">{hint}</p>
    </motion.div>
  );
}
