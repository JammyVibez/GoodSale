// components/ChatView.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import EmptyState from './ui/EmptyState';
import Button from './ui/Button';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Sheet from './ui/Sheet';
import { SmartAvatar, SmartImage } from './ui/SmartImage';
import LottieAnimation from './ui/LottieAnimation';
import AdSlot from './AdSlot';
import escrowShield from '../lib/lottie/escrow-shield.json';
import {
  MessageSquare, Send, Shield, Search,
  CheckCheck, ArrowLeft, MoreVertical,
  FileText, Image as ImageIcon, Video as VideoIcon, Package,
  ExternalLink, Play, Handshake, Sparkles, Store, ShieldCheck, Receipt,
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, SmilePlus, Reply, Flag, Clock, X,
  Bell, BellOff, Archive, ArchiveRestore, Loader2, Info, ArrowDown,
  PanelRightClose, PanelRightOpen, Check, Inbox,
} from 'lucide-react';
import {
  getDBState, dbOperations, ChatRoom, Message,
} from '../lib/store';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { startCall } from '@/lib/realtime-call';
import { uploadMedia } from '@/lib/upload';
import {
  chatArchivedFor,
  chatDayLabel,
  chatMessagePreview,
  chatMutedFor,
  chatReadAt,
  chatRelativeTime,
  chatRoomPreview,
  isChatParticipant,
  isDifferentChatDay,
  isMessageReadByPartner,
  totalUnreadMessages,
  unreadCountForRoom,
  type ChatInboxFilter,
} from '@/lib/chat';
import { toast } from '@/lib/feedback';
import { isVerifiedSeller } from '@/lib/verification';
import { VerifiedMark } from '@/components/verification/VerifiedBadge';

/** Emoji set offered in the message reaction picker. */
const REACTION_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const REPORT_REASONS = [
  'Scam or fraud attempt',
  'Asked me to pay off-platform',
  'Counterfeit or wrong item',
  'Abusive or harassing behaviour',
  'Spam or fake listing',
  'Other',
];

interface ChatViewProps {
  initialRoomId?: number | null;
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

const CAPTION_PHOTO = 'Photo attached for inspection';
const CAPTION_VIDEO = 'Video attached for inspection';
const IMAGE_UPLOAD_LIMIT = 8 * 1024 * 1024;
const VIDEO_UPLOAD_LIMIT = 25 * 1024 * 1024;

const INBOX_FILTERS: Array<{ id: ChatInboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'buying', label: 'Buying' },
  { id: 'selling', label: 'Selling' },
  { id: 'archived', label: 'Archived' },
];

