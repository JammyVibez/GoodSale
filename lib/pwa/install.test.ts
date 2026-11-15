import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectInstallPlatform,
  isBypassCachePath,
  isCacheableStaticPath,
} from './install';

test('detects iPhone Safari properly', () => {
  const info = detectInstallPlatform({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
    displayModeStandalone: false,
    navigatorStandalone: false,
  });
  assert.equal(info.isIOS, true);
  assert.equal(info.isIOSSafari, true);
  assert.equal(info.isInstalled, false);
  assert.equal(info.platformLabel, 'iOS');
});

test('detects iPhone Chrome as iOS non-Safari so user gets Safari guidance', () => {
  const info = detectInstallPlatform({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  });
  assert.equal(info.isIOS, true);
  assert.equal(info.isIOSSafari, false);
});

test('detects iPadOS desktop-class Safari via touch points', () => {
  const info = detectInstallPlatform({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    maxTouchPoints: 5,
  });
  assert.equal(info.isIOS, true);
  assert.equal(info.isIPadOS, true);
  assert.equal(info.isIOSSafari, true);
});

test('detects standalone mode on iOS and Chromium', () => {
  const iosStandalone = detectInstallPlatform({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    navigatorStandalone: true,
  });
  assert.equal(iosStandalone.isInstalled, true);
  assert.equal(iosStandalone.platformLabel, 'Installed App');

  const pwaStandalone = detectInstallPlatform({
    userAgent: 'Mozilla/5.0 (Linux; Android 14)',
    displayModeStandalone: true,
  });
  assert.equal(pwaStandalone.isInstalled, true);
  assert.equal(pwaStandalone.isAndroid, true);
});

test('cache routing never caches API or auth endpoints', () => {
  assert.equal(isBypassCachePath('/api/wallet/status'), true);
  assert.equal(isBypassCachePath('/auth/callback'), true);
  assert.equal(isCacheableStaticPath('/api/health'), false);
  assert.equal(isCacheableStaticPath('/_next/static/chunks/main.js'), true);
  assert.equal(isCacheableStaticPath('/apple-touch-icon.png'), true);
});
