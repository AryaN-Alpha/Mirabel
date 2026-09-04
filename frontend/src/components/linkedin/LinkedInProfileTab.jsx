import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, User } from "lucide-react";
import { getLinkedInProfile, getLinkedInProfileHistory, syncLinkedInProfile } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, accent, warning, danger, space, cream, glassBorder } from "../homeTheme";
import { EmptyState, ErrorNote, SuccessNote, GhostLink, GlassPanel, PanelEyebrow } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PRIORITY_COLOR = {
  HIGH: danger[400],
  MEDIUM: warning[400],
  LOW: cream(0.5),
};

export default function LinkedInProfileTab({ status }) {
  const [health, setHealth] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [profileData, historyData] = await Promise.all([getLinkedInProfile(), getLinkedInProfileHistory()]);
      setHealth(profileData.health);
      setLastSynced(profileData.profile?.last_synced);
      setHistory(historyData.changes || []);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load profile health."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncNote("");
    setError("");
    try {
      const result = await syncLinkedInProfile();
      setSyncNote(result.changed ? `${result.changes.length} change(s) detected.` : "No changes since last sync.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't sync LinkedIn profile."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: space[6] }}>
      <div style={entrance(0)}>
        <GlassPanel elevated float={1} delay={-1.6} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-center flex-wrap" style={{ gap: space[5] }}>
            <div
              className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
              style={{ width: 64, height: 64, background: cream(0.07), border: `1px solid ${glassBorder.medium}` }}
            >
              {status?.picture_url ? (
                <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={24} strokeWidth={1.6} style={{ color: cream(0.4) }} />
              )}
            </div>
            <div className="min-w-0" style={{ flex: 1 }}>
              <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 26, color: text.bright }}>
                {status?.name || "—"}
              </p>
              <p className="truncate" style={{ fontSize: 14, marginTop: 3, color: cream(0.55) }}>
                {status?.email || "—"}
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: space[6],
              paddingTop: space[5],
              borderTop: `1px solid ${glassBorder.soft}`,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: space[4],
            }}
          >
            <Row label="Member URN" value={status?.member_urn || "—"} mono />
            <Row label="Scopes granted" value={status?.scope || "—"} />
            <Row label="Token expires" value={formatDate(status?.token_expires_at) || "—"} />
            <Row label="Last synchronized" value={formatDate(lastSynced) || "not yet synced"} />
          </div>

          <p style={{ fontSize: 12, marginTop: space[5], lineHeight: 1.7, color: cream(0.35) }}>
            Headline isn't shown here — LinkedIn's Sign In with OpenID Connect scopes (openid, profile, email) don't
            expose it; that requires a separate partner-approved product.
          </p>
        </GlassPanel>
      </div>

      <div style={entrance(0.08)}>
        <GlassPanel float={2} delay={-3.1} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <div className="flex items-center justify-between" style={{ marginBottom: space[4] }}>
            <PanelEyebrow>Profile health</PanelEyebrow>
            <GhostLink onClick={handleSync} disabled={syncing} muted style={{ fontSize: 13 }}>
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} strokeWidth={1.8} />}
              {syncing ? "Syncing…" : "Sync now"}
            </GhostLink>
          </div>

          {syncNote && <SuccessNote>{syncNote}</SuccessNote>}
          <ErrorNote>{error}</ErrorNote>

          {loading ? (
            <div className="flex items-center" style={{ gap: space[2], marginTop: space[4], color: cream(0.4) }}>
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : (
            health && (
              <div>
                <div className="flex items-baseline gap-3" style={{ marginTop: space[2] }}>
                  <span style={{ fontFamily: fontHeading, fontSize: 40, color: text.bright }}>{health.score}</span>
                  <span style={{ fontSize: 14, color: cream(0.5) }}>/ 100</span>
                </div>

                {health.recommendations.length > 0 ? (
                  <div className="flex flex-col" style={{ marginTop: space[5], gap: space[4] }}>
                    {health.recommendations.map((rec) => (
                      <div
                        key={rec.field}
                        style={{
                          borderLeft: `2px solid ${PRIORITY_COLOR[rec.priority] || accent[400]}`,
                          paddingLeft: space[4],
                          padding: `${space[2]}px ${space[4]}px`,
                        }}
                      >
                        <div className="flex items-center justify-between flex-wrap" style={{ gap: space[2] }}>
                          <span style={{ fontFamily: fontHeading, fontSize: 17, color: text.base, textTransform: "capitalize" }}>
                            {rec.field.replace("_", " ")}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: PRIORITY_COLOR[rec.priority] || cream(0.5),
                            }}
                          >
                            {rec.priority}
                          </span>
                        </div>
                        <p style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.6, color: cream(0.65) }}>{rec.issue}</p>
                        <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: cream(0.45) }}>
                          Why it matters: {rec.why_it_matters}
                        </p>
                        <p style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: cream(0.45) }}>{rec.recommendation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13.5, marginTop: space[4], color: cream(0.55) }}>
                    Every field this integration can see is filled in.
                  </p>
                )}

                <p style={{ fontSize: 11.5, marginTop: space[5], lineHeight: 1.6, color: cream(0.32) }}>
                  {health.unscored_fields_note}
                </p>
              </div>
            )
          )}
        </GlassPanel>
      </div>

      <div style={entrance(0.14)}>
        <GlassPanel float={3} delay={-5.2} style={{ padding: `${space[6]}px ${space[7]}px` }}>
          <PanelEyebrow>Profile history</PanelEyebrow>

          {!loading && history && (
            history.length === 0 ? (
              <EmptyState>No profile changes detected yet — sync periodically or wait for the Profile Sync automation.</EmptyState>
            ) : (
              <div className="flex flex-col">
                {history.map((change, i) => (
                  <div key={i} style={{ padding: `${space[3]}px 0`, borderBottom: `1px solid ${cream(0.08)}` }}>
                    <div className="flex items-center justify-between flex-wrap" style={{ gap: space[2] }}>
                      <span style={{ fontSize: 14, color: text.base, textTransform: "capitalize" }}>
                        {change.field.replace("_", " ")} changed
                      </span>
                      <span style={{ fontFamily: fontMono, fontSize: 12, color: cream(0.4) }}>{formatDate(change.detected_at)}</span>
                    </div>
                    <p style={{ fontSize: 12.5, marginTop: 4, color: cream(0.45) }}>
                      {change.old_value || "(empty)"} → {change.new_value || "(empty)"}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.4) }}>{label}</div>
      <div
        className={`truncate ${mono ? "font-mono" : ""}`}
        style={{ fontSize: 14, marginTop: 3, color: text.cream }}
      >
        {value}
      </div>
    </div>
  );
}
