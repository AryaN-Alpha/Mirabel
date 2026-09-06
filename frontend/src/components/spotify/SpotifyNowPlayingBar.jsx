// Persistent "Now Playing" bar (spec section 20/21/23) — polls playback
// state on a reasonable interval (not per-second) and pauses entirely while
// the tab is hidden, per spec section 20's "do not continuously poll
// aggressively" and this repo's own memory-retrieval-cache-style caution
// around avoiding needless per-request work.
import { useEffect, useRef, useState } from "react";
import { Laptop2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Smartphone, Speaker, Volume2 } from "lucide-react";
import {
  getSpotifyDevices,
  getSpotifyPlayerState,
  getSpotifyStatus,
  spotifyNext,
  spotifyPause,
  spotifyPlay,
  spotifyPrevious,
  spotifySeek,
  spotifySetRepeat,
  spotifySetShuffle,
  spotifySetVolume,
  transferSpotifyPlayback,
} from "../../services/api";
import { setActiveSpotifyDeviceId } from "../../services/spotifyDeviceStore";
import { fontHeading, text, accent, space, radius, cream } from "../homeTheme";
import { formatDuration, playbackErrorMessage, Thumb } from "./spotifyShared";

const POLL_MS = 10000;
// Spotify's 429 doesn't always carry a usable Retry-After — fall back to a
// conservative pause so a rate-limited poll loop doesn't just keep hammering
// the same endpoint every POLL_MS and re-triggering the same 429.
const RATE_LIMIT_BACKOFF_MS = 30000;
const ERROR_DISPLAY_MS = 5000;
// Actions (play/pause/seek/skip/...) debounce into one refresh instead of
// firing a GET per click — rapid repeats (spamming skip, dragging the seek
// bar) previously meant one extra /me/player call per click on top of the
// write call itself.
const ACTION_REFRESH_DEBOUNCE_MS = 700;
// Spotify's actual repeat cycle is three states, not a toggle — off (no
// repeat), context (repeat the album/playlist/queue), track (repeat-one).
const NEXT_REPEAT_STATE = { off: "context", context: "track", track: "off" };

function DeviceIcon({ type, size = 14 }) {
  if (type === "Smartphone") return <Smartphone size={size} strokeWidth={1.8} />;
  if (type === "Speaker") return <Speaker size={size} strokeWidth={1.8} />;
  return <Laptop2 size={size} strokeWidth={1.8} />;
}

