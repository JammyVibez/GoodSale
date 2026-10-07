// components/CallHost.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { SmartAvatar } from './ui/SmartImage';
import {
  subscribeCall,
  subscribeCallMedia,
  getCallMedia,
  startCallInbox,
  stopCallInbox,
  acceptCall,
  declineCall,
  endCall,
  toggleMute,
  toggleCamera,
  type CallState,
} from '../lib/realtime-call';
import { useDBState } from '../lib/store';

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * App-wide call overlay. Mounted once at the app shell so an incoming call can
 * be answered from any screen, and the active call stays visible while the user
 * navigates.
 */
export default function CallHost() {
  const db = useDBState();
  const [call, setCall] = useState<CallState | null>(null);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [tick, setTick] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Ring receiver: one personal channel per signed-in user.
  useEffect(() => {
    const userId = db.currentUser?.id;
    if (userId) startCallInbox(userId);
    else stopCallInbox();
    return () => stopCallInbox();
  }, [db.currentUser?.id]);

  useEffect(() => subscribeCall(setCall), []);

  useEffect(
    () =>
      subscribeCallMedia((nextLocal, nextRemote) => {
        setLocal(nextLocal);
        setRemote(nextRemote);
      }),
    []
  );

  // Repaint once a second so the call timer advances.
  useEffect(() => {
    if (!call || call.phase !== 'ONGOING') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [call?.phase, call?.roomId]);

  // Attach media streams to the <video>/<audio> elements.
  useEffect(() => {
    if (localVideoRef.current && localVideoRef.current.srcObject !== local) {
      localVideoRef.current.srcObject = local;
    }
  }, [local, call?.phase]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remote) {
      remoteVideoRef.current.srcObject = remote;
    }
    if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remote) {
      remoteAudioRef.current.srcObject = remote;
    }
  }, [remote, call?.phase]);

  if (!call) return null;

  // Fall back to a live clock when the store copy has not refreshed yet.
  const { local: liveLocal } = getCallMedia();
  void liveLocal;
  void tick;
  const seconds =
    call.phase === 'ONGOING'
      ? Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000))
      : 0;

  const isVideo = call.kind === 'VIDEO';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-ink-900 text-white shadow-2xl">
        {/* Header / peer identity */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <SmartAvatar src={call.peer.avatar} name={call.peer.name} className="h-12 w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold">{call.peer.name}</p>
            <p className="text-sm text-white/60">
              {call.error
                ? call.error
                : call.phase === 'RINGING'
                  ? call.incoming
                    ? `Incoming ${isVideo ? 'video' : 'voice'} call`
                    : 'Ringing…'
                  : call.phase === 'ENDED'
                    ? 'Call ended'
                    : `${formatClock(seconds)} · ${isVideo ? 'Video call' : 'Voice call'}`}
            </p>
          </div>
          <span className="rounded-full bg-jade-500/20 px-3 py-1 text-xs font-medium text-jade-300">
            {isVideo ? 'Encrypted video' : 'Encrypted voice'}
          </span>
        </div>

        {/* Stage */}
        {call.phase === 'ONGOING' && isVideo ? (
          <div className="relative bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-72 w-full object-cover"
            />
            {!remote && (
              <div className="absolute inset-0 grid place-items-center text-sm text-white/50">
                Connecting secure media…
              </div>
            )}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-3 right-3 h-28 w-20 rounded-xl border border-white/20 object-cover shadow-lg"
            />
            {call.cameraOff && (
              <div className="absolute inset-0 grid place-items-center bg-ink-950/90 text-sm text-white/70">
                Your camera is off
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-10">
            <div
              className={`grid h-24 w-24 place-items-center rounded-full bg-jade-500/15 ${
                call.phase === 'RINGING' && !call.incoming ? 'animate-pulse' : ''
              }`}
            >
              <SmartAvatar src={call.peer.avatar} name={call.peer.name} className="h-20 w-20" />
            </div>
            <p className="text-sm text-white/60">
              {call.phase === 'RINGING'
                ? call.incoming
                  ? 'Tap answer to join'
                  : 'Waiting for them to answer…'
                : call.phase === 'ENDED'
                  ? 'The call has ended'
                  : formatClock(seconds)}
            </p>
            {/* Audio-only calls still need the remote track mounted. */}
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 border-t border-white/10 px-5 py-4">
          {call.incoming ? (
            <>
              <button
                onClick={() => void acceptCall()}
                className="flex items-center gap-2 rounded-full bg-jade-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-jade-600 cursor-pointer"
              >
                <Phone className="h-4 w-4" /> Answer
              </button>
              <button
                onClick={() => void declineCall()}
                className="flex items-center gap-2 rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20 cursor-pointer"
              >
                <PhoneOff className="h-4 w-4" /> Decline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleMute}
                aria-label={call.muted ? 'Unmute' : 'Mute'}
                className={`grid h-12 w-12 place-items-center rounded-full transition cursor-pointer ${
                  call.muted ? 'bg-white text-ink-900' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              {isVideo && (
                <button
                  onClick={toggleCamera}
                  aria-label={call.cameraOff ? 'Turn camera on' : 'Turn camera off'}
                  className={`grid h-12 w-12 place-items-center rounded-full transition cursor-pointer ${
                    call.cameraOff ? 'bg-white text-ink-900' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  {call.cameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>
              )}

              <button
                onClick={() => void endCall()}
                aria-label="End call"
                className="grid h-12 w-12 place-items-center rounded-full bg-red-500 transition hover:bg-red-600 cursor-pointer"
              >
                <PhoneOff className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {local?.getVideoTracks().length ? null : null}
      </div>
    </div>
  );
}
