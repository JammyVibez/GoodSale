// lib/realtime-call.ts
'use client';

/**
 * Real-time audio / video calling for GoodSale chat.
 *
 * Media flows peer-to-peer over WebRTC (encrypted end-to-end with DTLS-SRTP)
 * so nothing is routed through our servers. Supabase Realtime broadcast acts
 * only as the signalling channel that carries the ring, the SDP offer/answer
 * and ICE candidates between the two parties. Every attempt is written to the
 * `calls` table through the store so both sides keep a call history.
 */

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { dbOperations, getDBState } from '@/lib/store';

export type CallKind = 'AUDIO' | 'VIDEO';
export type CallPhase = 'RINGING' | 'ONGOING' | 'ENDED';

export interface CallPeer {
  userId: number;
  name: string;
  avatar?: string;
}

export interface CallState {
  /** Persisted row id in the `calls` table, once it exists. */
  id: number | null;
  roomId: number;
  kind: CallKind;
  peer: CallPeer;
  isCaller: boolean;
  phase: CallPhase;
  /** Incoming calls wait for the user to accept before any media is touched. */
  incoming: boolean;
  startedAt: number;
  muted: boolean;
  cameraOff: boolean;
  error?: string;
}

type Listener = (state: CallState | null) => void;

/* ------------------------------------------------------------------ *
 * Overlay state (framework-light, mirrored from lib/feedback.ts)
 * ------------------------------------------------------------------ */

let current: CallState | null = null;
const listeners = new Set<Listener>();
let elapsedTimer: ReturnType<typeof setInterval> | null = null;

function emit() {
  const snapshot = current ? { ...current } : null;
  listeners.forEach((fn) => fn(snapshot));
}

export function subscribeCall(listener: Listener): () => void {
  listeners.add(listener);
  listener(current ? { ...current } : null);
  return () => {
    listeners.delete(listener);
  };
}

export function getCallState(): CallState | null {
  return current ? { ...current } : null;
}

function patch(next: Partial<CallState>) {
  if (!current) return;
  current = { ...current, ...next };
  emit();
}

/* ------------------------------------------------------------------ *
 * WebRTC plumbing
 * ------------------------------------------------------------------ */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let remoteStream: MediaStream | null = null;
let channel: ReturnType<NonNullable<ReturnType<typeof createClient>>['channel']> | null = null;
let inbox: ReturnType<NonNullable<ReturnType<typeof createClient>>['channel']> | null = null;
let pendingCandidates: RTCIceCandidateInit[] = [];
let ringTimeout: ReturnType<typeof setTimeout> | null = null;
let answeredAt: number | null = null;

/** Extra sink for the media streams the overlay renders. */
const mediaListeners = new Set<(local: MediaStream | null, remote: MediaStream | null) => void>();
export function subscribeCallMedia(listener: (local: MediaStream | null, remote: MediaStream | null) => void) {
  mediaListeners.add(listener);
  listener(localStream, remoteStream);
  return () => {
    mediaListeners.delete(listener);
  };
}
function emitMedia() {
  mediaListeners.forEach((fn) => fn(localStream, remoteStream));
}
export function getCallMedia() {
  return { local: localStream, remote: remoteStream };
}

function supabase() {
  if (!isSupabaseConfigured()) return null;
  return createClient();
}

function tickElapsed() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = setInterval(() => emit(), 1000);
}

function teardownMedia() {
  if (elapsedTimer) clearInterval(elapsedTimer);
  elapsedTimer = null;
  if (ringTimeout) clearTimeout(ringTimeout);
  ringTimeout = null;

  try {
    pc?.getSenders().forEach((s) => s.track?.stop());
    pc?.close();
  } catch {
    /* already closed */
  }
  pc = null;

  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  remoteStream = null;
  pendingCandidates = [];
  emitMedia();

  if (channel) {
    try {
      void channel.unsubscribe();
    } catch {
      /* ignore */
    }
    channel = null;
  }
}

/** Release everything and hide the overlay. */
export function closeCall() {
  teardownMedia();
  current = null;
  answeredAt = null;
  emit();
}

/* ------------------------------------------------------------------ *
 * Signalling
 * ------------------------------------------------------------------ */

function broadcast(event: string, payload: Record<string, unknown>) {
  if (!channel) return;
  void channel.send({ type: 'broadcast', event, payload });
}

/**
 * Deliver a ring to the callee's personal inbox channel so a call can reach
 * them no matter which screen they are on.
 */
async function ringPeer(calleeId: number, payload: Record<string, unknown>) {
  const client = supabase();
  if (!client) return;
  const ch = client.channel(`goodsale-call-inbox-${calleeId}`, { config: { broadcast: { self: false } } });
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') done();
    });
    setTimeout(done, 2500);
  });
  void ch.send({ type: 'broadcast', event: 'ring', payload: { ...payload, from: me(), to: calleeId } });
  // Keep the channel up long enough for the send to flush, then release it.
  setTimeout(() => void ch.unsubscribe(), 4000);
}

function roomChannelName(roomId: number) {
  return `goodsale-call-${roomId}`;
}

