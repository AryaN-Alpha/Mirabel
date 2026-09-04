// Features: Followed artists (spec section 17) + Top artists (spec section 18).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSpotifyFollowedArtists, getSpotifyTopArtists } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, radius, cream, bg } from "../homeTheme";
import { underlineSelectStyle, TabLink, EmptyState, ErrorNote, GlassPanel } from "../homeWidgets";
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
    <div style={{ animation: "home-rise 0.9s cubic-bezier(.2,.7,.2,1) .05s both" }}>
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
              <option key={r.value} value={r.value} style={{ background: bg }}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <GlassPanel style={{ padding: `${space[5]}px ${space[5]}px`, marginTop: space[5] }}>
        <ErrorNote>{error}</ErrorNote>
        {loading && (
          <div className="flex items-center justify-center" style={{ padding: `${space[8]}px 0` }}>
            <Loader2 size={20} className="animate-spin" color={cream(0.4)} />
          </div>
        )}
        {!loading && (items?.length ? (
          <div className="flex flex-col">
            {items.map((a, i) => (
              <ArtistRow key={a.id} artist={a} rank={sub === "top" ? i + 1 : null} onClick={() => onOpenArtist(a.id)} />
            ))}
          </div>
        ) : (
          <EmptyState>{sub === "top" ? "Listen to more to build a top artists list." : "You aren't following any artists yet."}</EmptyState>
        ))}
      </GlassPanel>
    </div>
  );
}

function ArtistRow({ artist, rank, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center gap-4 border-none bg-transparent text-left w-full"
      style={{
        padding: space[2],
        borderRadius: radius.sm,
        cursor: "pointer",
        background: hovered ? "rgba(255,151,131,0.07)" : "transparent",
        transition: "background 0.15s ease",
      }}
    >
      {rank !== null && (
        <span style={{ width: 28, fontSize: 15, color: cream(0.35), fontVariantNumeric: "tabular-nums" }}>#{rank}</span>
      )}
      <MediaCardInline image={imageUrl(artist.images)} />
      <div>
        <div style={{ fontFamily: fontHeading, fontSize: 16, color: hovered ? text.bright : text.base }}>{artist.name}</div>
        <div style={{ fontSize: 12.5, color: cream(0.45) }}>
          {(artist.followers?.total || 0).toLocaleString()} followers
        </div>
      </div>
    </button>
  );
}

function MediaCardInline({ image }) {
  return (
    <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: cream(0.05) }}>
      {image && <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
    </div>
  );
}
