'use client';

import { createContext, useContext, useState, useCallback } from 'react';

type ToastKind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  // Safe no-op fallback so callers never crash if used outside the provider.
  return ctx ?? { show: () => {} };
}

let counter = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto px-4 py-2 rounded-full text-sm font-medium shadow-lg border backdrop-blur-md animate-[toast-in_.25s_ease]
              ${
                t.kind === 'error'
                  ? 'bg-live/95 text-white border-live'
                  : t.kind === 'success'
                  ? 'bg-teal/95 text-white border-teal'
                  : 'bg-ink/90 text-paper border-ink'
              }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
