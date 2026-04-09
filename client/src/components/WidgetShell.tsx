// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/WidgetShell.tsx
// PURPOSE: Common card wrapper for all widgets. Provides consistent
//          styling: white card, rounded corners, shadow, title bar.
// USED BY: WidgetRenderer.tsx
// EXPORTS: WidgetShell
// ═══════════════════════════════════════════════════════════════

import type { ReactNode } from 'react';

interface WidgetShellProps {
  title: string;
  children: ReactNode;
}

export default function WidgetShell({ title, children }: WidgetShellProps) {
  return (
    <div className="bg-[var(--color-bg-card)] rounded-[var(--radius-3xl)] shadow-[var(--shadow-card)]">
      <div className="px-5 py-4 border-b border-[var(--color-gold-subtle)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-muted)]">{title}</h3>
      </div>
      <div className="p-0">
        {children}
      </div>
    </div>
  );
}
