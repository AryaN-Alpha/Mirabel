// Feature: User's playlists (spec section 14) + create.
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createSpotifyPlaylist, getSpotifyPlaylists } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { underlineInputStyle, GhostLink, OutlineButton, EmptyState, ErrorNote, ModalShell } from "../homeWidgets";
import { MediaCard, imageUrl } from "./spotifyShared";

function CreatePlaylistModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const playlist = await createSpotifyPlaylist({ name: name.trim(), description: description.trim(), public: false });
      onCreated(playlist);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create the playlist."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell onClose={onClose} busy={busy}>
      <h3 style={{ fontFamily: fontHeading, fontSize: 22, color: text.bright }}>New playlist</h3>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Playlist name"
        autoFocus
        style={underlineInputStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        style={{ ...underlineInputStyle, resize: "vertical" }}
      />
      <ErrorNote>{error}</ErrorNote>
      <div className="flex items-center gap-4" style={{ marginTop: space[2] }}>
        <OutlineButton onClick={submit} disabled={busy || !name.trim()}>
          Create
        </OutlineButton>
        <GhostLink onClick={onClose} muted disabled={busy}>
          Cancel
        </GhostLink>
      </div>
    </ModalShell>
  );
}

export default function SpotifyPlaylistsTab({ onOpenPlaylist }) {
  const [playlists, setPlaylists] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSpotifyPlaylists({ limit: 50 })
      .then((data) => !cancelled && setPlaylists(data))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load your playlists.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 style={{ fontFamily: fontHeading, fontSize: 22, color: text.base }}>Your Playlists</h2>
        <GhostLink onClick={() => setShowCreate(true)}>
          <Plus size={14} /> New playlist
        </GhostLink>
      </div>

      <ErrorNote>{error}</ErrorNote>
      {loading && (
        <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
          <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
        </div>
      )}

      {!loading && (playlists?.items?.length ? (
        <div className="flex flex-wrap" style={{ gap: space[4], marginTop: space[6] }}>
          {playlists.items.filter(Boolean).map((p) => (
            <MediaCard
              key={p.id}
              image={imageUrl(p.images)}
              title={p.name}
              subtitle={`${p.tracks?.total ?? 0} tracks`}
              onClick={() => onOpenPlaylist(p.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState>
          No playlists yet. Your Spotify playlists will appear here.
        </EmptyState>
      ))}

      {showCreate && (
        <CreatePlaylistModal
          onClose={() => setShowCreate(false)}
          onCreated={(playlist) => {
            setShowCreate(false);
            setPlaylists((prev) => ({ ...prev, items: [playlist, ...(prev?.items || [])] }));
            onOpenPlaylist(playlist.id);
          }}
        />
      )}
    </div>
  );
}
