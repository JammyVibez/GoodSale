// lib/haptics.ts — Tactile mobile feedback respecting reduced-motion preferences
export type HapticPattern = 'light' | 'medium' | 'success' | 'warning';

export function getHapticVibrationPattern(pattern: HapticPattern): number | number[] {
  switch (pattern) {
    case 'light':
      return 10;
    case 'medium':
      return 18;
    case 'success':
      return [12, 32, 18];
    case 'warning':
      return [22, 40, 22];
  }
}

export interface HapticEnvironment {
  reducedMotion?: boolean;
  vibrate?: ((pattern: number | number[]) => boolean) | null;
  capacitorImpact?: ((style: 'LIGHT' | 'MEDIUM' | 'HEAVY') => void) | null;
}

export function resolveHapticEnvironment(): HapticEnvironment {
  if (typeof window === 'undefined') {
    return { reducedMotion: false, vibrate: null, capacitorImpact: null };
  }

  const reducedMotion =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const vibrate =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
      ? navigator.vibrate.bind(navigator)
      : null;

  const capHaptics = (window as unknown as {
    Capacitor?: { Plugins?: { Haptics?: { impact?: (opts: { style: string }) => void } } };
  }).Capacitor?.Plugins?.Haptics;

  const capacitorImpact =
    capHaptics && typeof capHaptics.impact === 'function'
      ? (style: 'LIGHT' | 'MEDIUM' | 'HEAVY') => {
          try {
            capHaptics.impact?.({ style });
          } catch {
            // Native plugin unavailable on current shell
          }
        }
      : null;

  return { reducedMotion, vibrate, capacitorImpact };
}

export function triggerHaptic(
  pattern: HapticPattern = 'light',
  envOverride?: HapticEnvironment
): boolean {
  const env = envOverride ?? resolveHapticEnvironment();
  if (env.reducedMotion) return false;

  if (env.capacitorImpact) {
    const style =
      pattern === 'warning' || pattern === 'success'
        ? 'MEDIUM'
        : pattern === 'medium'
          ? 'MEDIUM'
          : 'LIGHT';
    env.capacitorImpact(style);
    return true;
  }

  if (env.vibrate) {
    try {
      env.vibrate(getHapticVibrationPattern(pattern));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
