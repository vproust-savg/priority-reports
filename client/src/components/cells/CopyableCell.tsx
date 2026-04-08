// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/cells/CopyableCell.tsx
// PURPOSE: Custom cell renderer that copies value to clipboard
//          on click. Shows a subtle copy icon on hover.
// USED BY: useBBDExtend (registered for serialName, partNumber)
// EXPORTS: CopyableCell
// ═══════════════════════════════════════════════════════════════

import { Copy } from 'lucide-react';

interface CopyableCellProps {
  value: string;
  onCopy: (value: string) => void;
}

export default function CopyableCell({ value, onCopy }: CopyableCellProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(value);
        onCopy(value);
      }}
      className="group/copy flex items-center gap-1.5 hover:text-primary transition-colors"
      title="Click to copy"
    >
      <span>{value}</span>
      <Copy
        size={12}
        className="text-slate-300 opacity-0 group-hover/copy:opacity-100 transition-opacity"
      />
    </button>
  );
}
