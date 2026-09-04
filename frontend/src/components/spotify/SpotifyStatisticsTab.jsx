// Feature: Spotify statistics dashboard (spec section 24).
import { useEffect, useState } from "react";
import { Loader2, Music, User, Disc, Heart, Radio, Play } from "lucide-react";
import { getSpotifyStats, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, accent, cyan, space, radius, cream } from "../homeTheme";
import { ErrorNote } from "../homeWidgets";
import StatCard from "../common/StatCard";
import SectionCard from "../common/SectionCard";
import { imageUrl, artistNames, playbackErrorMessage } from "./spotifyShared";

export default function SpotifyStatisticsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    getSpotifyStats()
      .then(setStats)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load statistics.")))
      .finally(() => setLoading(false));
  }, []);

  async function handlePlayTrack(uri) {
    if (!uri) return;
    setPlaybackError("");
    try {
      await spotifyPlay({ uris: [uri] });
    } catch (err) {
      setPlaybackError(playbackErrorMessage(err, "Couldn't play track. Is Spotify open on an active device?"));
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <StatCard key={i} loading={true} />
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="flex flex-col gap-8">
      <ErrorNote>{error}</ErrorNote>
      {playbackError && <ErrorNote>{playbackError}</ErrorNote>}

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <StatCard
          label="Top Artist"
          value={stats.top_artists?.[0]?.name || "—"}
          sub="Your #1 streamed artist"
          icon={User}
        />
        <StatCard
          label="Top Track"
          value={stats.top_tracks?.[0]?.name || "—"}
          sub={stats.top_tracks?.[0]?.artists ? artistNames(stats.top_tracks[0].artists) : undefined}
          icon={Music}
        />
        <StatCard
          label="Playlists"
          value={stats.playlist_count ?? 0}
          sub="Curated and followed"
          icon={Disc}
        />
        <StatCard
          label="Saved Tracks"
          value={stats.saved_track_count ?? 0}
          sub="Liked songs in library"
          icon={Heart}
        />
        <StatCard
          label="Saved Albums"
          value={stats.saved_album_count ?? 0}
          sub="Full-length releases saved"
          icon={Disc}
        />
        <StatCard
          label="Following Artists"
          value={stats.followed_artist_count ?? 0}
          sub="Active creator subscriptions"
          icon={Radio}
        />
      </div>

      {/* Top Artists Ranked Grid */}
      {stats.top_artists?.length > 0 && (
        <SectionCard
          title="Top Artists"
          subtitle="Your most played artists across personal listening telemetry."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.top_artists.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-3.5 p-3 rounded-xl transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${cream(0.08)}`,
                }}
              >
                <span
                  className="w-7 text-center font-semibold text-xs shrink-0"
                  style={{
                    fontFamily: fontMono,
                    color: i === 0 ? "#facc15" : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : cyan[400],
                  }}
                >
                  #{i + 1}
                </span>
                {imageUrl(a.images) ? (
                  <img
                    src={imageUrl(a.images)}
                    alt=""
                    className="w-11 h-11 rounded-full object-cover shrink-0 border border-white/10 shadow-sm"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
                    <User size={18} color={cream(0.4)} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[15px] font-semibold"
                    style={{ color: text.bright, fontFamily: fontHeading }}
                  >
                    {a.name}
                  </div>
                  {a.genres?.length > 0 && (
                    <div className="truncate text-xs capitalize" style={{ color: text.secondary, marginTop: 1 }}>
                      {a.genres.slice(0, 2).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Top Tracks Ranked List */}
      {stats.top_tracks?.length > 0 && (
        <SectionCard
          title="Top Tracks"
          subtitle="Your highest rotation songs with direct playback control."
        >
          <div className="flex flex-col gap-1.5">
            {stats.top_tracks.map((t, i) => (
              <div
                key={t.id}
                className="group flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl transition-all duration-150 hover:bg-white/[0.05]"
                style={{
                  borderBottom: `1px solid ${cream(0.04)}`,
                }}
              >
                <span
                  className="w-6 text-center font-medium text-xs shrink-0"
                  style={{
                    fontFamily: fontMono,
                    color: i < 3 ? accent[300] : text.secondary,
                  }}
                >
                  #{i + 1}
                </span>

                {imageUrl(t.album?.images) ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-white/10">
                    <img src={imageUrl(t.album.images)} alt="" className="w-full h-full object-cover" />
                    {t.uri && (
                      <button
                        type="button"
                        onClick={() => handlePlayTrack(t.uri)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity border-none cursor-pointer text-white"
                        title="Play"
                      >
                        <Play size={14} fill="currentColor" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <Music size={16} color={cream(0.4)} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-[15px] font-medium"
                    style={{ color: text.bright, fontFamily: fontHeading }}
                  >
                    {t.name}
                  </div>
                  <div className="truncate text-[13px]" style={{ color: text.secondary, marginTop: 1 }}>
                    {artistNames(t.artists)}
                  </div>
                </div>

                {t.uri && (
                  <button
                    type="button"
                    onClick={() => handlePlayTrack(t.uri)}
                    className="opacity-0 group-hover:opacity-100 px-3 py-1 rounded-full text-xs font-medium border-none cursor-pointer transition-all"
                    style={{
                      background: `${accent[400]}22`,
                      color: accent[200],
                      border: `1px solid ${accent[400]}44`,
                    }}
                  >
                    Play
                  </button>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

