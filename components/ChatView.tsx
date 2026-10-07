// components/ChatView.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import EmptyState from './ui/EmptyState';
import Button from './ui/Button';
import Card from './ui/Card';
import Chip from './ui/Chip';
import Sheet from './ui/Sheet';
import { SmartAvatar } from './ui/SmartImage';
import LottieAnimation from './ui/LottieAnimation';
import AdSlot from './AdSlot';
import escrowShield from '../lib/lottie/escrow-shield.json';
import {
  MessageSquare, Send, Shield, Search,
  CheckCheck, ArrowLeft, MoreVertical,
  FileText, Image as ImageIcon, Video as VideoIcon, Package,
  ExternalLink, Play, Handshake, Sparkles, Store, ShieldCheck, Receipt,
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Video, SmilePlus, Reply, Flag, Clock, X,
} from 'lucide-react';
import {
  getDBState, dbOperations, ChatRoom, Message,
} from '../lib/store';
import { startCall } from '../lib/realtime-call';
import { toast } from '../lib/feedback';

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

export default function ChatView({ initialRoomId = null, onNavigate, onOpenAuth }: ChatViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeRoomId, setActiveRoomId] = useState<number | null>(initialRoomId);
  const [typedMessage, setTypedMessage] = useState('');
  const [roomQuery, setRoomQuery] = useState('');

  // Attachment / trade sheets
  const [openSheet, setOpenSheet] = useState<
    null | 'receipt' | 'photo' | 'video' | 'product' | 'offer' | 'calls' | 'report'
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

  const [chatImageFile, setChatImageFile] = useState<string | null>(null);
  const [chatImageCaption, setChatImageCaption] = useState(CAPTION_PHOTO);
  const [chatVideoFile, setChatVideoFile] = useState<string | null>(null);
  const [chatVideoCaption, setChatVideoCaption] = useState(CAPTION_VIDEO);
  const [offerAmount, setOfferAmount] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeRoomId, db.messages]);

  const user = db.currentUser;

  const myRooms = useMemo(() => {
    if (!user) return [] as ChatRoom[];
    const rooms = db.chatRooms.filter(
      (room) => room.buyerId === user.id || room.sellerId === user.id
    );
    const needle = roomQuery.trim().toLowerCase();
    const sorted = [...rooms].sort((a, b) => {
      const aT = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const bT = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return bT - aT;
    });
    if (!needle) return sorted;
    return sorted.filter((room) => {
      const other = db.users.find(
        (u) => u.id === (room.buyerId === user.id ? room.sellerId : room.buyerId)
      );
      return (
        room.productTitle?.toLowerCase().includes(needle) ||
        (room.lastMessage || '').toLowerCase().includes(needle) ||
        (other?.fullName || '').toLowerCase().includes(needle)
      );
    });
  }, [db.chatRooms, db.users, roomQuery, user]);

  const activeRoom = db.chatRooms.find((r) => r.id === activeRoomId) || null;
  const activeRoomMessages = activeRoom
    ? db.messages
        .filter((m) => m.roomId === activeRoom.id)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  const chatProduct = activeRoom ? db.products.find((p) => p.id === activeRoom.productId) : null;
  const partnerId = activeRoom && user
    ? (activeRoom.buyerId === user.id ? activeRoom.sellerId : activeRoom.buyerId)
    : null;
  const partner = partnerId ? db.users.find((u) => u.id === partnerId) || null : null;
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
    if (!typedMessage.trim() || !activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, typedMessage.trim(), undefined, undefined, undefined, undefined, replyTo?.id);
    setTypedMessage('');
    setReplyTo(null);
    refresh();
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

  const shareImage = (imageUrl: string, captionText: string) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, captionText, imageUrl);
    setChatImageFile(null);
    setChatImageCaption(CAPTION_PHOTO);
    setOpenSheet(null);
    refresh();
  };

  const shareVideo = (videoUrl: string, captionText: string) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, captionText, undefined, videoUrl);
    setChatVideoFile(null);
    setChatVideoCaption(CAPTION_VIDEO);
    setOpenSheet(null);
    refresh();
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

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-ink-50 transition-colors duration-300 dark:bg-ink-950">
      <div className="mx-auto flex h-[calc(100vh-4rem-72px)] w-full max-w-7xl border-x border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900 md:h-[calc(100vh-4rem)]">

        {/* A. Conversation list */}
        <aside
          className={`w-full shrink-0 flex-col border-r border-ink-200 dark:border-ink-800 md:flex md:w-[22rem] ${
            activeRoomId !== null ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="border-b border-ink-200 px-5 py-4 dark:border-ink-800">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold tracking-tight text-ink-900 dark:text-white">
                Messages
              </h2>
              <Chip tone="jade" icon={<Shield className="h-3.5 w-3.5" />}>
                Escrow protected
              </Chip>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                value={roomQuery}
                onChange={(e) => setRoomQuery(e.target.value)}
                placeholder="Search conversations"
                className="focus-ring w-full rounded-full border border-ink-200 bg-ink-50 py-2.5 pl-10 pr-4 text-sm text-ink-800 placeholder:text-ink-400 dark:border-ink-800 dark:bg-ink-800 dark:text-white"
              />
            </div>
          </div>

          <div className="list-stagger flex-1 overflow-y-auto">
            {myRooms.length === 0 ? (
              <EmptyState
                state="empty-chat"
                size="sm"
                icon={<MessageSquare />}
                title={roomQuery ? 'No matches' : 'No conversations yet'}
                description={
                  roomQuery
                    ? 'Try a different product, seller or keyword.'
                    : 'Message a seller from any listing to start a protected trade.'
                }
              />
            ) : (
              myRooms.map((room) => {
                const otherId = room.buyerId === user.id ? room.sellerId : room.buyerId;
                const other = db.users.find((u) => u.id === otherId);
                const prod = db.products.find((p) => p.id === room.productId);
                const roomMsgs = db.messages.filter((m) => m.roomId === room.id);
                const lastMsg = roomMsgs.length > 0 ? roomMsgs[roomMsgs.length - 1] : null;
                const isActive = activeRoomId === room.id;

                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`flex w-full items-start gap-3 border-b border-ink-100 px-4 py-3.5 text-left transition-colors cursor-pointer dark:border-ink-800/70 ${
                      isActive
                        ? 'bg-jade-500/[0.07] shadow-[inset_3px_0_0_0_var(--color-jade-500)]'
                        : 'hover:bg-ink-50 dark:hover:bg-ink-800/40'
                    }`}
                  >
                    <SmartAvatar
                      src={(other as any)?.avatar}
                      name={other?.fullName || 'GoodSale member'}
                      className="h-11 w-11 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="truncate text-sm font-bold text-ink-900 dark:text-white">
                          {other?.fullName || 'GoodSale member'}
                        </h4>
                        {lastMsg && (
                          <span className="shrink-0 font-mono text-xs text-ink-400">
                            {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-semibold text-jade-700 dark:text-jade-400">
                        <Package className="h-3.5 w-3.5 shrink-0" />
                        {prod?.title || room.productTitle || 'Listing'}
                      </p>
                      <p className="mt-1 truncate text-xs text-ink-500">
                        {lastMsg
                          ? lastMsg.messageText || 'Sent an attachment'
                          : 'Conversation started'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Sponsored: chat rail placement */}
          <div className="border-t border-ink-100 px-4 py-4 dark:border-ink-800">
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
              <header className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 dark:border-ink-800">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => setActiveRoomId(null)}
                    className="focus-ring shrink-0 rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-ink-900 md:hidden dark:bg-ink-800 dark:hover:text-white"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => partner && onNavigate?.('seller-profile', { sellerId: partner.id })}
                    className="group flex min-w-0 items-center gap-3 text-left cursor-pointer"
                  >
                    <SmartAvatar
                      src={(partner as any)?.avatar}
                      name={partnerName}
                      className="h-10 w-10 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-ink-900 transition-colors group-hover:text-jade-600 dark:text-white dark:group-hover:text-jade-400">
                        {partnerName}
                      </span>
                      <span className="flex items-center gap-1.5 font-mono text-xs text-ink-400">
                        <ShieldCheck className="h-3 w-3 text-jade-500" />
                        {partner ? `Trust ${partner.trustScore}%` : 'Verified member'}
                      </span>
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {chatProduct && (
                    <button
                      onClick={() => onNavigate?.('product', { id: chatProduct.id })}
                      className="hidden items-center gap-2 rounded-2xl border border-jade-500/20 bg-jade-500/[0.06] p-1.5 pr-3 text-left transition-colors hover:border-jade-500/50 sm:flex cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={chatProduct.images?.[0]}
                        alt=""
                        className="h-9 w-9 rounded-xl object-cover"
                      />
                      <span className="max-w-[10rem]">
                        <span className="block truncate text-xs font-bold text-ink-900 dark:text-white">
                          {chatProduct.title}
                        </span>
                        <span className="block font-mono text-xs font-bold text-jade-700 dark:text-jade-400">
                          ₦{Number(chatProduct.price).toLocaleString()}
                        </span>
                      </span>
                    </button>
                  )}
                  {/* Secure real-time calling */}
                  <button
                    onClick={() => placeCall('AUDIO')}
                    className="focus-ring rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:bg-jade-500 hover:text-white dark:bg-ink-800 dark:hover:text-white cursor-pointer"
                    aria-label="Start voice call"
                    title="Voice call"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => placeCall('VIDEO')}
                    className="focus-ring rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:bg-jade-500 hover:text-white dark:bg-ink-800 dark:hover:text-white cursor-pointer"
                    aria-label="Start video call"
                    title="Video call"
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setOpenSheet('calls')}
                    className="focus-ring rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-jade-600 dark:bg-ink-800 dark:hover:text-jade-400 cursor-pointer"
                    aria-label="Call history"
                    title="Call history"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setOpenSheet('offer')}
                    className="focus-ring rounded-xl bg-ink-100 p-2 text-ink-500 transition-colors hover:text-jade-600 dark:bg-ink-800 dark:hover:text-jade-400 cursor-pointer"
                    aria-label="Negotiation options"
                    title="Negotiation options"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
              </header>

              {/* Conversation trust bar */}
              <div className="flex items-center justify-between gap-2 border-b border-ink-100 bg-white px-4 py-2 dark:border-ink-800 dark:bg-ink-900">
                <span className="flex items-center gap-1.5 text-xs text-ink-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-jade-500" />
                  Payments held in escrow until delivery is confirmed
                </span>
                <button
                  onClick={() => {
                    if (!partner) return;
                    setReportTarget({
                      type: 'USER',
                      id: partner.id,
                      label: partnerName,
                    });
                    setOpenSheet('report');
                  }}
                  className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-ink-400 transition-colors hover:text-red-500 cursor-pointer"
                >
                  <Flag className="h-3.5 w-3.5" />
                  Report
                </button>
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="flex-1 space-y-4 overflow-y-auto bg-ink-50/60 p-4 dark:bg-ink-950/30"
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

                {activeRoomMessages.map((msg) => {
                  const isMine = msg.senderId === user.id;
                  const quoted = messageById(msg.replyToId);
                  const quotedAuthor = quoted
                    ? quoted.senderId === user.id
                      ? 'You'
                      : partnerName
                    : '';
                  const reactions = reactionsFor(msg.id);
                  return (
                    <div key={msg.id} className={`group flex items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
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
                          {isMine && <CheckCheck className="h-4 w-4" />}
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
                  );
                })}
              </div>

              {/* Composer */}
              <div className="border-t border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900">
                <div className="flex items-center gap-1.5 overflow-x-auto border-b border-ink-100 px-3 py-2 dark:border-ink-800/70">
                  <span className="mr-1 hidden shrink-0 text-xs font-bold tracking-tight text-ink-400 sm:block">
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
                        {replyTo.messageText || 'Attachment'}
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

                <form onSubmit={handleSendMessage} className="flex items-end gap-2 p-3">
                  <input
                    type="text"
                    value={typedMessage}
                    onChange={(e) => setTypedMessage(e.target.value)}
                    placeholder={`Message ${partnerName}...`}
                    className="focus-ring flex-1 rounded-full border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 dark:border-ink-800 dark:bg-ink-800 dark:text-white"
                  />
                  <Button type="submit" disabled={!typedMessage.trim()} className="shrink-0 rounded-full px-4" aria-label="Send message">
                    <Send className="h-4 w-4" />
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
      </div>

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
              if (!file) return;
              const reader = new FileReader();
              reader.onloadend = () => setChatImageFile(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
          {chatImageFile ? (
            <span className="block space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chatImageFile} alt="Preview" className="mx-auto max-h-32 rounded-xl object-contain" />
              <span className="block text-xs font-bold text-jade-600 dark:text-jade-400">
                Image ready to send
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
          disabled={!chatImageFile}
          onClick={() => chatImageFile && shareImage(chatImageFile, chatImageCaption)}
        >
          <ImageIcon className="h-4 w-4" />
          Send photo
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
              if (!file) return;
              const reader = new FileReader();
              reader.onloadend = () => setChatVideoFile(reader.result as string);
              reader.readAsDataURL(file);
            }}
          />
          {chatVideoFile ? (
            <span className="block space-y-2">
              <video src={chatVideoFile} controls className="mx-auto max-h-32 rounded-xl" />
              <span className="block text-xs font-bold text-jade-600 dark:text-jade-400">
                Video ready to send
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
          disabled={!chatVideoFile}
          onClick={() => chatVideoFile && shareVideo(chatVideoFile, chatVideoCaption)}
        >
          <VideoIcon className="h-4 w-4" />
          Send video
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