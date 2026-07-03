'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { createAuthedClient } from '@/lib/supabase/client';
import { MAX_VIDEO_SECONDS, MAX_FILE_BYTES, SCENES_VIDEO_ENABLED, readVideoDuration, resizeImage } from '@/lib/scenes';
import { SCENES } from '@/lib/copy';

interface SceneCaptureProps {
  eventId: string;
  onCreated: () => void;
  onClose: () => void;
}

/**
 * The Scenes camera (v4 P4) — rule zero: this only ever renders for a
 * checked-in event (the caller gates that; see ScenesDrawer.tsx). In-app
 * capture via getUserMedia + MediaRecorder (720p, hard-stopped at 15s), or a
 * gallery fallback with the same client-side validation. Photos are always
 * re-encoded through canvas (lib/scenes.ts resizeImage) — that also strips
 * EXIF (GPS included) as a side effect, satisfying the brief's "strip EXIF
 * GPS on upload" without a separate step.
 */
export default function SceneCapture({ eventId, onCreated, onClose }: SceneCaptureProps) {
  const { token } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef(0);

  const [cameraError, setCameraError] = useState('');
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: SCENES_VIDEO_ENABLED })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setCameraError('Camera not available — use the gallery instead.'));
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const upload = async (blob: Blob, kind: 'photo' | 'video', ext: string, durationS?: number) => {
    if (!token) return;
    setUploading(true);
    setError('');
    try {
      const authed = createAuthedClient(token);
      if (!authed) throw new Error('Sign-in session required.');
      const path = `${eventId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await authed.storage.from('scenes').upload(path, blob, { contentType: blob.type });
      if (upErr) throw new Error(upErr.message);

      const res = await fetch('/api/scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId, kind, storage_path: path, duration_s: durationS }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not post that Scene.');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      // Re-run through the same resize/strip pipeline as gallery uploads for one code path.
      const file = new File([blob], 'capture.png', { type: 'image/png' });
      const resized = await resizeImage(file);
      void upload(resized, 'photo', 'webp');
    }, 'image/png');
  };

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream || !SCENES_VIDEO_ENABLED) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const durationS = Math.min(MAX_VIDEO_SECONDS, (Date.now() - recordStartRef.current) / 1000);
      void upload(blob, 'video', 'webm', Math.round(durationS));
    };
    recorderRef.current = recorder;
    recordStartRef.current = Date.now();
    recorder.start();
    setRecording(true);
    stopTimerRef.current = setTimeout(stopRecording, MAX_VIDEO_SECONDS * 1000);
  };

  const stopRecording = () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  };

  // Tap = photo, hold = video — a single pointerdown/up pair must resolve to
  // exactly one of the two, never both (a naive onClick+onPointerDown combo
  // would fire capturePhoto AND a just-started recording on every plain tap).
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOLD_THRESHOLD_MS = 250;

  const onCaptureDown = () => {
    if (!SCENES_VIDEO_ENABLED) return;
    holdTimerRef.current = setTimeout(startRecording, HOLD_THRESHOLD_MS);
  };
  const onCaptureUp = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recording) stopRecording();
    else void capturePhoto();
  };

  const handleGalleryFile = async (file: File) => {
    setError('');
    if (file.size > MAX_FILE_BYTES) {
      setError(SCENES.fileTooLarge);
      return;
    }
    if (file.type.startsWith('video/')) {
      try {
        const duration = await readVideoDuration(file);
        if (duration > MAX_VIDEO_SECONDS) {
          setError(SCENES.videoTooLong);
          return;
        }
        void upload(file, 'video', file.name.split('.').pop() || 'mp4', Math.round(duration));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that file.');
      }
    } else {
      const resized = await resizeImage(file);
      void upload(resized, 'photo', 'webp');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} aria-label="Close" className="text-white text-2xl leading-none">
          ×
        </button>
        <span className="text-white text-xs font-medium">{SCENES.addCta}</span>
        <span className="w-6" />
      </div>

      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {cameraError ? (
          <p className="text-white/70 text-sm text-center px-8">{cameraError}</p>
        ) : (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        )}
      </div>

      {error && <p className="px-4 pb-2 text-center text-sm text-live">{error}</p>}

      <div className="flex items-center justify-center gap-8 p-6">
        <label className="text-white text-xs font-medium cursor-pointer">
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleGalleryFile(f);
              e.target.value = '';
            }}
          />
          Gallery
        </label>

        <button
          onPointerDown={onCaptureDown}
          onPointerUp={onCaptureUp}
          disabled={uploading || Boolean(cameraError)}
          className={`w-16 h-16 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 ${recording ? 'bg-live' : 'bg-white/20'}`}
          aria-label="Capture"
        >
          <span className={`rounded-full ${recording ? 'w-6 h-6 bg-white rounded-sm' : 'w-12 h-12 bg-white'}`} />
        </button>

        <span className="w-14 text-center text-[10px] text-white/50">{uploading ? 'Posting…' : SCENES_VIDEO_ENABLED ? 'Tap: photo\nHold: video' : 'Photo only'}</span>
      </div>
    </div>
  );
}
