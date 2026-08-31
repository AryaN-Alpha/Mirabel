// Feature: Spotify search (spec section 11) — debounced, cached per-query
// within the session, loading/empty/error states.
import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { addSpotifyQueue, searchSpotify, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream } from "../homeTheme";
import { underlineInputStyle, EmptyState, ErrorNote } from "../homeWidgets";
import { MediaCard, TrackRow, SectionHeading, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

const DEBOUNCE_MS = 400;
const SEARCH_CACHE = new Map(); // query -> results, cleared on full page reload only

export default function SpotifySearchTab({ onOpenAlbum, onOpenArtist }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setError("");
      return undefined;
    }
    if (SEARCH_CACHE.has(trimmed)) {
      setResults(SEARCH_CACHE.get(trimmed));
      setError("");
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const data = await searchSpotify(trimmed);
        SEARCH_CACHE.set(trimmed, data);
        setResults(data);
      } catch (err) {
        setError(getErrorMessage(err, "Search failed."));
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const artists = results?.artists?.items?.filter(Boolean) || [];
  const albums = results?.albums?.items?.filter(Boolean) || [];
  const tracks = results?.tracks?.items?.filter(Boolean) || [];
  const playlists = results?.playlists?.items?.filter(Boolean) || [];
  const hasAny = artists.length || albums.length || tracks.length || playlists.length;

  return (
    <div>
      <div className="flex items-center gap-3" style={{ borderBottom: `1px solid ${cream(0.16)}`, paddingBottom: space[2] }}>
        <Search size={16} strokeWidth={1.8} color={cream(0.45)} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
          autoFocus
          style={{ ...underlineInputStyle, borderBottom: "none", padding: `${space[1]}px 0` }}
        />
        {loading && <Loader2 size={15} className="animate-spin" color={cream(0.4)} />}
      </div>

      <ErrorNote>{error}</ErrorNote>

      {!query.trim() && <EmptyState dot>Search for artists, albums, tracks, and playlists.</EmptyState>}

      {query.trim() && !loading && results && !hasAny && <EmptyState>No results for "{query}".</EmptyState>}

      {artists.length > 0 && (
        <>
          <SectionHeading>Artists</SectionHeading>
          <div className="flex flex-wrap" style={{ gap: space[4] }}>
            {artists.slice(0, 8).map((a) => (
              <MediaCard key={a.id} rounded image={imageUrl(a.images)} title={a.name} subtitle="Artist" onClick={() => onOpenArtist?.(a.id)} />
            ))}
          </div>
        </>
      )}

      {albums.length > 0 && (
        <>
          <SectionHeading>Albums</SectionHeading>
          <div className="flex flex-wrap" style={{ gap: space[4] }}>
            {albums.slice(0, 8).map((a) => (
              <MediaCard key={a.id} image={imageUrl(a.images)} title={a.name} subtitle={artistNames(a.artists)} onClick={() => onOpenAlbum?.(a.id)} />
            ))}
          </div>
        </>
      )}

      {tracks.length > 0 && (
        <>
          <SectionHeading>Tracks</SectionHeading>
          <div className="flex flex-col">
            {tracks.slice(0, 15).map((t) => (
              <TrackRow
                key={t.id}
                image={imageUrl(t.album?.images, 2)}
                title={t.name}
                subtitle={`${artistNames(t.artists)} • ${t.album?.name || ""}`}
                durationMs={t.duration_ms}
                onPlay={() => withPlaybackError(spotifyPlay({ uris: [t.uri] }), setError)}
                onAdd={() => withPlaybackError(addSpotifyQueue(t.uri), setError, "Couldn't add that to the queue.")}
              />
            ))}
          </div>
        </>
      )}

      {playlists.length > 0 && (
        <>
          <SectionHeading>Playlists</SectionHeading>
          <div className="flex flex-wrap" style={{ gap: space[4] }}>
            {playlists.slice(0, 8).map((p) => (
              <MediaCard key={p.id} image={imageUrl(p.images)} title={p.name} subtitle={p.owner?.display_name} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
