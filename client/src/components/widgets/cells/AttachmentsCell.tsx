// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/widgets/cells/AttachmentsCell.tsx
// PURPOSE: Renders the Attachments column for Customer Returns.
//          Paperclip + count trigger; popover lists filenames;
//          click triggers a download via
//          /api/v1/attachments/DOCUMENTS_N/:docNo/:type/:num.
// USED BY: ReportTableWidget (wired in Task 9)
// EXPORTS: AttachmentsCell, Attachment
// ═══════════════════════════════════════════════════════════════

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Attachment {
  num: number;
  filename: string;
}

interface AttachmentsCellProps {
  value: Attachment[] | null;
  docNo: string;
  type: string;
}

// WHY: Default vertical padding from the trigger button. Matches the
// previous mt-1 spacing.
const POPOVER_GAP_PX = 4;
const POPOVER_MIN_WIDTH = 220;

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// WHY: Compute viewport-relative coordinates for the popover. Anchored to
// the trigger's right edge so long filenames extend leftward (the column
// is the last one — the trigger sits near the iframe's right boundary).
// Flips above the trigger when there isn't enough room below.
function computePosition(rect: DOMRect): { top: number; right: number; flipped: boolean } {
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const estimatedPopoverHeight = 160; // 5 files × ~32px is a fine upper bound

  // WHY: When the viewport reports 0 (headless test, detached iframe before
  // layout), positioning math becomes nonsense (spaceBelow turns negative,
  // flip triggers, popover lands off-screen). Default to "below the trigger",
  // anchored to its right edge — this is what a freshly painted layout would
  // produce anyway.
  if (viewportHeight === 0 || viewportWidth === 0) {
    return { top: rect.bottom + POPOVER_GAP_PX, right: 0, flipped: false };
  }

  const spaceBelow = viewportHeight - rect.bottom;
  const flipped = spaceBelow < estimatedPopoverHeight && rect.top > estimatedPopoverHeight;
  return {
    top: flipped ? rect.top - estimatedPopoverHeight - POPOVER_GAP_PX : rect.bottom + POPOVER_GAP_PX,
    right: viewportWidth - rect.right,
    flipped,
  };
}

export function AttachmentsCell({ value, docNo, type }: AttachmentsCellProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; flipped: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // WHY: Re-measure the trigger right before the portal renders so the
  // popover lands at the correct viewport-fixed coordinates. useLayoutEffect
  // runs synchronously after DOM updates and before paint — avoids a
  // one-frame flicker where the popover briefly sits at (0,0).
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setPos(computePosition(triggerRef.current.getBoundingClientRect()));
  }, [open]);

  // WHY: When the user scrolls the table or resizes the iframe, the
  // trigger moves but a fixed-position popover stays put — visually
  // detaching from the cell. Close on either event; reopening repositions.
  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  // WHY: Click-outside now checks BOTH refs because the popover lives in
  // document.body (escaping the table's overflow context) while the trigger
  // sits inside the row.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = triggerRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inTrigger && !inPopover) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!value || value.length === 0) return null;

  const popover = open && pos
    ? createPortal(
        <div
          ref={popoverRef}
          role="menu"
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            minWidth: POPOVER_MIN_WIDTH,
          }}
          className="z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
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
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Attachments (${value.length})`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-slate-900"
      >
        <span aria-hidden>📎</span>
        <span>{value.length}</span>
      </button>
      {popover}
    </>
  );
}
