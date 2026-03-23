// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/ErrorState.tsx
// PURPOSE: Error state with retry button. Simple fade-in.
//          Respects reduced motion.
// USED BY: ReportTableWidget
// EXPORTS: ErrorState (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_IN, EASE_DEFAULT, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface ErrorStateProps {
  onRetry: () => void;
}

export default function ErrorState({ onRetry }: ErrorStateProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="p-6 text-center"
      {...(reduced ? REDUCED_FADE : FADE_IN)}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
    >
      <AlertCircle size={32} className="text-red-300 mx-auto mb-3" />
      <p className="text-red-500 text-sm mb-3">Failed to load data</p>
      <button
        onClick={onRetry}
        className="text-sm text-primary font-medium hover:underline"
      >
        Retry
      </button>
    </motion.div>
  );
}
