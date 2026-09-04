// Feature: Spotify statistics dashboard (spec section 24).
import { useEffect, useState } from "react";
import { Loader2, Users, Music } from "lucide-react";
import { getSpotifyStats } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontMono, text, accent, space, cream } from "../homeTheme";
import { ErrorNote, EmptyState, StatTile, GlassPanel } from "../homeWidgets";
import { imageUrl, artistNames, Section } from "./spotifyShared";

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
      <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0`, marginTop: space[6] }}>
        <div className="flex items-center justify-center" style={{ color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </GlassPanel>
    );
  }

  if (!stats) return <ErrorNote>{error}</ErrorNote>;

  const hasAnything = stats.top_artists?.length || stats.top_tracks?.length;

  return (
    <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap" style={{ gap: space[4] }}>
        <StatTile label="Top Artist" value={stats.top_artists?.[0]?.name || "—"} />
        <StatTile label="Top Track" value={stats.top_tracks?.[0]?.name || "—"} />
        <StatTile label="Playlists" value={stats.playlist_count ?? 0} />
        <StatTile label="Saved Tracks" value={stats.saved_track_count ?? 0} />
        <StatTile label="Saved Albums" value={stats.saved_album_count ?? 0} />
        <StatTile label="Following" value={stats.followed_artist_count ?? 0} />
      </div>

      {!hasAnything && <EmptyState dot>Listen to more on Spotify to build your statistics.</EmptyState>}

      {stats.top_artists?.length > 0 && (
        <Section title="Top Artists" icon={Users}>
          <div style={{ overflowX: "auto" }}>
            <table className="ds-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {stats.top_artists.map((a, i) => (
                  <tr key={a.id}>
                    <td style={{ width: 32, padding: `${space[2]}px ${space[2]}px`, fontFamily: fontMono, fontVariantNumeric: "tabular-nums", color: accent[300] }}>
                      {i + 1}
                    </td>
                    <td style={{ width: 40, padding: `${space[2]}px ${space[2]}px` }}>
                      {imageUrl(a.images) && (
                        <img src={imageUrl(a.images)} alt="" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                      )}
                    </td>
                    <td style={{ padding: `${space[2]}px ${space[2]}px`, color: text.base }}>{a.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {stats.top_tracks?.length > 0 && (
        <Section title="Top Tracks" icon={Music}>
          <div style={{ overflowX: "auto" }}>
            <table className="ds-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {stats.top_tracks.map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ width: 32, padding: `${space[2]}px ${space[2]}px`, fontFamily: fontMono, fontVariantNumeric: "tabular-nums", color: accent[300] }}>
                      {i + 1}
                    </td>
                    <td className="truncate" style={{ padding: `${space[2]}px ${space[2]}px`, color: text.base, maxWidth: 0 }}>
                      {t.name} <span style={{ color: cream(0.45), fontSize: 13 }}>— {artistNames(t.artists)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
