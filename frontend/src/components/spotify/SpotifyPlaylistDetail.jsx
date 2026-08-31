// Feature: Playlist page + track CRUD + custom cover (spec sections 14/15/16).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronUp, ExternalLink, ImagePlus, Loader2, Play, Search, X } from "lucide-react";
import {
  addSpotifyPlaylistTracks,
  getSpotifyPlaylist,
  getSpotifyPlaylistTracks,
  removeSpotifyPlaylistTracks,
  reorderSpotifyPlaylistTracks,
  searchSpotify,
  spotifyPlay,
  updateSpotifyPlaylist,
  uploadSpotifyPlaylistCover,
} from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { underlineInputStyle, GhostLink, OutlineButton, ModalShell, EmptyState, ErrorNote } from "../homeWidgets";
import { IconButton } from "../homeWidgets";
import { Thumb, TrackRow, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

const MAX_COVER_BYTES = 256 * 1024;

function RemoveConfirmModal({ track, onCancel, onConfirm, busy }) {
  return (
    <ModalShell onClose={busy ? undefined : onCancel} busy={busy}>
      <p style={{ fontSize: 15, color: text.base }}>Remove this track from playlist?</p>
      <div>
        <div style={{ fontFamily: fontHeading, fontSize: 17, color: text.bright }}>{track.name}</div>
        <div style={{ fontSize: 13, color: cream(0.5) }}>{artistNames(track.artists)}</div>
      </div>
      <div className="flex items-center gap-4">
        <GhostLink onClick={onCancel} muted disabled={busy}>
          Cancel
        </GhostLink>
        <GhostLink onClick={onConfirm} danger disabled={busy}>
          Remove
        </GhostLink>
      </div>
    </ModalShell>
  );
}

function AddTracksModal({ playlistId, onClose, onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(new Set());
  const [error, setError] = useState("");
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchSpotify(query.trim(), { types: "track", limit: 15 });
        setResults(data.tracks?.items?.filter(Boolean) || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function addTrack(track) {
    setError("");
    try {
      await addSpotifyPlaylistTracks(playlistId, [track.uri]);
      setAdded((prev) => new Set(prev).add(track.id));
      onAdded(track);
    } catch (err) {
      // leave un-added on failure — the (+) affordance stays clickable to retry
      setError(getErrorMessage(err, "Couldn't add that track."));
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth={560}>
      <div className="flex items-center justify-between">
        <h3 style={{ fontFamily: fontHeading, fontSize: 20, color: text.bright }}>Add to Playlist</h3>
        <IconButton onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="flex items-center gap-2" style={{ borderBottom: `1px solid ${cream(0.16)}` }}>
        <Search size={14} color={cream(0.4)} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tracks…"
          autoFocus
          style={{ ...underlineInputStyle, borderBottom: "none" }}
        />
        {loading && <Loader2 size={14} className="animate-spin" color={cream(0.4)} />}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-col" style={{ maxHeight: 360, overflowY: "auto" }}>
        {results.map((t) => (
          <TrackRow
            key={t.id}
            image={imageUrl(t.album?.images, 2)}
            title={t.name}
            subtitle={artistNames(t.artists)}
            trailing={
              <span style={{ fontSize: 12, color: added.has(t.id) ? "#8fd6a8" : accent[300], cursor: added.has(t.id) ? "default" : "pointer" }}
                onClick={() => !added.has(t.id) && addTrack(t)}
              >
                {added.has(t.id) ? "Added" : "Add"}
              </span>
            }
          />
        ))}
      </div>
    </ModalShell>
  );
}

export default function SpotifyPlaylistDetail({ playlistId, onBack }) {
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingRemove, setPendingRemove] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const coverInputRef = useRef(null);

  function load() {
    setLoading(true);
    setError("");
    Promise.all([getSpotifyPlaylist(playlistId), getSpotifyPlaylistTracks(playlistId, { limit: 100 })])
      .then(([p, t]) => {
        setPlaylist(p);
        setDescription(p.description || "");
        setTracks((t.items || []).filter((i) => i.track));
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load this playlist.")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [playlistId]);

  async function confirmRemove() {
    const uri = pendingRemove.uri;
    setBusy(true);
    try {
      await removeSpotifyPlaylistTracks(playlistId, [uri]);
      setTracks((prev) => prev.filter((i) => i.track.uri !== uri));
      setPendingRemove(null);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't remove that track."));
    } finally {
      setBusy(false);
    }
  }

  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    setTracks(next);
    try {
      await reorderSpotifyPlaylistTracks(playlistId, index, delta > 0 ? target + 1 : target);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't reorder that track."));
      load();
    }
  }

  async function saveDescription() {
    try {
      await updateSpotifyPlaylist(playlistId, { description });
      setPlaylist((prev) => ({ ...prev, description }));
      setEditingDescription(false);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save the description."));
    }
  }

  async function handleCoverFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/jpg"].includes(file.type)) {
      setError("Cover image must be a JPEG.");
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setError(`Cover image must be under ${MAX_COVER_BYTES / 1024}KB.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await uploadSpotifyPlaylistCover(playlistId, file);
      load();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't update the cover."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
        <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
      </div>
    );
  }

  if (!playlist) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div>
      <GhostLink onClick={onBack} muted style={{ fontSize: 13 }}>
        <ChevronLeft size={14} /> Back
      </GhostLink>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-end gap-6 flex-wrap" style={{ marginTop: space[6] }}>
        <div className="relative group" style={{ width: 180, height: 180 }}>
          <Thumb src={imageUrl(playlist.images, 1)} size={180} />
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center border-none"
            style={{ background: "rgba(0,0,0,0.45)", opacity: 0, cursor: "pointer", transition: "opacity 0.25s ease" }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
            title="Change cover"
          >
            <ImagePlus size={26} color={text.bright} />
          </button>
          <input ref={coverInputRef} type="file" accept="image/jpeg" hidden onChange={handleCoverFile} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42) }}>
            Playlist
          </div>
          <h1 style={{ fontFamily: fontHeading, fontSize: "clamp(26px,3vw,40px)", color: text.bright, margin: `${space[2]}px 0` }}>
            {playlist.name}
          </h1>
          {editingDescription ? (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ ...underlineInputStyle, fontSize: 14 }}
              />
              <GhostLink onClick={saveDescription}>Save</GhostLink>
            </div>
          ) : (
            <p
              onClick={() => setEditingDescription(true)}
              style={{ fontSize: 14, color: cream(0.55), cursor: "pointer", maxWidth: "60ch" }}
              title="Click to edit"
            >
              {playlist.description || "Add a description…"}
            </p>
          )}
          <div style={{ fontSize: 13, color: cream(0.45) }}>
            {playlist.owner?.display_name} • {tracks.length} tracks
          </div>
          <div className="flex items-center gap-4" style={{ marginTop: space[4] }}>
            <OutlineButton onClick={() => withPlaybackError(spotifyPlay({ contextUri: playlist.uri }), setError)}>
              <Play size={14} fill="currentColor" style={{ marginRight: 6 }} />
              Play
            </OutlineButton>
            <GhostLink onClick={() => setShowAdd(true)}>+ Add to Playlist</GhostLink>
            {playlist.external_urls?.spotify && (
              <GhostLink muted onClick={() => window.open(playlist.external_urls.spotify, "_blank")}>
                <ExternalLink size={13} /> Open in Spotify
              </GhostLink>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col" style={{ marginTop: space[8] }}>
        {tracks.length === 0 && <EmptyState>No tracks yet. Use "Add to Playlist" to get started.</EmptyState>}
        {tracks.map(({ track }, i) => (
          <TrackRow
            key={`${track.id}-${i}`}
            index={i}
            image={imageUrl(track.album?.images, 2)}
            title={track.name}
            subtitle={`${artistNames(track.artists)} • ${track.album?.name || ""}`}
            durationMs={track.duration_ms}
            onPlay={() => withPlaybackError(spotifyPlay({ contextUri: playlist.uri, offset: { uri: track.uri } }), setError)}
            trailing={
              <div className="flex items-center" style={{ gap: 2 }}>
                <IconButton disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  <ChevronUp size={14} />
                </IconButton>
                <IconButton disabled={i === tracks.length - 1} onClick={() => move(i, 1)} title="Move down">
                  <ChevronDown size={14} />
                </IconButton>
                <IconButton danger onClick={() => setPendingRemove(track)} title="Remove">
                  <X size={14} />
                </IconButton>
              </div>
            }
          />
        ))}
      </div>

      {pendingRemove && (
        <RemoveConfirmModal
          track={pendingRemove}
          busy={busy}
          onCancel={() => setPendingRemove(null)}
          onConfirm={confirmRemove}
        />
      )}

      {showAdd && (
        <AddTracksModal
          playlistId={playlistId}
          onClose={() => setShowAdd(false)}
          onAdded={(track) => setTracks((prev) => [...prev, { track }])}
        />
      )}
    </div>
  );
}
