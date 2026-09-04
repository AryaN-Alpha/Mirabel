// Feature: Personalized music dashboard (spec section 29) — the Music Home page.
import { useEffect, useState } from "react";
import { Loader2, History, Users, Music, ListMusic, Library } from "lucide-react";
import { addSpotifyQueue, getSpotifyHomeDashboard, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { ErrorNote, EmptyState, GlassPanel } from "../homeWidgets";
import { HorizontalShelf, Section, MediaCard, TrackRow, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function SpotifyHomeTab({ displayName, onOpenAlbum, onOpenArtist, onOpenPlaylist }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getSpotifyHomeDashboard()
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your dashboard.")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
        <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
      </div>
    );
  }

  if (!data) return <ErrorNote>{error}</ErrorNote>;

  const hasAnything =
    data.playlists?.length || data.top_artists?.length || data.top_tracks?.length || data.recently_played?.length || data.saved_albums?.length;

  return (
    <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
      <ErrorNote>{error}</ErrorNote>
      <h1 style={{ fontFamily: fontHeading, fontSize: "clamp(26px,3vw,38px)", color: text.bright }}>
        {greeting()}{displayName ? `, ${displayName.split(" ")[0]}` : ""}
      </h1>

      {!hasAnything && (
        <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0`, marginTop: space[6] }}>
          <EmptyState dot>Play something on Spotify and your personalized dashboard will fill in here.</EmptyState>
        </GlassPanel>
      )}

      {data.recently_played?.length > 0 && (
        <HorizontalShelf title="Continue Listening" icon={History}>
          {data.recently_played.map((t, i) => (
            <MediaCard
              key={`${t.id}-${i}`}
              image={imageUrl(t.album?.images)}
              title={t.name}
              subtitle={artistNames(t.artists)}
              onClick={() => withPlaybackError(spotifyPlay({ uris: [t.uri] }), setError)}
            />
          ))}
        </HorizontalShelf>
      )}

      {data.top_artists?.length > 0 && (
        <HorizontalShelf title="Your Top Artists" icon={Users}>
          {data.top_artists.map((a) => (
            <MediaCard key={a.id} rounded image={imageUrl(a.images)} title={a.name} subtitle="Artist" onClick={() => onOpenArtist(a.id)} />
          ))}
        </HorizontalShelf>
      )}

      {data.top_tracks?.length > 0 && (
        <Section title="Your Top Tracks" icon={Music}>
          <div className="flex flex-col">
            {data.top_tracks.slice(0, 6).map((t, i) => (
              <TrackRow
                key={t.id}
                index={i}
                image={imageUrl(t.album?.images, 2)}
                title={t.name}
                subtitle={artistNames(t.artists)}
                durationMs={t.duration_ms}
                onPlay={() => withPlaybackError(spotifyPlay({ uris: [t.uri] }), setError)}
                onAdd={() => withPlaybackError(addSpotifyQueue(t.uri), setError, "Couldn't add that to the queue.")}
              />
            ))}
          </div>
        </Section>
      )}

      {data.playlists?.length > 0 && (
        <HorizontalShelf title="Your Playlists" icon={ListMusic}>
          {data.playlists.map((p) => (
            <MediaCard key={p.id} image={imageUrl(p.images)} title={p.name} subtitle={`${p.tracks?.total ?? 0} tracks`} onClick={() => onOpenPlaylist(p.id)} />
          ))}
        </HorizontalShelf>
      )}

      {data.saved_albums?.length > 0 && (
        <HorizontalShelf title="From Your Library" icon={Library}>
          {data.saved_albums.map((a) => (
            <MediaCard key={a.id} image={imageUrl(a.images)} title={a.name} subtitle={artistNames(a.artists)} onClick={() => onOpenAlbum(a.id)} />
          ))}
        </HorizontalShelf>
      )}
    </div>
  );
}
