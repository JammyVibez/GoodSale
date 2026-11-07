'use client';

/**
 * Camera barcode capture for the seller listing flow.
 *
 * Uses the browser BarcodeDetector API, which is the only way to read a real
 * barcode without shipping a decoding library. When the browser cannot decode
 * barcodes the control explains that and the manual input stays available —
 * nothing is invented.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === 'undefined') return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === 'function' ? ctor : null;
}

/** True only when this browser can actually decode a barcode from video. */
export function canScanBarcodes(): boolean {
  return Boolean(getDetectorCtor());
}

export default function BarcodeCameraScanner({
  onDetected,
}: {
  onDetected: (barcode: string) => void;
}) {
  const [supported] = useState(canScanBarcodes);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOpen(false);
    setStarting(false);
  }, []);

  useEffect(() => stop, [stop]);

  const scan = useCallback(async () => {
    if (stoppedRef.current) return;
    const video = videoRef.current;
    const ctor = getDetectorCtor();
    if (!video || !ctor) return;
    try {
      const results = await new ctor({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
      }).detect(video);
      const code = String(results[0]?.rawValue || '').trim();
      if (/^[0-9]{8,14}$/.test(code)) {
        stop();
        onDetected(code);
        return;
      }
    } catch {
      // A single unreadable frame is normal; keep scanning.
    }
    if (!stoppedRef.current) timerRef.current = window.setTimeout(() => void scan(), 300);
  }, [onDetected, stop]);

  const start = async () => {
    setError(null);
    if (!supported) {
      setError('This browser cannot decode barcodes. Enter the number manually or use a phone browser.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable in this browser. Enter the number manually.');
      return;
    }
    stoppedRef.current = false;
    setStarting(true);
    setOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      if (stoppedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('Camera preview is not ready');
      video.srcObject = stream;
      await video.play();
      setStarting(false);
      void scan();
    } catch (err) {
      stop();
      setError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access or enter the barcode manually.'
          : 'Could not start the camera. Enter the barcode manually.'
      );
    }
  };

  return (
    <div className="space-y-2">
      {!open ? (
        <button
          type="button"
          onClick={() => void start()}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-bold text-ink-700 transition-colors hover:border-jade-400 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 cursor-pointer"
        >
          <Camera className="h-3.5 w-3.5" />
          Scan with camera
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-ink-950 dark:border-ink-700">
          <video
            ref={videoRef}
            muted
            playsInline
            className="h-48 w-full object-cover"
            aria-label="Camera barcode preview"
          />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-jade-400/70" />
          <button
            type="button"
            onClick={stop}
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-ink-950/70 text-white cursor-pointer"
            aria-label="Stop camera"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {starting && (
            <div className="absolute inset-0 grid place-items-center bg-ink-950/60 text-white">
              <span className="flex items-center gap-2 text-xs font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" /> Starting camera…
              </span>
            </div>
          )}
          <p className="absolute inset-x-0 bottom-0 bg-ink-950/70 px-3 py-2 text-center text-[10px] font-medium text-white/80">
            Hold the barcode inside the frame.
          </p>
        </div>
      )}
      {error && <p className="text-[10px] leading-relaxed text-ink-500 dark:text-ink-400">{error}</p>}
    </div>
  );
}
