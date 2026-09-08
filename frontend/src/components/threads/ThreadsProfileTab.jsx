import { useEffect, useState } from "react";
import { History, Loader2, RefreshCw, Sparkles, User } from "lucide-react";
import { getThreadsProfile, getThreadsProfileHistory, syncThreadsProfile } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, accent, space, cream, surface, glassBorder, radius, success, warning } from "../homeTheme";
import { OutlineButton, EmptyState, ErrorNote, GlassPanel, PanelEyebrow, StatusDot } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function ThreadsProfileTab({ status }) {
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [profData, histData] = await Promise.all([
        getThreadsProfile(),
        getThreadsProfileHistory(),
      ]);
      setProfile(profData);
      setHistory(histData.changes || []);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load Threads profile."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await syncThreadsProfile();
      await loadData();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to synchronize profile."));
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <GlassPanel hoverLift={false} style={{ padding: `${space[8]}px 0` }}>
        <div className="w-full flex items-center justify-center" style={{ color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      </GlassPanel>
    );
  }

  const health = profile?.health || {};

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      {/* Profile Card */}
      <div style={entrance(0)}>
        <GlassPanel elevated float={1} delay={-1} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-4">
              {profile?.picture_url ? (
                <img
                  src={profile.picture_url}
                  alt={profile.username || "Profile"}
                  className="w-16 h-16 rounded-full object-cover border border-white/10"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
                  style={{ background: surface.sunken, border: `1px solid ${glassBorder.soft}`, color: accent[300] }}
                >
                  {profile?.name?.[0] || profile?.username?.[0] || "?"}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h2 style={{ fontFamily: fontHeading, fontSize: 18, color: text.bright, margin: 0 }}>
                    {profile?.name || profile?.username || "Threads User"}
                  </h2>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: profile?.is_private_profile ? `${warning[400]}22` : `${success[400]}22`,
                      color: profile?.is_private_profile ? warning[300] : success[300],
                      border: `1px solid ${profile?.is_private_profile ? `${warning[400]}44` : `${success[400]}44`}`,
                    }}
                  >
                    {profile?.is_private_profile ? "Private Account" : "Public Profile"}
                  </span>
                </div>

                {profile?.username && (
                  <span style={{ fontFamily: fontMono, fontSize: 13, color: cream(0.6) }}>
                    @{profile.username}
                  </span>
                )}

                {profile?.biography && (
                  <p className="text-sm mt-2 max-w-xl leading-relaxed" style={{ color: text.cream }}>
                    {profile.biography}
                  </p>
                )}

                {profile?.last_synced && (
                  <span className="text-xs mt-2" style={{ color: cream(0.4) }}>
                    Last synced: {formatDate(profile.last_synced)}
                  </span>
                )}
              </div>
            </div>

            <div>
              <OutlineButton onClick={handleSync} busy={syncing} icon={RefreshCw}>
                Sync Profile
              </OutlineButton>
            </div>
          </div>
        </GlassPanel>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Profile Health Score */}
      <div style={entrance(0.08)}>
        <GlassPanel style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={Sparkles}>Profile Health ({health.score || 0}/100)</PanelEyebrow>
          <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden mt-3">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${health.score || 0}%`,
                background: health.score >= 80 ? success[400] : health.score >= 50 ? warning[400] : accent[400],
              }}
            />
          </div>

          {health.suggestions?.length > 0 && (
            <div className="flex flex-col mt-4 gap-2">
              <span style={{ fontSize: 13, color: cream(0.5) }}>Suggestions to complete profile:</span>
              {health.suggestions.map((s, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm" style={{ color: text.cream }}>
                  <StatusDot color={accent[400]} />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      {/* Change History Timeline */}
      <div style={entrance(0.14)}>
        <GlassPanel style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow icon={History}>Detected Changes History ({history.length})</PanelEyebrow>
          {history.length === 0 ? (
            <EmptyState>No changes recorded yet. Snapshots are recorded when profile details update.</EmptyState>
          ) : (
            <div className="flex flex-col mt-3 divide-y divide-white/5">
              {history.map((change, idx) => (
                <div key={idx} className="py-3 flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span style={{ fontFamily: fontHeading, fontWeight: 600, fontSize: 14, color: text.bright }}>
                      {change.field.replace("_", " ").toUpperCase()}
                    </span>
                    <span className="text-xs" style={{ color: cream(0.5) }}>
                      Previous: <span className="line-through">{change.old_value || "(empty)"}</span> → New: <strong style={{ color: text.cream }}>{change.new_value}</strong>
                    </span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: cream(0.4) }}>
                    {formatDate(change.detected_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
