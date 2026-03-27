// ═══════════════════════════════════════════════════════════════
// FILE: client/src/config/detailRegistry.ts
// PURPOSE: Maps reportId → detail panel component for expandable rows.
//          Adding expandable rows to a new report = add one entry here.
// USED BY: ReportTableWidget
// EXPORTS: getDetailComponent
// ═══════════════════════════════════════════════════════════════

import type { DetailComponent } from '../components/details/types';
import BbdDetailPanel from '../components/details/BbdDetailPanel';

const detailRegistry: Record<string, DetailComponent> = {
  bbd: BbdDetailPanel,
};

export function getDetailComponent(reportId: string): DetailComponent | null {
  return detailRegistry[reportId] ?? null;
}

export { detailRegistry };
