import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { subscribeToasts, type ToastItem } from '../lib/toast.ts';

export const ToastViewport: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((toast) => {
      setToasts((prev) => [...prev.slice(-3), toast]);
      const delay = toast.durationMs ?? 4200;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, delay);
    });
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed top-16 sm:top-5 right-3 left-3 sm:left-auto sm:right-5 z-[70] flex flex-col items-center sm:items-end gap-2.5 max-w-md sm:w-96 mx-auto sm:mx-0"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isError = toast.variant === 'error';
          const isInfo = toast.variant === 'info';
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              role="status"
              className={`pointer-events-auto w-full rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md flex items-start gap-3 ${
                isError
                  ? 'bg-red-50/95 dark:bg-red-950/95 border-red-200 dark:border-red-800/70 text-red-900 dark:text-red-100'
                  : isInfo
                    ? 'bg-sky-50/95 dark:bg-slate-900/95 border-sky-200 dark:border-sky-800/70 text-slate-900 dark:text-sky-100'
                    : 'bg-emerald-50/95 dark:bg-emerald-950/95 border-emerald-200 dark:border-emerald-800/70 text-emerald-950 dark:text-emerald-100'
              }`}
            >
              {isError ? (
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : isInfo ? (
                <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-bold leading-snug">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-[11px] sm:text-xs opacity-85 leading-relaxed">
                    {toast.description}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="p-1 rounded-lg opacity-65 hover:opacity-100 transition-opacity cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
