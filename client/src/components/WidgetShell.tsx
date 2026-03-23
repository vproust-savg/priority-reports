// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/WidgetShell.tsx
// PURPOSE: Common card wrapper for all widgets. Provides consistent
//          styling: white card, rounded corners, shadow, title bar.
// USED BY: WidgetRenderer.tsx
// EXPORTS: WidgetShell
// ═══════════════════════════════════════════════════════════════

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { SPRING_GENTLE } from '../config/animationConstants';

interface WidgetShellProps {
  title: string;
  children: ReactNode;
}

export default function WidgetShell({ title, children }: WidgetShellProps) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="bg-white rounded-2xl border border-slate-200/60 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      whileHover={reduced ? undefined : { y: -2, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      transition={SPRING_GENTLE}
    >
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-600">{title}</h3>
      </div>
      <div className="p-0">
        {children}
      </div>
    </motion.div>
  );
}
