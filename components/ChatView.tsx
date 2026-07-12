// components/ChatView.tsx
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Send, Shield, ShoppingBag, 
  User as UserIcon, Check, CheckCheck, RefreshCw, ArrowLeft,
  FileText, Image as ImageIcon, Video as VideoIcon, Package, X,
  ExternalLink, Calendar, Landmark, HelpCircle, Play, AlertCircle
} from 'lucide-react';
import { 
  getDBState, saveDBState, dbOperations, ChatRoom, Message 
} from '../lib/store';

interface ChatViewProps {
  initialRoomId?: number | null;
  onNavigate?: (view: string, payload?: any) => void;
  onOpenAuth?: () => void;
}

export default function ChatView({ initialRoomId = null, onNavigate, onOpenAuth }: ChatViewProps) {
  const [db, setDb] = useState(getDBState());
  const [activeRoomId, setActiveRoomId] = useState<number | null>(initialRoomId);
  const [typedMessage, setTypedMessage] = useState('');
  const [isAiReplying, setIsAiReplying] = useState(false);
  
  // Interactive Overlays
  const [showReceiptPicker, setShowReceiptPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showVideoPicker, setShowVideoPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);

  // Real Upload attachments state
  const [chatImageFile, setChatImageFile] = useState<string | null>(null);
  const [chatImageCaption, setChatImageCaption] = useState('📷 Physical Inspection: Photo attached');
  const [chatVideoFile, setChatVideoFile] = useState<string | null>(null);
  const [chatVideoCaption, setChatVideoCaption] = useState('🎥 Video Inspection: Video attached');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleStateChange = () => {
      setDb(getDBState());
    };
    window.addEventListener('goodsale_db_state_change', handleStateChange);
    return () => window.removeEventListener('goodsale_db_state_change', handleStateChange);
  }, []);

  // Set active room to initialRoomId if passed from details view
  useEffect(() => {
    if (initialRoomId) {
      const timer = setTimeout(() => {
        setActiveRoomId(initialRoomId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [initialRoomId]);

  // Auto Scroll Chat list to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeRoomId, db.messages]);

  const user = db.currentUser;
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center select-none">
        <div className="w-16 h-16 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
          <MessageSquare className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white mb-2">Secure Merchant Chat</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto leading-relaxed">
          Connect directly with verified sellers, share visual receipts, send images/videos of item conditions, and trade securely with escrow safety.
        </p>
        <button
          onClick={onOpenAuth}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-sans font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer shadow-md shadow-emerald-500/10 transition-all"
        >
          Sign In / Register Account
        </button>
      </div>
    );
  }

  // Filter chat rooms that current user belongs to (buyer or seller)
  const myRooms = db.chatRooms.filter(room => 
    room.buyerId === user.id || room.sellerId === user.id
  );

  const activeRoom = db.chatRooms.find(r => r.id === activeRoomId);
  const activeRoomMessages = activeRoom 
    ? db.messages.filter(m => m.roomId === activeRoom.id).sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];

  const chatProduct = activeRoom ? db.products.find(p => p.id === activeRoom.productId) : null;
  const partnerId = activeRoom 
    ? (activeRoom.buyerId === user.id ? activeRoom.sellerId : activeRoom.buyerId)
    : null;
  const partner = partnerId ? db.users.find(u => u.id === partnerId) : null;

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!typedMessage.trim() || !activeRoomId) return;

    dbOperations.sendMessage(activeRoomId, typedMessage.trim());
    setTypedMessage('');
    setDb(getDBState());
  };

  // Advanced Attachment Sharing Helpers
  const shareReceipt = (order: any) => {
    if (!activeRoomId) return;
    const receiptObj = {
      orderNumber: order.orderNumber,
      productTitle: order.productTitle,
      amount: order.totalAmount,
      paymentMethod: order.paymentMethod || 'PAYSTACK_ESCROW',
      status: order.status || 'PAID_ESCROW',
      createdAt: order.createdAt || new Date().toISOString()
    };
    dbOperations.sendMessage(activeRoomId, undefined, undefined, undefined, receiptObj);
    setShowReceiptPicker(false);
    setDb(getDBState());
  };

  const shareImage = (imageUrl: string, captionText: string) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, captionText, imageUrl);
    setShowImagePicker(false);
    setDb(getDBState());
  };

  const shareVideo = (videoUrl: string, captionText: string) => {
    if (!activeRoomId) return;
    dbOperations.sendMessage(activeRoomId, captionText, undefined, videoUrl);
    setShowVideoPicker(false);
    setDb(getDBState());
  };

  const shareProductPreview = (prod: any) => {
    if (!activeRoomId) return;
    const productObj = {
      id: prod.id,
      title: prod.title,
      price: prod.price,
      image: prod.images[0] || 'https://picsum.photos/seed/product/150',
      condition: prod.condition
    };
    dbOperations.sendMessage(activeRoomId, undefined, undefined, undefined, undefined, productObj);
    setShowProductPicker(false);
    setDb(getDBState());
  };

  // Mock Receipt Data Generator in case they have no orders
  const myOrders = db.orders.filter(order => order.buyerId === user.id || order.sellerId === user.id);
  const fallbackOrders = myOrders.length > 0 ? myOrders : [
    {
      id: 9991,
      orderNumber: 'GS-2026-881029',
      productTitle: chatProduct?.title || 'Grade-A iPhone 13 Pro',
      totalAmount: chatProduct?.price || 420000,
      paymentMethod: 'DEBIT_CARD_SECURED',
      status: 'PAID_ESCROW',
      createdAt: new Date().toISOString()
    }
  ];

  // Real local uploads used for attachments
  const photoPresets: any[] = [];
  const videoPresets: any[] = [];

  return (
    <div className="bg-gray-50 dark:bg-slate-950 min-h-[calc(100vh-4rem)] flex transition-colors duration-300">
      <div className="max-w-7xl mx-auto w-full flex border-x border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative">
        
        {/* A. Left Side: Active Rooms List */}
        <div className={`w-full md:w-80 border-r border-gray-200 dark:border-slate-800 ${activeRoomId !== null ? 'hidden md:flex' : 'flex'} flex-col shrink-0`}>
          <div className="p-4 border-b border-gray-200 dark:border-slate-800 font-sans font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
            Merchant Messages
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800/60">
            {myRooms.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-400">
                No active chat sessions.
              </div>
            ) : (
              myRooms.map((room) => {
                const otherUserId = room.buyerId === user.id ? room.sellerId : room.buyerId;
                const otherUser = db.users.find(u => u.id === otherUserId);
                const prod = db.products.find(p => p.id === room.productId);
                const roomMsgs = db.messages.filter(m => m.roomId === room.id);
                const lastMsg = roomMsgs.length > 0 ? roomMsgs[roomMsgs.length - 1] : null;

                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    className={`w-full text-left p-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/40 flex items-start gap-3 transition-colors ${activeRoomId === room.id ? 'bg-emerald-500/5 border-l-4 border-emerald-500' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/10">
                      <UserIcon className="w-5 h-5 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className="font-sans font-bold text-xs text-slate-900 dark:text-white truncate">
                          {otherUser?.fullName || 'GoodSale Merchant'}
                        </h4>
                        {lastMsg && (
                          <span className="text-[9px] text-gray-400 font-mono">
                            {new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      
                      <p className="text-[10px] text-emerald-500 font-bold truncate mb-1">
                        📦 Product: {prod?.title}
                      </p>

                      <p className="text-[11px] text-gray-400 truncate leading-relaxed">
                        {lastMsg ? lastMsg.messageText || 'Sent an attachment' : 'Chat session established'}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* B. Right Side: Interactive Active chat workspace */}
        <div className={`flex-1 flex flex-col ${activeRoomId === null ? 'hidden md:flex' : 'flex'}`}>
          {activeRoom && partner ? (
            <>
              {/* Active Header Row */}
              <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRoomId(null);
                    }}
                    className="md:hidden p-2 bg-gray-50 dark:bg-slate-800 hover:bg-gray-150 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl transition-all shrink-0"
                    title="Back to conversation list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div 
                    onClick={() => onNavigate?.('seller-profile', { sellerId: partner.id })}
                    className="cursor-pointer hover:opacity-85 transition-all text-left group min-w-0"
                    title="Click to view profile"
                  >
                    <h3 className="font-sans font-bold text-sm text-slate-950 dark:text-white flex items-center gap-1 group-hover:text-emerald-500 transition-colors truncate">
                      {partner.fullName}
                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-800 text-slate-500 rounded text-[9px] font-bold">@{partner.username}</span>
                    </h3>
                    <p className="text-[10px] text-gray-400 font-mono truncate">
                      Merchant Level: {partner.sellerLevel} • Trust Score: {partner.trustScore}%
                    </p>
                  </div>
                </div>

                {chatProduct && (
                  <div className="p-2 border border-emerald-500/10 bg-emerald-500/5 rounded-xl hidden sm:flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-slate-800 overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={chatProduct.images[0]} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left">
                      <span className="text-[9px] text-gray-400 uppercase tracking-widest block">Linked Catalog SKU</span>
                      <span className="font-sans font-bold text-[11px] text-slate-900 dark:text-white line-clamp-1">{chatProduct.title}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat messages body container */}
              <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-950/20"
              >
                
                {/* Secure Trust Notice */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/15 rounded-2xl flex items-start gap-2.5 max-w-lg mx-auto">
                  <Shield className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5 animate-pulse" />
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                    <strong>Payment Escrow Alert:</strong> Do not pay sellers via direct wire. Pay only inside the GoodSale checkout window to invoke secure escrow insurance.
                  </p>
                </div>

                {activeRoomMessages.map((msg) => {
                  const isMine = msg.senderId === user.id;

                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md rounded-2xl p-3 shadow-sm text-xs leading-relaxed ${isMine ? 'bg-emerald-500 text-white rounded-br-none' : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-gray-100 dark:border-slate-800/80 rounded-bl-none'}`}>
                        
                        {/* 1. Normal text content */}
                        {msg.messageText && <p>{msg.messageText}</p>}

                        {/* 2. Photo Attachment Bubble */}
                        {msg.imageUrl && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 shadow-sm relative group bg-black/5 max-w-sm">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={msg.imageUrl} 
                              alt="Shared Inspection Upload" 
                              className="w-full h-44 object-cover hover:scale-105 transition-transform duration-300" 
                            />
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[9px] text-white font-bold flex items-center gap-1">
                              <ImageIcon className="w-3 h-3" />
                              VERIFIED PHOTO
                            </div>
                          </div>
                        )}

                        {/* 3. Playable Video Attachment Bubble */}
                        {msg.videoUrl && (
                          <div className="mt-2 rounded-xl overflow-hidden border border-gray-100 dark:border-slate-800 shadow-md bg-slate-950 max-w-xs p-1">
                            <div className="relative group">
                              <video 
                                src={msg.videoUrl} 
                                controls 
                                poster="https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80"
                                className="w-full h-44 rounded-lg object-cover" 
                              />
                              <div className="absolute top-2 left-2 px-2 py-0.5 bg-red-600 rounded text-[9px] text-white font-bold flex items-center gap-1 font-mono tracking-widest uppercase">
                                <VideoIcon className="w-3 h-3 animate-pulse" />
                                Live video
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 4. Structured Escrow Receipt Bubble */}
                        {msg.receiptDetails && (
                          <div className="mt-2 border-2 border-emerald-500/30 bg-emerald-500/5 dark:bg-slate-950 rounded-2xl p-4 shadow-md max-w-xs text-left">
                            <div className="flex items-center gap-1.5 pb-2 border-b border-emerald-500/10 mb-2.5">
                              <div className="w-7 h-7 rounded bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                                <FileText className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-wider block font-sans">ESCROW RECEIPT</span>
                                <span className="text-[9px] text-gray-400 font-mono block leading-none">{msg.receiptDetails.orderNumber}</span>
                              </div>
                            </div>

                            <div className="space-y-1.5 text-[10px]">
                              <div className="flex justify-between items-baseline">
                                <span className="text-gray-400">Escrow Item:</span>
                                <span className="font-bold text-slate-800 dark:text-white line-clamp-1 max-w-[120px]">{msg.receiptDetails.productTitle}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Capital Paid:</span>
                                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">₦{Number(msg.receiptDetails.amount).toLocaleString()}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Escrow Status:</span>
                                <span className="px-1.5 py-0.5 bg-emerald-500 text-white rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-0.5">
                                  <Shield className="w-2.5 h-2.5" />
                                  SECURED
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-400">Payment Node:</span>
                                <span className="font-mono text-gray-500 dark:text-slate-400">{msg.receiptDetails.paymentMethod}</span>
                              </div>
                            </div>

                            <div className="mt-3 pt-2 border-t border-emerald-500/10 text-center">
                              <span className="text-[8px] text-gray-400 font-sans block">
                                Safe-Handshake Protection Activated.
                              </span>
                            </div>
                          </div>
                        )}

                        {/* 5. Product Embed Preview Card Bubble */}
                        {msg.productDetails && (
                          <div className="mt-2 border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm max-w-xs text-left">
                            <div className="h-28 w-full relative">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={msg.productDetails.image} alt="" className="w-full h-full object-cover" />
                              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/60 text-white rounded text-[8px] font-bold">
                                {msg.productDetails.condition.replace('_', ' ')}
                              </div>
                            </div>
                            <div className="p-3 space-y-1">
                              <h5 className="font-sans font-bold text-xs text-slate-900 dark:text-white line-clamp-1">{msg.productDetails.title}</h5>
                              <p className="font-mono text-xs text-emerald-500 font-extrabold">₦{Number(msg.productDetails.price).toLocaleString()}</p>
                              
                              <button 
                                onClick={() => onNavigate?.('product-details', { productId: msg.productDetails?.id })}
                                className="w-full py-1.5 bg-gray-50 dark:bg-slate-800 hover:bg-emerald-500 hover:text-white transition-colors text-[9px] font-bold text-slate-700 dark:text-slate-300 rounded-lg flex items-center justify-center gap-1 mt-1"
                              >
                                Inspect Full Specs
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex justify-end items-center gap-1 text-[9px] mt-1.5 opacity-65 font-mono">
                          <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {isMine && <CheckCheck className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* AI Simulating feedback bubble */}
                {isAiReplying && (
                  <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800/80 rounded-2xl rounded-bl-none p-3 text-xs text-gray-400 italic flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                      Seller is writing a reply...
                    </div>
                  </div>
                )}

              </div>

              {/* Chat Input form footer with attachments bar */}
              <div className="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                
                {/* Advanced Attachment Options Toolbar */}
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-800/60 bg-gray-50/50 dark:bg-slate-950/20 flex gap-1 overflow-x-auto items-center">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mr-2 select-none shrink-0">Trade Tools:</span>
                  
                  <button
                    onClick={() => setShowReceiptPicker(true)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:border-emerald-500 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 transition-all shrink-0"
                    title="Share an Escrow Transaction Receipt"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    Share Receipt
                  </button>

                  <button
                    onClick={() => setShowImagePicker(true)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:border-emerald-500 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 transition-all shrink-0"
                    title="Send Simulated Physical Condition Photos"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
                    Send Photo
                  </button>

                  <button
                    onClick={() => setShowVideoPicker(true)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:border-emerald-500 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 transition-all shrink-0"
                    title="Send Playable Diagnostic/Unboxing Videos"
                  >
                    <VideoIcon className="w-3.5 h-3.5 text-red-500" />
                    Send Video
                  </button>

                  <button
                    onClick={() => setShowProductPicker(true)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:border-emerald-500 border border-gray-200 dark:border-slate-700 rounded-xl text-[10px] text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1 transition-all shrink-0"
                    title="Send a Catalog Product Preview Card"
                  >
                    <Package className="w-3.5 h-3.5 text-amber-500" />
                    Share Product
                  </button>
                </div>

                <form 
                  onSubmit={handleSendMessage}
                  className="p-3 flex gap-2"
                >
                  <input
                    type="text"
                    value={typedMessage}
                    onChange={(e) => setTypedMessage(e.target.value)}
                    placeholder="Enter message for partner..."
                    className="flex-1 px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-white"
                  />
                  
                  <button
                    type="submit"
                    className="p-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-colors flex items-center justify-center cursor-pointer shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-500">
              <MessageSquare className="w-12 h-12 text-gray-200 dark:text-slate-800 mb-2 animate-bounce" />
              <p className="text-sm font-semibold mb-1">Select a Chat Session</p>
              <p className="text-xs">Click a buyer conversation thread from the left list to begin chatting.</p>
            </div>
          )}
        </div>

      </div>

      {/* MODAL 1: SHARE RECEIPT SELECTOR */}
      {showReceiptPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button 
              onClick={() => setShowReceiptPicker(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-400 hover:text-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="font-sans font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <FileText className="w-5.5 h-5.5 text-blue-500" />
                Share Escrow Ledger Receipt
              </h3>
              <p className="text-xs text-gray-500 mt-1">Select an active transaction invoice to share with your trading partner in this conversation thread.</p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
              {fallbackOrders.map((ord) => (
                <button
                  key={ord.id}
                  onClick={() => shareReceipt(ord)}
                  className="w-full text-left p-3 border border-gray-100 dark:border-slate-800 rounded-2xl hover:border-emerald-500 hover:bg-emerald-500/5 transition-all flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold block text-slate-900 dark:text-white truncate max-w-[240px]">{ord.productTitle}</span>
                    <span className="text-[10px] text-gray-400 font-mono">Invoice: {ord.orderNumber}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-emerald-500 block">₦{Number(ord.totalAmount).toLocaleString()}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 rounded uppercase font-bold tracking-widest">{ord.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SEND IMAGE PICKER */}
      {showImagePicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button 
              onClick={() => setShowImagePicker(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-400 hover:text-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="font-sans font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <ImageIcon className="w-5.5 h-5.5 text-emerald-500" />
                Physical Inspection Photos
              </h3>
              <p className="text-xs text-gray-500 mt-1 font-sans">Select a real physical verification picture or courier handover shot from your device.</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-center cursor-pointer hover:border-emerald-500 bg-gray-50/50 dark:bg-slate-950/20 relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setChatImageFile(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {chatImageFile ? (
                  <div className="space-y-2">
                    <img src={chatImageFile} alt="Preview" className="max-h-32 mx-auto rounded-lg object-contain" />
                    <span className="text-[10px] text-emerald-500 font-bold block">✓ Image Selected Successfully</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <ImageIcon className="w-8 h-8 text-slate-400 mx-auto" />
                    <span className="text-xs font-bold block text-slate-700 dark:text-slate-300">Click to Select Device Image</span>
                    <span className="text-[10px] text-slate-400 block font-sans">JPEG, PNG, WebP</span>
                  </div>
                )}
              </div>

              {chatImageFile && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Attachment Caption</label>
                  <input
                    type="text"
                    value={chatImageCaption}
                    onChange={(e) => setChatImageCaption(e.target.value)}
                    placeholder="Enter image caption..."
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                  />
                </div>
              )}

              <button
                disabled={!chatImageFile}
                onClick={() => {
                  if (chatImageFile) {
                    shareImage(chatImageFile, chatImageCaption);
                    setShowImagePicker(false);
                    setChatImageFile(null);
                    setChatImageCaption('📷 Physical Inspection: Photo attached');
                  }
                }}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 shadow-md shadow-emerald-500/10 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                Attach & Send Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: SEND VIDEO PICKER */}
      {showVideoPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button 
              onClick={() => {
                setShowVideoPicker(false);
                setChatVideoFile(null);
              }}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-400 hover:text-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="font-sans font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <VideoIcon className="w-5.5 h-5.5 text-red-500" />
                Physical Unboxing Videos
              </h3>
              <p className="text-xs text-gray-500 mt-1 font-sans">Upload a real-time diagnostics or unboxing verification video proof of condition to secure full escrow compliance.</p>
            </div>

            <div className="space-y-4 text-xs">
              <div className="border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-2xl p-4 text-center cursor-pointer hover:border-red-500 bg-gray-50/50 dark:bg-slate-950/20 relative">
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setChatVideoFile(reader.result as string);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                {chatVideoFile ? (
                  <div className="space-y-2">
                    <video src={chatVideoFile} controls className="max-h-32 mx-auto rounded-lg" />
                    <span className="text-[10px] text-red-500 font-bold block">✓ Video Selected Successfully</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Play className="w-8 h-8 text-slate-400 mx-auto" />
                    <span className="text-xs font-bold block text-slate-700 dark:text-slate-300">Click to Select Device Video</span>
                    <span className="text-[10px] text-slate-400 block font-sans">MP4, WebM, AVI</span>
                  </div>
                )}
              </div>

              {chatVideoFile && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Attachment Caption</label>
                  <input
                    type="text"
                    value={chatVideoCaption}
                    onChange={(e) => setChatVideoCaption(e.target.value)}
                    placeholder="Enter video caption..."
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-white focus:outline-none"
                  />
                </div>
              )}

              <button
                disabled={!chatVideoFile}
                onClick={() => {
                  if (chatVideoFile) {
                    shareVideo(chatVideoFile, chatVideoCaption);
                    setShowVideoPicker(false);
                    setChatVideoFile(null);
                    setChatVideoCaption('🎥 Video Inspection: Video attached');
                  }
                }}
                className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1 shadow-md shadow-red-600/10 cursor-pointer"
              >
                <VideoIcon className="w-4 h-4" />
                Attach & Send Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: SHARE PRODUCT SELECTOR */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button 
              onClick={() => setShowProductPicker(false)}
              className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full text-gray-400 hover:text-slate-900"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="font-sans font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Package className="w-5.5 h-5.5 text-amber-500" />
                Share Catalog Product Embed
              </h3>
              <p className="text-xs text-gray-500 mt-1">Send a clickable embedded listing card so your partner can inspect price, condition, SKU specs, and active warranty terms.</p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
              {db.products.map((p) => (
                <button
                  key={p.id}
                  onClick={() => shareProductPreview(p)}
                  className="w-full text-left p-3 border border-gray-100 dark:border-slate-800 rounded-2xl hover:border-emerald-500 hover:bg-emerald-500/5 transition-all flex items-center gap-3"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.images[0]} alt="" className="w-10 h-10 object-cover rounded-lg shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold block text-slate-900 dark:text-white truncate">{p.title}</span>
                    <span className="text-[10px] text-gray-400 font-sans block truncate">{p.brand || 'No brand'} • Condition: {p.condition.replace('_', ' ')}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-mono font-extrabold text-emerald-500">₦{Number(p.price).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
