import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteTrack,
  type LocalTrackPublication,
  type LocalVideoTrack,
} from "livekit-client";

/**
 * KixxMe Live media-plane hook (LiveKit client).
 *
 * Connects to a call's LiveKit room and exposes everything the custom in-call
 * UI needs to render real video + audio. Hard-won rules baked in here:
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
 * 3. SINGLE getUserMedia. iOS Safari drops the first captured track when the
 *    camera and microphone are requested in two separate getUserMedia calls,
 *    which silently kills the published mic (and sometimes the camera). We
 *    acquire BOTH at once via `enableCameraAndMicrophone()` on connect, then
 *    reconcile with the user's toggle intent. Per-toggle effects only act on
 *    *subsequent* changes (guarded by `mediaReady` + applied refs) so they
 *    never trigger a second simultaneous acquisition.
 *
 * 4. NO adaptiveStream / dynacast. For a 1:1 fullscreen call adaptiveStream can
 *    pause the remote track when it can't measure the <video> as "visible",
 *    which shows up as a connected-but-blank remote view. Plain receive is
 *    more reliable here.
 *
 * 5. Audio autoplay needs a gesture on iOS. Remote audio plays through a hidden
 *    <audio> element, but Safari blocks autoplay until the user interacts. We
 *    surface `needsAudioGesture` (from `room.canPlaybackAudio` +
 *    `AudioPlaybackStatusChanged`) so the UI can show a clear "tap to enable
 *    sound" prompt; `resumeAudio()` calls `room.startAudio()` from that gesture.
 *
 * 6. Graceful degradation: no credentials (LiveKit unconfigured / not Gold /
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
  /** Remote audio is being received but the browser blocked autoplay. */
  needsAudioGesture: boolean;
  /** Ref callback for the full-screen remote <video>. */
  attachRemoteVideo: (el: HTMLVideoElement | null) => void;
  /** Ref callback for the corner self-preview <video>. */
  attachLocalVideo: (el: HTMLVideoElement | null) => void;
  /** Resume audio after an autoplay block; call from a user gesture. */
  resumeAudio: () => void;
  /** True when more than one camera exists (mobile front/back switch). */
  canSwitchCamera: boolean;
  /** Flip between the front and back camera. */
  switchCamera: () => void;
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
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  // Flipped true once the connect flow has acquired local media; gates the
  // per-toggle effects so they never fire a second concurrent getUserMedia.
  const [mediaReady, setMediaReady] = useState(false);

  // Room + element/track refs shared by the connect effect and the ref callbacks.
  const roomRef = useRef<Room | null>(null);
  const localElRef = useRef<HTMLVideoElement | null>(null);
  const remoteElRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const localTrackRef = useRef<Track | null>(null);
  const remoteVideoTrackRef = useRef<RemoteTrack | null>(null);
  const remoteAudioTrackRef = useRef<RemoteTrack | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");

  // Latest toggle intent, read by the connect flow without re-subscribing.
  const camOnRef = useRef(camOn);
  const micOnRef = useRef(micOn);
  camOnRef.current = camOn;
  micOnRef.current = micOn;
  // The last cam/mic state we actually applied, so a toggle effect can skip the
  // initial run (already handled by the connect flow's acquisition).
  const appliedCamRef = useRef<boolean | null>(null);
  const appliedMicRef = useRef<boolean | null>(null);

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
    const room = roomRef.current;
    if (!room) return;
    room
      .startAudio()
      .then(() => setNeedsAudioGesture(false))
      .catch(() => {});
  }, []);

  // Detect whether a second camera exists (front/back on mobile) so the UI can
  // show the flip control only when it would actually do something.
  const detectCameras = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCanSwitchCamera(cams.length > 1);
    } catch {
      setCanSwitchCamera(false);
    }
  }, []);

  // Flip the published camera between front ("user") and back ("environment")
  // by restarting the existing local video track in place — no re-publish, so
  // the remote side sees a seamless source swap.
  const switchCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (!track) return;
    const next = facingModeRef.current === "user" ? "environment" : "user";
    track
      .restartTrack({ facingMode: next })
      .then(() => {
        facingModeRef.current = next;
        if (localElRef.current) track.attach(localElRef.current);
      })
      .catch(() => {});
  }, []);

  // --- Connect (only when the latch changes) -------------------------------
  useEffect(() => {
    if (!media) {
      setStatus("idle");
      return;
    }

    let cancelled = false;
    // Plain receive: no adaptiveStream/dynacast (see rule #4) so the remote
    // track is never paused for a "not visible" fullscreen <video>.
    const room = new Room();
    roomRef.current = room;
    setStatus("connecting");
    setHasRemoteVideo(false);
    setMediaError(false);
    setMediaReady(false);
    setNeedsAudioGesture(false);
    appliedCamRef.current = null;
    appliedMicRef.current = null;

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
        // Surface the autoplay-block prompt the moment audio arrives blocked.
        setNeedsAudioGesture(!room.canPlaybackAudio);
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
    const onAudioStatus = () => {
      if (!cancelled) setNeedsAudioGesture(!room.canPlaybackAudio);
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.ConnectionStateChanged, onState)
      .on(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus);

    void (async () => {
      try {
        await room.connect(media.url, media.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        setStatus("connected");

        // Acquire camera + mic in a SINGLE getUserMedia (rule #3).
        let acquired = true;
        try {
          await room.localParticipant.enableCameraAndMicrophone();
        } catch {
          acquired = false;
          if (!cancelled) setMediaError(true);
        }
        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Reconcile with the user's current intent (they may have toggled cam/
        // mic off during the pre-call countdown). No-ops when already correct,
        // so this never fires a second simultaneous acquisition. Skipped when
        // acquisition failed (e.g. permission denied) so we don't fire a
        // redundant second getUserMedia attempt — a later toggle can retry.
        if (acquired) {
          try {
            await room.localParticipant.setCameraEnabled(camOnRef.current, {
              facingMode: facingModeRef.current,
            });
            await room.localParticipant.setMicrophoneEnabled(micOnRef.current);
            const camPub = room.localParticipant.getTrackPublication(
              Track.Source.Camera,
            );
            if (camPub?.track && localElRef.current) {
              camPub.track.attach(localElRef.current);
            }
          } catch {
            if (!cancelled) setMediaError(true);
          }
        }

        appliedCamRef.current = camOnRef.current;
        appliedMicRef.current = micOnRef.current;
        void detectCameras();
        if (!cancelled) {
          setNeedsAudioGesture(!room.canPlaybackAudio);
          setMediaReady(true);
        }
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
        .off(RoomEvent.ConnectionStateChanged, onState)
        .off(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus);
      remoteVideoTrackRef.current = null;
      remoteAudioTrackRef.current = null;
      localTrackRef.current = null;
      roomRef.current = null;
      void room.disconnect();
      audioEl.remove();
      audioElRef.current = null;
      setStatus("idle");
      setHasRemoteVideo(false);
      setMediaReady(false);
      setNeedsAudioGesture(false);
    };
  }, [media, detectCameras]);

  // --- Per-toggle camera publish (only AFTER the initial acquisition) ------
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !mediaReady) return;
    // The connect flow already applied the initial state; skip that no-op run.
    if (appliedCamRef.current === camOn) return;
    appliedCamRef.current = camOn;
    room.localParticipant
      .setCameraEnabled(camOn, { facingMode: facingModeRef.current })
      .then((pub) => {
        if (pub?.track && localElRef.current) pub.track.attach(localElRef.current);
        setMediaError(false);
        if (camOn) void detectCameras();
      })
      .catch(() => setMediaError(true));
  }, [camOn, mediaReady, detectCameras]);

  // --- Per-toggle microphone publish --------------------------------------
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !mediaReady) return;
    if (appliedMicRef.current === micOn) return;
    appliedMicRef.current = micOn;
    room.localParticipant
      .setMicrophoneEnabled(micOn)
      .catch(() => setMediaError(true));
  }, [micOn, mediaReady]);

  return {
    active: !!media,
    status,
    hasRemoteVideo,
    mediaError,
    needsAudioGesture,
    attachRemoteVideo,
    attachLocalVideo,
    resumeAudio,
    canSwitchCamera,
    switchCamera,
  };
}
