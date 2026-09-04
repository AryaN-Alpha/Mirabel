// Shared primitives for every Spotify tab — one TrackRow/MediaCard used
// across Search/Library/Playlists/Top Tracks/Album instead of a bespoke
// component per screen, so hover/layout stays consistent (spec section 31).
import { useState } from "react";
import { Music, Play, Plus } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, radius, cream, surface, glassBorder, motion } from "../homeTheme";
import { GlassPanel, PanelEyebrow } from "../homeWidgets";

// Sunken glass field — mirrors AIModelPage.jsx's local `fieldStyle` (depth
// layer: canvas → panel → field) so every Spotify text/search input matches
// the rest of the redesigned app instead of the old baseline-underline-only
// look. Exported here (rather than duplicated per tab) since Search, Queue,
// Playlists (create/add-tracks modals), Playlist detail (description edit),
// and the AI Playlist form all need the same recessed field.
export const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}, background ${motion.hover}`,
};

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
        background: cream(0.05),
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
      style={{
        padding: `${space[2]}px ${space[2]}px`,
        borderRadius: radius.sm,
        background: hovered ? "rgba(255,151,131,0.07)" : "transparent",
        transition: "background 0.15s ease",
      }}
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
          background: cream(0.05),
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

// A horizontally-scrolling shelf of MediaCards (Home dashboard's "Continue
// Listening", "Your Top Artists", ...) — wrapped in the same floating
// GlassPanel + PanelEyebrow language as every other redesigned page instead
// of a bare heading, so the Spotify tabs read as an extension of
// AIModelPage.jsx rather than a separate product.
export function HorizontalShelf({ title, icon, children }) {
  return (
    <section style={{ marginTop: space[6] }}>
      <GlassPanel style={{ padding: `${space[5]}px ${space[5]}px` }}>
        <PanelEyebrow icon={icon}>{title}</PanelEyebrow>
        <div className="flex overflow-x-auto" style={{ gap: space[4], paddingBottom: space[2] }}>
          {children}
        </div>
      </GlassPanel>
    </section>
  );
}

// Same GlassPanel + PanelEyebrow treatment as HorizontalShelf, for a
// vertical list/grid section instead of a horizontal-scroll shelf (Search
// results by category, Statistics' ranked lists, an artist's Popular
// tracks/Discography). Replaces the old bare `<h2>` SectionHeading.
export function Section({ title, icon, children, style }) {
  return (
    <section style={{ marginTop: space[6] }}>
      <GlassPanel style={{ padding: `${space[5]}px ${space[5]}px`, ...style }}>
        <PanelEyebrow icon={icon}>{title}</PanelEyebrow>
        {children}
      </GlassPanel>
    </section>
  );
}
