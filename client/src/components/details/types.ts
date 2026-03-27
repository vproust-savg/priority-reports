// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/details/types.ts
// PURPOSE: Shared props interface for all expandable row detail panels.
//          Every detail panel component must accept these props.
// USED BY: BbdDetailPanel, detailRegistry, ReportTable
// EXPORTS: DetailPanelProps, DetailComponent
// ═══════════════════════════════════════════════════════════════

import type { ComponentType } from 'react';

export interface DetailPanelProps {
  // WHY: The full parent row data object. Detail panels read fields from
  // this (e.g., purchasePrice for value calculations) without re-fetching.
  row: Record<string, unknown>;
  reportId: string;
}

export type DetailComponent = ComponentType<DetailPanelProps>;
