// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/cells/AttachmentsCell.tsx
// PURPOSE: Renders the Attachments column for Customer Returns.
//          Paperclip + count trigger; popover lists filenames;
//          click triggers a download via
//          /api/v1/attachments/DOCUMENTS_N/:docNo/:type/:num.
// USED BY: ReportTableWidget (wired in Task 9)
// EXPORTS: AttachmentsCell, Attachment
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react';

export interface Attachment {
  num: number;
  filename: string;
}

interface AttachmentsCellProps {
  value: Attachment[] | null;
  docNo: string;
  type: string;
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

export function AttachmentsCell({ value, docNo, type }: AttachmentsCellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // WHY: Close the popover on mousedown outside the component.
  // mousedown (not click) so the popover closes BEFORE other handlers
  // — matches the existing useClickOutside pattern in the dashboard.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!value || value.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Attachments (${value.length})`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
      >
        <span aria-hidden>📎</span>
        <span>{value.length}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[200px] rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
        >
          <ul className="flex flex-col gap-1">
            {value.map((att) => (
              <li key={att.num}>
                <button
                  type="button"
                  className="w-full truncate text-left text-sm text-slate-700 hover:text-slate-900"
                  onClick={() => {
                    // WHY: Integer num (not filename) in the URL — Priority
                    // identifies attachments by EXTFILENUM, and the route
                    // validates this segment as a positive integer.
                    const url = `/api/v1/attachments/DOCUMENTS_N/${docNo}/${type}/${att.num}`;
                    triggerDownload(url, att.filename);
                  }}
                >
                  {att.filename}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
