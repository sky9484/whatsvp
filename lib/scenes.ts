/**
 * Scenes (v4 P4) shared constants + client-side media validation. Kept in
 * sync with the server-side checks in app/api/scenes/route.ts — client
 * validation is just fast feedback, the server never trusts it.
 */

export const MAX_VIDEO_SECONDS = 15;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_SCENES_PER_EVENT = 10;
export const REPORT_HIDE_THRESHOLD = 3;
/** A scene needs at least this many reactions by day 7 to survive into the
 * 30-day recap instead of being hard-deleted — a fixed threshold rather than
 * a relative "top N" ranking, so a scene's fate doesn't depend on how many
 * other scenes happen to be posted that week. */
export const RECAP_REACTION_THRESHOLD = 3;

export const SCENES_VIDEO_ENABLED = process.env.NEXT_PUBLIC_SCENES_VIDEO_ENABLED !== 'false';

/** Reads a video File's duration without uploading it, via a throwaway <video>. */
export function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Could not read that video file.'));
    };
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Resizes/re-encodes an image File via canvas (max 1600px, webp ~q0.8) —
 * this also strips EXIF (GPS included) as a side effect of re-encoding,
 * satisfying the "strip EXIF GPS on upload" rule without a separate step.
 */
export function resizeImage(file: File, maxDim = 1600, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas not supported'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))), 'image/webp', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Could not read that image file.'));
    };
    img.src = URL.createObjectURL(file);
  });
}
