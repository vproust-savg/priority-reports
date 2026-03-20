// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/WidgetRenderer.tsx
// PURPOSE: Resolves a widget config to its React component via the registry.
//          Wraps it in WidgetShell for consistent card styling.
// USED BY: PageRenderer.tsx
// EXPORTS: WidgetRenderer
// ═══════════════════════════════════════════════════════════════

import { widgetRegistry } from '../config/widgetRegistry';
import WidgetShell from './WidgetShell';
import type { WidgetConfig } from '@shared/types';

interface WidgetRendererProps {
  widget: WidgetConfig;
}

export default function WidgetRenderer({ widget }: WidgetRendererProps) {
  const Component = widgetRegistry[widget.type];

  if (!Component) {
    return (
      <WidgetShell title={widget.title}>
        <div className="p-6 text-center text-red-500 text-sm">
          Unknown widget type: {widget.type}
        </div>
      </WidgetShell>
    );
  }

  return (
    <WidgetShell title={widget.title}>
      <Component reportId={widget.reportId} />
    </WidgetShell>
  );
}
