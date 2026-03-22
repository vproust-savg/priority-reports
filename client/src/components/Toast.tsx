// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/Toast.tsx
// PURPOSE: Minimal toast notification for export feedback.
//          Fixed bottom-right, auto-dismisses after 3s.
//          Follows the Apple/Stripe card aesthetic (white, rounded,
//          subtle shadow, emerald/red status colors).
// USED BY: ReportTableWidget.tsx
// EXPORTS: Toast
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface ToastProps {
  message: string;
  variant: 'success' | 'error';
  onDismiss: () => void;
}

export default function Toast({ message, variant, onDismiss }: ToastProps) {
  // WHY: Auto-dismiss after 3 seconds. The user can also manually close.
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const Icon = variant === 'success' ? CheckCircle2 : XCircle;
  const iconColor = variant === 'success' ? 'text-emerald-500' : 'text-red-500';

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3
        bg-white rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.08)]
        border border-slate-200/60"
      style={{ animation: 'toast-slide-up 200ms ease-out' }}
    >
      <Icon size={18} className={iconColor} />
      <span className="text-sm text-slate-700 font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="p-0.5 ml-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
