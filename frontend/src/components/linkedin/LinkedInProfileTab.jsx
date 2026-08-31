import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getLinkedInProfile, getLinkedInProfileHistory, syncLinkedInProfile } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { labelStyle, EmptyState, ErrorNote, GhostLink } from "../homeWidgets";

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
  HIGH: "rgba(224,140,140,0.95)",
  MEDIUM: "#f0c9a2",
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
    <div style={{ maxWidth: 640 }}>
      <div className="flex items-center" style={{ gap: space[5] ?? 23 }}>
        <div
          className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
          style={{ width: 64, height: 64, background: cream(0.07) }}
        >
          {status?.picture_url ? (
            <img src={status.picture_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontFamily: fontHeading, fontSize: 24, color: cream(0.4) }}>
              {status?.name?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate" style={{ fontFamily: fontHeading, fontSize: 24, color: text.bright }}>
            {status?.name || "—"}
          </p>
          <p className="truncate" style={{ fontSize: 14, marginTop: 2, color: cream(0.55) }}>
            {status?.email || "—"}
          </p>
        </div>
      </div>

      <div style={{ marginTop: space[8] * 0.9 }}>
        <div style={{ ...labelStyle, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}>Details</div>
        <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
          <Row label="Member URN" value={status?.member_urn || "—"} mono />
          <Row label="Scopes granted" value={status?.scope || "—"} />
          <Row label="Token expires" value={formatDate(status?.token_expires_at) || "—"} />
          <Row label="Last synchronized" value={formatDate(lastSynced) || "not yet synced"} />
        </div>
      </div>

      <p style={{ fontSize: 12, marginTop: space[6], lineHeight: 1.7, color: cream(0.35) }}>
        Headline isn't shown here — LinkedIn's Sign In with OpenID Connect scopes (openid, profile, email) don't
        expose it; that requires a separate partner-approved product.
      </p>

      <div
        className="flex items-center justify-between"
        style={{ marginTop: space[8] * 0.9, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}
      >
        <div style={labelStyle}>Profile health</div>
        <GhostLink onClick={handleSync} disabled={syncing} muted style={{ fontSize: 13 }}>
          {syncing ? "Syncing…" : "Sync now"}
        </GhostLink>
      </div>

      {syncNote && <p style={{ fontSize: 12, marginTop: space[2], color: "#8fd6a8" }}>{syncNote}</p>}
      <ErrorNote>{error}</ErrorNote>

      {loading ? (
        <div className="flex items-center" style={{ gap: space[2], marginTop: space[4], color: cream(0.4) }}>
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        health && (
          <div style={{ marginTop: space[4] }}>
            <div className="flex items-baseline gap-3">
              <span style={{ fontFamily: fontHeading, fontSize: 36, color: text.bright }}>{health.score}</span>
              <span style={{ fontSize: 14, color: cream(0.5) }}>/ 100</span>
            </div>

            {health.recommendations.length > 0 ? (
              <div className="flex flex-col" style={{ marginTop: space[4], gap: space[4] }}>
                {health.recommendations.map((rec) => (
                  <div key={rec.field} style={{ borderLeft: `2px solid ${PRIORITY_COLOR[rec.priority] || accent[400]}`, paddingLeft: space[3] }}>
                    <div className="flex items-center justify-between">
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
                    <p style={{ fontSize: 13.5, marginTop: 4, color: cream(0.65) }}>{rec.issue}</p>
                    <p style={{ fontSize: 12.5, marginTop: 3, color: cream(0.45) }}>Why it matters: {rec.why_it_matters}</p>
                    <p style={{ fontSize: 12.5, marginTop: 3, color: cream(0.45) }}>{rec.recommendation}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 13.5, marginTop: space[3], color: cream(0.55) }}>
                Every field this integration can see is filled in.
              </p>
            )}

            <p style={{ fontSize: 11.5, marginTop: space[5], lineHeight: 1.6, color: cream(0.32) }}>
              {health.unscored_fields_note}
            </p>
          </div>
        )
      )}

      <div
        style={{
          marginTop: space[8] * 0.9,
          paddingBottom: space[2],
          borderBottom: `1px solid ${cream(0.14)}`,
          ...labelStyle,
        }}
      >
        Profile history
      </div>

      {!loading && history && (
        history.length === 0 ? (
          <EmptyState>No profile changes detected yet — sync periodically or wait for the Profile Sync automation.</EmptyState>
        ) : (
          <div className="flex flex-col" style={{ marginTop: space[3] }}>
            {history.map((change, i) => (
              <div
                key={i}
                style={{ padding: `${space[3]}px 0`, borderBottom: `1px solid ${cream(0.08)}` }}
              >
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 14, color: text.base, textTransform: "capitalize" }}>
                    {change.field.replace("_", " ")} changed
                  </span>
                  <span style={{ fontSize: 12, color: cream(0.4) }}>{formatDate(change.detected_at)}</span>
                </div>
                <p style={{ fontSize: 12.5, marginTop: 3, color: cream(0.45) }}>
                  {change.old_value || "(empty)"} → {change.new_value || "(empty)"}
                </p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 13, color: cream(0.5) }}>{label}</span>
      <span
        className={`truncate ${mono ? "font-mono" : ""}`}
        style={{ fontSize: 13.5, maxWidth: "60%", color: text.cream }}
      >
        {value}
      </span>
    </div>
  );
}
