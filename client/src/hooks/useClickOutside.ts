// ═══════════════════════════════════════════════════════════════
// FILE: client/src/hooks/useClickOutside.ts
// PURPOSE: Fire a callback when a mousedown/touchstart lands outside
//          a ref'd element. The ref must wrap the entire region that
//          should count as "inside" — trigger + popover alike.
// USED BY: ReportTableWidget (guards Filter/Columns/Sort panels)
// EXPORTS: useClickOutside
// ═══════════════════════════════════════════════════════════════

import { useEffect } from 'react';

export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    function handle(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [ref, onOutside, enabled]);
}
