// components/chat/VoiceNoteRecorder.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react';
import {
  buildDeterministicWaveform,
  formatAudioDuration,
  pickSupportedAudioMime,
} from '@/lib/chat/voice';
import { uploadMedia } from '@/lib/upload';

interface VoiceNoteRecorderProps {
  onSendVoiceNote: (url: string, durationSeconds: number) => Promise<void> | void;
  disabled?: boolean;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not encode audio clip'));
    reader.readAsDataURL(blob);
  });
}

export function VoiceNoteRecorder({ onSendVoiceNote, disabled = false }: VoiceNoteRecorderProps) {
  const [status, setStatus] = useState<'IDLE' | 'RECORDING' | 'READY' | 'SENDING'>('IDLE');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>('audio/webm');

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupStream = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => () => cleanupStream(), []);

  const startRecording = async () => {
    setError(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Microphone recording is unavailable in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickSupportedAudioMime((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      setRecordedMime(mime || recorder.mimeType || 'audio/webm');
      chunksRef.current = [];
      setElapsed(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || recorder.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setStatus('READY');
        cleanupStream();
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setStatus('RECORDING');

      timerRef.current = setInterval(() => {
        setElapsed((sec) => {
          if (sec >= 120) {
            recorder.stop();
            return sec;
          }
          return sec + 1;
        });
      }, 1000);
    } catch {
      cleanupStream();
      setError('Allow microphone permission to record a negotiation voice note.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    } else {
      cleanupStream();
      setStatus('IDLE');
    }
  };

  const discardRecording = () => {
    cleanupStream();
    setRecordedBlob(null);
    setElapsed(0);
    setStatus('IDLE');
    setError(null);
  };

  const sendClip = async () => {
    if (!recordedBlob) return;
    setStatus('SENDING');
    setError(null);
    try {
      const ext = recordedMime.includes('mp4') ? 'm4a' : recordedMime.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([recordedBlob], `voice-note-${Date.now()}.${ext}`, { type: recordedMime });
      let finalUrl = '';
      try {
        finalUrl = await uploadMedia(file, 'chat-media');
      } catch {
        // Offline / preview fallback when remote storage isn't configured
        finalUrl = await blobToDataUrl(recordedBlob);
      }
      await onSendVoiceNote(finalUrl, Math.max(1, elapsed));
      discardRecording();
    } catch {
      setStatus('READY');
      setError('Could not attach voice note. Try again.');
    }
  };

  if (status === 'IDLE') {
    return (
      <div className="flex flex-col items-start">
        <button
          type="button"
          disabled={disabled}
          onClick={() => void startRecording()}
          aria-label="Record voice note"
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 text-[11px] font-bold text-ink-700 transition-colors hover:border-jade-500/50 hover:text-jade-700 disabled:opacity-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200 cursor-pointer"
        >
          <Mic className="h-4 w-4 text-jade-600 dark:text-jade-400" />
          <span>Voice note</span>
        </button>
        {error && <span className="mt-1 text-[10px] font-semibold text-red-600 dark:text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-jade-500/30 bg-jade-500/10 px-2.5 py-1">
      {status === 'RECORDING' ? (
        <>
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
          <span className="font-mono text-xs font-bold tabular-nums text-jade-800 dark:text-jade-200">
            {formatAudioDuration(elapsed)}
          </span>
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Stop recording"
            className="grid h-8 w-8 place-items-center rounded-full bg-jade-600 text-white hover:bg-jade-700 cursor-pointer"
          >
            <Square className="h-3.5 w-3.5 fill-white" />
          </button>
        </>
      ) : (
        <>
          <span className="font-mono text-xs font-bold text-jade-800 dark:text-jade-200">
            Voice · {formatAudioDuration(elapsed)}
          </span>
          <button
            type="button"
            onClick={discardRecording}
            aria-label="Discard voice note"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-500 hover:bg-white/70 hover:text-red-600 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={status === 'SENDING'}
            onClick={() => void sendClip()}
            aria-label="Send voice note"
            className="grid h-8 w-8 place-items-center rounded-full bg-jade-600 text-white hover:bg-jade-700 cursor-pointer"
          >
            {status === 'SENDING' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </>
      )}
    </div>
  );
}

export function VoiceNotePlayer({
  url,
  durationSeconds,
  seed,
  mine = false,
}: {
  url: string;
  durationSeconds?: number;
  seed: number | string;
  mine?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [totalSec, setTotalSec] = useState<number>(durationSeconds || 0);
  const bars = useMemo(() => buildDeterministicWaveform(seed, 22), [seed]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div
      className={`flex min-w-[210px] items-center gap-2.5 rounded-2xl px-2.5 py-2 ${
        mine ? 'bg-white/15 text-white' : 'bg-ink-100/80 text-ink-800 dark:bg-ink-800 dark:text-ink-100'
      }`}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setTotalSec(Math.round(d));
        }}
        onTimeUpdate={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) {
            setProgress(Math.min(1, e.currentTarget.currentTime / d));
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors cursor-pointer ${
          mine ? 'bg-white text-jade-800 hover:bg-jade-50' : 'bg-jade-600 text-white hover:bg-jade-700'
        }`}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current translate-x-0.5" />}
      </button>

      <div className="flex flex-1 items-center gap-[3px] h-7" aria-hidden="true">
        {bars.map((height, i) => {
          const active = i / bars.length <= progress;
          return (
            <span
              key={i}
              className={`w-[3px] rounded-full transition-colors ${
                mine
                  ? active
                    ? 'bg-gold-300'
                    : 'bg-white/40'
                  : active
                    ? 'bg-jade-600 dark:bg-jade-400'
                    : 'bg-ink-300 dark:bg-ink-600'
              }`}
              style={{ height: `${Math.round(height * 24)}px` }}
            />
          );
        })}
      </div>

      <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums opacity-85">
        {formatAudioDuration(totalSec)}
      </span>
    </div>
  );
}
