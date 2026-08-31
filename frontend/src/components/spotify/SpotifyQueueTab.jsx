// Feature: Queue management (spec section 14/23).
import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addSpotifyQueue, getSpotifyQueue, searchSpotify } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { underlineInputStyle, GhostLink, EmptyState, ErrorNote } from "../homeWidgets";
import { TrackRow, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

export default function SpotifyQueueTab() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  function load() {
    setLoading(true);
    getSpotifyQueue()
      .then(setQueue)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load the queue.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily: fontHeading, fontSize: 22, color: text.base }}>Queue</h2>
        <GhostLink onClick={() => setShowAdd((v) => !v)}>
          <Plus size={14} /> Add to Queue
        </GhostLink>
      </div>

      {showAdd && <QueueSearch onAdded={load} />}

      <ErrorNote>{error}</ErrorNote>
      {loading && (
        <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
          <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
        </div>
      )}

      {!loading && queue?.currently_playing && (
        <>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42), marginTop: space[6] }}>
            Now Playing
          </div>
          <TrackRow
            image={imageUrl(queue.currently_playing.album?.images, 2)}
            title={queue.currently_playing.name}
            subtitle={artistNames(queue.currently_playing.artists)}
            durationMs={queue.currently_playing.duration_ms}
            active
          />
        </>
      )}

      <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42), marginTop: space[6] }}>
        Up Next
      </div>
      {!loading && (queue?.queue?.length ? (
        <div className="flex flex-col">
          {queue.queue.slice(0, 20).map((t, i) => (
            <TrackRow
              key={`${t.id}-${i}`}
              index={i}
              image={imageUrl(t.album?.images, 2)}
              title={t.name}
              subtitle={artistNames(t.artists)}
              durationMs={t.duration_ms}
            />
          ))}
        </div>
      ) : (
        !loading && <EmptyState>Nothing queued.</EmptyState>
      ))}
    </div>
  );
}

function QueueSearch({ onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  async function runSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setError("");
    try {
      const data = await searchSpotify(query.trim(), { types: "track", limit: 8 });
      setResults(data.tracks?.items?.filter(Boolean) || []);
    } catch (err) {
      setResults([]);
      setError(getErrorMessage(err, "Search failed."));
    }
  }

  return (
    <div style={{ marginTop: space[4] }}>
      <form onSubmit={runSearch} className="flex items-center gap-2" style={{ borderBottom: `1px solid ${cream(0.16)}` }}>
        <Search size={14} color={cream(0.4)} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a track to queue…"
          style={{ ...underlineInputStyle, borderBottom: "none" }}
        />
      </form>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-col" style={{ marginTop: space[2] }}>
        {results.map((t) => (
          <TrackRow
            key={t.id}
            image={imageUrl(t.album?.images, 2)}
            title={t.name}
            subtitle={artistNames(t.artists)}
            onAdd={() => withPlaybackError(addSpotifyQueue(t.uri).then(onAdded), setError, "Couldn't add that to the queue.")}
          />
        ))}
      </div>
    </div>
  );
}
