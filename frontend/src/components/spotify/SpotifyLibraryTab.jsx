// Feature: User's saved music (spec section 13).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSpotifySavedAlbums, getSpotifySavedTracks, removeSpotifySavedTracks, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { TabLink, EmptyState, ErrorNote, GlassPanel } from "../homeWidgets";
import { MediaCard, TrackRow, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

export default function SpotifyLibraryTab({ onOpenAlbum }) {
  const [sub, setSub] = useState("tracks");
  const [tracks, setTracks] = useState(null);
  const [albums, setAlbums] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const load = sub === "tracks" ? getSpotifySavedTracks({ limit: 50 }) : getSpotifySavedAlbums({ limit: 50 });
    load
      .then((data) => {
        if (cancelled) return;
        if (sub === "tracks") setTracks(data);
        else setAlbums(data);
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load your library.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sub]);

  async function removeTrack(trackId) {
    try {
      await removeSpotifySavedTracks([trackId]);
      setTracks((prev) => ({ ...prev, items: prev.items.filter((i) => i.track.id !== trackId) }));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove that track."));
    }
  }

  return (
    <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
      <div className="flex items-center" style={{ gap: space[6] }}>
        <TabLink active={sub === "tracks"} onClick={() => setSub("tracks")}>
          Tracks
        </TabLink>
        <TabLink active={sub === "albums"} onClick={() => setSub("albums")}>
          Albums
        </TabLink>
      </div>

      <GlassPanel style={{ padding: `${space[5]}px ${space[5]}px`, marginTop: space[5] }}>
        <ErrorNote>{error}</ErrorNote>
        {loading && (
          <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
            <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
          </div>
        )}

        {!loading && sub === "tracks" && (tracks?.items?.length ? (
          <div className="flex flex-col">
            {tracks.items.map(({ track }) => (
              <TrackRow
                key={track.id}
                image={imageUrl(track.album?.images, 2)}
                title={track.name}
                subtitle={`${artistNames(track.artists)} • ${track.album?.name || ""}`}
                durationMs={track.duration_ms}
                onPlay={() => withPlaybackError(spotifyPlay({ uris: [track.uri] }), setError)}
                trailing={
                  <button
                    type="button"
                    onClick={() => removeTrack(track.id)}
                    className="border-none bg-transparent"
                    style={{ fontSize: 12, color: cream(0.4), cursor: "pointer" }}
                  >
                    Remove
                  </button>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState>No saved tracks yet. Songs you save will appear here.</EmptyState>
        ))}

        {!loading && sub === "albums" && (albums?.items?.length ? (
          <div className="flex flex-wrap" style={{ gap: space[4] }}>
            {albums.items.map(({ album }) => (
              <MediaCard key={album.id} image={imageUrl(album.images)} title={album.name} subtitle={artistNames(album.artists)} onClick={() => onOpenAlbum?.(album.id)} />
            ))}
          </div>
        ) : (
          <EmptyState>No saved albums yet.</EmptyState>
        ))}
      </GlassPanel>
    </div>
  );
}