async function joinRoomChannel(roomId: number) {
  const client = supabase();
  if (!client) return;
  if (channel) {
    try {
      void channel.unsubscribe();
    } catch {
      /* ignore */
    }
  }
  const ch = client.channel(roomChannelName(roomId), { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'webrtc' }, ({ payload }: { payload: any }) => {
    void handleSignal(payload);
  });
  ch.on('broadcast', { event: 'call' }, ({ payload }: { payload: any }) => {
    void handleControl(payload);
  });
  await new Promise<void>((resolve) => {
    ch.subscribe((status: string) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') resolve();
    });
  });
  channel = ch as any;
}

function ensurePeerConnection(roomId: number) {
  if (pc) return pc;
  const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  conn.onicecandidate = (e) => {
    if (e.candidate) {
      broadcast('webrtc', { kind: 'ice', from: me(), candidate: e.candidate.toJSON() });
    }
  };
  conn.ontrack = (e) => {
    remoteStream = e.streams[0] ?? remoteStream;
    emitMedia();
  };
  conn.onconnectionstatechange = () => {
    if (!pc || !current) return;
    if (pc.connectionState === 'connected') {
      if (answeredAt == null) answeredAt = Date.now();
      patch({ phase: 'ONGOING' });
    }
    if (pc.connectionState === 'failed' && current.phase !== 'ENDED') {
      patch({ error: 'Connection lost. Check your network and try again.' });
      void endCall(false);
    }
  };
  pc = conn;
  void roomId;
  return conn;
}

function me() {
  return getDBState().currentUser?.id ?? 0;
}

async function handleSignal(payload: any) {
  if (!current || !payload) return;
  // Ignore our own echoes and anything addressed to someone else.
  if (payload.from === me()) return;
  if (payload.to && payload.to !== me()) return;

  if (payload.kind === 'offer') {
    try {
      const conn = ensurePeerConnection(current.roomId);
      await conn.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of pendingCandidates) {
        try {
          await conn.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          /* ignore */
        }
      }
      pendingCandidates = [];
      const answer = await conn.createAnswer();
      await conn.setLocalDescription(answer);
      broadcast('webrtc', { kind: 'answer', from: me(), to: payload.from, sdp: answer });
    } catch (err) {
      console.error('Failed to answer call:', err);
      patch({ error: 'Could not establish the call.' });
    }
    return;
  }

  if (payload.kind === 'answer' && pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const c of pendingCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {
          /* ignore */
        }
      }
      pendingCandidates = [];
    } catch (err) {
      console.error('Failed to apply answer:', err);
    }
    return;
  }

  if (payload.kind === 'ice') {
    const candidate = payload.candidate;
    if (!candidate) return;
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        /* ignore */
      }
    } else {
      pendingCandidates.push(candidate);
    }
  }
}

async function handleControl(payload: any) {
  if (!current || !payload) return;
  if (payload.from === me()) return;
  if (payload.to && payload.to !== me()) return;

  if (payload.kind === 'accept') {
    // Caller side: callee picked up → start the media negotiation.
    if (ringTimeout) clearTimeout(ringTimeout);
    ringTimeout = null;
    answeredAt = Date.now();
    tickElapsed();
    patch({ phase: 'ONGOING', incoming: false });
    await offerToPeer();
  } else if (payload.kind === 'decline') {
    patch({ error: 'Call declined.' });
    await endCall(false, 'DECLINED');
  } else if (payload.kind === 'end') {
    await endCall(false, answeredAt ? 'COMPLETED' : 'MISSED');
  }
}

async function offerToPeer() {
  try {
    const conn = ensurePeerConnection(current!.roomId);
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    broadcast('webrtc', { kind: 'offer', from: me(), to: current!.peer.userId, sdp: offer });
  } catch (err) {
    console.error('Failed to start call negotiation:', err);
    patch({ error: 'Could not start the call.' });
    await endCall(false, 'FAILED');
  }
}

