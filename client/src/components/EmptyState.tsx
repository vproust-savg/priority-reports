// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/EmptyState.tsx
// PURPOSE: Animated empty state shown when filters return no data.
//          Icon bounces in, text fades up. Respects reduced motion.
// USED BY: ReportTableWidget
// EXPORTS: EmptyState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { SearchX } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  FADE_SCALE, SPRING_GENTLE, SPRING_BOUNCY,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

export default function EmptyState() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-8 text-center"
      {...(reduced ? REDUCED_FADE : FADE_SCALE)}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
    >
      <motion.div
        initial={reduced ? undefined : { scale: 0.8, rotate: -5 }}
        animate={reduced ? undefined : { scale: 1, rotate: 0 }}
        transition={reduced ? undefined : { ...SPRING_BOUNCY, delay: 0.1 }}
        className="inline-block mb-3"
      >
        <SearchX size={32} className="text-slate-300" />
      </motion.div>
      <p className="text-slate-500 text-sm font-medium">No results found</p>
      <p className="text-slate-400 text-xs mt-1">Try adjusting your filters</p>
    </motion.div>
  );
}
