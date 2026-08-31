import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Home, Library, ListMusic, Loader2, Search, Sparkles, TrendingUp, Users } from "lucide-react";
import { disconnectSpotify, getSpotifyStatus, spotifyConnectUrl } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { fontHeading, text, space, cream } from "./homeTheme";
import { labelStyle, GhostLink, OutlineButton, TabLink } from "./homeWidgets";
import SpotifyHomeTab from "./spotify/SpotifyHomeTab";
import SpotifySearchTab from "./spotify/SpotifySearchTab";
import SpotifyLibraryTab from "./spotify/SpotifyLibraryTab";
import SpotifyPlaylistsTab from "./spotify/SpotifyPlaylistsTab";
import SpotifyPlaylistDetail from "./spotify/SpotifyPlaylistDetail";
import SpotifyArtistsTab from "./spotify/SpotifyArtistsTab";
import SpotifyTopTracksTab from "./spotify/SpotifyTopTracksTab";
import SpotifyQueueTab from "./spotify/SpotifyQueueTab";
import SpotifyStatisticsTab from "./spotify/SpotifyStatisticsTab";
import SpotifyAIPlaylistTab from "./spotify/SpotifyAIPlaylistTab";
import SpotifyAlbumView from "./spotify/SpotifyAlbumView";
import SpotifyArtistView from "./spotify/SpotifyArtistView";

// Music Center navigation (spec section 28) — kept flat rather than the
// spec's full 10-item suggestion (Search/Top Tracks/Top Artists folded into
// Artists+time-range and a single Search tab) since this app's TabLink row
// convention (see OutlookPage/LinkedInPage) works best with a handful of
// tabs, not a sidebar-within-a-sidebar.
const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "search", label: "Search", icon: Search },
  { key: "library", label: "Library", icon: Library },
  { key: "playlists", label: "Playlists", icon: ListMusic },
  { key: "artists", label: "Artists", icon: Users },
  { key: "top-tracks", label: "Top Tracks", icon: TrendingUp },
  { key: "queue", label: "Queue", icon: ListMusic },
  { key: "stats", label: "Statistics", icon: TrendingUp },
  { key: "ai-playlist", label: "AI Playlist", icon: Sparkles },
];

export default function SpotifyPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState("home");
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
          <div style={labelStyle}>Spotify</div>
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
        <>
          {!overlayOpen && (
            <div className="flex items-center" style={{ gap: space[5], marginTop: space[6], flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <TabLink key={t.key} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} icon={t.icon}>
                  {t.label}
                </TabLink>
              ))}
            </div>
          )}

          <div style={{ marginTop: space[6] }}>
            {openAlbumId && <SpotifyAlbumView albumId={openAlbumId} onBack={closeOverlay} onOpenArtist={openArtist} />}
            {openArtistId && <SpotifyArtistView artistId={openArtistId} onBack={closeOverlay} onOpenAlbum={openAlbum} />}
            {openPlaylistId && <SpotifyPlaylistDetail playlistId={openPlaylistId} onBack={closeOverlay} />}

            {!overlayOpen && activeTab === "home" && (
              <SpotifyHomeTab displayName={status.display_name} onOpenAlbum={openAlbum} onOpenArtist={openArtist} onOpenPlaylist={openPlaylist} />
            )}
            {!overlayOpen && activeTab === "search" && <SpotifySearchTab onOpenAlbum={openAlbum} onOpenArtist={openArtist} />}
            {!overlayOpen && activeTab === "library" && <SpotifyLibraryTab onOpenAlbum={openAlbum} />}
            {!overlayOpen && activeTab === "playlists" && <SpotifyPlaylistsTab onOpenPlaylist={openPlaylist} />}
            {!overlayOpen && activeTab === "artists" && <SpotifyArtistsTab onOpenArtist={openArtist} />}
            {!overlayOpen && activeTab === "top-tracks" && <SpotifyTopTracksTab />}
            {!overlayOpen && activeTab === "queue" && <SpotifyQueueTab />}
            {!overlayOpen && activeTab === "stats" && <SpotifyStatisticsTab />}
            {!overlayOpen && activeTab === "ai-playlist" && <SpotifyAIPlaylistTab />}
          </div>
        </>
      ) : (
        <p
          style={{
            maxWidth: "58ch",
            marginTop: space[6],
            fontSize: 17,
            lineHeight: 1.85,
            textAlign: "justify",
            color: cream(0.7),
          }}
        >
          Connect your Spotify account to unlock your personalized music experience — search, playlists, your library,
          playback control, and an AI playlist generator, right from here.
        </p>
      )}
    </div>
  );
}
