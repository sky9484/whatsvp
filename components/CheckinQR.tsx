'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useAuth } from '@/lib/auth';
import { CHECKIN } from '@/lib/copy';

interface CheckinQRProps {
  eventId: string;
}

/** Organizer-facing rotating QR — refreshes itself just before each code expires. */
export default function CheckinQR({ eventId }: CheckinQRProps) {
  const { token } = useAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch(`/api/checkin/qr/${eventId}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Could not load check-in code');
          return;
        }
        setError('');
        const dataUrl = await QRCode.toDataURL(data.checkinUrl, {
          width: 240,
          margin: 1,
          color: { dark: '#1B1B18', light: '#F7F5EF' },
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
        const delay = Math.max(2000, data.expiresAt - Date.now() - 2000);
        timerRef.current = setTimeout(refresh, delay);
      } catch {
        if (!cancelled) setError('Network error');
      }
    };

    void refresh();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token, eventId]);

  return (
    <div className="text-center">
      <h3 className="text-sm font-semibold text-ink mb-1">{CHECKIN.organizerCodeTitle}</h3>
      <p className="text-xs text-sub mb-3">{CHECKIN.organizerCodeHint}</p>
      {error ? (
        <p className="text-sm text-live">{error}</p>
      ) : qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qrDataUrl}
          alt="Check-in QR code"
          width={240}
          height={240}
          className="mx-auto rounded-xl border border-hairline"
        />
      ) : (
        <div className="mx-auto w-[240px] h-[240px] rounded-xl bg-ink/5 animate-pulse" />
      )}
    </div>
  );
}
