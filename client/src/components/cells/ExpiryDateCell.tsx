// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/cells/ExpiryDateCell.tsx
// PURPOSE: Custom cell renderer for the BBD Expiry Date column.
//          Shows the formatted date with an inline Extend button.
// USED BY: useBBDExtend (registered as cellRenderer for expiryDate)
// EXPORTS: ExpiryDateCell
// ═══════════════════════════════════════════════════════════════

import { formatCellValue } from '../../utils/formatters';

interface ExpiryDateCellProps {
  value: unknown;
  onExtend: () => void;
}

export default function ExpiryDateCell({ value, onExtend }: ExpiryDateCellProps) {
  const { formatted } = formatCellValue(value, 'date');

  return (
    <span className="flex items-center gap-2">
      <span>{formatted}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onExtend();
        }}
        className="text-xs font-medium text-[var(--color-gold-primary)] hover:text-[var(--color-gold-primary)]/80 transition-colors"
      >
        Extend
      </button>
    </span>
  );
}
