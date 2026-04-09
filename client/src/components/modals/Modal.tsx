// ═══════════════════════════════════════════════════════════════
// FILE: client/src/components/modals/Modal.tsx
// PURPOSE: Reusable modal base — portal-rendered with backdrop,
//          animation, Escape key dismiss, and preventClose guard.
//          First modal in the codebase.
// USED BY: ExtendExpiryModal, BulkExtendModal
// EXPORTS: Modal
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { EASE_FAST } from '../../config/animationConstants';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  preventClose?: boolean;
}

export default function Modal({
  isOpen, onClose, title, children,
  maxWidth = 'max-w-lg', preventClose = false,
}: ModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // WHY: Focus first focusable element on open for accessibility.
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const focusable = contentRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusable?.focus();
    }
  }, [isOpen]);

  // WHY: Close on Escape key — disabled during submission (preventClose).
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !preventClose) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, preventClose, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={EASE_FAST}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={preventClose ? undefined : onClose}
            data-testid="modal-backdrop"
          />

          {/* Content */}
          <motion.div
            ref={contentRef}
            className={`relative bg-[var(--color-bg-card)] rounded-[var(--radius-3xl)] shadow-[var(--shadow-dropdown)] w-full ${maxWidth} max-h-[85vh] overflow-hidden flex flex-col`}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={EASE_FAST}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-gold-subtle)]">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
              {!preventClose && (
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-gold-hover)] transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
