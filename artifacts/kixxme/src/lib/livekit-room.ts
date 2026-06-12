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
import {
  reportLiveDiag,
  type LiveDiagReport,
  type LiveDiagError,
} from "@workspace/api-client-react";

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
 * 3. SINGLE getUserMedia, with a SEQUENTIAL FALLBACK. iOS Safari drops the
 *    first captured track when the camera and microphone are requested in two
 *    separate getUserMedia calls, which silently kills the published mic (and
 *    sometimes the camera). So we try BOTH at once via
 *    `enableCameraAndMicrophone()` first. Only if that throws do we fall back to
 *    enabling the mic and then the camera independently — each in its own
 *    try/catch — so a dead/blocked camera still lets AUDIO through instead of
 *    killing the whole call. Per-toggle effects only act on *subsequent* changes
 *    (guarded by `mediaReady` + applied refs) so they never trigger a second
 *    simultaneous acquisition.
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
 *    `mediaError` (+ a typed `mediaErrorReason`) but keeps the connection so
 *    remote video still flows.
 *
 * 7. DIAGNOSTICS. Because a self-view only proves LOCAL capture — not that the
 *    track ever reached the SFU — every connection reports a structured
 *    snapshot to `POST /live/diag` at three moments (acquire-settled, ~6s in,
 *    teardown) and on any toggle/switch failure. The report captures connect
 *    outcome (separate from getUserMedia), how media was acquired, which local
 *    tracks published, which remote tracks subscribed, device counts, and the
 *    environment (userAgent / secure-context / iOS standalone PWA / permission
 *    states). It NEVER contains tokens. The server pairs it with the
 *    authoritative `listParticipants` room view so we can tell "didn't join",
 *    "joined but published nothing", and "published but no media" apart.
 */

export type LiveKitStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

/** Why local media couldn't be captured/published — drives an actionable UI message. */
export type MediaErrorReason =
  | "denied"
  | "busy"
  | "notfound"
  | "insecure"
  | "overconstrained"
  | "unknown";

export interface LiveKitCall {
  /** True once credentials are latched and a connection is being held. */
  active: boolean;
  status: LiveKitStatus;
  /** Remote participant's camera track is subscribed and attached. */
  hasRemoteVideo: boolean;
  /** Local camera/mic could not be published (permissions / iframe sandbox). */
  mediaError: boolean;
  /** Typed cause of `mediaError`, for an actionable message (null when none). */
  mediaErrorReason: MediaErrorReason | null;
  /** Remote audio is being received but the browser blocked autoplay. */
  needsAudioGesture: boolean;
  /** A <video> element's play() was rejected (paused/black); needs a gesture. */
  needsVideoGesture: boolean;
  /** Ref callback for the full-screen remote <video>. */
  attachRemoteVideo: (el: HTMLVideoElement | null) => void;
  /** Ref callback for the corner self-preview <video>. */
  attachLocalVideo: (el: HTMLVideoElement | null) => void;
  /** Resume audio after an autoplay block; call from a user gesture. */
  resumeAudio: () => void;
  /** Re-issue play() on both <video> elements after an autoplay block, from a gesture. */
  resumeVideo: () => void;
  /** True when more than one camera exists (mobile front/back switch). */
  canSwitchCamera: boolean;
  /** Flip between the front and back camera. */
  switchCamera: () => void;
  /** Re-request the camera after a denial/failure, from a user gesture. */
  retryCamera: () => void;
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

// --- Diagnostics helpers (module scope, no React state) --------------------

/**
 * livekit.DisconnectReason is a wire-stable protobuf enum; map the numeric
 * codes to readable names locally so the log is legible without importing the
 * enum object (avoids version coupling). Mirror of the server-side maps.
 */
const DISCONNECT_REASON: Record<number, string> = {
  0: "unknown",
  1: "client_initiated",
  2: "duplicate_identity",
  3: "server_shutdown",
  4: "participant_removed",
  5: "room_deleted",
  6: "state_mismatch",
  7: "join_failure",
  8: "migration",
  9: "signal_close",
  10: "room_closed",
  11: "user_unavailable",
  12: "user_rejected",
  13: "sip_trunk_failure",
};

function errInfo(err: unknown, stage: string): LiveDiagError {
  const e = err as { name?: string; message?: string } | undefined;
  return {
    stage,
    name: e?.name,
    message: e?.message ? String(e.message).slice(0, 300) : undefined,
  };
}

/** Map a DOMException name to a typed reason for an actionable UI message. */
function classifyMediaError(err: unknown): MediaErrorReason {
  // An insecure or stripped context (no mediaDevices) is the most common silent
  // killer in odd webviews / non-HTTPS — surface it explicitly first.
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return "insecure";
  }
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return "insecure";
  }
  const name = (err as { name?: string } | undefined)?.name;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "denied";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "busy";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "notfound";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "overconstrained";
    default:
      return "unknown";
  }
}

