import { useCallback, useEffect, useState } from "react";
import { Activity, ClipboardList, Gauge, History, Loader2, Sparkles } from "lucide-react";
import { getThreadsOverview } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { text, accent, space, cream, glassBorder, success, danger, warning } from "../homeTheme";
import { EmptyState, ErrorNote, GlassPanel, PanelEyebrow, StatTile, StatusDot } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ThreadsOverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getThreadsOverview(30));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load Threads overview."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
        <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </GlassPanel>
    );
  }

  if (error) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[6]}px ${space[6]}px` }}>
        <ErrorNote>{error}</ErrorNote>
      </GlassPanel>
    );
  }
  if (!data) return null;

  const { profile_health: health, activity, recent_profile_changes: changes, automations, rate_limit } = data;
  const enabledCount = automations?.filter((a) => a.enabled).length || 0;

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      {/* Metrics Row */}
      <div style={entrance(0)}>
        <GlassPanel elevated float={1} delay={-1} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Activity}>Platform Snapshot</PanelEyebrow>
          <div className="flex flex-wrap mt-3" style={{ gap: space[4] }}>
            <StatTile label="Profile Health" value={`${health?.score ?? 0}/100`} size="lg" />
            <StatTile label={`Published (${activity.period_days}d)`} value={activity.posts_published} size="lg" />
            <StatTile
              label="Daily Post Quota"
              value={rate_limit ? `${rate_limit.quota_usage}/${rate_limit.quota_total}` : "250/250"}
              size="lg"
            />
            <StatTile label="Automations Active" value={`${enabledCount}/${automations.length}`} size="lg" />
          </div>
        </GlassPanel>
      </div>

      {/* Content & History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: space[6] }}>
        <div style={entrance(0.08)}>
          <GlassPanel float={2} delay={-2.6} style={{ padding: `${space[6]}px ${space[6]}px`, height: "100%" }}>
            <PanelEyebrow icon={ClipboardList}>Recent Threads</PanelEyebrow>
            {activity.recent_posts.length === 0 ? (
              <EmptyState>No threads published through Mirabel yet.</EmptyState>
            ) : (
              <div className="flex flex-col mt-3" style={{ gap: space[3] }}>
                {activity.recent_posts.slice(0, 5).map((post) => (
                  <div
                    key={post.id}
                    style={{ padding: `${space[3]}px ${space[4]}px`, borderRadius: 8, border: `1px solid ${glassBorder.soft}` }}
                  >
                    <p style={{ fontSize: 14, color: text.base, lineHeight: 1.5 }}>{post.body_preview || "(empty)"}</p>
                    <div className="flex items-center justify-between mt-1 text-xs" style={{ color: cream(0.42) }}>
                      <span>{post.reply_control} · {formatDate(post.published_at)}</span>
                      {post.permalink && (
                        <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>

        <div style={entrance(0.14)}>
          <GlassPanel float={3} delay={-4.4} style={{ padding: `${space[6]}px ${space[6]}px`, height: "100%" }}>
            <PanelEyebrow icon={History}>Profile Evolution</PanelEyebrow>
            {changes.length === 0 ? (
              <EmptyState>No profile changes detected yet.</EmptyState>
            ) : (
              <div className="flex flex-col mt-3" style={{ gap: space[2] }}>
                {changes.map((change, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                    style={{ padding: `${space[3]}px 0`, borderBottom: i < changes.length - 1 ? `1px solid ${cream(0.08)}` : "none" }}
                  >
                    <span style={{ fontSize: 13.5, color: text.base, textTransform: "capitalize" }}>
                      {change.field} updated
                    </span>
                    <span style={{ fontSize: 12, color: cream(0.4) }}>{formatDate(change.detected_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      </div>

      {/* Suggestions */}
      {health?.suggestions?.length > 0 && (
        <div style={entrance(0.2)}>
          <GlassPanel float={1} delay={-0.8} glow style={{ padding: `${space[6]}px ${space[7]}px` }}>
            <PanelEyebrow icon={Sparkles}>Suggestions for Growth</PanelEyebrow>
            <div className="flex flex-col mt-2" style={{ gap: space[2] }}>
              {health.suggestions.map((s, idx) => (
                <p key={idx} style={{ fontSize: 14, lineHeight: 1.6, color: cream(0.72) }}>
                  <span style={{ color: accent[300] }}>•</span> {s}
                </p>
              ))}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
