// Feature: Spotify statistics dashboard (spec section 24).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSpotifyStats } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, radius, cream } from "../homeTheme";
import { ErrorNote } from "../homeWidgets";
import { imageUrl, artistNames, SectionHeading } from "./spotifyShared";

function StatTile({ label, value }) {
  return (
    <div style={{ padding: space[5] ?? 23, border: `1px solid ${cream(0.1)}`, borderRadius: radius.md, minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: cream(0.42) }}>{label}</div>
      <div className="truncate" style={{ fontFamily: fontHeading, fontSize: 24, color: text.bright, marginTop: space[2] }}>
        {value}
      </div>
    </div>
  );
}

export default function SpotifyStatisticsTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getSpotifyStats()
      .then(setStats)
      .catch((err) => setError(getErrorMessage(err, "Couldn't load statistics.")))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
        <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
      </div>
    );
  }

  if (!stats) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap" style={{ gap: space[4] }}>
        <StatTile label="Top Artist" value={stats.top_artists?.[0]?.name || "—"} />
        <StatTile label="Top Track" value={stats.top_tracks?.[0]?.name || "—"} />
        <StatTile label="Playlists" value={stats.playlist_count} />
        <StatTile label="Saved Tracks" value={stats.saved_track_count} />
        <StatTile label="Saved Albums" value={stats.saved_album_count} />
        <StatTile label="Following" value={stats.followed_artist_count} />
      </div>

      {stats.top_artists?.length > 0 && (
        <>
          <SectionHeading>Top Artists</SectionHeading>
          <ol className="flex flex-col" style={{ gap: space[2] }}>
            {stats.top_artists.map((a, i) => (
              <li key={a.id} className="flex items-center gap-3" style={{ fontSize: 15, color: text.base }}>
                <span style={{ color: accent[300], width: 20 }}>#{i + 1}</span>
                {imageUrl(a.images) && (
                  <img src={imageUrl(a.images)} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                )}
                {a.name}
              </li>
            ))}
          </ol>
        </>
      )}

      {stats.top_tracks?.length > 0 && (
        <>
          <SectionHeading>Top Tracks</SectionHeading>
          <ol className="flex flex-col" style={{ gap: space[2] }}>
            {stats.top_tracks.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3" style={{ fontSize: 15, color: text.base }}>
                <span style={{ color: accent[300], width: 20 }}>#{i + 1}</span>
                <span className="truncate">
                  {t.name} <span style={{ color: cream(0.45), fontSize: 13 }}>— {artistNames(t.artists)}</span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