/** Running as an installed/standalone PWA (iOS `navigator.standalone` or display-mode). */
function isStandalone(): boolean {
  try {
    const iosStandalone = (navigator as unknown as { standalone?: boolean })
      .standalone;
    if (iosStandalone === true) return true;
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

/** enumerateDevices input counts; null when unavailable (insecure/stripped context). */
async function deviceCounts(): Promise<{
  video: number;
  audio: number;
} | null> {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      video: devices.filter((d) => d.kind === "videoinput").length,
      audio: devices.filter((d) => d.kind === "audioinput").length,
    };
  } catch {
    return null;
  }
}

/** Permissions API state, wrapped because Safari < 16 throws on camera/microphone. */
async function queryPermission(
  name: "camera" | "microphone",
): Promise<string> {
  try {
    const perms = (
      navigator as unknown as {
        permissions?: {
          query?: (d: { name: PermissionName }) => Promise<{ state: string }>;
        };
      }
    ).permissions;
    if (!perms?.query) return "unknown";
    const res = await perms.query({ name: name as PermissionName });
    return res.state ?? "unknown";
  } catch {
    return "unknown";
  }
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
  const [mediaErrorReason, setMediaErrorReason] =
    useState<MediaErrorReason | null>(null);
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);
  const [needsVideoGesture, setNeedsVideoGesture] = useState(false);
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

  // Accumulating diagnostics for the current connection, plus a mirror of the
  // latch so off-effect handlers (toggles/switch) can post against the right
  // callId. diagRef is reset at the top of each connect.
  const diagRef = useRef<LiveDiagReport>({});
  const mediaRef = useRef<Latched | null>(null);
  mediaRef.current = media;

  // Snapshot the current diagnostics + live environment and fire it at the
  // server, fire-and-forget. Never throws, never blocks the call, never carries
  // a token. `callId` is passed explicitly so a teardown post uses the OLD
  // call's id even when the latch has already advanced to a new call.
  const postDiag = useCallback(
    (reason: string, diagCallId: string | null | undefined) => {
      if (!diagCallId) return;
      const room = roomRef.current;
      const connectionState = room ? String(room.state) : undefined;
      const subscribedVideo = !!remoteVideoTrackRef.current;
      const subscribedAudio = !!remoteAudioTrackRef.current;
      void (async () => {
        try {
          const counts = await deviceCounts();
          const report: LiveDiagReport = {
            ...diagRef.current,
            reason,
            connectionState,
            subscribedVideo,
            subscribedAudio,
            userAgent:
              typeof navigator !== "undefined" ? navigator.userAgent : undefined,
            isSecureContext:
              typeof window !== "undefined" ? window.isSecureContext : undefined,
            standalone: isStandalone(),
            mediaDevicesPresent:
              typeof navigator !== "undefined" && !!navigator.mediaDevices,
            cameraPermission: await queryPermission("camera"),
            micPermission: await queryPermission("microphone"),
          };
          if (counts) {
            report.videoInputsPost = counts.video;
            report.audioInputsPost = counts.audio;
          }
          // Element + published-track health. This is what distinguishes
          // "camera blocked" (no track, widths 0) from "camera published but
          // black" (track live but muted / producing 0×0 frames) — the two
          // top-ranked iOS causes.
          const localEl = localElRef.current;
          const remoteEl = remoteElRef.current;
          if (localEl) {
            report.localVideoWidth = localEl.videoWidth;
            report.localVideoPaused = localEl.paused;
            report.localVideoCurrentTime = localEl.currentTime;
            report.localVideoReadyState = localEl.readyState;
            report.localClientWidth = localEl.clientWidth;
            report.localClientHeight = localEl.clientHeight;
          }
          if (remoteEl) {
            report.remoteVideoWidth = remoteEl.videoWidth;
            report.remoteVideoPaused = remoteEl.paused;
            report.remoteVideoCurrentTime = remoteEl.currentTime;
            report.remoteVideoReadyState = remoteEl.readyState;
            report.remoteClientWidth = remoteEl.clientWidth;
            report.remoteClientHeight = remoteEl.clientHeight;
          }
          const camPub = room?.localParticipant.getTrackPublication(
            Track.Source.Camera,
          );
          if (camPub) {
            report.cameraPubMuted = camPub.isMuted;
            const mst = (camPub.track as LocalVideoTrack | undefined)
              ?.mediaStreamTrack;
            if (mst) {
              report.cameraTrackReadyState = mst.readyState;
              report.cameraTrackMuted = mst.muted;
              try {
                const s = mst.getSettings();
                if (typeof s.width === "number") report.cameraWidth = s.width;
                if (typeof s.height === "number")
                  report.cameraHeight = s.height;
              } catch {
                // getSettings unsupported — skip.
              }
            }
          }
          await reportLiveDiag({ callId: diagCallId, report });
        } catch {
          // Diagnostics must never disrupt the call.
        }
      })();
    },
    [],
  );

  // Record a media failure: set the boolean + typed reason for the UI, and add
  // the error to the diagnostics trail.
  const recordMediaError = useCallback((err: unknown, stage: string) => {
    diagRef.current.gumErrors = [
      ...(diagRef.current.gumErrors ?? []),
      errInfo(err, stage),
    ];
    setMediaError(true);
    setMediaErrorReason(classifyMediaError(err));
  }, []);

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

  // Explicitly (re)start playback on a <video>. LiveKit's track.attach() calls
  // play() once and swallows rejection; on mobile (esp. iOS Safari) that single
  // attempt can be refused while the element isn't laid out/visible yet, leaving
  // it PAUSED (black) even though frames are decoding (videoWidth>0) and audio
  // (a separate <audio>) plays fine. We re-issue play() on loadedmetadata/canplay
  // and, for the remote view, surface a tap-to-play gesture if it still won't run.
  const playVideo = useCallback(
    (el: HTMLVideoElement | null, which: "local" | "remote") => {
      if (!el) return;
      const attempt = () => {
        // iOS only allows un-gestured playback on a video that is muted AND
        // inline. React sets `muted` as a property (not an attribute), which can
        // lag render timing — pin both imperatively right before play() so the
        // element is always in the autoplay-eligible state. Audio is unaffected
        // (it rides a separate <audio>; these <video> els are muted by design).
        el.muted = true;
        el.playsInline = true;
        const p = el.play() as Promise<void> | undefined;
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (which === "remote") setNeedsVideoGesture(false);
          }).catch((err: unknown) => {
            const name = (err as { name?: string } | undefined)?.name;
            if (which === "remote") {
              diagRef.current.remotePlayError = name;
              setNeedsVideoGesture(true);
            } else {
              diagRef.current.localPlayError = name;
            }
          });
        }
      };
      attempt();
      el.addEventListener("loadedmetadata", attempt, { once: true });
      el.addEventListener("canplay", attempt, { once: true });
    },
    [],
  );

  // Every attach site must go through here so none forgets to (re)start playback.
  const attachAndPlay = useCallback(
    (
      track: { attach: (el: HTMLMediaElement) => unknown } | null | undefined,
      el: HTMLVideoElement | null,
      which: "local" | "remote",
    ) => {
      if (!track || !el) return;
      track.attach(el);
      playVideo(el, which);
    },
    [playVideo],
  );

  const attachRemoteVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      remoteElRef.current = el;
      if (el && remoteVideoTrackRef.current)
        attachAndPlay(remoteVideoTrackRef.current, el, "remote");
    },
    [attachAndPlay],
  );

  const attachLocalVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      localElRef.current = el;
      if (el && localTrackRef.current)
        attachAndPlay(localTrackRef.current, el, "local");
    },
    [attachAndPlay],
  );

  // Re-issue play() on both <video> elements from a user gesture (clears the
  // tap-to-play prompt once the remote view is actually running). Audio is
  // independent and keeps working regardless.
  const resumeVideo = useCallback(() => {
    const els: Array<[HTMLVideoElement | null, "local" | "remote"]> = [
      [remoteElRef.current, "remote"],
      [localElRef.current, "local"],
    ];
    for (const [el, which] of els) {
      if (el) playVideo(el, which);
    }
  }, [playVideo]);

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
        attachAndPlay(track, localElRef.current, "local");
      })
      .catch((err) => {
        recordMediaError(err, "switch");
        postDiag("toggle-cam", mediaRef.current?.callId);
      });
  }, [recordMediaError, postDiag, attachAndPlay]);

  // Manual retry after a camera denial/failure. iOS Safari won't re-prompt
  // automatically once camera is denied per-site, but a fresh gesture-driven
  // request succeeds the moment the user re-enables it (Safari aA → Configuración
  // del sitio web → Cámara). Clears the error on success so the UI recovers.
  const retryCamera = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    room.localParticipant
      .setCameraEnabled(true, { facingMode: facingModeRef.current })
      .then((pub) => {
        appliedCamRef.current = true;
        if (pub?.track) attachAndPlay(pub.track, localElRef.current, "local");
        setMediaError(false);
        setMediaErrorReason(null);
        void detectCameras();
        postDiag("acquire", mediaRef.current?.callId);
      })
      .catch((err) => {
        recordMediaError(err, "retry-camera");
        postDiag("acquire", mediaRef.current?.callId);
      });
  }, [detectCameras, recordMediaError, postDiag, attachAndPlay]);

  // --- Connect (only when the latch changes) -------------------------------
  useEffect(() => {
    if (!media) {
      setStatus("idle");
      return;
    }

    const diagCallId = media.callId;
    let cancelled = false;
    let delayedDiagId: ReturnType<typeof setTimeout> | undefined;
    // Fresh diagnostics trail for this connection.
    diagRef.current = {};
    // Plain receive: no adaptiveStream/dynacast (see rule #4) so the remote
    // track is never paused for a "not visible" fullscreen <video>.
    const room = new Room();
    roomRef.current = room;
    setStatus("connecting");
    setHasRemoteVideo(false);
    setMediaError(false);
    setMediaErrorReason(null);
    setMediaReady(false);
    setNeedsAudioGesture(false);
    setNeedsVideoGesture(false);
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
        attachAndPlay(track, remoteElRef.current, "remote");
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
      // Authoritative client-side proof that a track was handed to the SFU
      // (distinct from merely capturing it locally).
      if (pub.kind === Track.Kind.Video) {
        diagRef.current.publishedCamera = true;
        if (pub.track) {
          localTrackRef.current = pub.track;
          attachAndPlay(pub.track, localElRef.current, "local");
        }
      } else if (pub.kind === Track.Kind.Audio) {
        diagRef.current.publishedMic = true;
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
    const onDisconnected = (reason?: number) => {
      diagRef.current.disconnectReason =
        reason == null
          ? undefined
          : (DISCONNECT_REASON[reason] ?? String(reason));
    };

    room
      .on(RoomEvent.TrackSubscribed, onTrackSubscribed)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.ConnectionStateChanged, onState)
      .on(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus)
      .on(RoomEvent.Disconnected, onDisconnected);

    // iOS mutes the local camera when the app is backgrounded mid-call (capture
    // interruption → published-but-black frames). On resume, best-effort restart
    // the camera track so video recovers without tearing down the call.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (!camOnRef.current) return;
      const r = roomRef.current;
      if (!r) return;
      const pub = r.localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as LocalVideoTrack | undefined;
      if (!track) return;
      const mst = track.mediaStreamTrack;
      if (pub?.isMuted || mst?.muted || mst?.readyState === "ended") {
        track
          .restartTrack({ facingMode: facingModeRef.current })
          .then(() => {
            attachAndPlay(track, localElRef.current, "local");
          })
          .catch((err) => {
            recordMediaError(err, "visibility-restart");
            postDiag("delayed", mediaRef.current?.callId);
          });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    void (async () => {
      // Connect outcome is tracked SEPARATELY from getUserMedia: a failure here
      // means the token/URL/SFU is the problem, not the camera.
      try {
        await room.connect(media.url, media.token);
        diagRef.current.connectOk = true;
      } catch (err) {
        diagRef.current.connectOk = false;
        diagRef.current.connectError = errInfo(err, "connect");
        if (!cancelled) setStatus("error");
        postDiag("acquire", diagCallId);
        return;
      }
      if (cancelled) {
        await room.disconnect();
        return;
      }
      setStatus("connected");
      // Post a delayed snapshot once the call has had time to settle — this is
      // the one that reveals "connected but no remote/published media".
      delayedDiagId = setTimeout(() => postDiag("delayed", diagCallId), 6000);

      // Device inventory before acquisition (0 videoinputs ⇒ no camera at all).
      const pre = await deviceCounts();
      if (pre) {
        diagRef.current.videoInputsPre = pre.video;
        diagRef.current.audioInputsPre = pre.audio;
      }

      // Acquire camera + mic in a SINGLE getUserMedia (rule #3), then fall back
      // to mic-first / camera-second so a blocked camera still gives us audio.
      let cameraAcquired = false;
      let micAcquired = false;
      let gumMode = "none";
      try {
        await room.localParticipant.enableCameraAndMicrophone();
        cameraAcquired = true;
        micAcquired = true;
        gumMode = "combined";
      } catch (err) {
        diagRef.current.gumErrors = [
          ...(diagRef.current.gumErrors ?? []),
          errInfo(err, "combined"),
        ];
        // Mic first — audio is the floor of a usable call.
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          micAcquired = true;
        } catch (micErr) {
          diagRef.current.gumErrors = [
            ...(diagRef.current.gumErrors ?? []),
            errInfo(micErr, "mic"),
          ];
        }
        // Then camera, independently.
        try {
          await room.localParticipant.setCameraEnabled(true, {
            facingMode: facingModeRef.current,
          });
          cameraAcquired = true;
        } catch (camErr) {
          diagRef.current.gumErrors = [
            ...(diagRef.current.gumErrors ?? []),
            errInfo(camErr, "camera"),
          ];
        }
        gumMode =
          cameraAcquired && micAcquired
            ? "combined-fallback"
            : micAcquired
              ? "mic-only"
              : cameraAcquired
                ? "camera-only"
                : "failed";
      }
      diagRef.current.gumMode = gumMode;
      diagRef.current.cameraAcquired = cameraAcquired;
      diagRef.current.micAcquired = micAcquired;

      if (cancelled) {
        await room.disconnect();
        return;
      }

      // Surface a media error tied to the self-view (camera). Audio-only still
      // counts as a working call, so we keep the connection regardless.
      if (!cameraAcquired) {
        const camErr =
          diagRef.current.gumErrors?.find((e) => e.stage === "camera") ??
          diagRef.current.gumErrors?.find((e) => e.stage === "combined");
        setMediaError(true);
        setMediaErrorReason(classifyMediaError({ name: camErr?.name }));
      } else {
        setMediaError(false);
        setMediaErrorReason(null);
      }

      // Reconcile with the user's pre-call toggle intent (they may have toggled
      // cam/mic off during the countdown). Only turn ACQUIRED tracks off — never
      // re-enable here, so we don't fire a redundant second getUserMedia.
      try {
        if (cameraAcquired && camOnRef.current === false) {
          await room.localParticipant.setCameraEnabled(false);
        }
        if (micAcquired && micOnRef.current === false) {
          await room.localParticipant.setMicrophoneEnabled(false);
        }
        const camPub = room.localParticipant.getTrackPublication(
          Track.Source.Camera,
        );
        if (camPub?.track) {
          attachAndPlay(camPub.track, localElRef.current, "local");
        }
      } catch (err) {
        diagRef.current.gumErrors = [
          ...(diagRef.current.gumErrors ?? []),
          errInfo(err, "reconcile"),
        ];
      }

      // Device inventory after acquisition (labels populate once permission is
      // granted; a jump from 0→N confirms the grant happened).
      const post = await deviceCounts();
      if (post) {
        diagRef.current.videoInputsPost = post.video;
        diagRef.current.audioInputsPost = post.audio;
      }

      appliedCamRef.current = camOnRef.current;
      appliedMicRef.current = micOnRef.current;
      void detectCameras();
      if (!cancelled) {
        setNeedsAudioGesture(!room.canPlaybackAudio);
        setMediaReady(true);
        postDiag("acquire", diagCallId);
      }
    })();

    return () => {
      cancelled = true;
      if (delayedDiagId) clearTimeout(delayedDiagId);
      document.removeEventListener("visibilitychange", onVisibility);
      // Final snapshot BEFORE we tear refs down (reads roomRef/track refs).
      postDiag("teardown", diagCallId);
      room
        .off(RoomEvent.TrackSubscribed, onTrackSubscribed)
        .off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
        .off(RoomEvent.LocalTrackPublished, onLocalPublished)
        .off(RoomEvent.ConnectionStateChanged, onState)
        .off(RoomEvent.AudioPlaybackStatusChanged, onAudioStatus)
        .off(RoomEvent.Disconnected, onDisconnected);
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
      setNeedsVideoGesture(false);
    };
  }, [media, detectCameras, postDiag, recordMediaError, attachAndPlay]);

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
        if (pub?.track) attachAndPlay(pub.track, localElRef.current, "local");
        setMediaError(false);
        setMediaErrorReason(null);
        if (camOn) void detectCameras();
      })
      .catch((err) => {
        recordMediaError(err, "toggle-cam");
        postDiag("toggle-cam", mediaRef.current?.callId);
      });
  }, [camOn, mediaReady, detectCameras, recordMediaError, postDiag, attachAndPlay]);

  // --- Per-toggle microphone publish --------------------------------------
  useEffect(() => {
    const room = roomRef.current;
    if (!room || !mediaReady) return;
    if (appliedMicRef.current === micOn) return;
    appliedMicRef.current = micOn;
    room.localParticipant.setMicrophoneEnabled(micOn).catch((err) => {
      recordMediaError(err, "toggle-mic");
      postDiag("toggle-mic", mediaRef.current?.callId);
    });
  }, [micOn, mediaReady, recordMediaError, postDiag]);

  return {
    active: !!media,
    status,
    hasRemoteVideo,
    mediaError,
    mediaErrorReason,
    needsAudioGesture,
    needsVideoGesture,
    attachRemoteVideo,
    attachLocalVideo,
    resumeAudio,
    resumeVideo,
    canSwitchCamera,
    switchCamera,
    retryCamera,
  };
}
