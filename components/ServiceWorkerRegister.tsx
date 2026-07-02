'use client';

import { useEffect } from 'react';

/** Registers the PWA service worker (public/sw.js) on mount. Silent, no UI. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[pwa] service worker registration failed:', e));
    }
  }, []);
  return null;
}
