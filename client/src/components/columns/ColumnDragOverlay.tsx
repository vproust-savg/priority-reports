// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/columns/ColumnDragOverlay.tsx
// PURPOSE: Floating pill shown during column drag, displaying
//          the column label. Same pattern as filter DragOverlay.
// USED BY: ColumnManagerPanel
// EXPORTS: ColumnDragOverlay
// ═══════════════════════════════════════════════════════════════

interface ColumnDragOverlayProps {
  label: string;
}

export default function ColumnDragOverlay({ label }: ColumnDragOverlayProps) {
  return (
    <div className="bg-white shadow-lg rounded-lg px-3 py-2 text-sm text-slate-600 border border-slate-200">
      {label}
    </div>
  );
}
