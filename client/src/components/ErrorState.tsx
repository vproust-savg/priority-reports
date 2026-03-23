// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ErrorState.tsx
// PURPOSE: Animated error state with retry button. Icon bounces
//          in, text fades up. Retry button has tap feedback.
// USED BY: ReportTableWidget
// EXPORTS: ErrorState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  FADE_SCALE, SPRING_GENTLE, SPRING_BOUNCY, SPRING_STIFF,
  REDUCED_FADE, REDUCED_TRANSITION,
} from '../config/animationConstants';

interface ErrorStateProps {
  onRetry: () => void;
}

export default function ErrorState({ onRetry }: ErrorStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-6 text-center"
      {...(reduced ? REDUCED_FADE : FADE_SCALE)}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
    >
      <motion.div
        initial={reduced ? undefined : { scale: 0.8, rotate: -5 }}
        animate={reduced ? undefined : { scale: 1, rotate: 0 }}
        transition={reduced ? undefined : { ...SPRING_BOUNCY, delay: 0.1 }}
        className="inline-block mb-3"
      >
        <AlertCircle size={32} className="text-red-300" />
      </motion.div>
      <p className="text-red-500 text-sm mb-3">Failed to load data</p>
      <motion.button
        onClick={onRetry}
        whileTap={reduced ? undefined : { scale: 0.97 }}
        transition={SPRING_STIFF}
        className="text-sm text-primary font-medium hover:underline"
      >
        Retry
      </motion.button>
    </motion.div>
  );
}
