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

// WHY: navigator.clipboard.writeText() fails silently inside iframes (Airtable Omni embed)
// without the clipboard-write permission. This fallback uses a temporary textarea + execCommand.
function execCommandCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API first (works on direct HTTPS, may work in some iframes)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through to execCommand */ }
  }
  // Fallback for restricted iframe contexts
  return execCommandCopy(text);
}

export default function CopyableCell({ value, onCopy }: CopyableCellProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        copyToClipboard(value).then((ok) => {
          if (ok) onCopy(value);
        });
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
