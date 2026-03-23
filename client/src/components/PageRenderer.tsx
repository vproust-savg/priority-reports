// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/PageRenderer.tsx
// PURPOSE: Renders a page by reading its widget config and laying
//          them out in a responsive 12-column grid.
// USED BY: App.tsx (one PageRenderer per route)
// EXPORTS: PageRenderer
// ═══════════════════════════════════════════════════════════════

import WidgetRenderer from './WidgetRenderer';
import type { PageConfig } from '@shared/types';

// WHY: Tailwind purges dynamic class names like `col-span-${n}`.
// This explicit mapping ensures all col-span classes are preserved.
const COL_SPAN_CLASSES: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3',
  4: 'col-span-4', 5: 'col-span-5', 6: 'col-span-6',
  7: 'col-span-7', 8: 'col-span-8', 9: 'col-span-9',
  10: 'col-span-10', 11: 'col-span-11', 12: 'col-span-12',
};

interface PageRendererProps {
  page: PageConfig;
}

export default function PageRenderer({ page }: PageRendererProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {page.widgets.map((widget) => (
        <div key={widget.id} className={`${COL_SPAN_CLASSES[widget.colSpan] ?? 'col-span-12'}`}>
          <WidgetRenderer widget={widget} />
        </div>
      ))}
    </div>
  );
}