// Self-contained: checks Spotify connection status itself so it can be
// mounted once in HomeLayout (spec section 20 — "persistent Now Playing
// component") and stay visible while navigating between Outlook/Kanban/CV/
// etc., not just within the Spotify page itself. Renders nothing until it
// knows a Spotify account is actually connected.
export default function SpotifyNowPlayingBar() {
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [devices, setDevices] = useState([]);
  const [showDevices, setShowDevices] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localVolume, setLocalVolume] = useState(50);
  const pollRef = useRef(null);
  const errorTimeoutRef = useRef(null);
  const refreshTimeoutRef = useRef(null);
  const syncedVolumeDeviceRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(errorTimeoutRef.current);
      clearTimeout(refreshTimeoutRef.current);
    },
    []
  );

  // Re-sync the slider from the server only when the *device* changes, not
  // on every ~6s poll tick — otherwise a poll landing mid-drag would yank
  // the slider back to the last-known server value while the user is still
  // moving it. defaultValue (the previous approach) never re-synced at all,
  // which meant switching devices silently kept showing the old device's
  // volume — a stale-state bug of its own.
  useEffect(() => {
    const deviceId = state?.device?.id;
    const serverVolume = state?.device?.volume_percent;
    if (deviceId && deviceId !== syncedVolumeDeviceRef.current && serverVolume != null) {
      setLocalVolume(serverVolume);
      syncedVolumeDeviceRef.current = deviceId;
    }
  }, [state?.device?.id, state?.device?.volume_percent]);

  function flashMessage(message) {
    setError(message);
    clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => setError(""), ERROR_DISPLAY_MS);
  }

  function flashError(err, fallback) {
    flashMessage(playbackErrorMessage(err, fallback));
  }

  useEffect(() => {
    let cancelled = false;
    getSpotifyStatus()
      .then((data) => !cancelled && setConnected(!!data.connected))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connected) return undefined;

    let cancelled = false;

    function scheduleNext(delayMs) {
      clearTimeout(pollRef.current);
      pollRef.current = setTimeout(poll, delayMs);
    }

    // Self-rescheduling instead of setInterval so a 429 can push the next
    // attempt out (Retry-After, or RATE_LIMIT_BACKOFF_MS as a fallback)
    // instead of the loop just retrying — and getting rate-limited again —
    // every POLL_MS regardless.
    function poll() {
      getSpotifyPlayerState()
        .then((data) => {
          if (cancelled) return;
          setState(data);
          setActiveSpotifyDeviceId(data?.device?.id);
          scheduleNext(POLL_MS);
        })
        .catch((err) => {
          if (cancelled) return;
          const retryAfterSec = err?.response?.data?.retry_after;
          const delayMs =
            err?.response?.status === 429
              ? (Number(retryAfterSec) > 0 ? Number(retryAfterSec) * 1000 : RATE_LIMIT_BACKOFF_MS)
              : POLL_MS;
          scheduleNext(delayMs);
        });
    }

    function handleVisibility() {
      if (document.hidden) {
        clearTimeout(pollRef.current);
      } else {
        poll();
      }
    }

    poll();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      cancelled = true;
      clearTimeout(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connected]);

  async function refresh() {
    try {
      const data = await getSpotifyPlayerState();
      setState(data);
      setActiveSpotifyDeviceId(data?.device?.id);
    } catch {
      // best-effort — the next poll tick will pick it back up
    }
  }

  // Coalesces refreshes from bursts of actions (spamming skip, dragging
  // seek) into a single call instead of one GET per click.
  function scheduleRefresh() {
    clearTimeout(refreshTimeoutRef.current);
    refreshTimeoutRef.current = setTimeout(refresh, ACTION_REFRESH_DEBOUNCE_MS);
  }

  async function withBusy(fn) {
    setBusy(true);
    try {
      await fn();
      scheduleRefresh();
    } catch (err) {
      // Most common real cause: no active device, or a Free account
      // hitting a Premium-only endpoint — both need a message, not silence
      // (CLAUDE.md's error-handling convention; spec section 21).
      flashError(err, "Spotify playback isn't available. Open Spotify on a device and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function loadDevices() {
    try {
      const data = await getSpotifyDevices();
      setDevices(data.devices || []);
    } catch {
      setDevices([]);
    }
  }

  if (!connected) return null;

  const item = state?.item;
  const isPlaying = state?.is_playing;
  const deviceId = state?.device?.id;

  return (
    <div className="relative shrink-0 px-4 pt-2 pb-4">
      {error && (
        <div
          className="absolute left-1/2"
          style={{
            bottom: "100%",
            transform: "translateX(-50%)",
            marginBottom: space[2],
            padding: `${space[1]}px ${space[3]}px`,
            borderRadius: radius.md,
            background: "rgba(10,10,10,0.95)",
            border: "1px solid rgba(224,140,140,0.4)",
            color: "rgba(224,140,140,0.95)",
            fontSize: 12.5,
            whiteSpace: "nowrap",
            boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
            zIndex: 30,
          }}
        >
          {error}
        </div>
      )}
      <div
        className="flex items-center justify-between gap-2 sm:gap-4 rounded-[22px] transition-all duration-300"
        style={{
          border: `1px solid rgba(246,248,255,0.10)`,
          borderTop: `1px solid rgba(236,48,19,0.30)`,
          background: "linear-gradient(175deg, rgba(14,13,18,0.85) 0%, rgba(8,7,12,0.92) 100%)",
          backdropFilter: "blur(32px) saturate(120%)",
          WebkitBackdropFilter: "blur(32px) saturate(120%)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.65), 0 0 35px rgba(236,48,19,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
          padding: `${space[2]}px ${space[3]}px`,
        }}
      >
      <div className="hidden sm:flex items-center gap-3 min-w-0 shrink-0" style={{ width: 260 }}>
        {item ? (
          <>
            <div className="rounded-md overflow-hidden shrink-0" style={{ border: "1px solid rgba(246,248,255,0.12)" }}>
              <Thumb src={item.album?.images?.[2]?.url || item.album?.images?.[0]?.url} size={44} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium" style={{ fontFamily: fontHeading, fontSize: 14, color: "rgba(248,250,255,0.95)" }}>
                {item.name}
              </div>
              <div className="truncate" style={{ fontSize: 12, color: "rgba(246,248,255,0.52)" }}>
                {(item.artists || []).map((a) => a.name).join(", ")}
              </div>
            </div>
          </>
        ) : (
          <span style={{ fontSize: 13, color: "rgba(246,248,255,0.4)" }}>Nothing playing</span>
        )}
      </div>

      {item && (
        <div className="flex sm:hidden items-center gap-2 min-w-0 shrink">
          <div className="rounded-md overflow-hidden shrink-0" style={{ border: "1px solid rgba(246,248,255,0.12)" }}>
            <Thumb src={item.album?.images?.[2]?.url || item.album?.images?.[0]?.url} size={36} />
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium" style={{ fontFamily: fontHeading, fontSize: 13, color: "rgba(248,250,255,0.95)" }}>
              {item.name}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center min-w-0" style={{ flex: 1, maxWidth: 480 }}>
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => withBusy(() => spotifySetShuffle(!state?.shuffle_state, deviceId))}
            className="hidden sm:inline-flex transition-colors duration-200 hover:text-white"
            style={{ background: "none", border: "none", cursor: "pointer", color: state?.shuffle_state ? "#ec3013" : "rgba(246,248,255,0.45)" }}
            title="Shuffle"
          >
            <Shuffle size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => withBusy(() => spotifyPrevious(deviceId))}
            className="transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(246,248,255,0.85)" }}
            title="Previous"
          >
            <SkipBack size={17} strokeWidth={1.8} fill="currentColor" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!isPlaying && !item) {
                flashMessage("Select a track from Search or Library to start playing.");
                return;
              }
              withBusy(async () => {
                if (isPlaying) {
                  await spotifyPause(deviceId);
                  setState((s) => (s ? { ...s, is_playing: false } : s));
                } else {
                  await spotifyPlay({ deviceId });
                  setState((s) => (s ? { ...s, is_playing: true } : s));
                }
              });
            }}
            className="flex items-center justify-center transition-all duration-200 hover:scale-108 active:scale-95 cursor-pointer"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(236,48,19,0.92), rgba(180,25,8,0.88))",
              border: "1px solid rgba(255,130,100,0.50)",
              color: "#ffffff",
              boxShadow: "0 0 18px rgba(236,48,19,0.38), 0 4px 12px rgba(0,0,0,0.45)",
            }}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => withBusy(() => spotifyNext(deviceId))}
            className="transition-all duration-200 hover:scale-110 active:scale-95"
            style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(246,248,255,0.85)" }}
            title="Next"
          >
            <SkipForward size={17} strokeWidth={1.8} fill="currentColor" />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => withBusy(() => spotifySetRepeat(NEXT_REPEAT_STATE[state?.repeat_state] || "context", deviceId))}
            className="hidden sm:inline-flex transition-colors duration-200 hover:text-white"
            style={{ background: "none", border: "none", cursor: "pointer", color: state?.repeat_state && state.repeat_state !== "off" ? "#ec3013" : "rgba(246,248,255,0.45)" }}
            title={`Repeat: ${state?.repeat_state || "off"}`}
          >
            {state?.repeat_state === "track" ? (
              <Repeat1 size={15} strokeWidth={1.8} />
            ) : (
              <Repeat size={15} strokeWidth={1.8} />
            )}
          </button>
        </div>
        {item && (
          <div className="flex items-center gap-2 w-full" style={{ marginTop: space[1] }}>
            <span style={{ fontSize: 10.5, color: "rgba(246,248,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
              {formatDuration(state?.progress_ms)}
            </span>
            <div
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={item.duration_ms}
              aria-valuenow={state?.progress_ms || 0}
              tabIndex={0}
              onClick={(e) => {
                if (!item.duration_ms) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
                withBusy(() => spotifySeek(Math.round(ratio * item.duration_ms), deviceId));
              }}
              onKeyDown={(e) => {
                if (!item.duration_ms) return;
                const step = 5000;
                if (e.key === "ArrowRight") withBusy(() => spotifySeek(Math.min(item.duration_ms, (state?.progress_ms || 0) + step), deviceId));
                if (e.key === "ArrowLeft") withBusy(() => spotifySeek(Math.max(0, (state?.progress_ms || 0) - step), deviceId));
              }}
              className="flex-1 rounded-full overflow-hidden"
              style={{ height: 4, background: "rgba(246,248,255,0.10)", position: "relative", cursor: "pointer" }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${item.duration_ms ? Math.min(100, ((state?.progress_ms || 0) / item.duration_ms) * 100) : 0}%`,
                  background: "linear-gradient(90deg, #ec3013, #ff9783)",
                  boxShadow: "0 0 8px rgba(236,48,19,0.5)",
                  borderRadius: 2,
                  pointerEvents: "none",
                }}
              />
            </div>
            <span style={{ fontSize: 10.5, color: "rgba(246,248,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
              {formatDuration(item.duration_ms)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 relative shrink-0" style={{ justifyContent: "flex-end" }}>
        <Volume2 size={15} strokeWidth={1.8} color="rgba(246,248,255,0.55)" className="hidden sm:block" />
        <input
          type="range"
          min={0}
          max={100}
          value={localVolume}
          aria-label="Volume"
          onChange={(e) => setLocalVolume(Number(e.target.value))}
          onMouseUp={(e) => withBusy(() => spotifySetVolume(Number(e.target.value), deviceId))}
          onTouchEnd={(e) => withBusy(() => spotifySetVolume(Number(e.target.value), deviceId))}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
              withBusy(() => spotifySetVolume(Number(e.target.value), deviceId));
            }
          }}
          className="hidden sm:block"
          style={{ width: 80, accentColor: "#ec3013" }}
        />
        <button
          type="button"
          onClick={() => {
            setShowDevices((v) => !v);
            if (!showDevices) loadDevices();
          }}
          className="transition-colors duration-200 hover:text-white"
          style={{ background: "none", border: "none", cursor: "pointer", color: state?.device ? "#ff9783" : "rgba(246,248,255,0.55)" }}
          title="Devices"
        >
          <DeviceIcon type={state?.device?.type} />
        </button>

        {showDevices && (
          <div
            className="absolute flex flex-col"
            style={{
              bottom: "calc(100% + 10px)",
              right: 0,
              minWidth: 230,
              padding: "14px 16px",
              border: `1px solid rgba(246,248,255,0.12)`,
              borderRadius: 18,
              background: "rgba(12,11,16,0.96)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.7), 0 0 25px rgba(236,48,19,0.08)",
              gap: space[1],
              zIndex: 30,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(246,248,255,0.45)", marginBottom: space[1] }}>
              Devices
            </div>
            {devices.length === 0 && <div style={{ fontSize: 13, color: "rgba(246,248,255,0.5)" }}>No devices found. Open Spotify somewhere.</div>}
            {devices.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  withBusy(() => transferSpotifyPlayback(d.id, true));
                  setShowDevices(false);
                }}
                className="flex items-center gap-2.5 border-none bg-transparent text-left rounded-lg transition-colors duration-150 hover:bg-white/5"
                style={{ padding: "7px 8px", cursor: "pointer", color: d.is_active ? "#ff9783" : "rgba(246,248,255,0.88)", fontSize: 13.5 }}
              >
                <DeviceIcon type={d.type} />
                <span className="truncate">{d.name}</span>
                {d.is_active && (
                  <span className="flex items-center gap-1 text-[11px] text-[#ff9783] ml-auto shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ec3013]" />
                    Active
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
