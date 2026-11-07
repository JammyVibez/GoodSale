import type { ChatRoom, Message } from './types';

export type ChatInboxFilter = 'all' | 'unread' | 'buying' | 'selling' | 'archived';

export function isChatParticipant(room: ChatRoom, userId: number): boolean {
  return room.buyerId === userId || room.sellerId === userId;
}

/** The signed-in member's read position in a conversation. */
export function chatReadAt(room: ChatRoom, userId: number): string | undefined {
  if (room.buyerId === userId) return room.buyerLastReadAt;
  if (room.sellerId === userId) return room.sellerLastReadAt;
  return undefined;
}

/** The other participant's read position, used for read receipts. */
export function chatPartnerReadAt(room: ChatRoom, userId: number): string | undefined {
  if (room.buyerId === userId) return room.sellerLastReadAt;
  if (room.sellerId === userId) return room.buyerLastReadAt;
  return undefined;
}

export function chatMutedFor(room: ChatRoom, userId: number): boolean {
  if (room.buyerId === userId) return room.buyerMuted === true;
  if (room.sellerId === userId) return room.sellerMuted === true;
  return false;
}

export function chatArchivedFor(room: ChatRoom, userId: number): boolean {
  if (room.buyerId === userId) return Boolean(room.buyerArchivedAt);
  if (room.sellerId === userId) return Boolean(room.sellerArchivedAt);
  return false;
}

export function unreadCountForRoom(
  room: ChatRoom,
  messages: Message[],
  userId: number
): number {
  if (!isChatParticipant(room, userId)) return 0;
  const readAt = chatReadAt(room, userId);
  const readTime = readAt ? new Date(readAt).getTime() : 0;
  return messages.reduce((count, message) => {
    if (message.roomId !== room.id || message.senderId === userId) return count;
    const created = new Date(message.createdAt).getTime();
    if (!Number.isFinite(created)) return count;
    return created > readTime ? count + 1 : count;
  }, 0);
}

export function totalUnreadMessages(
  rooms: ChatRoom[],
  messages: Message[],
  userId: number
): number {
  return rooms.reduce(
    (total, room) => total + unreadCountForRoom(room, messages, userId),
    0
  );
}

export function chatMessagePreview(message: Message): string {
  if (message.offerDetails) return 'Sent a price offer';
  if (message.receiptDetails) return 'Shared an escrow receipt';
  if (message.productDetails) return 'Shared a listing';
  if (message.imageUrl) return 'Sent a photo';
  if (message.videoUrl) return 'Sent a video';
  if (message.voiceNoteUrl) return 'Sent a voice note';
  return message.messageText?.trim() || 'New message';
}

export function chatRoomPreview(room: ChatRoom, messages: Message[], userId: number): string {
  const latest = messages
    .filter((message) => message.roomId === room.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const preview = room.lastMessage || (latest ? chatMessagePreview(latest) : 'Conversation started');
  const sentByMe = latest ? latest.senderId === userId : room.lastMessageSenderId === userId;
  return sentByMe ? `You: ${preview}` : preview;
}

export function chatRelativeTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return '';
  if (ms < 60_000) return 'Now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function chatDayLabel(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (day === today) return 'Today';
  if (day === today - 86_400_000) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function isDifferentChatDay(a?: string, b?: string): boolean {
  if (!a || !b) return true;
  const first = new Date(a);
  const second = new Date(b);
  return (
    first.getFullYear() !== second.getFullYear() ||
    first.getMonth() !== second.getMonth() ||
    first.getDate() !== second.getDate()
  );
}

export function isMessageReadByPartner(
  message: Message,
  room: ChatRoom,
  userId: number
): boolean {
  if (message.senderId !== userId) return false;
  const partnerReadAt = chatPartnerReadAt(room, userId);
  if (!partnerReadAt) return false;
  return new Date(partnerReadAt).getTime() >= new Date(message.createdAt).getTime();
}
