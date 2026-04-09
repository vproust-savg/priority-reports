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
    <div className="bg-[var(--color-bg-card)] shadow-[var(--shadow-dropdown)] rounded-[var(--radius-lg)] px-3 py-2 text-sm text-[var(--color-text-secondary)] border border-[var(--color-gold-subtle)]">
      {label}
    </div>
  );
}
