'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextType {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const VARIANTS: Record<ToastVariant, { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: 'bg-success-bg text-success border-success/20' },
  error: { icon: XCircle, className: 'bg-error-bg text-error border-error/20' },
  warning: { icon: AlertTriangle, className: 'bg-warning-bg text-warning border-warning/20' },
  info: { icon: Info, className: 'bg-primary-50 text-primary-700 border-primary-100' },
};

const AUTO_DISMISS_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message: string, variant: ToastVariant) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const value = useMemo<ToastContextType>(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'error'),
    warning: (m) => push(m, 'warning'),
    info: (m) => push(m, 'info'),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const { icon: Icon, className } = VARIANTS[t.variant];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.15 } }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                role="status"
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${className}`}
              >
                <Icon className="w-5 h-5 mt-0.5 shrink-0" aria-hidden />
                <p className="text-sm font-medium flex-1 leading-relaxed whitespace-pre-line">{t.message}</p>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
