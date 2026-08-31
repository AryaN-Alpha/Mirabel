import { useEffect, useState } from "react";
import { ChevronLeft, ExternalLink, Loader2, Play } from "lucide-react";
import { addSpotifyQueue, followSpotifyArtists, getSpotifyArtist, spotifyPlay, unfollowSpotifyArtists } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, ErrorNote } from "../homeWidgets";
import { MediaCard, Thumb, TrackRow, imageUrl, SectionHeading, withPlaybackError } from "./spotifyShared";

export default function SpotifyArtistView({ artistId, onBack, onOpenAlbum }) {
  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getSpotifyArtist(artistId)
      .then((data) => !cancelled && setArtist(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load this artist.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [artistId]);

  async function toggleFollow() {
    setBusy(true);
    try {
      if (following) {
        await unfollowSpotifyArtists([artistId]);
        setFollowing(false);
      } else {
        await followSpotifyArtists([artistId]);
        setFollowing(true);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update follow status."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <GhostLink onClick={onBack} muted style={{ fontSize: 13 }}>
        <ChevronLeft size={14} /> Back
      </GhostLink>

      {loading && (
        <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
          <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>

      {artist && (
        <>
          <div className="flex items-end gap-6 flex-wrap" style={{ marginTop: space[6] }}>
            <Thumb src={imageUrl(artist.images, 1)} size={180} rounded />
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42) }}>
                Artist
              </div>
              <h1 style={{ fontFamily: fontHeading, fontSize: "clamp(26px,3vw,40px)", color: text.bright, margin: `${space[2]}px 0` }}>
                {artist.name}
              </h1>
              <div style={{ fontSize: 14, color: cream(0.5) }}>
                {(artist.followers?.total || 0).toLocaleString()} followers
                {artist.genres?.length > 0 && ` • ${artist.genres.slice(0, 3).join(", ")}`}
              </div>
              <div className="flex items-center gap-4" style={{ marginTop: space[4] }}>
                <OutlineButton onClick={() => withPlaybackError(spotifyPlay({ contextUri: artist.uri }), setError)}>
                  <Play size={14} fill="currentColor" style={{ marginRight: 6 }} />
                  Play
                </OutlineButton>
                <OutlineButton disabled={busy} onClick={toggleFollow}>
                  {following === null ? "Follow" : following ? "Following" : "Follow"}
                </OutlineButton>
                {artist.external_urls?.spotify && (
                  <GhostLink muted onClick={() => window.open(artist.external_urls.spotify, "_blank")}>
                    <ExternalLink size={13} /> Open in Spotify
                  </GhostLink>
                )}
              </div>
            </div>
          </div>

          <SectionHeading>Popular</SectionHeading>
          <div className="flex flex-col">
            {(artist.top_tracks || []).slice(0, 10).map((t, i) => (
              <TrackRow
                key={t.id}
                index={i}
                image={imageUrl(t.album?.images, 2)}
                title={t.name}
                durationMs={t.duration_ms}
                onPlay={() => withPlaybackError(spotifyPlay({ uris: [t.uri] }), setError)}
                onAdd={() => withPlaybackError(addSpotifyQueue(t.uri), setError, "Couldn't add that to the queue.")}
              />
            ))}
          </div>

          {artist.albums?.length > 0 && (
            <>
              <SectionHeading>Discography</SectionHeading>
              <div className="flex flex-wrap" style={{ gap: space[4] }}>
                {artist.albums.slice(0, 10).map((a) => (
                  <MediaCard
                    key={a.id}
                    image={imageUrl(a.images)}
                    title={a.name}
                    subtitle={a.release_date?.slice(0, 4)}
                    onClick={() => onOpenAlbum?.(a.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
