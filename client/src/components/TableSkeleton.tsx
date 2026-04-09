// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/TableSkeleton.tsx
// PURPOSE: Stripe-style shimmer skeleton for table loading state.
//          Renders placeholder bars that match the table layout
//          with a diagonal light sweep animation.
// USED BY: ReportTableWidget (replaces inline animate-pulse skeleton)
// EXPORTS: TableSkeleton
// ═══════════════════════════════════════════════════════════════

const SHIMMER_STYLE = {
  backgroundImage:
    'linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.5) 50%, transparent 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease-in-out infinite',
};

// WHY: Varying widths create visual interest and hint at different
// column widths the real table will have.
const ROW_WIDTHS = ['w-full', 'w-5/6', 'w-4/5', 'w-full', 'w-5/6', 'w-11/12', 'w-4/5', 'w-full'];

export default function TableSkeleton() {
  return (
    <div className="px-5 py-6 space-y-4">
      {/* Header row placeholder */}
      <div className="flex gap-4">
        <div className="h-3 skeleton rounded w-1/6" style={SHIMMER_STYLE} />
        <div className="h-3 skeleton rounded w-1/5" style={SHIMMER_STYLE} />
        <div className="h-3 skeleton rounded w-1/4" style={SHIMMER_STYLE} />
        <div className="h-3 skeleton rounded w-1/6" style={SHIMMER_STYLE} />
      </div>
      {/* Body row placeholders */}
      {ROW_WIDTHS.map((w, i) => (
        <div key={i} className="flex gap-4">
          <div className={`h-4 skeleton rounded ${w}`} style={SHIMMER_STYLE} />
        </div>
      ))}
    </div>
  );
}
