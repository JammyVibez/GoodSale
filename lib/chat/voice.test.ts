// lib/chat/voice.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicWaveform,
  formatAudioDuration,
  pickSupportedAudioMime,
  validateCounterOfferAmount,
} from './voice';

test('formatAudioDuration renders mm:ss cleanly', () => {
  assert.equal(formatAudioDuration(0), '0:00');
  assert.equal(formatAudioDuration(9), '0:09');
  assert.equal(formatAudioDuration(75), '1:15');
});

test('pickSupportedAudioMime selects the first supported candidate cleanly', () => {
  assert.equal(pickSupportedAudioMime((mime) => mime === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickSupportedAudioMime(() => false), null);
});

test('buildDeterministicWaveform returns normalized heights within bounds', () => {
  const bars = buildDeterministicWaveform(42, 20);
  assert.equal(bars.length, 20);
  assert.ok(bars.every((bar) => bar >= 0.22 && bar <= 0.96));
});

test('validateCounterOfferAmount prevents zero, unchanged, or invalid values', () => {
  assert.deepEqual(validateCounterOfferAmount('₦145,000', 150_000), {
    valid: true,
    amount: 145_000,
  });
  assert.equal(validateCounterOfferAmount('150000', 150_000).valid, false);
  assert.equal(validateCounterOfferAmount('', 150_000).valid, false);
});
