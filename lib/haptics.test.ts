// lib/haptics.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getHapticVibrationPattern, triggerHaptic } from './haptics';

test('triggerHaptic skips vibration when reduced motion is enabled', () => {
  let called = false;
  const fired = triggerHaptic('success', {
    reducedMotion: true,
    vibrate: () => {
      called = true;
      return true;
    },
  });
  assert.equal(fired, false);
  assert.equal(called, false);
});

test('triggerHaptic prefers native Capacitor Haptics when present and falls back to vibrate', () => {
  const styles: string[] = [];
  const capFired = triggerHaptic('medium', {
    reducedMotion: false,
    capacitorImpact: (s) => styles.push(s),
    vibrate: () => true,
  });
  assert.equal(capFired, true);
  assert.deepEqual(styles, ['MEDIUM']);

  let patternUsed: number | number[] | undefined;
  const webFired = triggerHaptic('success', {
    reducedMotion: false,
    vibrate: (p) => {
      patternUsed = p;
      return true;
    },
  });
  assert.equal(webFired, true);
  assert.deepEqual(patternUsed, getHapticVibrationPattern('success'));
});
