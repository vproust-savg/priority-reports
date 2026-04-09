// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/LoadingToast.tsx
// PURPOSE: Apple-style loading toast with minimal spinner + text.
//          Centered pill card above a dimmed TableSkeleton.
//          Pure CSS spinner (thin rotating ring). Framer Motion fade-in.
// USED BY: ReportTableWidget
// EXPORTS: LoadingToast (default)
// ═══════════════════════════════════════════════════════════════

import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { FADE_IN, EASE_DEFAULT, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';
import TableSkeleton from './TableSkeleton';

// WHY: Inline style avoids Tailwind animate-spin (different timing function).
// 0.8s linear matches iOS activity indicator tempo.
const SPINNER_STYLE = {
  animation: 'loading-toast-spin 0.8s linear infinite',
};

export default function LoadingToast() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      role="status"
      aria-label="Loading data"
      {...(reduced ? REDUCED_FADE : FADE_IN)}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
    >
      {/* WHY: Inline <style> scoped by unique keyframe name. Only one LoadingToast renders at a time. */}
      <style>{`
        @keyframes loading-toast-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .loading-toast-spinner { animation: none !important; }
        }
      `}</style>

      <div className="flex flex-col items-center justify-center py-12">
        <div className="inline-flex items-center gap-3 px-5 py-3 bg-[var(--color-bg-card)]
          rounded-[var(--radius-3xl)] shadow-[var(--shadow-card)] border border-[var(--color-gold-subtle)]">
          {/* WHY: border-t-primary creates the spinning arc; three transparent sides create the gap */}
          <div
            className="loading-toast-spinner h-5 w-5 rounded-full
              border-2 border-[var(--color-gold-subtle)] border-t-[var(--color-gold-primary)]"
            style={SPINNER_STYLE}
          />
          <p className="text-sm text-[var(--color-text-secondary)] font-medium">Loading...</p>
        </div>
      </div>

      <div className="opacity-50">
        <TableSkeleton />
      </div>
    </motion.div>
  );
}
