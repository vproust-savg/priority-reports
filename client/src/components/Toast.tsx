// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Toast notification with subtle fade entrance/exit.
//          Fixed bottom-right by default; optionally anchored to a
//          DOMRect (e.g. the cell that was clicked to copy).
//          Auto-dismisses after 3 seconds.
// USED BY: ReportTableWidget.tsx
// EXPORTS: Toast
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EASE_DEFAULT, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
  anchor?: DOMRect;
}

// WHY: 168 = half of max-w-[320px] (320px) + 8px viewport margin. Keeps the toast
// on-screen when the source cell is at the far left/right edge.
const HORIZONTAL_CLAMP_PX = 168;
// WHY: Below this top offset, the above-cell toast would clip the viewport
// edge (or hide behind the sticky table header). Flip placement below the cell.
const FLIP_BELOW_THRESHOLD_PX = 80;

interface AnchoredPosition {
  left: number;
  top: number;
  translateX: string;
  translateY: string;
}

function computeAnchoredPosition(anchor: DOMRect): AnchoredPosition {
  const flipBelow = anchor.top < FLIP_BELOW_THRESHOLD_PX;
  const centerX = anchor.left + anchor.width / 2;
  const left = Math.min(
    Math.max(centerX, HORIZONTAL_CLAMP_PX),
    window.innerWidth - HORIZONTAL_CLAMP_PX,
  );
  const top = flipBelow ? anchor.bottom + 8 : anchor.top - 8;
  return {
    left,
    top,
    translateX: '-50%',
    translateY: flipBelow ? '0%' : '-100%',
  };
}

export default function Toast({ message, variant, onDismiss, anchor }: ToastProps) {
  const reduced = useReducedMotion();

  // WHY: Auto-dismiss after 3 seconds. The user can also manually close.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // WHY: When anchored, framer-motion's `y` (translateY) would fight the
  // centering transform on the same element, so we drop the slide and animate
  // only opacity. Anchor coords are captured at click time and not tracked
  // across scroll — 3s is too short to justify a scroll listener per toast.
  const cardClasses = `flex items-center gap-3 px-4 py-3 w-max max-w-[320px]
    bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] shadow-[var(--shadow-dropdown)]
    border border-[var(--color-gold-subtle)]`;

  if (anchor) {
    const pos = computeAnchoredPosition(anchor);
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
        style={{
          position: 'fixed',
          left: pos.left,
          top: pos.top,
          translateX: pos.translateX,
          translateY: pos.translateY,
          zIndex: 50,
        }}
        className={cardClasses}
      >
        {variant === 'success'
          ? <CheckCircle2 size={18} className="text-[var(--color-green)] shrink-0" />
          : <XCircle size={18} className="text-[var(--color-red)] shrink-0" />}
        <span className="text-sm text-[var(--color-text-primary)] font-medium">{message}</span>
        <button
          onClick={onDismiss}
          className="p-0.5 ml-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          <X size={14} />
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduced ? REDUCED_FADE.initial : { opacity: 0, y: 8 }}
      animate={reduced ? REDUCED_FADE.animate : { opacity: 1, y: 0 }}
      exit={reduced ? REDUCED_FADE.exit : { opacity: 0, y: 8 }}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
      className={`fixed bottom-4 right-4 z-50 ${cardClasses}`}
    >
      {variant === 'success'
        ? <CheckCircle2 size={18} className="text-[var(--color-green)] shrink-0" />
        : <XCircle size={18} className="text-[var(--color-red)] shrink-0" />}
      <span className="text-sm text-[var(--color-text-primary)] font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 ml-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
