// Feature: Top tracks (spec section 19).
import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { addSpotifyQueue, getSpotifyTopTracks, spotifyPlay } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space, cream, bg } from "../homeTheme";
import { underlineSelectStyle, EmptyState, ErrorNote, GlassPanel, PanelEyebrow } from "../homeWidgets";
import { TrackRow, artistNames, imageUrl, withPlaybackError } from "./spotifyShared";

const TIME_RANGES = [
  { value: "short_term", label: "Last 4 Weeks" },
  { value: "medium_term", label: "Last 6 Months" },
  { value: "long_term", label: "All Time" },
];

export default function SpotifyTopTracksTab() {
  const [timeRange, setTimeRange] = useState("medium_term");
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getSpotifyTopTracks({ timeRange, limit: 30 })
      .then((data) => !cancelled && setItems(data.items || []))
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load top tracks.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [timeRange]);

  return (
    <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
      <GlassPanel style={{ padding: `${space[5]}px ${space[5]}px` }}>
        <div className="flex items-center justify-between flex-wrap" style={{ gap: space[3] }}>
          <PanelEyebrow icon={TrendingUp}>Your Top Tracks</PanelEyebrow>
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} style={underlineSelectStyle}>
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value} style={{ background: bg }}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <ErrorNote>{error}</ErrorNote>
        {loading && (
          <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
            <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
          </div>
        )}
        {!loading && (items?.length ? (
          <div className="flex flex-col">
            {items.map((t, i) => (
              <TrackRow
                key={t.id}
                index={i}
                image={imageUrl(t.album?.images, 2)}
                title={t.name}
                subtitle={`${artistNames(t.artists)} • ${t.album?.name || ""}`}
                durationMs={t.duration_ms}
                onPlay={() => withPlaybackError(spotifyPlay({ uris: [t.uri] }), setError)}
                onAdd={() => withPlaybackError(addSpotifyQueue(t.uri), setError, "Couldn't add that to the queue.")}
              />
            ))}
          </div>
        ) : (
          <EmptyState>Listen to more to build a top tracks list.</EmptyState>
        ))}
      </GlassPanel>
    </div>
  );
}
