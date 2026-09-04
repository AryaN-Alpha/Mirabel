// Feature: Album pages (spec section 12).
import { useEffect, useState } from "react";
import { ChevronLeft, ExternalLink, ListMusic, Loader2, Play } from "lucide-react";
import { addSpotifyQueue, getSpotifyAlbum, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, ErrorNote, GlassPanel } from "../homeWidgets";
import { Thumb, TrackRow, artistNames, imageUrl, Section, withPlaybackError } from "./spotifyShared";

export default function SpotifyAlbumView({ albumId, onBack, onOpenArtist }) {
  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getSpotifyAlbum(albumId)
      .then((data) => !cancelled && setAlbum(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load this album.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [albumId]);

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

      {album && (
        <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
          <GlassPanel elevated glow style={{ padding: `${space[6]}px ${space[6]}px`, marginTop: space[6] }}>
            <div className="flex items-end gap-6 flex-wrap">
              <Thumb src={imageUrl(album.images, 1)} size={180} />
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42) }}>
                  Album
                </div>
                <h1 style={{ fontFamily: fontHeading, fontSize: "clamp(26px,3vw,40px)", color: text.bright, margin: `${space[2]}px 0` }}>
                  {album.name}
                </h1>
                <div style={{ fontSize: 15, color: cream(0.6) }}>
                  {(album.artists || []).map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ", "}
                      <button
                        type="button"
                        onClick={() => onOpenArtist?.(a.id)}
                        className="border-none bg-transparent p-0"
                        style={{ color: cream(0.75), cursor: "pointer", fontSize: 15 }}
                      >
                        {a.name}
                      </button>
                    </span>
                  ))}
                  {" • "}
                  {album.release_date?.slice(0, 4)} • {album.total_tracks} tracks
                </div>
                <div className="flex items-center gap-4" style={{ marginTop: space[4] }}>
                  <OutlineButton onClick={() => withPlaybackError(spotifyPlay({ contextUri: album.uri }), setError)}>
                    <Play size={14} fill="currentColor" style={{ marginRight: 6 }} />
                    Play
                  </OutlineButton>
                  {album.external_urls?.spotify && (
                    <GhostLink muted onClick={() => window.open(album.external_urls.spotify, "_blank")}>
                      <ExternalLink size={13} /> Open in Spotify
                    </GhostLink>
                  )}
                </div>
              </div>
            </div>
          </GlassPanel>

          <Section title="Tracklist" icon={ListMusic}>
            <div className="flex flex-col">
              {(album.tracks?.items || []).map((t, i) => (
                <TrackRow
                  key={t.id}
                  index={i}
                  title={t.name}
                  subtitle={artistNames(t.artists)}
                  durationMs={t.duration_ms}
                  onPlay={() => withPlaybackError(spotifyPlay({ contextUri: album.uri, offset: { uri: t.uri } }), setError)}
                  onAdd={() => withPlaybackError(addSpotifyQueue(t.uri), setError, "Couldn't add that to the queue.")}
                />
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
