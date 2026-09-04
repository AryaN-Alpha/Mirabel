// Feature: Queue management (spec section 14/23).
import { useEffect, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { addSpotifyQueue, getSpotifyQueue, searchSpotify, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { underlineInputStyle, GhostLink, EmptyState, ErrorNote } from "../homeWidgets";
import { TrackRow, artistNames, imageUrl, playbackErrorMessage, withPlaybackError } from "./spotifyShared";

// Matches the render list below (queue.queue.slice(0, 20)) — kept as one
// constant so playFromQueue's index always lines up with what's on screen
// instead of two independently-maintained slices drifting apart.
const VISIBLE_QUEUE_LIMIT = 20;

export default function SpotifyQueueTab() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [playingIndex, setPlayingIndex] = useState(null);

  function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    getSpotifyQueue()
      .then(setQueue)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load the queue.")))
      .finally(() => !silent && setLoading(false));
  }

  useEffect(() => {
    // Spotify's queue endpoint is heavy and strictly rate-limited — skip the
    // fetch while the tab is backgrounded (e.g. this component stays mounted
    // behind a browser tab switch) and catch back up once it's visible again,
    // instead of firing a request nobody's there to see.
    if (!document.hidden) load();
    function handleVisibility() {
      if (!document.hidden) load({ silent: true });
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const visibleQueue = queue?.queue?.slice(0, VISIBLE_QUEUE_LIMIT) || [];

  // Playing a specific "Up Next" row should skip to that track and keep
  // whatever was still queued after it — not the generic preserve_queue
  // behavior (spotify/services/client.py::play), which would snapshot and
  // restore the WHOLE pre-play queue, resurrecting the tracks being skipped
  // past (and re-adding the clicked track's own uri redundantly). So this
  // opts out of preserve_queue and re-queues only the remainder itself.
  async function playFromQueue(index) {
    if (playingIndex !== null) return; // one play-then-requeue flow at a time
    const upcoming = visibleQueue.slice(index + 1);
    const target = visibleQueue[index];
    if (!target?.uri) return;
    setError("");
    setPlayingIndex(index);
    try {
      await spotifyPlay({ uris: [target.uri], preserveQueue: false });
      // Best-effort per track — one failed re-add (e.g. a transient error)
      // shouldn't abandon the rest of the restore or skip the final reload,
      // which would otherwise leave the UI showing the stale pre-play queue.
      for (const t of upcoming) {
        if (!t.uri) continue;
        try {
          await addSpotifyQueue(t.uri);
        } catch (err) {
          setError(playbackErrorMessage(err, "Couldn't restore the rest of the queue."));
        }
      }
    } catch (err) {
      setError(playbackErrorMessage(err, "Couldn't play that track."));
    } finally {
      setPlayingIndex(null);
      load({ silent: true }); // playingIndex already covered the busy state; no need to flash the whole list
    }
  }

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
      {!loading && (visibleQueue.length ? (
        <div className="flex flex-col">
          {visibleQueue.map((t, i) => (
            <TrackRow
              key={`${t.id}-${i}`}
              index={i}
              image={imageUrl(t.album?.images, 2)}
              title={t.name}
              subtitle={artistNames(t.artists)}
              durationMs={t.duration_ms}
              onPlay={() => playFromQueue(i)}
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
