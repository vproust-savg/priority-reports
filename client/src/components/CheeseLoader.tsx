// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/CheeseLoader.tsx
// PURPOSE: Loading animation placeholder. Will be replaced with
//          a cheese wheel animation (designed via Claude artifact).
//          For now, wraps TableSkeleton with a centered message.
// USED BY: ReportTableWidget
// EXPORTS: CheeseLoader (default)
// ═══════════════════════════════════════════════════════════════

import TableSkeleton from './TableSkeleton';

export default function CheeseLoader() {
  return (
    <div>
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span>Loading data...</span>
        </div>
      </div>
      <TableSkeleton />
    </div>
  );
}
