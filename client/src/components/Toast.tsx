// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Premium toast notification with spring entrance/exit
//          and animated SVG checkmark. Fixed bottom-right.
// USED BY: ReportTableWidget.tsx
// EXPORTS: Toast
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { XCircle, X } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_GENTLE, REDUCED_FADE, REDUCED_TRANSITION } from '../config/animationConstants';

interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
}

// WHY: SVG checkmark that draws itself on mount — a satisfying
// micro-interaction that signals "action completed successfully."
function AnimatedCheck() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-emerald-500 shrink-0">
      <motion.circle
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="2"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M8 12l3 3 5-5"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      />
    </svg>
  );
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
      initial={reduced ? REDUCED_FADE.initial : { opacity: 0, y: 20, scale: 0.95 }}
      animate={reduced ? REDUCED_FADE.animate : { opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? REDUCED_FADE.exit : { opacity: 0, y: 10, scale: 0.95 }}
      transition={reduced ? REDUCED_TRANSITION : SPRING_GENTLE}
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3
        bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)]
        border border-slate-200/60"
    >
      {variant === 'success' ? <AnimatedCheck /> : <XCircle size={18} className="text-red-500 shrink-0" />}
      <span className="text-sm text-slate-700 font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 ml-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
