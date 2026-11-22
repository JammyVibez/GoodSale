import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPushPayload,
  sanitizePushUrl,
  shouldDeliverPushForTopic,
  urlBase64ToUint8Array,
  validatePushSubscriptionInput,
} from './payload';

test('buildPushPayload formats escrow lock & release notifications cleanly', () => {
  const locked = buildPushPayload({
    kind: 'ESCROW_LOCKED',
    orderNumber: 'GS-1042',
    amountNaira: 45000,
    recipientRole: 'seller',
  });
  assert.equal(locked.category, 'escrow');
  assert.match(locked.title, /GS-1042/);
  assert.match(locked.body, /₦45,000/);
  assert.equal(locked.url, '/?view=dashboard');

  const released = buildPushPayload({
    kind: 'ESCROW_RELEASED',
    orderNumber: 'GS-1042',
    amountNaira: 45000,
    recipientRole: 'seller',
  });
  assert.equal(released.url, '/?view=wallet');
  assert.match(released.body, /credited to your GoodSale wallet/i);
});

test('buildPushPayload formats dispute resolutions and requires interaction', () => {
  const buyerWin = buildPushPayload({
    kind: 'DISPUTE_RESOLVED',
    orderNumber: 'GS-9910',
    resolution: 'REFUND_BUYER',
    recipientRole: 'buyer',
  });
  assert.equal(buyerWin.category, 'disputes');
  assert.equal(buyerWin.requireInteraction, true);
  assert.equal(buyerWin.url, '/?view=trust-safety');
  assert.match(buyerWin.body, /refund is being processed/i);
});

test('buildPushPayload truncates long chat messages and deep-links to roomId', () => {
  const longText = 'Hello '.repeat(40);
  const chat = buildPushPayload({
    kind: 'CHAT_MESSAGE',
    roomId: 88,
    senderName: 'Adaeze Store',
    preview: longText,
  });
  assert.equal(chat.category, 'messages');
  assert.equal(chat.title, 'Adaeze Store');
  assert.equal(chat.url, '/?view=chats&roomId=88');
  assert.ok(chat.body.length <= 120);
  assert.ok(chat.body.endsWith('…'));
});

test('validatePushSubscriptionInput validates HTTPS endpoints and encryption keys', () => {
  const invalidHttp = validatePushSubscriptionInput({
    endpoint: 'http://example.com/push/123',
    keys: { p256dh: 'B'.repeat(40), auth: 'A'.repeat(16) },
  });
  assert.equal(invalidHttp.ok, false);

  const valid = validatePushSubscriptionInput({
    endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc',
    keys: { p256dh: 'B'.repeat(40), auth: 'A'.repeat(16) },
    platform: 'ios',
    topics: { escrow: true, disputes: true, messages: false },
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.data.platform, 'ios');
    assert.equal(valid.data.topics.messages, false);
    assert.equal(valid.data.topics.escrow, true);
  }
});

test('topic filtering, urlBase64 decoding, and URL sanitization work safely', () => {
  assert.equal(shouldDeliverPushForTopic({ escrow: true, disputes: false, messages: true }, 'disputes'), false);
  assert.equal(shouldDeliverPushForTopic({ escrow: true, disputes: true, messages: true }, 'escrow', false), false);
  assert.equal(sanitizePushUrl('//evil.com'), '/');
  assert.equal(sanitizePushUrl('https://evil.com'), '/');
  assert.equal(sanitizePushUrl('/?view=chats&roomId=7'), '/?view=chats&roomId=7');

  const bytes = urlBase64ToUint8Array('SGVsbG8');
  assert.deepEqual(Array.from(bytes), [72, 101, 108, 108, 111]);
});
