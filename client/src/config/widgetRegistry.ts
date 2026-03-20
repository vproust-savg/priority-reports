// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/widgetRegistry.ts
// PURPOSE: Maps widget type names to React components.
//          Adding a new widget type = import component + add one line here.
// USED BY: WidgetRenderer.tsx
// EXPORTS: WidgetProps, widgetRegistry
// ═══════════════════════════════════════════════════════════════

import type { ComponentType } from 'react';
import DemoTableWidget from '../components/widgets/DemoTableWidget';

export interface WidgetProps {
  reportId: string;
}

export const widgetRegistry: Record<string, ComponentType<WidgetProps>> = {
  table: DemoTableWidget,
  // Future: kpi: KPIWidget, chart: ChartWidget, download: DownloadWidget
};