async function openMedia(kind: CallKind) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    patch({ error: 'This device or browser cannot place calls.' });
    return false;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'VIDEO' ? { facingMode: 'user' } : false,
    });
    emitMedia();
    return true;
  } catch (err) {
    console.error('Microphone/camera permission failed:', err);
    patch({ error: 'Allow microphone (and camera) access to make this call.' });
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Public API — used by the chat header and the overlay
 * ------------------------------------------------------------------ */

/** Ring another member of a chat room. */
export async function startCall(roomId: number, peer: CallPeer, kind: CallKind) {
  if (current) return;
  const state = getDBState();
  const user = state.currentUser;
  if (!user) return;

  const room = state.chatRooms.find((r) => r.id === roomId);
  if (!room) return;

  current = {
    id: null,
    roomId,
    kind,
    peer,
    isCaller: true,
    phase: 'RINGING',
    incoming: false,
    startedAt: Date.now(),
    muted: false,
    cameraOff: false,
  };
  emit();

  const opened = await openMedia(kind);
  if (!opened) {
    patch({ error: current?.error || 'Could not access your microphone or camera.' });
  }

  await joinRoomChannel(roomId);

  // Persist the attempt first so it lands in both parties' history.
  const res = (await dbOperations.startCall(roomId, kind)) as { callId?: number } | undefined;
  if (res?.callId) patch({ id: res.callId });

  // Ring the callee on their personal inbox channel (the room channel is used
  // once both parties are on the call, for the WebRTC handshake).
  await ringPeer(peer.userId, { roomId, callId: res?.callId ?? null, callKind: kind });

  // If nobody picks up within 45s, close it out as a missed call.
  ringTimeout = setTimeout(() => {
    void endCall(false, 'MISSED');
  }, 45000);
}

/** Show an incoming call and wait for the user to answer or decline. */
export function presentIncomingCall(input: {
  roomId: number;
  kind: CallKind;
  peer: CallPeer;
  callId: number | null;
}) {
  if (current) {
    // Already busy — politely tell the caller we are unavailable.
    const client = supabase();
    if (client) {
      const ch = client.channel(roomChannelName(input.roomId), { config: { broadcast: { self: false } } });
      void ch.subscribe(() => {
        void ch.send({ type: 'broadcast', event: 'call', payload: { kind: 'decline', from: me(), to: input.peer.userId, busy: true } });
        setTimeout(() => void ch.unsubscribe(), 500);
      });
    }
    return;
  }
  current = {
    id: input.callId,
    roomId: input.roomId,
    kind: input.kind,
    peer: input.peer,
    isCaller: false,
    phase: 'RINGING',
    incoming: true,
    startedAt: Date.now(),
    muted: false,
    cameraOff: false,
  };
  emit();
}

/** Callee accepted — join the room channel and let the caller send the offer. */
export async function acceptCall() {
  if (!current || !current.incoming) return;
  const opened = await openMedia(current.kind);
  if (!opened) {
    await endCall(false, 'FAILED');
    return;
  }
  await joinRoomChannel(current.roomId);
  patch({ incoming: false, phase: 'ONGOING' });
  broadcast('call', { kind: 'accept', from: me(), to: current.peer.userId });
  answeredAt = Date.now();
  tickElapsed();
}

/** Callee rejected the ring. */
export async function declineCall() {
  if (!current) return;
  const peerId = current.peer.userId;
  const roomId = current.roomId;
  await joinRoomChannel(roomId);
  broadcast('call', { kind: 'decline', from: me(), to: peerId });
  await endCall(false, 'DECLINED');
}

export function toggleMute() {
  if (!current) return;
  const next = !current.muted;
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
  patch({ muted: next });
}

export function toggleCamera() {
  if (!current || current.kind !== 'VIDEO') return;
  const next = !current.cameraOff;
  localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
  patch({ cameraOff: next });
}

export function callSeconds(): number {
  if (!current || current.phase !== 'ONGOING' || answeredAt == null) return 0;
  return Math.max(0, Math.floor((Date.now() - answeredAt) / 1000));
}

/** Hang up (either party) and write the final outcome to history. */
export async function endCall(notifyPeer = true, status?: 'COMPLETED' | 'MISSED' | 'DECLINED' | 'FAILED') {
  const snapshot = current;
  if (!snapshot) return;

  if (notifyPeer) {
    broadcast('call', { kind: 'end', from: me(), to: snapshot.peer.userId });
  }

  const duration = answeredAt ? Math.floor((Date.now() - answeredAt) / 1000) : 0;
  const finalStatus = status ?? (answeredAt ? 'COMPLETED' : 'MISSED');

  teardownMedia();
  patch({ phase: 'ENDED' });

  if (snapshot.id) {
    try {
      await dbOperations.finishCall(snapshot.id, finalStatus, duration);
    } catch (err) {
      console.error('Failed to record call outcome:', err);
    }
  }

  // Leave the overlay up briefly so the "call ended" state is readable.
  setTimeout(() => {
    if (current && current.phase === 'ENDED') closeCall();
  }, 1200);
}

/* ------------------------------------------------------------------ *
 * Global ring receiver — one channel per signed-in user.
 * ------------------------------------------------------------------ */

let inboxUserId: number | null = null;

export function startCallInbox(userId: number) {
  const client = supabase();
  if (!client || inboxUserId === userId) return;
  stopCallInbox();

  inboxUserId = userId;
  const ch = client.channel(`goodsale-call-inbox-${userId}`, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'ring' }, ({ payload }: { payload: any }) => {
    if (!payload || payload.from === userId) return;
    const state = getDBState();
    const caller = state.users.find((u) => u.id === payload.from);
    presentIncomingCall({
      roomId: Number(payload.roomId),
      kind: payload.callKind === 'VIDEO' ? 'VIDEO' : 'AUDIO',
      callId: payload.callId != null ? Number(payload.callId) : null,
      peer: {
        userId: Number(payload.from),
        name: caller?.fullName || 'GoodSale member',
        avatar: (caller as any)?.avatar,
      },
    });
  });
  void ch.subscribe();
  inbox = ch as any;
}

export function stopCallInbox() {
  if (inbox) {
    try {
      void inbox.unsubscribe();
    } catch {
      /* ignore */
    }
    inbox = null;
  }
  inboxUserId = null;
}
