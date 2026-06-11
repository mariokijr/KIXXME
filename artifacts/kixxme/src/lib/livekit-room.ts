import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteTrack,
  type LocalTrackPublication,
} from "livekit-client";

/**
 * KixxMe Live media-plane hook (LiveKit client).
 *
 * Connects to a call's LiveKit room and exposes everything the custom in-call
 * UI needs to render real video. Designed around three rules learned while
 * planning Phase 2:
 *
 * 1. LATCH credentials per call.id. The server mints a FRESH room-scoped token
 *    on every `GET /live/state` poll (~2s) and returns null the moment a plan
 *    lapses. If we connected straight off the live DTO we'd reconnect every
 *    poll and tear down an in-progress call on a transient null. Instead we
 *    latch `{callId, token, url}` once and drive the connection (and all UI
 *    gating via `active`) off the latch — never the raw DTO.
 *
 * 2. The connect effect depends ONLY on the latch and reads cam/mic via refs,
 *    so toggling the camera/mic never reconnects the room.
 *
 * 3. Graceful degradation: no credentials (LiveKit unconfigured / not Gold /
 *    call not active) → `active` is false and the caller shows its placeholder.
 *    A blocked camera (e.g. the Replit preview iframe has no
 *    `allow="camera;microphone"`, or a real permission denial) sets
 *    `mediaError` but keeps the connection so remote video still flows.
 */

export type LiveKitStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface LiveKitCall {
  /** True once credentials are latched and a connection is being held. */
  active: boolean;
  status: LiveKitStatus;
  /** Remote participant's camera track is subscribed and attached. */
  hasRemoteVideo: boolean;
  /** Local camera/mic could not be published (permissions / iframe sandbox). */
  mediaError: boolean;
  /** Ref callback for the full-screen remote <video>. */
  attachRemoteVideo: (el: HTMLVideoElement | null) => void;
  /** Ref callback for the corner self-preview <video>. */
  attachLocalVideo: (el: HTMLVideoElement | null) => void;
  /** Resume audio after an autoplay block; call from a user gesture. */
  resumeAudio: () => void;
}

interface Params {
  /** The active call's id, or null when there is no active call. */
  callId: string | null;
  /** Room-scoped LiveKit token from the DTO (may churn / go null). */
  token: string | null;
  /** wss:// LiveKit URL from the DTO. */
  url: string | null;
  camOn: boolean;
  micOn: boolean;
}

interface Latched {
  callId: string;
  token: string;
  url: string;
}

export function useLiveKitCall({
  callId,
  token,
  url,
  camOn,
  micOn,
}: Params): LiveKitCall {
  const [media, setMedia] = useState<Latched | null>(null);
  const [status, setStatus] = useState<LiveKitStatus>("idle");
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [mediaError, setMediaError] = useState(false);

  // Room + element/track refs shared by the connect effect and the ref callbacks.
  const roomRef = useRef<Room | null>(null);
  const localElRef = useRef<HTMLVideoElement | null>(null);
  const remoteElRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const localTrackRef = useRef<Track | null>(null);
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null);
  const remoteAudioTrackRef = useRef<RemoteTrack | null>(null);

  // --- Latch credentials once per call -------------------------------------
  useEffect(() => {
    if (!callId) {
      setMedia(null);
      return;
    }
    if (token && url) {
      // First time we see creds for this call → latch. Token churn on later
      // polls is ignored (same callId keeps the existing latch).
      setMedia((prev) =>
        prev?.callId === callId ? prev : { callId, token, url },
      );
    } else {
      // No creds: drop a latch that belonged to a *different* call; keep a
      // latch for the SAME call (a transient null from a plan lapse mid-call
      // must not kill an in-progress connection).
      setMedia((prev) => (prev && prev.callId !== callId ? null : prev));
    }
  }, [callId, token, url]);

  const attachRemoteVideo = useCallback((el: HTMLVideoElement | null) => {
    remoteElRef.current = el;
    if (el && remoteVideoTrackRef.current) remoteVideoTrackRef.current.attach(el);
  }, []);

  const attachLocalVideo = useCallback((el: HTMLVideoElement | null) => {
    localElRef.current = el;
    if (el && localTrackRef.current) localTrackRef.current.attach(el);
  }, []);

  const resumeAudio = useCallback(() => {
    roomRef.current?.startAudio().catch(() => {});
  }, []);

  // --- Connect (only when the latch changes) -------------------------------
  useEffect(() => {
    if (!media) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setStatus("connecting");
    setHasRemoteVideo(false);
    setMediaError(false);

    // Hidden element so remote audio plays without affecting layout.
    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    audioEl.setAttribute("playsinline", "");
    audioEl.style.display = "none";
    document.body.appendChild(audioEl);
    audioElRef.current = audioEl;

    const onTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) {
        remoteVideoTrackRef.current = track;
        if (remoteElRef.current) track.attach(remoteElRef.current);
        setHasRemoteVideo(true);
      } else if (track.kind === Track.Kind.Audio) {
        remoteAudioTrackRef.current = track;
        if (audioElRef.current) track.attach(audioElRef.current);
      }
    };
    const onTrackUnsubscribed = (track: RemoteTrack) => {
      track.detach();
      if (track === remoteVideoTrackRef.current) {
        remoteVideoTrackRef.current = null;
        setHasRemoteVideo(false);
      }
      if (track === remoteAudioTrackRef.current) {
        remoteAudioTrackRef.current = null;
      }
    };
    const onLocalPublished = (pub: LocalTrackPublication) => {
      if (pub.kind === Track.Kind.Video && pub.track) {
        localTrackRef.current = pub.track;
        if (localElRef.current) pub.track.attach(localElRef.current);
      }
    };
    const onState = (s: ConnectionState) => {
      if (cancelled) return;
      if (s === ConnectionState.Connected) setStatus("connected");
      else if (s === ConnectionState.Reconnecting) setStatus("reconnecting");
      else if (s === ConnectionState.Connecting) setStatus("connecting");
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.ConnectionStateChanged, onState);

    void (async () => {
      try {
        await room.connect(media.url, media.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        setStatus("connected");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      room
        .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
        .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
        .off(RoomEvent.LocalTrackPublished, onLocalPublished)
        .off(RoomEvent.ConnectionStateChanged, onState);
      remoteVideoTrackRef.current = null;
      remoteAudioTrackRef.current = null;
      localTrackRef.current = null;
      roomRef.current = null;
      void room.disconnect();
      audioEl.remove();
      audioElRef.current = null;
      setStatus("idle");
      setHasRemoteVideo(false);
    };
  }, [media]);

  // --- Publish camera / mic per the toggles (once connected) ---------------
  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    room.localParticipant
      .setCameraEnabled(camOn)
      .then((pub) => {
        if (pub?.track && localElRef.current) pub.track.attach(localElRef.current);
        setMediaError(false);
      })
      .catch(() => setMediaError(true));
  }, [camOn, status]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || status !== "connected") return;
    room.localParticipant
      .setMicrophoneEnabled(micOn)
      .catch(() => setMediaError(true));
  }, [micOn, status]);

  return {
    active: !!media,
    status,
    hasRemoteVideo,
    mediaError,
    attachRemoteVideo,
    attachLocalVideo,
    resumeAudio,
  };
}
