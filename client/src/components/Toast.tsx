// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Toast notification with subtle fade entrance/exit.
//          Fixed bottom-right. Auto-dismisses after 3 seconds.
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
}

export default function Toast({ message, variant, onDismiss }: ToastProps) {
  const reduced = useReducedMotion();

  // WHY: Auto-dismiss after 3 seconds. The user can also manually close.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <motion.div
      initial={reduced ? REDUCED_FADE.initial : { opacity: 0, y: 8 }}
      animate={reduced ? REDUCED_FADE.animate : { opacity: 1, y: 0 }}
      exit={reduced ? REDUCED_FADE.exit : { opacity: 0, y: 8 }}
      transition={reduced ? REDUCED_TRANSITION : EASE_DEFAULT}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3
        bg-[var(--color-bg-card)] rounded-[var(--radius-xl)] shadow-[var(--shadow-dropdown)]
        border border-[var(--color-gold-subtle)]"
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
