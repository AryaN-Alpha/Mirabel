// Shared primitives for every Spotify tab — one TrackRow/MediaCard used
// across Search/Library/Playlists/Top Tracks/Album instead of a bespoke
// component per screen, so hover/layout stays consistent (spec section 31).
import { useState } from "react";
import { Music, Play, Plus } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, radius, cream } from "../homeTheme";

// Every inline "play"/"add to queue" affordance across the Spotify tabs
// fires a request whose most common real-world failure is entirely
// expected (no active Spotify device, a Free account hitting a
// Premium-only endpoint) — CLAUDE.md's error-handling convention requires
// every user-facing failure say *what* went wrong, so this must never be a
// bare `.catch(() => {})`. Centralized here instead of repeating the same
// three-line catch in every tab, so a future change to the fallback
// message only needs to land once.
// playback_restricted (spotify/services/oauth.py::reason_for_status) is
// Spotify's 403 "Player command failed: Restriction violated" — an expected
// player-state condition (e.g. nothing resumable), not a scope or
// connection problem, so it gets its own message instead of surfacing
// Spotify's raw error text via getErrorMessage's default path. Exported (not
// just used by withPlaybackError below) so every Spotify surface that
// handles playback errors — including ones with their own busy/error
// plumbing, like SpotifyNowPlayingBar and SpotifyQueueTab's multi-step
// play-then-requeue flow — shares one copy of the message instead of each
// re-declaring the same string.
export function playbackErrorMessage(err, fallback = "Couldn't do that — is Spotify open on a device?") {
  if (err?.response?.data?.reason === "playback_restricted") {
    return "Playback is restricted on this device. Select a track or open Spotify on your device.";
  }
  return getErrorMessage(err, fallback);
}

export function withPlaybackError(promise, setError, fallback) {
  return promise.catch((err) => setError?.(playbackErrorMessage(err, fallback)));
}

export function formatDuration(ms) {
  if (!ms && ms !== 0) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function artistNames(artists) {
  return (artists || []).map((a) => a.name).join(", ");
}

export function imageUrl(images, fallbackSize = 1) {
  if (!images || images.length === 0) return null;
  return images[Math.min(fallbackSize, images.length - 1)]?.url || images[0]?.url;
}

export function Thumb({ src, size = 44, rounded = false }) {
  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: rounded ? "50%" : radius.sm,
        overflow: "hidden",
        background: "rgba(255,255,255,0.05)",
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <Music size={size * 0.4} strokeWidth={1.4} color={cream(0.3)} />
      )}
    </div>
  );
}

// One row: artwork, title, secondary line, optional trailing meta/actions —
// used for tracks in search results, library, playlists, top tracks, queue.
export function TrackRow({ index, title, subtitle, image, durationMs, onPlay, onAdd, trailing, active }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-3.5 px-3 py-2.5 rounded-xl transition-colors duration-150"
      style={{
        background: active
          ? "rgba(255,151,131,0.08)"
          : hovered
          ? "rgba(255,255,255,0.055)"
          : "transparent",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(typeof index === "number" || onPlay) && (
        <span
          className="shrink-0 text-right"
          style={{
            width: 22,
            fontSize: 13,
            color: active ? accent[300] : text.secondary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {hovered && onPlay ? (
            <button
              type="button"
              onClick={onPlay}
              className="border-none bg-transparent p-0 inline-flex items-center justify-center text-white"
              style={{ color: accent[300], cursor: "pointer" }}
              title="Play"
            >
              <Play size={14} fill="currentColor" />
            </button>
          ) : (
            typeof index === "number" && index + 1
          )}
        </span>
      )}
      {image !== undefined && (
        <div className="relative rounded-lg overflow-hidden shrink-0 border border-white/10">
          <Thumb src={image} size={42} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div
          className="truncate text-[15px] font-medium"
          style={{ color: active ? accent[300] : text.bright, fontFamily: fontHeading }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-[14px]" style={{ color: text.secondary, marginTop: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      {durationMs !== undefined && (
        <span style={{ fontSize: 13, color: text.secondary, fontVariantNumeric: "tabular-nums" }}>
          {formatDuration(durationMs)}
        </span>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="border-none bg-transparent p-1.5 shrink-0 rounded-md transition-colors"
          style={{
            color: hovered ? accent[300] : text.secondary,
            background: hovered ? "rgba(255,255,255,0.06)" : "transparent",
            cursor: "pointer",
          }}
          title="Add to queue"
        >
          <Plus size={16} strokeWidth={1.8} />
        </button>
      )}
      {trailing}
    </div>
  );
}

// Square artwork card with a title/subtitle underneath — albums, playlists,
// artists (rounded), used in the Home dashboard and grid tabs.
export function MediaCard({ image, title, subtitle, onClick, rounded = false }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex flex-col items-start text-left border-none bg-transparent p-0 transition-transform duration-200"
      style={{
        width: 154,
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
      }}
    >
      <div
        className="w-full aspect-square border border-white/10 overflow-hidden"
        style={{
          borderRadius: rounded ? "50%" : radius.lg,
          background: "rgba(255,255,255,0.04)",
          boxShadow: hovered
            ? "0 14px 30px -10px rgba(0,0,0,0.7), 0 0 20px -8px rgba(255,151,131,0.25)"
            : "0 6px 16px -8px rgba(0,0,0,0.5)",
          transition: "box-shadow 0.25s ease",
        }}
      >
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover transition-transform duration-300" style={{ transform: hovered ? "scale(1.04)" : "scale(1)" }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={40} strokeWidth={1.2} color={cream(0.35)} />
          </div>
        )}
      </div>
      <div
        className="truncate w-full text-[15px] font-medium"
        style={{ fontFamily: fontHeading, color: hovered ? text.bright : text.base, marginTop: space[2] }}
      >
        {title}
      </div>
      {subtitle && (
        <div className="truncate w-full text-[13.5px]" style={{ color: text.secondary, marginTop: 1 }}>
          {subtitle}
        </div>
      )}
    </button>
  );
}

export function HorizontalShelf({ title, children }) {
  return (
    <section style={{ marginTop: space[8] }}>
      <h2 style={{ fontFamily: fontHeading, fontSize: 22, color: text.base, marginBottom: space[4] }}>{title}</h2>
      <div className="flex overflow-x-auto" style={{ gap: space[4], paddingBottom: space[2] }}>
        {children}
      </div>
    </section>
  );
}

export function SectionHeading({ children }) {
  return (
    <h2 style={{ fontFamily: fontHeading, fontSize: 22, color: text.base, marginTop: space[8], marginBottom: space[4] }}>
      {children}
    </h2>
  );
}
