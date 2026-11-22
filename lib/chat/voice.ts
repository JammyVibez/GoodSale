// lib/chat/voice.ts

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export function pickSupportedAudioMime(
  isTypeSupported?: (mime: string) => boolean
): string | null {
  if (!isTypeSupported) return null;
  for (const candidate of AUDIO_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      /* ignore unsupported probe */
    }
  }
  return null;
}

export function formatAudioDuration(seconds?: number): string {
  const safe = Math.max(0, Math.round(Number(seconds) || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function buildDeterministicWaveform(seed: number | string, bars = 24): number[] {
  const input = String(seed || 'voice');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    hash ^= i + 0x9e3779b9;
    hash = Math.imul(hash, 0x85ebca6b);
    const ratio = ((hash >>> 0) % 75) / 100; // 0.00..0.74
    out.push(Number((0.22 + ratio).toFixed(2)));
  }
  return out;
}

export function validateCounterOfferAmount(
  rawInput: string,
  originalAmount: number
): { valid: true; amount: number } | { valid: false; error: string } {
  const digits = rawInput.replace(/[^0-9]/g, '');
  if (!digits) {
    return { valid: false, error: 'Enter a valid counter-offer amount in Naira.' };
  }
  const amount = Number(digits);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: 'Counter-offer must be greater than ₦0.' };
  }
  if (amount === originalAmount) {
    return { valid: false, error: 'Enter a different amount than the current offer or accept it directly.' };
  }
  if (amount > 500_000_000) {
    return { valid: false, error: 'Amount exceeds maximum marketplace limit.' };
  }
  return { valid: true, amount };
}
