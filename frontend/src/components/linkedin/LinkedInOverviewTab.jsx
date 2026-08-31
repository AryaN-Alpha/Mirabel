import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getLinkedInOverview } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { labelStyle, EmptyState, ErrorNote } from "../homeWidgets";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Kpi({ label, value }) {
  return (
    <div style={{ padding: `${space[4]}px 0` }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontFamily: fontHeading, fontSize: 32, marginTop: 4, color: text.bright }}>{value}</div>
    </div>
  );
}

export default function LinkedInOverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getLinkedInOverview(30));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load the LinkedIn overview."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center" style={{ gap: space[2], color: cream(0.4) }}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const { profile_health: health, activity, recent_profile_changes: changes, automations } = data;
  const enabledCount = automations.filter((a) => a.enabled).length;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="flex flex-wrap" style={{ gap: space[8] }}>
        <Kpi label="Profile health" value={`${health.score}/100`} />
        <Kpi label={`Posts published (${activity.period_days}d)`} value={activity.posts_published} />
        <Kpi label="Automations enabled" value={`${enabledCount}/${automations.length}`} />
      </div>

      <p style={{ fontSize: 12, marginTop: space[2], lineHeight: 1.6, color: cream(0.35) }}>{activity.note}</p>

      <div style={{ marginTop: space[8] * 0.9, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}`, ...labelStyle }}>
        Top content this period
      </div>
      {activity.recent_posts.length === 0 ? (
        <EmptyState>No posts published through Mirabel in this period yet.</EmptyState>
      ) : (
        <div className="flex flex-col" style={{ marginTop: space[3] }}>
          {activity.recent_posts.slice(0, 5).map((post) => (
            <div key={post.id} style={{ padding: `${space[3]}px 0`, borderBottom: `1px solid ${cream(0.08)}` }}>
              <p style={{ fontSize: 14, color: text.base }}>{post.body_preview || "(empty post)"}</p>
              <p style={{ fontSize: 12, marginTop: 3, color: cream(0.42) }}>
                {post.visibility} · {formatDate(post.published_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: space[8] * 0.9, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}`, ...labelStyle }}>
        Recent profile changes
      </div>
      {changes.length === 0 ? (
        <EmptyState>No profile changes detected recently.</EmptyState>
      ) : (
        <div className="flex flex-col" style={{ marginTop: space[3] }}>
          {changes.map((change, i) => (
            <div key={i} style={{ padding: `${space[2]}px 0` }}>
              <span style={{ fontSize: 13.5, color: text.base, textTransform: "capitalize" }}>{change.field} changed</span>
              <span style={{ fontSize: 12, marginLeft: space[3], color: cream(0.4) }}>{formatDate(change.detected_at)}</span>
            </div>
          ))}
        </div>
      )}

      {health.recommendations.length > 0 && (
        <>
          <div style={{ marginTop: space[8] * 0.9, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}`, ...labelStyle }}>
            AI recommendations
          </div>
          <div className="flex flex-col" style={{ marginTop: space[3], gap: space[2] }}>
            {health.recommendations.map((rec) => (
              <p key={rec.field} style={{ fontSize: 14, color: cream(0.65) }}>
                <span style={{ color: accent[300] }}>•</span> {rec.recommendation}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
