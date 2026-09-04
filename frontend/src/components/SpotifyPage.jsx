import { useEffect, useState } from "react";
import { Outlet, useOutletContext, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { disconnectSpotify, getSpotifyStatus, spotifyConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, StatusDot } from "./homeWidgets";
import SpotifyHomeTab from "./spotify/SpotifyHomeTab";
import SpotifySearchTab from "./spotify/SpotifySearchTab";
import SpotifyLibraryTab from "./spotify/SpotifyLibraryTab";
import SpotifyPlaylistsTab from "./spotify/SpotifyPlaylistsTab";
import SpotifyPlaylistDetail from "./spotify/SpotifyPlaylistDetail";
import SpotifyArtistsTab from "./spotify/SpotifyArtistsTab";
import SpotifyAlbumView from "./spotify/SpotifyAlbumView";
import SpotifyArtistView from "./spotify/SpotifyArtistView";

// Sub-routes whose tab component needs the album/artist/playlist overlay
// openers owned by SpotifyPage pull them via outlet context instead of
// props, matching the Outlook/LinkedIn/Classroom sidebar-tree pattern.
export function SpotifyHomeRoute() {
  const { status, openAlbum, openArtist, openPlaylist } = useOutletContext();
  return <SpotifyHomeTab displayName={status.display_name} onOpenAlbum={openAlbum} onOpenArtist={openArtist} onOpenPlaylist={openPlaylist} />;
}

export function SpotifySearchRoute() {
  const { openAlbum, openArtist } = useOutletContext();
  return <SpotifySearchTab onOpenAlbum={openAlbum} onOpenArtist={openArtist} />;
}

export function SpotifyLibraryRoute() {
  const { openAlbum } = useOutletContext();
  return <SpotifyLibraryTab onOpenAlbum={openAlbum} />;
}

export function SpotifyPlaylistsRoute() {
  const { openPlaylist } = useOutletContext();
  return <SpotifyPlaylistsTab onOpenPlaylist={openPlaylist} />;
}

export function SpotifyArtistsRoute() {
  const { openArtist } = useOutletContext();
  return <SpotifyArtistsTab onOpenArtist={openArtist} />;
}

export default function SpotifyPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Detail overlays — clicking an album/artist/playlist anywhere pushes one
  // of these instead of a nested route, so "back" always returns to
  // whichever tab you were on (spec sections 12/17/14 — album/artist/
  // playlist pages).
  const [openAlbumId, setOpenAlbumId] = useState(null);
  const [openArtistId, setOpenArtistId] = useState(null);
  const [openPlaylistId, setOpenPlaylistId] = useState(null);

  const banner = searchParams.get("connected") ? "connected" : searchParams.get("error") ? "error" : null;
  const bannerError = searchParams.get("error");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getSpotifyStatus()
      .then((data) => !cancelled && setStatus(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load Spotify settings. Is the backend running?")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissBanner() {
    const next = new URLSearchParams(searchParams);
    next.delete("connected");
    next.delete("error");
    setSearchParams(next, { replace: true });
  }

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      const data = await disconnectSpotify();
      setStatus((prev) => ({ ...prev, ...data }));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  function openAlbum(id) {
    setOpenArtistId(null);
    setOpenPlaylistId(null);
    setOpenAlbumId(id);
  }
  function openArtist(id) {
    setOpenAlbumId(null);
    setOpenPlaylistId(null);
    setOpenArtistId(id);
  }
  function openPlaylist(id) {
    setOpenAlbumId(null);
    setOpenArtistId(null);
    setOpenPlaylistId(id);
  }
  function closeOverlay() {
    setOpenAlbumId(null);
    setOpenArtistId(null);
    setOpenPlaylistId(null);
  }

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center" style={{ padding: `${space[8] * 2.5}px 0`, color: cream(0.4) }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const overlayOpen = openAlbumId || openArtistId || openPlaylistId;

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both" }}>
      {banner && (
        <div
          className="flex items-center justify-between gap-4"
          style={{
            marginTop: space[6],
            padding: `${space[3]}px ${space[4]}px`,
            borderLeft: `1px solid ${banner === "connected" ? "#8fd6a8" : "rgba(224,140,140,0.7)"}`,
            fontSize: 13,
            color: banner === "connected" ? "#8fd6a8" : "rgba(224,140,140,0.95)",
          }}
        >
          <span>{banner === "connected" ? "Spotify connected." : `Couldn't connect Spotify: ${bannerError}`}</span>
          <GhostLink onClick={dismissBanner} muted style={{ fontSize: 13 }}>
            Dismiss
          </GhostLink>
        </div>
      )}

      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{
          gap: space[6],
          marginTop: space[8] * 1.5,
          paddingBottom: space[5] ?? 23,
          borderBottom: `1px solid ${cream(0.16)}`,
        }}
      >
        <div>
          <div className="flex items-center gap-2" style={{ marginBottom: space[1] }}>
            {status?.connected && <StatusDot />}
            <span style={labelStyle}>Spotify</span>
          </div>
          <div
            style={{
              fontFamily: fontHeading,
              fontSize: "clamp(26px,3.2vw,42px)",
              color: text.bright,
              marginTop: space[2],
              wordBreak: "break-word",
            }}
          >
            {status?.connected ? status.display_name || "Connected" : "Not connected"}
          </div>
          {status?.connected && !status.is_premium && (
            <p style={{ fontSize: 12.5, color: cream(0.45), marginTop: space[1] }}>
              Free account — playback control needs Spotify Premium and an already-open Spotify device.
            </p>
          )}
        </div>
        {status?.connected ? (
          <GhostLink onClick={handleDisconnect} disabled={busy} muted>
            Disconnect
          </GhostLink>
        ) : (
          <OutlineButton onClick={() => (window.location.href = spotifyConnectUrl())}>Connect Spotify</OutlineButton>
        )}
      </div>

      {error && <p style={{ fontSize: 12, marginTop: space[3], color: "rgba(224,140,140,0.9)" }}>{error}</p>}

      {status?.connected ? (
        <div style={{ marginTop: space[6] }}>
          {openAlbumId && <SpotifyAlbumView albumId={openAlbumId} onBack={closeOverlay} onOpenArtist={openArtist} />}
          {openArtistId && <SpotifyArtistView artistId={openArtistId} onBack={closeOverlay} onOpenAlbum={openAlbum} />}
          {openPlaylistId && <SpotifyPlaylistDetail playlistId={openPlaylistId} onBack={closeOverlay} />}

          {!overlayOpen && <Outlet context={{ status, openAlbum, openArtist, openPlaylist }} />}
        </div>
      ) : (
        <div style={{ marginTop: space[6], animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
          <GlassPanel glow style={{ padding: `${space[6]}px ${space[7]}px`, maxWidth: 640 }}>
            <p
              style={{
                margin: 0,
                fontSize: 17,
                lineHeight: 1.85,
                color: cream(0.7),
              }}
            >
              Connect your Spotify account to unlock your personalized music experience — search, playlists, your
              library, playback control, and an AI playlist generator, right from here.
            </p>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
