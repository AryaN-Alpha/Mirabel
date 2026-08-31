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
export function withPlaybackError(promise, setError, fallback = "Couldn't do that — is Spotify open on a device?") {
  return promise.catch((err) => setError?.(getErrorMessage(err, fallback)));
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
      className="flex items-center gap-3"
      style={{ padding: `${space[2]}px ${space[2]}px`, borderRadius: radius.sm }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(typeof index === "number" || onPlay) && (
        <span
          className="shrink-0 text-right"
          style={{ width: 20, fontSize: 13, color: active ? accent[300] : cream(0.4), fontVariantNumeric: "tabular-nums" }}
        >
          {hovered && onPlay ? (
            <button
              type="button"
              onClick={onPlay}
              className="border-none bg-transparent p-0"
              style={{ color: accent[300], cursor: "pointer" }}
              title="Play"
            >
              <Play size={13} fill="currentColor" />
            </button>
          ) : (
            typeof index === "number" && index + 1
          )}
        </span>
      )}
      {image !== undefined && <Thumb src={image} size={40} />}
      <div className="flex-1 min-w-0">
        <div
          className="truncate"
          style={{ fontSize: 15, color: active ? accent[300] : text.base, fontFamily: fontHeading }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="truncate" style={{ fontSize: 12.5, color: cream(0.5), marginTop: 1 }}>
            {subtitle}
          </div>
        )}
      </div>
      {durationMs !== undefined && (
        <span style={{ fontSize: 12.5, color: cream(0.4), fontVariantNumeric: "tabular-nums" }}>
          {formatDuration(durationMs)}
        </span>
      )}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="border-none bg-transparent p-1 shrink-0"
          style={{ color: hovered ? accent[300] : cream(0.35), cursor: "pointer", opacity: hovered ? 1 : 0.6 }}
          title="Add"
        >
          <Plus size={15} strokeWidth={1.8} />
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
      className="flex flex-col items-start text-left border-none bg-transparent p-0"
      style={{ width: 148, cursor: onClick ? "pointer" : "default", flexShrink: 0 }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          borderRadius: rounded ? "50%" : radius.md,
          overflow: "hidden",
          background: "rgba(255,255,255,0.05)",
          boxShadow: hovered ? "0 10px 24px rgba(0,0,0,0.35)" : "none",
          transition: "box-shadow 0.3s ease",
        }}
      >
        {image ? (
          <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={40} strokeWidth={1.2} color={cream(0.25)} />
          </div>
        )}
      </div>
      <div
        className="truncate w-full"
        style={{ fontFamily: fontHeading, fontSize: 15, color: hovered ? accent[200] : text.base, marginTop: space[2] }}
      >
        {title}
      </div>
      {subtitle && (
        <div className="truncate w-full" style={{ fontSize: 12.5, color: cream(0.5) }}>
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
