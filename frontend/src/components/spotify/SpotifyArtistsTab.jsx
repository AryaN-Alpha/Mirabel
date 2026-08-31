// Features: Followed artists (spec section 17) + Top artists (spec section 18).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSpotifyFollowedArtists, getSpotifyTopArtists } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { underlineSelectStyle, TabLink, EmptyState, ErrorNote } from "../homeWidgets";
import { imageUrl } from "./spotifyShared";

const TIME_RANGES = [
  { value: "short_term", label: "Last 4 Weeks" },
  { value: "medium_term", label: "Last 6 Months" },
  { value: "long_term", label: "All Time" },
];

export default function SpotifyArtistsTab({ onOpenArtist }) {
  const [sub, setSub] = useState("top");
  const [timeRange, setTimeRange] = useState("medium_term");
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const load =
      sub === "top" ? getSpotifyTopArtists({ timeRange, limit: 30 }) : getSpotifyFollowedArtists({ limit: 30 });
    load
      .then((data) => {
        if (cancelled) return;
        setItems(sub === "top" ? data.items : (data.artists?.items || []));
      })
      .catch((err) => !cancelled && setError(getErrorMessage(err, "Couldn't load artists.")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [sub, timeRange]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap" style={{ gap: space[4] }}>
        <div className="flex items-center" style={{ gap: space[6] }}>
          <TabLink active={sub === "top"} onClick={() => setSub("top")}>
            Your Top Artists
          </TabLink>
          <TabLink active={sub === "following"} onClick={() => setSub("following")}>
            Following
          </TabLink>
        </div>
        {sub === "top" && (
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} style={underlineSelectStyle}>
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value} style={{ background: "#171310" }}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={{ marginTop: space[6] }}>
        <ErrorNote>{error}</ErrorNote>
        {loading && (
          <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
            <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
          </div>
        )}
        {!loading && (items?.length ? (
          <div className="flex flex-col" style={{ gap: space[3] }}>
            {items.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenArtist(a.id)}
                className="flex items-center gap-4 border-none bg-transparent text-left w-full"
                style={{ padding: space[2], cursor: "pointer" }}
              >
                {sub === "top" && (
                  <span style={{ width: 28, fontSize: 15, color: cream(0.35), fontVariantNumeric: "tabular-nums" }}>
                    #{i + 1}
                  </span>
                )}
                <MediaCardInline image={imageUrl(a.images)} />
                <div>
                  <div style={{ fontFamily: fontHeading, fontSize: 16, color: text.base }}>{a.name}</div>
                  <div style={{ fontSize: 12.5, color: cream(0.45) }}>
                    {(a.followers?.total || 0).toLocaleString()} followers
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState>{sub === "top" ? "Listen to more to build a top artists list." : "You aren't following any artists yet."}</EmptyState>
        ))}
      </div>
    </div>
  );
}

function MediaCardInline({ image }) {
  return (
    <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)" }}>
      {image && <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}
