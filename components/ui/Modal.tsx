'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Defaults to a comfortable form width; pass 'lg' for wider content. */
  size?: 'md' | 'lg';
}

/**
 * Overlay dialog rendered via a portal into document.body, so it sits above
 * the page regardless of where it's mounted in the tree — unlike an inline
 * Card, opening it never shifts the page underneath.
 */
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] print:hidden" role="presentation">
          <motion.div
            className="absolute inset-0 bg-[#02465B]/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
          />
          <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6 flex items-start sm:items-center justify-center">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : undefined}
              className={`relative w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-xl'} bg-white rounded-2xl border border-[#E8EFF3] shadow-xl my-auto`}
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-6">
                {title && (
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-primary-900">{title}</h2>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="p-1 -m-1 rounded-lg hover:bg-[#F1F6F8]"
                    >
                      <X className="w-4 h-4 text-text-muted" aria-hidden />
                    </button>
                  </div>
                )}
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
