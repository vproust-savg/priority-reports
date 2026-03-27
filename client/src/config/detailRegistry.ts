// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/detailRegistry.ts
// PURPOSE: Maps reportId → detail panel component for expandable rows.
//          Adding expandable rows to a new report = add one entry here.
// USED BY: ReportTableWidget
// EXPORTS: getDetailComponent
// ═══════════════════════════════════════════════════════════════

import type { DetailComponent } from '../components/details/types';

// WHY: Populated as detail panel components are created.
// BbdDetailPanel will be added in Task 10.
const detailRegistry: Record<string, DetailComponent> = {};

export function getDetailComponent(reportId: string): DetailComponent | null {
  return detailRegistry[reportId] ?? null;
}

export { detailRegistry };
