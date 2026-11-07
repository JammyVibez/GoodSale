import { describe, expect, it } from 'vitest';
import {
  chatArchivedFor,
  chatMessagePreview,
  chatMutedFor,
  chatRoomPreview,
  isDifferentChatDay,
  isMessageReadByPartner,
  totalUnreadMessages,
  unreadCountForRoom,
} from '../../lib/chat';
import type { ChatRoom, Message } from '../../lib/types';

const room: ChatRoom = {
  id: 8,
  buyerId: 1,
  sellerId: 2,
  productId: 10,
  productTitle: 'Leather loafers',
  productPrice: 48000,
  productImage: '',
  sellerName: 'Seller',
  buyerName: 'Buyer',
  lastMessage: 'Sent a photo',
  lastMessageTime: '2026-01-01T10:07:00.000Z',
  lastMessageSenderId: 2,
  buyerLastReadAt: '2026-01-01T10:00:00.000Z',
  sellerLastReadAt: '2026-01-01T10:06:00.000Z',
  buyerMuted: true,
  sellerArchivedAt: '2026-01-02T00:00:00.000Z',
};

const messages: Message[] = [
  {
    id: 1,
    roomId: 8,
    senderId: 2,
    messageText: 'Yes, it is available.',
    createdAt: '2026-01-01T10:01:00.000Z',
  },
  {
    id: 2,
    roomId: 8,
    senderId: 1,
    messageText: 'Is this available?',
    createdAt: '2026-01-01T10:05:00.000Z',
  },
  {
    id: 3,
    roomId: 8,
    senderId: 2,
    imageUrl: 'https://example.com/photo.jpg',
    createdAt: '2026-01-01T10:07:00.000Z',
  },
  {
    id: 4,
    roomId: 99,
    senderId: 2,
    messageText: 'Another room',
    createdAt: '2026-01-01T10:08:00.000Z',
  },
];

describe('chat inbox helpers', () => {
  it('counts only messages the member has not read', () => {
    expect(unreadCountForRoom(room, messages, 1)).toBe(2);
    expect(unreadCountForRoom(room, messages, 2)).toBe(0);
    expect(totalUnreadMessages([room], messages, 1)).toBe(2);
  });

  it('returns previews for every message attachment type', () => {
    expect(chatMessagePreview(messages[0])).toBe('Yes, it is available.');
    expect(chatMessagePreview(messages[2])).toBe('Sent a photo');
    expect(
      chatMessagePreview({
        id: 5,
        roomId: 8,
        senderId: 1,
        offerDetails: {
          amount: 40000,
          productId: 10,
          status: 'PENDING',
          proposedBy: 1,
        },
        createdAt: '2026-01-01T10:09:00.000Z',
      })
    ).toBe('Sent a price offer');
    expect(chatRoomPreview(room, messages, 1)).toBe('Sent a photo');
  });

  it('resolves per-participant preferences safely', () => {
    expect(chatMutedFor(room, 1)).toBe(true);
    expect(chatMutedFor(room, 2)).toBe(false);
    expect(chatArchivedFor(room, 1)).toBe(false);
    expect(chatArchivedFor(room, 2)).toBe(true);
    expect(chatMutedFor(room, 7)).toBe(false);
  });

  it('marks a sent message read only after the partner read position', () => {
    expect(isMessageReadByPartner(messages[1], room, 1)).toBe(true);
    expect(isMessageReadByPartner(messages[2], room, 2)).toBe(false);
    expect(isMessageReadByPartner(messages[0], room, 1)).toBe(false);
  });

  it('separates messages by calendar day', () => {
    expect(isDifferentChatDay('2026-01-01T23:59:00.000Z', '2026-01-02T00:01:00.000Z')).toBe(
      true
    );
    expect(isDifferentChatDay('2026-01-01T10:00:00.000Z', '2026-01-01T23:00:00.000Z')).toBe(
      false
    );
  });
});