export default function ChatView({ initialRoomId = null, onNavigate, onOpenAuth }: ChatViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeRoomId, setActiveRoomId] = useState<number | null>(initialRoomId);
  const [typedMessage, setTypedMessage] = useState('');
  const [roomQuery, setRoomQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<ChatInboxFilter>('all');
  const [threadSearch, setThreadSearch] = useState('');
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [unreadAnchor, setUnreadAnchor] = useState<string | null>(null);
  const [showUnreadMarker, setShowUnreadMarker] = useState(false);

  // Attachment / trade sheets
  const [openSheet, setOpenSheet] = useState<
    null | 'receipt' | 'photo' | 'video' | 'product' | 'offer' | 'calls' | 'report' | 'details'
  >(null);

  // Reply + reactions
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionOpenFor, setReactionOpenFor] = useState<number | null>(null);

  // Swipe-to-reply: drag a message toward the leading edge to quote it.
  const [swipe, setSwipe] = useState<{ id: number; dx: number } | null>(null);
  const swipeStart = useRef<{ id: number; x: number } | null>(null);
  const SWIPE_TRIGGER = 56;

  const onMessageTouchStart = (id: number) => (e: React.TouchEvent) => {
    swipeStart.current = { id, x: e.touches[0].clientX };
  };

  const onMessageTouchMove = (id: number) => (e: React.TouchEvent) => {
    const start = swipeStart.current;
    if (!start || start.id !== id) return;
    const dx = e.touches[0].clientX - start.x;
    // Only a leftward drag quotes a message; clamp so the bubble never flies off.
    setSwipe({ id, dx: Math.max(-96, Math.min(0, dx)) });
  };

  const onMessageTouchEnd = (id: number, message: Message) => () => {
    const dx = swipe && swipe.id === id ? swipe.dx : 0;
    swipeStart.current = null;
    setSwipe(null);
    if (dx <= -SWIPE_TRIGGER) setReplyTo(message);
  };

  // Report flow
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState('');
  const [reportTarget, setReportTarget] = useState<{ type: 'USER' | 'PRODUCT' | 'MESSAGE'; id: number; label: string } | null>(null);

  const [chatImageFile, setChatImageFile] = useState<File | null>(null);
  const [chatImagePreview, setChatImagePreview] = useState<string | null>(null);
  const [chatImageCaption, setChatImageCaption] = useState(CAPTION_PHOTO);
  const [chatVideoFile, setChatVideoFile] = useState<File | null>(null);
  const [chatVideoPreview, setChatVideoPreview] = useState<string | null>(null);
  const [chatVideoCaption, setChatVideoCaption] = useState(CAPTION_VIDEO);
  const [offerAmount, setOfferAmount] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const latestTypedRef = useRef('');
  const previousRoomRef = useRef<number | null>(null);
  const skipDraftSaveRef = useRef(false);

  // Messages stay live via Supabase Realtime (see bootstrapStore in lib/store.ts)
  useEffect(() => {
    const handleStateChange = () => setDb(getDBState());
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  useEffect(() => {
    if (initialRoomId) setActiveRoomId(initialRoomId);
  }, [initialRoomId]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance < 220) element.scrollTop = element.scrollHeight;
    else setShowJumpToLatest(true);
  }, [db.messages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    setShowJumpToLatest(false);
  }, [activeRoomId]);

  const user = db.currentUser;

  const myRooms = useMemo(() => {
    if (!user) return [] as ChatRoom[];
    return db.chatRooms
      .filter((room) => isChatParticipant(room, user.id))
      .sort((a, b) => {
        const aT = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
        const bT = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
        return bT - aT;
      });
  }, [db.chatRooms, user]);

  const unreadByRoom = useMemo(() => {
    const counts = new Map<number, number>();
    if (!user) return counts;
    for (const room of myRooms) {
      counts.set(room.id, unreadCountForRoom(room, db.messages, user.id));
    }
    return counts;
  }, [db.messages, myRooms, user]);

  const inboxUnread = user ? totalUnreadMessages(myRooms, db.messages, user.id) : 0;

  const filterCounts = useMemo(() => {
    if (!user) return { all: 0, unread: 0, buying: 0, selling: 0, archived: 0 } as Record<ChatInboxFilter, number>;
    const activeRooms = myRooms.filter((room) => !chatArchivedFor(room, user.id));
    return {
      all: activeRooms.length,
      unread: activeRooms.filter((room) => (unreadByRoom.get(room.id) || 0) > 0).length,
      buying: activeRooms.filter((room) => room.buyerId === user.id).length,
      selling: activeRooms.filter((room) => room.sellerId === user.id).length,
      archived: myRooms.filter((room) => chatArchivedFor(room, user.id)).length,
    };
  }, [myRooms, unreadByRoom, user]);

  const filteredRooms = useMemo(() => {
    if (!user) return [] as ChatRoom[];
    const needle = roomQuery.trim().toLowerCase();
    return myRooms.filter((room) => {
      const archived = chatArchivedFor(room, user.id);
      if (inboxFilter === 'archived' ? !archived : archived) return false;
      if (inboxFilter === 'unread' && (unreadByRoom.get(room.id) || 0) === 0) return false;
      if (inboxFilter === 'buying' && room.buyerId !== user.id) return false;
      if (inboxFilter === 'selling' && room.sellerId !== user.id) return false;
      if (!needle) return true;
      const otherId = room.buyerId === user.id ? room.sellerId : room.buyerId;
      const other = db.users.find((entry) => entry.id === otherId);
      return (
        room.productTitle?.toLowerCase().includes(needle) ||
        (room.lastMessage || '').toLowerCase().includes(needle) ||
        (other?.fullName || '').toLowerCase().includes(needle)
      );
    });
  }, [db.users, inboxFilter, myRooms, roomQuery, unreadByRoom, user]);

  const activeRoom = db.chatRooms.find((r) => r.id === activeRoomId) || null;
  const activeRoomMessages = useMemo(
    () =>
      activeRoom
        ? db.messages
            .filter((message) => message.roomId === activeRoom.id)
            .sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )
        : [],
    [activeRoom, db.messages]
  );

  const visibleMessages = useMemo(() => {
    const needle = threadSearch.trim().toLowerCase();
    if (!needle) return activeRoomMessages;
    return activeRoomMessages.filter((message) => {
      const searchable = [
        message.messageText || '',
        chatMessagePreview(message),
        message.receiptDetails?.orderNumber || '',
        message.receiptDetails?.productTitle || '',
        message.productDetails?.title || '',
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(needle);
    });
  }, [activeRoomMessages, threadSearch]);

  const chatProduct = activeRoom ? db.products.find((p) => p.id === activeRoom.productId) : null;
  const partnerId = activeRoom && user
    ? (activeRoom.buyerId === user.id ? activeRoom.sellerId : activeRoom.buyerId)
    : null;
  const partner = partnerId ? db.users.find((u) => u.id === partnerId) || null : null;
  const partnerProfile = partnerId ? db.profiles.find((p) => p.userId === partnerId) : undefined;
  const partnerVerified = isVerifiedSeller({
    verificationStatus: partnerProfile?.verificationStatus,
    verificationExpiresAt: partnerProfile?.verificationExpiresAt,
  });
  const partnerName = partner?.fullName || (activeRoom ? (activeRoom.buyerId === user?.id ? activeRoom.sellerName : activeRoom.buyerName) : '') || 'GoodSale member';
  const myOrders = user
    ? db.orders.filter((order) => order.buyerId === user.id || order.sellerId === user.id)
    : [];

  /** Call history for the signed-in user, newest first. */
  const myCalls = useMemo(() => {
    if (!user) return [];
    return db.calls
      .filter((c) => c.callerId === user.id || c.calleeId === user.id)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [db.calls, user]);

  const activeRoomCalls = activeRoom ? myCalls.filter((c) => c.roomId === activeRoom.id) : [];

  // Capture the read position on open so an unread divider stays visible after
  // the read RPC advances the durable pointer.
  useEffect(() => {
    const room = getDBState().chatRooms.find((entry) => entry.id === activeRoomId);
    const current = getDBState().currentUser;
    if (!room || !current) {
      setUnreadAnchor(null);
      setShowUnreadMarker(false);
      return;
    }
    setUnreadAnchor(chatReadAt(room, current.id) || null);
    setShowUnreadMarker(unreadCountForRoom(room, getDBState().messages, current.id) > 0);
  }, [activeRoom?.id, activeRoomId]);

  useEffect(() => {
    if (!activeRoom || !user) return;
    if (unreadCountForRoom(activeRoom, db.messages, user.id) > 0) {
      void dbOperations.markChatRead(activeRoom.id);
    }
  }, [activeRoom, activeRoomMessages.length, db.messages, user]);

  // Drafts survive room switches and accidental refreshes.
  useEffect(() => {
    if (!activeRoomId || !user) return;
    const previousRoom = previousRoomRef.current;
    if (previousRoom && previousRoom !== activeRoomId) {
      const previousKey = `goodsale:chat-draft:${user.id}:${previousRoom}`;
      const previousDraft = latestTypedRef.current;
      if (previousDraft.trim()) window.localStorage.setItem(previousKey, previousDraft);
      else window.localStorage.removeItem(previousKey);
    }
    previousRoomRef.current = activeRoomId;
    const saved = window.localStorage.getItem(`goodsale:chat-draft:${user.id}:${activeRoomId}`) || '';
    setTypedMessage(saved);
    latestTypedRef.current = saved;
    skipDraftSaveRef.current = true;
    setReplyTo(null);
    setThreadSearch('');
    setThreadSearchOpen(false);
    setThreadMenuOpen(false);
  }, [activeRoomId, user]);

  useEffect(() => {
    latestTypedRef.current = typedMessage;
    if (!activeRoomId || !user) return;
    if (skipDraftSaveRef.current) {
      skipDraftSaveRef.current = false;
      return;
    }
    const key = `goodsale:chat-draft:${user.id}:${activeRoomId}`;
    if (typedMessage.trim()) window.localStorage.setItem(key, typedMessage);
    else window.localStorage.removeItem(key);
  }, [activeRoomId, typedMessage, user]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [activeRoomId, typedMessage]);

  // Typing is ephemeral Realtime broadcast state — never written to the database.
  useEffect(() => {
    if (!activeRoom?.id || !user || !partnerId) return;
    const client = createClient();
    if (!client) return;
    const channel = client.channel(`goodsale-chat-typing-${activeRoom.id}`, {
      config: { broadcast: { self: false } },
    });
    channel.on('broadcast', { event: 'typing' }, (event) => {
      const payload = event.payload as { userId?: number } | undefined;
      if (payload?.userId !== partnerId) return;
      setPartnerTyping(true);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => setPartnerTyping(false), 2600);
    });
    channel.subscribe();
    typingChannelRef.current = channel;
    setPartnerTyping(false);
    return () => {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingChannelRef.current = null;
      setPartnerTyping(false);
      void client.removeChannel(channel);
    };
  }, [activeRoom?.id, partnerId, user]);

  useEffect(() => {
    const preview = chatImagePreview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [chatImagePreview]);

  useEffect(() => {
    const preview = chatVideoPreview;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [chatVideoPreview]);

  const notifyTyping = () => {
    if (!user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1800) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: user.id },
    });
  };

  const scrollToLatest = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    setShowJumpToLatest(false);
  };

  /** Reactions grouped per message: emoji → { count, mine }. */
  const reactionsFor = (messageId: number) => {
    const rows = db.messageReactions.filter((r) => r.messageId === messageId);
    const grouped = new Map<string, { count: number; mine: boolean }>();
    rows.forEach((r) => {
      const entry = grouped.get(r.emoji) || { count: 0, mine: false };
      entry.count += 1;
      if (user && r.userId === user.id) entry.mine = true;
      grouped.set(r.emoji, entry);
    });
    return Array.from(grouped.entries());
  };

  const messageById = (id?: number) => (id ? db.messages.find((m) => m.id === id) || null : null);

  const submitReport = async () => {
    if (!reportTarget) return;
    const res = await dbOperations.createReport({
      targetType: reportTarget.type,
      targetId: reportTarget.id,
      targetLabel: reportTarget.label,
      reason: reportReason,
      details: reportDetails,
    });
    if (res && 'error' in res && res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Report submitted. Our trust & safety team will review it.', 'Thanks');
    setReportDetails('');
    setReportReason(REPORT_REASONS[0]);
    setReportTarget(null);
    setOpenSheet(null);
  };

  // ---- Guards -------------------------------------------------------------
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-jade-500/10">
          <MessageSquare className="h-9 w-9 text-jade-600 dark:text-jade-400" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">
          Secure merchant chat
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
          Talk directly with verified sellers, confirm item condition with photos and video, and
          settle through escrow — never off-platform.
        </p>
        <Button className="mt-8 w-full" size="lg" onClick={onOpenAuth}>
          Sign in to open messages
        </Button>
      </div>
    );
  }

  // ---- Actions -----------------------------------------------------------
  const refresh = () => setDb(getDBState());

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = typedMessage.trim();
    if (!text || !activeRoomId) return;
    void dbOperations.sendMessage(
      activeRoomId,
      text,
      undefined,
      undefined,
      undefined,
      undefined,
      replyTo?.id
    );
    if (user) window.localStorage.removeItem(`goodsale:chat-draft:${user.id}:${activeRoomId}`);
    setTypedMessage('');
    setReplyTo(null);
    setPartnerTyping(false);
    refresh();
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const toggleMute = async () => {
    if (!activeRoom || !user) return;
    const next = !chatMutedFor(activeRoom, user.id);
    setThreadMenuOpen(false);
    const result = await dbOperations.setChatPreferences(activeRoom.id, { muted: next });
    if (result.error) toast.error(result.error);
    else toast.success(next ? 'Conversation muted.' : 'Conversation unmuted.');
    refresh();
  };

  const toggleArchive = async () => {
    if (!activeRoom || !user) return;
    const next = !chatArchivedFor(activeRoom, user.id);
    setThreadMenuOpen(false);
    const result = await dbOperations.setChatPreferences(activeRoom.id, { archived: next });
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(next ? 'Conversation archived.' : 'Conversation restored.');
    if (next || inboxFilter === 'archived') setActiveRoomId(null);
    refresh();
  };

  const chooseImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > IMAGE_UPLOAD_LIMIT) {
      toast.error('That photo is larger than 8MB. Choose a smaller image.');
      return;
    }
    setChatImageFile(file);
    setChatImagePreview(URL.createObjectURL(file));
  };

  const chooseVideo = (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('Choose an MP4, WebM or MOV video.');
      return;
    }
    if (file.size > VIDEO_UPLOAD_LIMIT) {
      toast.error('That video is larger than 25MB. Trim it or choose a smaller clip.');
      return;
    }
    setChatVideoFile(file);
    setChatVideoPreview(URL.createObjectURL(file));
  };

  const placeCall = (kind: 'AUDIO' | 'VIDEO') => {
    if (!activeRoomId || !partner) return;
    void startCall(activeRoomId, { userId: partner.id, name: partnerName, avatar: (partner as any)?.avatar }, kind);
  };

  const reactTo = (messageId: number, emoji: string) => {
    dbOperations.toggleReaction(messageId, emoji);
    setReactionOpenFor(null);
    refresh();
  };

  const shareReceipt = (order: any) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, undefined, undefined, undefined, {
      orderNumber: order.orderNumber,
      productTitle: order.productTitle,
      amount: order.totalAmount,
      paymentMethod: order.paymentMethod || 'PAYSTACK_ESCROW',
      status: order.status || 'PAID_ESCROW',
      createdAt: order.createdAt || new Date().toISOString(),
    });
    setOpenSheet(null);
    refresh();
  };

  const shareImage = async (file: File, captionText: string) => {
    if (!activeRoomId || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const imageUrl = await uploadMedia(file, 'chat-media');
      await dbOperations.sendMessage(activeRoomId, captionText.trim() || undefined, imageUrl);
      setChatImageFile(null);
      setChatImagePreview(null);
      setChatImageCaption(CAPTION_PHOTO);
      setOpenSheet(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload that photo.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const shareVideo = async (file: File, captionText: string) => {
    if (!activeRoomId || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const videoUrl = await uploadMedia(file, 'chat-media');
      await dbOperations.sendMessage(activeRoomId, captionText.trim() || undefined, undefined, videoUrl);
      setChatVideoFile(null);
      setChatVideoPreview(null);
      setChatVideoCaption(CAPTION_VIDEO);
      setOpenSheet(null);
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not upload that video.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const shareProductPreview = (prod: any) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, undefined, undefined, undefined, undefined, {
      id: prod.id,
      title: prod.title,
      price: prod.price,
      image: prod.images?.[0] || '',
      condition: prod.condition,
    });
    setOpenSheet(null);
    refresh();
  };

  const submitOffer = () => {
    if (!activeRoomId || !chatProduct) return;
    const amt = parseInt(offerAmount.replace(/[^0-9]/g, ''), 10);
    if (!amt || amt <= 0) return;
    dbOperations.sendNegotiationOffer(activeRoomId, chatProduct.id, amt);
    setOfferAmount('');
    setOpenSheet(null);
    refresh();
  };

  const conversationMuted = activeRoom ? chatMutedFor(activeRoom, user.id) : false;
  const conversationArchived = activeRoom ? chatArchivedFor(activeRoom, user.id) : false;
  const relatedOrder = activeRoom
    ? myOrders.find(
        (order) =>
          order.productId === activeRoom.productId &&
          (order.buyerId === partnerId || order.sellerId === partnerId)
      )
    : undefined;

  const detailsPanel = activeRoom ? (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-400">
            Conversation
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-jade-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-jade-700 dark:text-jade-300">
            <ShieldCheck className="h-3 w-3" /> Protected
          </span>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
          <SmartAvatar
            src={(partner as any)?.avatar}
            name={partnerName}
            className="h-11 w-11 shrink-0"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-1 truncate text-sm font-black text-ink-900 dark:text-white">
              {partnerName}
              {partnerVerified && (
                <VerifiedMark
                  status={partnerProfile?.verificationStatus}
                  expiresAt={partnerProfile?.verificationExpiresAt}
                />
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-500">
              {partner ? `${partner.trustScore}% trust · ${partner.sellerLevel.toLowerCase()}` : 'GoodSale member'}
            </p>
          </div>
        </div>
      </div>

      {chatProduct && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
          <SmartImage
            src={chatProduct.images?.[0]}
            alt={chatProduct.title}
            seed={`chat-details-${chatProduct.id}`}
            className="h-32 w-full"
          />
          <div className="space-y-2 p-3">
            <p className="line-clamp-2 text-xs font-bold text-ink-900 dark:text-white">
              {chatProduct.title}
            </p>
            <p className="font-mono text-sm font-black text-jade-700 dark:text-jade-400">
              ₦{Number(chatProduct.price).toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate?.('product', { id: chatProduct.id })}
                className="rounded-xl border border-ink-200 py-2 text-[11px] font-bold text-ink-700 transition-colors hover:border-jade-500/50 dark:border-ink-700 dark:text-ink-200 cursor-pointer"
              >
                View listing
              </button>
              <button
                onClick={() => setOpenSheet('offer')}
                className="rounded-xl bg-jade-500 py-2 text-[11px] font-bold text-white transition-colors hover:bg-jade-600 cursor-pointer"
              >
                Make offer
              </button>
            </div>
          </div>
        </div>
      )}

      {relatedOrder && (
        <div className="rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-ink-400">Order</p>
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[9px] font-black text-ink-600 dark:bg-ink-800 dark:text-ink-300">
              {relatedOrder.status.replaceAll('_', ' ')}
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] font-bold text-ink-700 dark:text-ink-200">
            {relatedOrder.orderNumber}
          </p>
          <p className="mt-1 text-[11px] text-ink-500">
            ₦{Number(relatedOrder.totalAmount).toLocaleString()} · escrow protected
          </p>
          <button
            onClick={() => onNavigate?.('buyer-profile')}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl bg-ink-100 py-2 text-[11px] font-bold text-ink-700 transition-colors hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 cursor-pointer"
          >
            View order <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-jade-500/20 bg-jade-500/[0.04] p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-black text-jade-800 dark:text-jade-200">
          <ShieldCheck className="h-4 w-4" /> Safe trade checklist
        </p>
        <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-ink-600 dark:text-ink-300">
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" /> Confirm condition with a real photo or video.</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" /> Keep every payment inside GoodSale escrow.</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade-500" /> Never share a bank PIN, OTP or delivery PIN in chat.</li>
        </ul>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white p-3 text-[11px] dark:border-ink-800 dark:bg-ink-900">
        <span className="text-ink-500">{activeRoomMessages.length} messages</span>
        <button
          onClick={() => void toggleMute()}
          className="flex items-center gap-1.5 font-bold text-ink-700 hover:text-jade-600 dark:text-ink-300 cursor-pointer"
        >
          {conversationMuted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
          {conversationMuted ? 'Unmute' : 'Mute'}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-ink-50 transition-colors duration-300 dark:bg-ink-950">
      <div className="mx-auto flex h-[calc(100vh-4rem-72px)] w-full max-w-[1500px] border-x border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900 md:h-[calc(100vh-4rem)]">

        {/* A. Conversation list */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 md:flex md:w-[23rem] xl:w-[24rem] ${
            activeRoomId !== null ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="border-b border-ink-200 px-5 pb-3 pt-5 dark:border-ink-800">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-xl font-black tracking-tight text-ink-900 dark:text-white">
                    Inbox
                  </h2>
                  {inboxUnread > 0 && (
                    <span className="rounded-full bg-jade-500 px-2 py-0.5 font-mono text-[10px] font-black text-white">
                      {inboxUnread > 99 ? '99+' : inboxUnread}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-ink-400">
                  Buyer and seller conversations
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-full border border-jade-500/20 bg-jade-500/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-jade-700 dark:text-jade-300">
                <Shield className="h-3 w-3" /> Escrow
              </span>
            </div>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={roomQuery}
                onChange={(e) => setRoomQuery(e.target.value)}
                placeholder="Search people, listings or messages"
                className="focus-ring w-full rounded-2xl border border-ink-200 bg-ink-50 py-2.5 pl-10 pr-4 text-sm text-ink-800 placeholder:text-ink-400 dark:border-ink-800 dark:bg-ink-950/50 dark:text-white"
              />
            </div>

            <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {INBOX_FILTERS.map((filter) => {
                const selected = inboxFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    onClick={() => setInboxFilter(filter.id)}
                    aria-pressed={selected}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                        : 'bg-ink-100/80 text-ink-500 hover:bg-ink-200/70 dark:bg-ink-800 dark:text-ink-300'
                    }`}
                  >
                    {filter.label}
                    {filterCounts[filter.id] > 0 && (
                      <span className={`ml-1 font-mono ${selected ? 'opacity-70' : 'text-ink-400'}`}>
                        {filterCounts[filter.id]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="list-stagger flex-1 overflow-y-auto">
            {filteredRooms.length === 0 ? (
              <EmptyState
                state="empty-chat"
                size="sm"
                icon={inboxFilter === 'unread' ? <Inbox /> : <MessageSquare />}
                title={
                  myRooms.length === 0
                    ? 'No conversations yet'
                    : inboxFilter === 'unread'
                      ? 'You are all caught up'
                      : 'No conversations here'
                }
                description={
                  roomQuery
                    ? 'Try a different person, listing or keyword.'
                    : myRooms.length === 0
                      ? 'Start a protected conversation from any listing.'
                      : 'Try another filter or browse new listings.'
                }
              />
            ) : (
              filteredRooms.map((room) => {
                const otherId = room.buyerId === user.id ? room.sellerId : room.buyerId;
                const other = db.users.find((u) => u.id === otherId);
                const otherProfile = db.profiles.find((p) => p.userId === otherId);
                const otherVerified = isVerifiedSeller({
                  verificationStatus: otherProfile?.verificationStatus,
                  verificationExpiresAt: otherProfile?.verificationExpiresAt,
                });
                const product = db.products.find((entry) => entry.id === room.productId);
                const unread = unreadByRoom.get(room.id) || 0;
                const isActive = activeRoomId === room.id;
                const isBuyer = room.buyerId === user.id;
                const muted = chatMutedFor(room, user.id);

                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`relative flex w-full items-start gap-3 border-b border-ink-100 px-4 py-4 text-left transition-colors cursor-pointer dark:border-ink-800/70 ${
                      isActive
                        ? 'bg-jade-500/[0.08] shadow-[inset_3px_0_0_0_var(--color-jade-500)]'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
                    }`}
                  >
                    <span className="relative shrink-0">
                      <SmartAvatar
                        src={(other as any)?.avatar}
                        name={other?.fullName || 'GoodSale member'}
                        className={`h-12 w-12 ${unread > 0 ? 'ring-2 ring-jade-500/30' : ''}`}
                      />
                      <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center overflow-hidden rounded-full border-2 border-white bg-ink-100 dark:border-ink-900 dark:bg-ink-800">
                        {product?.images?.[0] ? (
                          <SmartImage
                            src={product.images[0]}
                            alt=""
                            seed={`inbox-${room.id}`}
                            className="h-full w-full"
                          />
                        ) : (
                          <Package className="h-3 w-3 text-ink-400" />
                        )}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="flex min-w-0 items-center gap-1 text-sm text-ink-900 dark:text-white">
                          <span className={`truncate ${unread > 0 ? 'font-black' : 'font-bold'}`}>
                            {other?.fullName || 'GoodSale member'}
                          </span>
                          {otherVerified && (
                            <VerifiedMark
                              status={otherProfile?.verificationStatus}
                              expiresAt={otherProfile?.verificationExpiresAt}
                            />
                          )}
                        </h4>
                        <span className={`shrink-0 font-mono text-[10px] ${unread > 0 ? 'font-bold text-jade-600 dark:text-jade-400' : 'text-ink-400'}`}>
                          {chatRelativeTime(room.lastMessageTime)}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                          isBuyer
                            ? 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                            : 'bg-gold-400/15 text-gold-700 dark:text-gold-300'
                        }`}>
                          {isBuyer ? 'Buying' : 'Selling'}
                        </span>
                        <span className="truncate text-[11px] font-semibold text-jade-700 dark:text-jade-400">
                          {product?.title || room.productTitle || 'Listing'}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        <p className={`min-w-0 flex-1 truncate text-xs ${unread > 0 ? 'font-bold text-ink-800 dark:text-ink-100' : 'text-ink-500'}`}>
                          {chatRoomPreview(room, db.messages, user.id)}
                        </p>
                        {muted && <BellOff className="h-3 w-3 shrink-0 text-ink-400" aria-label="Muted" />}
                        {unread > 0 && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-jade-500 px-1.5 font-mono text-[10px] font-black text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-ink-100 p-4 dark:border-ink-800">
            <button
              onClick={() => onNavigate?.('marketplace')}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white py-2.5 text-xs font-bold text-ink-700 transition-colors hover:border-jade-500/50 hover:text-jade-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 cursor-pointer"
            >
              <Store className="h-3.5 w-3.5" /> Browse listings
            </button>
            <AdSlot placement="CHAT" onNavigate={onNavigate} variant="rail" />
          </div>
        </aside>

        {/* B. Active thread */}
        <section
          className={`flex min-w-0 flex-1 flex-col ${activeRoomId === null ? 'hidden md:flex' : 'flex'}`}
        >
          {activeRoom ? (
            <>
              {/* Thread header */}
              <header className="relative flex items-center justify-between gap-2 border-b border-ink-200 bg-white px-3 py-3 dark:border-ink-800 dark:bg-ink-900 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <button
                    onClick={() => setActiveRoomId(null)}
                    className="focus-ring shrink-0 rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-ink-900 md:hidden dark:bg-ink-800 dark:hover:text-white"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (partner && activeRoom.buyerId === user.id) {
                        onNavigate?.('seller-profile', { sellerId: partner.id });
                      }
                    }}
                    className={`group flex min-w-0 items-center gap-2.5 text-left ${activeRoom.buyerId === user.id ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <SmartAvatar
                      src={(partner as any)?.avatar}
                      name={partnerName}
                      className="h-10 w-10 shrink-0 ring-2 ring-jade-500/10"
                    />
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-1 text-sm font-black text-ink-900 transition-colors group-hover:text-jade-600 dark:text-white dark:group-hover:text-jade-400">
                        <span className="truncate">{partnerName}</span>
                        {partnerVerified && (
                          <VerifiedMark
                            status={partnerProfile?.verificationStatus}
                            expiresAt={partnerProfile?.verificationExpiresAt}
                          />
                        )}
                      </span>
                      <span className={`flex items-center gap-1.5 text-[11px] ${partnerTyping ? 'font-semibold text-jade-600 dark:text-jade-400' : 'text-ink-400'}`}>
                        {partnerTyping ? (
                          <span className="flex items-center gap-1">
                            <span className="flex gap-0.5">
                              <span className="h-1 w-1 animate-bounce rounded-full bg-jade-500 [animation-delay:-0.2s]" />
                              <span className="h-1 w-1 animate-bounce rounded-full bg-jade-500 [animation-delay:-0.1s]" />
                              <span className="h-1 w-1 animate-bounce rounded-full bg-jade-500" />
                            </span>
                            typing…
                          </span>
                        ) : (
                          <>
                            <ShieldCheck className="h-3 w-3 text-jade-500" />
                            {partnerVerified ? 'Verified' : 'GoodSale member'}
                            {partner ? ` · ${partner.trustScore}% trust` : ''}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setThreadSearchOpen((open) => !open)}
                    className={`focus-ring rounded-xl p-2 transition-colors cursor-pointer ${
                      threadSearchOpen
                        ? 'bg-jade-500 text-white'
                        : 'bg-ink-100 text-ink-500 hover:text-jade-600 dark:bg-ink-800 dark:hover:text-jade-400'
                    }`}
                    aria-label="Search this conversation"
                    title="Search conversation"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => placeCall('AUDIO')}
                    className="focus-ring hidden rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:bg-jade-500 hover:text-white dark:bg-ink-800 dark:hover:text-white cursor-pointer sm:grid"
                    aria-label="Start voice call"
                    title="Voice call"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => placeCall('VIDEO')}
                    className="focus-ring hidden rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:bg-jade-500 hover:text-white dark:bg-ink-800 dark:hover:text-white cursor-pointer sm:grid"
                    aria-label="Start video call"
                    title="Video call"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDetailsOpen((open) => !open)}
                    className="focus-ring hidden rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-jade-600 xl:grid dark:bg-ink-800 dark:hover:text-jade-400 cursor-pointer"
                    aria-label="Toggle conversation details"
                    title="Conversation details"
                  >
                    {detailsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setOpenSheet('details')}
                    className="focus-ring grid rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-jade-600 xl:hidden dark:bg-ink-800 dark:hover:text-jade-400 cursor-pointer"
                    aria-label="Conversation details"
                    title="Conversation details"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setThreadMenuOpen((open) => !open)}
                    className="focus-ring rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-jade-600 dark:bg-ink-800 dark:hover:text-jade-400 cursor-pointer"
                    aria-label="Conversation options"
                    aria-expanded={threadMenuOpen}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>

                {threadMenuOpen && (
                  <div className="absolute right-3 top-[3.75rem] z-30 w-60 overflow-hidden rounded-2xl border border-ink-200 bg-white p-1.5 shadow-xl dark:border-ink-700 dark:bg-ink-900">
                    <button
                      onClick={() => void toggleMute()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800 cursor-pointer"
                    >
                      {conversationMuted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      {conversationMuted ? 'Unmute conversation' : 'Mute conversation'}
                    </button>
                    <button
                      onClick={() => void toggleArchive()}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800 cursor-pointer"
                    >
                      {conversationArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                      {conversationArchived ? 'Restore to inbox' : 'Archive conversation'}
                    </button>
                    <button
                      onClick={() => {
                        setThreadMenuOpen(false);
                        setOpenSheet('calls');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800 cursor-pointer"
                    >
                      <Clock className="h-4 w-4" /> Call history
                    </button>
                    <div className="my-1 border-t border-ink-100 dark:border-ink-800" />
                    <button
                      onClick={() => {
                        if (!partner) return;
                        setReportTarget({ type: 'USER', id: partner.id, label: partnerName });
                        setThreadMenuOpen(false);
                        setOpenSheet('report');
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10 cursor-pointer"
                    >
                      <Flag className="h-4 w-4" /> Report this member
                    </button>
                  </div>
                )}
              </header>

              {/* Thread search */}
              {threadSearchOpen && (
                <div className="flex items-center gap-2 border-b border-ink-100 bg-jade-500/[0.04] px-3 py-2 dark:border-ink-800">
                  <Search className="h-4 w-4 shrink-0 text-jade-500" />
                  <input
                    autoFocus
                    type="search"
                    value={threadSearch}
                    onChange={(event) => setThreadSearch(event.target.value)}
                    placeholder="Search this conversation"
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400 dark:text-white"
                  />
                  {threadSearch.trim() && (
                    <span className="shrink-0 font-mono text-[10px] font-bold text-ink-400">
                      {visibleMessages.length} {visibleMessages.length === 1 ? 'result' : 'results'}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      setThreadSearch('');
                      setThreadSearchOpen(false);
                    }}
                    className="rounded-lg p-1 text-ink-400 hover:text-ink-700 dark:hover:text-white cursor-pointer"
                    aria-label="Close conversation search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Conversation trust bar */}
              <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-white px-4 py-2 dark:border-ink-800 dark:bg-ink-900">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-jade-500" />
                  Private to you and {partnerName.split(' ')[0]} · keep payments in escrow
                </span>
                {conversationMuted && (
                  <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    <BellOff className="h-3 w-3" /> Muted
                  </span>
                )}
              </div>

              {/* Messages */}
              <div className="relative min-h-0 flex-1">
              <div
                ref={scrollRef}
                onScroll={() => {
                  const element = scrollRef.current;
                  if (!element) return;
                  setShowJumpToLatest(
                    element.scrollHeight - element.scrollTop - element.clientHeight > 220
                  );
                }}
                className="h-full space-y-4 overflow-y-auto bg-ink-50/60 p-4 dark:bg-ink-950/30"
              >
                <Card
                  variant="outline"
                  className="mx-auto flex max-w-lg items-start gap-3 border-jade-500/25 bg-jade-500/[0.05] p-3.5"
                >
                  <div className="lottie-host h-10 w-10 shrink-0">
                    <div className="lottie-fallback text-jade-500">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div className="lottie-layer h-full w-full">
                      <LottieAnimation animationData={escrowShield} className="h-full w-full" />
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed text-jade-800 dark:text-jade-300">
                    <strong className="font-bold">Keep it in escrow.</strong> Never pay a seller by
                    direct transfer. Paying through GoodSale checkout is the only way your money is
                    protected until you confirm delivery.
                  </p>
                </Card>

                {visibleMessages.length === 0 && (
                  <div className="mx-auto flex max-w-sm flex-col items-center py-10 text-center">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-jade-600 shadow-sm dark:bg-ink-900 dark:text-jade-400">
                      <MessageSquare className="h-5 w-5" />
                    </span>
                    <p className="mt-3 text-sm font-bold text-ink-800 dark:text-ink-100">
                      {threadSearch.trim() ? 'No matching messages' : 'Start the conversation'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500">
                      {threadSearch.trim()
                        ? 'Try a different word, order number or listing title.'
                        : `Ask ${partnerName.split(' ')[0]} about condition, size, delivery or a fair price — keep the payment in escrow.`}
                    </p>
                  </div>
                )}

                {visibleMessages.map((msg, index) => {
                  const isMine = msg.senderId === user.id;
                  const quoted = messageById(msg.replyToId);
                  const quotedAuthor = quoted
                    ? quoted.senderId === user.id
                      ? 'You'
                      : partnerName
                    : '';
                  const reactions = reactionsFor(msg.id);
                  const previous = visibleMessages[index - 1];
                  const showDay = !threadSearch.trim() && (!previous || isDifferentChatDay(previous.createdAt, msg.createdAt));
                  const readByPartner = isMessageReadByPartner(msg, activeRoom, user.id);
                  const readTime = unreadAnchor ? new Date(unreadAnchor).getTime() : 0;
                  const firstUnreadIndex = showUnreadMarker && !threadSearch.trim()
                    ? visibleMessages.findIndex(
                        (entry) =>
                          entry.senderId !== user.id && new Date(entry.createdAt).getTime() > readTime
                      )
                    : -1;
                  return (
                    <React.Fragment key={msg.id}>
                    {showDay && (
                      <div className="flex items-center gap-3 py-1">
                        <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                        <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-ink-400 shadow-sm dark:bg-ink-900">
                          {chatDayLabel(msg.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                      </div>
                    )}
                    {index === firstUnreadIndex && (
                      <div className="flex items-center gap-3 py-1">
                        <span className="h-px flex-1 bg-jade-500/30" />
                        <span className="rounded-full bg-jade-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-jade-700 dark:text-jade-300">
                          Unread messages
                        </span>
                        <span className="h-px flex-1 bg-jade-500/30" />
                      </div>
                    )}
                    <div className={`group flex items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      {swipe?.id === msg.id && swipe.dx <= -16 && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-jade-600 dark:text-jade-400">
                          <Reply className="h-3.5 w-3.5" />
                          Reply
                        </span>
                      )}
                      <div
                        className={`flex max-w-[85%] flex-col sm:max-w-md ${isMine ? 'items-end' : 'items-start'}`}
                        onTouchStart={onMessageTouchStart(msg.id)}
                        onTouchMove={onMessageTouchMove(msg.id)}
                        onTouchEnd={onMessageTouchEnd(msg.id, msg)}
                        style={
                          swipe?.id === msg.id && swipe.dx < 0
                            ? { transform: `translateX(${swipe.dx}px)`, transition: 'transform 90ms ease-out' }
                            : undefined
                        }
                      >
                      <div
                        className={`relative w-full rounded-3xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isMine
                            ? 'rounded-br-lg bg-jade-500 text-white'
                            : 'rounded-bl-lg border border-ink-200 bg-white text-ink-800 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100'
                        }`}
                      >
                        {/* Quoted reply */}
                        {quoted && (
                          <div
                            onClick={() => setReplyTo(quoted)}
                            className={`mb-2 cursor-pointer rounded-xl border-l-2 px-2.5 py-1.5 text-xs ${
                              isMine
                                ? 'border-white/60 bg-white/15 text-white/85'
                                : 'border-jade-500 bg-ink-50 text-ink-500 dark:bg-ink-800'
                            }`}
                          >
                            <span className="block font-semibold">{quotedAuthor}</span>
                            <span className="line-clamp-2 block opacity-90">
                              {quoted.messageText || 'Attachment'}
                            </span>
                          </div>
                        )}

                        {msg.messageText && <p className="whitespace-pre-wrap">{msg.messageText}</p>}

                        {/* Photo attachment */}
                        {msg.imageUrl && (
                          <div className="mt-2.5 max-w-sm overflow-hidden rounded-2xl border border-black/10 bg-black/5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={msg.imageUrl}
                              alt="Shared inspection photo"
                              className="h-44 w-full object-cover"
                            />
                            <div className="flex items-center gap-1 bg-black/60 px-2 py-1 text-xs font-bold tracking-tight text-white">
                              <ImageIcon className="h-3 w-3" />
                              Inspection photo
                            </div>
                          </div>
                        )}

                        {/* Video attachment */}
                        {msg.videoUrl && (
                          <div className="mt-2.5 max-w-xs overflow-hidden rounded-2xl border border-ink-800 bg-ink-950 p-1">
                            <video src={msg.videoUrl} controls className="h-44 w-full rounded-xl object-cover" />
                            <div className="flex items-center gap-1 px-1 py-1 font-mono text-xs font-bold tracking-tight text-white">
                              <VideoIcon className="h-3 w-3" />
                              Inspection video
                            </div>
                          </div>
                        )}

                        {/* Escrow receipt */}
                        {msg.receiptDetails && (
                          <div className="mt-2.5 max-w-xs rounded-2xl border-2 border-jade-500/30 bg-white p-4 text-left text-ink-800 dark:bg-ink-950 dark:text-ink-100">
                            <div className="mb-3 flex items-center gap-2 border-b border-jade-500/15 pb-2.5">
                              <span className="grid h-8 w-8 place-items-center rounded-lg bg-jade-500/15 text-jade-600 dark:text-jade-400">
                                <Receipt className="h-4 w-4" />
                              </span>
                              <span>
                                <span className="block text-xs font-semibold tracking-tight text-jade-700 dark:text-jade-400">
                                  Escrow receipt
                                </span>
                                <span className="block font-mono text-xs text-ink-400">
                                  {msg.receiptDetails.orderNumber}
                                </span>
                              </span>
                            </div>
                            <dl className="space-y-1.5 text-xs">
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-ink-400">Item</dt>
                                <dd className="max-w-[9rem] truncate font-bold">{msg.receiptDetails.productTitle}</dd>
                              </div>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-ink-400">Amount</dt>
                                <dd className="font-mono font-bold text-jade-700 dark:text-jade-400">
                                  ₦{Number(msg.receiptDetails.amount).toLocaleString()}
                                </dd>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <dt className="text-ink-400">Status</dt>
                                <dd className="inline-flex items-center gap-1 rounded-md bg-jade-500 px-1.5 py-0.5 text-xs font-bold tracking-tight text-white">
                                  <Shield className="h-2.5 w-2.5" />
                                  Secured
                                </dd>
                              </div>
                              <div className="flex items-baseline justify-between gap-3">
                                <dt className="text-ink-400">Rail</dt>
                                <dd className="font-mono text-xs text-ink-500">
                                  {msg.receiptDetails.paymentMethod}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        )}

                        {/* Product embed */}
                        {msg.productDetails && (
                          <div className="mt-2.5 max-w-xs overflow-hidden rounded-2xl border border-ink-200 bg-white text-left dark:border-ink-800 dark:bg-ink-900">
                            <div className="relative h-28 w-full">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={msg.productDetails.image}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
                                {msg.productDetails.condition?.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="space-y-1 p-3">
                              <h5 className="truncate text-xs font-bold text-ink-900 dark:text-white">
                                {msg.productDetails.title}
                              </h5>
                              <p className="font-mono text-xs font-semibold text-jade-700 dark:text-jade-400">
                                ₦{Number(msg.productDetails.price).toLocaleString()}
                              </p>
                              <button
                                onClick={() =>
                                  onNavigate?.('product', { id: msg.productDetails?.id })
                                }
                                className="focus-ring mt-1 flex w-full items-center justify-center gap-1 rounded-xl bg-ink-100 py-1.5 text-xs font-bold text-ink-700 transition-colors hover:bg-jade-500 hover:text-white dark:bg-ink-800 dark:text-ink-200 cursor-pointer"
                              >
                                View listing
                                <ExternalLink className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Negotiation offer */}
                        {msg.offerDetails && (
                          <div className="mt-2.5 max-w-xs rounded-2xl border border-ink-300 bg-white p-4 text-left dark:bg-ink-950 dark:rounded-2xl dark:border-ink-700">
                            <div className="mb-3 flex items-center gap-2 border-b border-ink-200 pb-2.5 dark:border-ink-700">
                              <span className="grid h-8 w-8 place-items-center rounded-lg bg-jade-500/15 text-jade-600 dark:text-jade-400">
                                <Handshake className="h-4 w-4" />
                              </span>
                              <span>
                                <span className="block text-xs font-semibold tracking-tight text-ink-700 dark:text-ink-200">
                                  {msg.offerDetails.counterAmount ? 'Counter offer' : 'Offer'}
                                </span>
                                <span className="block font-mono text-xs text-ink-400">
                                  {msg.offerDetails.status}
                                </span>
                              </span>
                            </div>

                            <dl className="space-y-1.5 text-xs">
                              {msg.offerDetails.counterAmount ? (
                                <>
                                  <div className="flex justify-between gap-3">
                                    <dt className="text-ink-400">List price</dt>
                                    <dd className="font-mono text-ink-400 line-through">
                                      ₦{msg.offerDetails.amount.toLocaleString()}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between gap-3 text-sm font-bold">
                                    <dt>Counter</dt>
                                    <dd className="font-mono">
                                      ₦{msg.offerDetails.counterAmount.toLocaleString()}
                                    </dd>
                                  </div>
                                </>
                              ) : (
                                <div className="flex justify-between gap-3 text-sm font-bold">
                                  <dt>Proposed</dt>
                                  <dd className="font-mono">
                                    ₦{msg.offerDetails.amount.toLocaleString()}
                                  </dd>
                                </div>
                              )}
                              <div className="flex justify-between gap-3">
                                <dt className="text-ink-400">Proposed by</dt>
                                <dd className="font-semibold">
                                  {msg.offerDetails.proposedBy === user.id
                                    ? 'You'
                                    : partnerName}
                                </dd>
                              </div>
                            </dl>

                            {msg.offerDetails.status === 'PENDING' && (
                              <div className="mt-4 space-y-2">
                                {msg.offerDetails.proposedBy !== user.id ? (
                                  <>
                                    <div className="grid grid-cols-2 gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          dbOperations.updateOfferStatus(msg.id, 'ACCEPTED', undefined, user.id);
                                          refresh();
                                        }}
                                      >
                                        Accept
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                          const counterStr = prompt('Enter your counter offer amount (₦):');
                                          if (counterStr) {
                                            const amt = parseInt(counterStr.replace(/[^0-9]/g, ''), 10);
                                            if (amt > 0) {
                                              dbOperations.updateOfferStatus(msg.id, 'COUNTERED', amt, user.id);
                                              refresh();
                                            }
                                          }
                                        }}
                                      >
                                        Counter
                                      </Button>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="w-full"
                                      onClick={() => {
                                        dbOperations.updateOfferStatus(msg.id, 'DECLINED', undefined, user.id);
                                        refresh();
                                      }}
                                    >
                                      Decline
                                    </Button>
                                  </>
                                ) : (
                                  <p className="rounded-xl bg-ink-100 p-2 text-center text-xs text-ink-500 dark:bg-ink-800">
                                    Awaiting {partnerName}&apos;s decision
                                  </p>
                                )}
                              </div>
                            )}

                            {msg.offerDetails.status === 'ACCEPTED' && (
                              <p className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-jade-500/10 p-2 text-center text-xs font-bold text-jade-700 dark:text-jade-400">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Accepted — escrow order created
                              </p>
                            )}
                            {msg.offerDetails.status === 'DECLINED' && (
                              <p className="mt-3 rounded-xl bg-ink-100 p-2 text-center text-xs font-bold text-ink-500 dark:bg-ink-800">
                                Offer declined
                              </p>
                            )}
                            {msg.offerDetails.status === 'COUNTERED' && (
                              <p className="mt-3 rounded-xl bg-ink-100 p-2 text-center text-xs font-bold text-ink-500 dark:bg-ink-800">
                                Countered — awaiting response
                              </p>
                            )}
                          </div>
                        )}

                        <div
                          className={`mt-1.5 flex items-center justify-end gap-1 text-xs ${
                            isMine ? 'text-white/70' : 'text-ink-400'
                          }`}
                        >
                          {msg.replyToId && <Reply className="h-3 w-3" />}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isMine && (
                            <CheckCheck
                              className={`h-4 w-4 ${readByPartner ? 'text-gold-200 dark:text-gold-300' : 'opacity-60'}`}
                              aria-label={readByPartner ? 'Read by recipient' : 'Sent'}
                            />
                          )}
                        </div>
                      </div>

                      {/* Reactions + message actions */}
                      <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                        {reactions.map(([emoji, meta]) => (
                          <button
                            key={emoji}
                            onClick={() => reactTo(msg.id, emoji)}
                            title={`${meta.count} reaction${meta.count > 1 ? 's' : ''}`}
                            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors cursor-pointer ${
                              meta.mine
                                ? 'border-jade-500/40 bg-jade-500/10 text-jade-700 dark:text-jade-300'
                                : 'border-ink-200 bg-white text-ink-500 hover:border-jade-500/40 dark:border-ink-700 dark:bg-ink-800'
                            }`}
                          >
                            <span>{emoji}</span>
                            <span>{meta.count}</span>
                          </button>
                        ))}

                        <div className="relative flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => setReactionOpenFor(reactionOpenFor === msg.id ? null : msg.id)}
                            aria-label="React to message"
                            className="rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-jade-600 dark:hover:bg-ink-800 cursor-pointer"
                          >
                            <SmilePlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setReplyTo(msg)}
                            aria-label="Reply to message"
                            className="rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-jade-600 dark:hover:bg-ink-800 cursor-pointer"
                          >
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          {!isMine && (
                            <button
                              onClick={() => {
                                setReportTarget({
                                  type: 'MESSAGE',
                                  id: msg.id,
                                  label: `${partnerName}: ${(msg.messageText || 'attachment').slice(0, 60)}`,
                                });
                                setOpenSheet('report');
                              }}
                              aria-label="Report message"
                              className="rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-red-500 dark:hover:bg-ink-800 cursor-pointer"
                            >
                              <Flag className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {reactionOpenFor === msg.id && (
                            <div
                              className={`absolute bottom-full z-20 mb-1 flex items-center gap-0.5 rounded-full border border-ink-200 bg-white p-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900 ${
                                isMine ? 'right-0' : 'left-0'
                              }`}
                            >
                              {REACTION_EMOJI.map((emoji) => (
                                <button
                                  key={emoji}
                                  onClick={() => reactTo(msg.id, emoji)}
                                  className="rounded-full px-1.5 py-1 text-base transition-transform hover:scale-125 cursor-pointer"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })}
              </div>
                {showJumpToLatest && (
                  <button
                    onClick={scrollToLatest}
                    className="absolute bottom-3 right-1/2 z-20 flex translate-x-1/2 items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-[11px] font-bold text-ink-700 shadow-lg transition-all hover:border-jade-500/50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 cursor-pointer"
                  >
                    <ArrowDown className="h-3.5 w-3.5" /> Latest
                  </button>
                )}
              </div>

              {/* Composer */}
              <div className="border-t border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-ink-100 px-3 py-2 dark:border-ink-800/70">
                  <span className="mr-1 hidden shrink-0 text-[10px] font-black uppercase tracking-wider text-ink-400 sm:block">
                    Trade tools
                  </span>
                  <Chip tone="outline" icon={<FileText className="h-3.5 w-3.5 text-jade-500" />} onClick={() => setOpenSheet('receipt')}>
                    Receipt
                  </Chip>
                  <Chip tone="outline" icon={<ImageIcon className="h-3.5 w-3.5 text-jade-500" />} onClick={() => setOpenSheet('photo')}>
                    Photo
                  </Chip>
                  <Chip tone="outline" icon={<VideoIcon className="h-3.5 w-3.5 text-jade-500" />} onClick={() => setOpenSheet('video')}>
                    Video
                  </Chip>
                  <Chip tone="outline" icon={<Store className="h-3.5 w-3.5 text-jade-500" />} onClick={() => setOpenSheet('product')}>
                    Listing
                  </Chip>
                  <Chip tone="jade" icon={<Handshake className="h-3.5 w-3.5" />} onClick={() => setOpenSheet('offer')}>
                    Make offer
                  </Chip>
                </div>

                {replyTo && (
                  <div className="flex items-start gap-2 border-t border-ink-100 bg-jade-500/5 px-3 py-2 dark:border-ink-800/70">
                    <Reply className="mt-0.5 h-4 w-4 shrink-0 text-jade-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-jade-700 dark:text-jade-300">
                        Replying to {replyTo.senderId === user.id ? 'yourself' : partnerName}
                      </p>
                      <p className="line-clamp-1 text-xs text-ink-500">
                        {chatMessagePreview(replyTo)}
                      </p>
                    </div>
                    <button
                      onClick={() => setReplyTo(null)}
                      className="shrink-0 rounded-lg p-1 text-ink-400 transition-colors hover:text-ink-700 dark:hover:text-white cursor-pointer"
                      aria-label="Cancel reply"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {uploadingMedia && (
                  <div className="flex items-center gap-2 border-t border-jade-500/20 bg-jade-500/[0.06] px-4 py-2 text-[11px] font-semibold text-jade-700 dark:text-jade-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading securely…
                  </div>
                )}

                <form onSubmit={handleSendMessage} className="flex items-end gap-2 p-3">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setComposerEmojiOpen((open) => !open)}
                      className="grid h-10 w-10 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-jade-600 dark:hover:bg-ink-800 cursor-pointer"
                      aria-label="Add emoji"
                    >
                      <SmilePlus className="h-5 w-5" />
                    </button>
                    {composerEmojiOpen && (
                      <div className="absolute bottom-full left-0 z-30 mb-2 flex gap-0.5 rounded-2xl border border-ink-200 bg-white p-1.5 shadow-xl dark:border-ink-700 dark:bg-ink-900">
                        {REACTION_EMOJI.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                              setTypedMessage((current) => `${current}${emoji}`);
                              setComposerEmojiOpen(false);
                              composerRef.current?.focus();
                            }}
                            className="rounded-xl px-1.5 py-1 text-lg transition-transform hover:scale-125 cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl border border-ink-200 bg-ink-50 px-3 py-1.5 transition-colors focus-within:border-jade-500/60 dark:border-ink-800 dark:bg-ink-800/70">
                    <textarea
                      ref={composerRef}
                      rows={1}
                      value={typedMessage}
                      onChange={(event) => {
                        setTypedMessage(event.target.value);
                        if (event.target.value.trim()) notifyTyping();
                      }}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={`Message ${partnerName.split(' ')[0]}…`}
                      className="max-h-[132px] min-h-[32px] w-full resize-none bg-transparent py-1.5 text-sm leading-relaxed text-ink-800 outline-none placeholder:text-ink-400 dark:text-white"
                    />
                    <div className="flex items-center justify-between pb-0.5">
                      <span className="text-[9px] font-medium text-ink-400">Enter to send · Shift + Enter for a new line</span>
                      {typedMessage.trim() && (
                        <span className="font-mono text-[9px] text-ink-400">{typedMessage.length}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    type="submit"
                    disabled={!typedMessage.trim() || uploadingMedia}
                    className="h-10 w-10 shrink-0 rounded-full p-0"
                    aria-label="Send message"
                  >
                    {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState
                state="empty-chat"
                size="lg"
                icon={<MessageSquare />}
                title="Select a conversation"
                description="Pick a thread on the left to read messages, share inspection media and negotiate a price inside escrow."
              />
            </div>
          )}
        </section>

        {/* C. Conversation details */}
        {activeRoom && detailsOpen && (
          <aside className="hidden w-[19rem] shrink-0 overflow-y-auto border-l border-ink-200 bg-ink-50/70 p-4 dark:border-ink-800 dark:bg-ink-950/40 xl:block">
            {detailsPanel}
          </aside>
        )}
      </div>

      {/* Sheet: conversation details */}
      <Sheet open={openSheet === 'details'} onClose={() => setOpenSheet(null)} title="Conversation details">
        {detailsPanel}
      </Sheet>

      {/* Sheet: share a receipt */}
      <Sheet open={openSheet === 'receipt'} onClose={() => setOpenSheet(null)} title="Share an escrow receipt">
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {myOrders.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-ink-300 dark:text-ink-700" />
              <p className="text-sm font-bold text-ink-700 dark:text-ink-200">No receipts yet</p>
              <p className="mt-1 text-xs text-ink-500">
                Completed orders appear here as escrow ledger receipts.
              </p>
            </div>
          ) : (
            myOrders.map((ord) => (
              <button
                key={ord.id}
                onClick={() => shareReceipt(ord)}
                className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-200 p-3 text-left transition-colors hover:border-jade-500 hover:bg-jade-500/5 dark:border-ink-800 cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-ink-900 dark:text-white">
                    {ord.productTitle}
                  </span>
                  <span className="block font-mono text-xs text-ink-400">
                    {ord.orderNumber}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold text-jade-700 dark:text-jade-400">
                    ₦{Number(ord.totalAmount).toLocaleString()}
                  </span>
                  <span className="text-xs font-bold tracking-tight text-ink-400">
                    {ord.status}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </Sheet>

      {/* Sheet: photo */}
      <Sheet open={openSheet === 'photo'} onClose={() => setOpenSheet(null)} title="Share an inspection photo">
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-ink-200 p-5 text-center transition-colors hover:border-jade-500 dark:border-ink-800">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) chooseImage(file);
            }}
          />
          {chatImageFile && chatImagePreview ? (
            <span className="block space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chatImagePreview} alt="Preview" className="mx-auto max-h-32 rounded-xl object-contain" />
              <span className="block text-xs font-bold text-jade-600 dark:text-jade-400">
                {chatImageFile.name} · ready to upload
              </span>
            </span>
          ) : (
            <span className="block space-y-1">
              <ImageIcon className="mx-auto h-8 w-8 text-ink-400" />
              <span className="block text-sm font-bold text-ink-700 dark:text-ink-200">
                Choose a photo
              </span>
              <span className="block text-xs text-ink-400">JPEG, PNG or WebP</span>
            </span>
          )}
        </label>

        {chatImageFile && (
          <div className="mt-4 space-y-1.5">
            <label className="font-mono text-xs font-bold tracking-tight text-ink-400">
              Caption
            </label>
            <input
              type="text"
              value={chatImageCaption}
              onChange={(e) => setChatImageCaption(e.target.value)}
              className="focus-ring w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
            />
          </div>
        )}

        <Button
          className="mt-4 w-full"
          disabled={!chatImageFile || uploadingMedia}
          onClick={() => chatImageFile && void shareImage(chatImageFile, chatImageCaption)}
        >
          {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {uploadingMedia ? 'Uploading…' : 'Send photo'}
        </Button>
      </Sheet>

      {/* Sheet: video */}
      <Sheet open={openSheet === 'video'} onClose={() => setOpenSheet(null)} title="Share an inspection video">
        <label className="block cursor-pointer rounded-2xl border-2 border-dashed border-ink-200 p-5 text-center transition-colors hover:border-jade-500 dark:border-ink-800">
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) chooseVideo(file);
            }}
          />
          {chatVideoFile && chatVideoPreview ? (
            <span className="block space-y-2">
              <video src={chatVideoPreview} controls className="mx-auto max-h-32 rounded-xl" />
              <span className="block text-xs font-bold text-jade-600 dark:text-jade-400">
                {chatVideoFile.name} · ready to upload
              </span>
            </span>
          ) : (
            <span className="block space-y-1">
              <Play className="mx-auto h-8 w-8 text-ink-400" />
              <span className="block text-sm font-bold text-ink-700 dark:text-ink-200">
                Choose a video
              </span>
              <span className="block text-xs text-ink-400">MP4, WebM or MOV</span>
            </span>
          )}
        </label>

        {chatVideoFile && (
          <div className="mt-4 space-y-1.5">
            <label className="font-mono text-xs font-bold tracking-tight text-ink-400">
              Caption
            </label>
            <input
              type="text"
              value={chatVideoCaption}
              onChange={(e) => setChatVideoCaption(e.target.value)}
              className="focus-ring w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
            />
          </div>
        )}

        <Button
          className="mt-4 w-full"
          disabled={!chatVideoFile || uploadingMedia}
          onClick={() => chatVideoFile && void shareVideo(chatVideoFile, chatVideoCaption)}
        >
          {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <VideoIcon className="h-4 w-4" />}
          {uploadingMedia ? 'Uploading…' : 'Send video'}
        </Button>
      </Sheet>

      {/* Sheet: share a listing */}
      <Sheet open={openSheet === 'product'} onClose={() => setOpenSheet(null)} title="Share a listing">
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {db.products.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-500">No listings available yet.</p>
          ) : (
            db.products.map((p) => (
              <button
                key={p.id}
                onClick={() => shareProductPreview(p)}
                className="focus-ring flex w-full items-center gap-3 rounded-2xl border border-ink-200 p-2.5 text-left transition-colors hover:border-jade-500 hover:bg-jade-500/5 dark:border-ink-800 cursor-pointer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.images?.[0]} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900 dark:text-white">
                    {p.title}
                  </span>
                  <span className="block truncate text-xs text-ink-400">
                    {p.brand || 'No brand'} · {p.condition?.replace('_', ' ')}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-sm font-semibold text-jade-700 dark:text-jade-400">
                  ₦{Number(p.price).toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>
      </Sheet>

      {/* Sheet: negotiate */}
      <Sheet open={openSheet === 'offer'} onClose={() => setOpenSheet(null)} title="Negotiate a price">
        {chatProduct ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl border border-ink-200 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chatProduct.images?.[0]} alt="" className="h-12 w-12 rounded-xl object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-ink-900 dark:text-white">
                  {chatProduct.title}
                </span>
                <span className="block font-mono text-xs text-ink-400">
                  List price ₦{Number(chatProduct.price).toLocaleString()}
                </span>
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="font-mono text-xs font-bold tracking-tight text-ink-400">
                Your offer (₦)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={offerAmount}
                onChange={(e) => setOfferAmount(e.target.value)}
                placeholder={String(chatProduct.price)}
                className="focus-ring w-full rounded-xl border border-ink-200 bg-white px-3 py-3 font-mono text-lg font-bold text-ink-900 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {[0.95, 0.9, 0.8].map((f) => (
                <Chip
                  key={f}
                  tone="outline"
                  onClick={() => setOfferAmount(String(Math.round(chatProduct.price * f)))}
                >
                  ₦{Math.round(chatProduct.price * f).toLocaleString()}
                </Chip>
              ))}
            </div>

            <Button className="w-full" disabled={!offerAmount} onClick={submitOffer}>
              <Sparkles className="h-4 w-4" />
              Send offer through escrow
            </Button>
            <p className="text-center text-xs text-ink-400">
              Accepting an offer creates an escrow order automatically.
            </p>
          </div>
        ) : (
          <EmptyState
            state="error"
            size="sm"
            icon={<Handshake />}
            title="No listing in this thread"
            description="This conversation isn't linked to a listing, so there's nothing to negotiate yet."
          />
        )}
      </Sheet>

      {/* Sheet: call history */}
      <Sheet open={openSheet === 'calls'} onClose={() => setOpenSheet(null)} title="Call history">
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {(activeRoomCalls.length ? activeRoomCalls : myCalls).length === 0 ? (
            <div className="py-8 text-center">
              <Phone className="mx-auto mb-2 h-8 w-8 text-ink-300 dark:text-ink-700" />
              <p className="text-sm font-semibold text-ink-700 dark:text-ink-200">No calls yet</p>
              <p className="mt-1 text-xs text-ink-500">
                Tap the voice or video icon above to call this member over an encrypted line.
              </p>
            </div>
          ) : (
            (activeRoomCalls.length ? activeRoomCalls : myCalls).map((call) => {
              const outgoing = call.callerId === user.id;
              const otherId = outgoing ? call.calleeId : call.callerId;
              const other = db.users.find((u) => u.id === otherId);
              const missed = call.status === 'MISSED' || call.status === 'DECLINED' || call.status === 'FAILED';
              const Icon = missed ? PhoneMissed : outgoing ? PhoneOutgoing : PhoneIncoming;
              const mins = Math.floor((call.durationSeconds || 0) / 60);
              const secs = (call.durationSeconds || 0) % 60;
              return (
                <div
                  key={call.id}
                  className="flex items-center gap-3 rounded-2xl border border-ink-200 p-3 dark:border-ink-800"
                >
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
                      missed ? 'bg-red-500/10 text-red-500' : 'bg-jade-500/10 text-jade-700 dark:text-jade-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">
                      {other?.fullName || partnerName}
                    </p>
                    <p className="text-xs text-ink-500">
                      {call.kind === 'VIDEO' ? 'Video' : 'Voice'} ·{' '}
                      {new Date(call.startedAt).toLocaleString([], {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-semibold ${missed ? 'text-red-500' : 'text-ink-700 dark:text-ink-200'}`}>
                      {missed
                        ? call.status.charAt(0) + call.status.slice(1).toLowerCase()
                        : `${mins}m ${String(secs).padStart(2, '0')}s`}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Sheet>

      {/* Sheet: report a member or message */}
      <Sheet open={openSheet === 'report'} onClose={() => setOpenSheet(null)} title="Report to trust & safety">
        <div className="space-y-4">
          <div className="rounded-2xl bg-ink-50 p-3 text-xs text-ink-500 dark:bg-ink-800/50">
            <span className="block font-semibold text-ink-700 dark:text-ink-200">
              {reportTarget?.type === 'MESSAGE' ? 'Reporting a message' : 'Reporting a member'}
            </span>
            <span className="mt-0.5 block break-words">{reportTarget?.label}</span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-500">Reason</label>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                    reportReason === reason
                      ? 'border-jade-500 bg-jade-500/10 font-semibold text-jade-700 dark:text-jade-300'
                      : 'border-ink-200 text-ink-600 hover:border-jade-500/50 dark:border-ink-700 dark:text-ink-300'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-ink-500">What happened? (optional)</label>
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={4}
              placeholder="Add order numbers, screenshots or anything that helps our team investigate."
              className="focus-ring w-full rounded-2xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-800 dark:border-ink-800 dark:bg-ink-950 dark:text-white"
            />
          </div>

          <Button className="w-full" variant="danger" onClick={submitReport}>
            <Flag className="h-4 w-4" />
            Submit report
          </Button>
          <p className="text-center text-xs text-ink-400">
            Reports are private. The other party is never told who reported them.
          </p>
        </div>
      </Sheet>
    </div>
  );
}