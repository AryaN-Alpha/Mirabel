import { useState } from "react";
import { AlertCircle, ExternalLink, Settings, ShieldCheck } from "lucide-react";
import { disconnectThreads, threadsConnectUrl } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontMono, text, success, danger, warning, space, cream, glassBorder, surface, radius } from "../homeTheme";
import { ErrorNote, GhostLink, GlassPanel, OutlineButton, PanelEyebrow, StatusDot } from "../homeWidgets";

const entrance = (delay) => ({ animation: `home-rise 0.9s cubic-bezier(.2,.7,.2,1) ${delay}s both` });

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ThreadsSettingsTab({ status, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectThreads();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  const isPrivate = status?.is_private_profile;
  const needsReauth = status?.needs_reauth;

  return (
    <div style={entrance(0)} className="flex flex-col gap-6 max-w-2xl">
      {/* Reconnect Banner */}
      {status?.connected && needsReauth && (
        <div
          className="p-4 rounded-xl flex items-start gap-3"
          style={{
            background: `${warning[400]}18`,
            border: `1px solid ${warning[400]}44`,
            color: warning[300],
          }}
        >
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">Manual Reconnection Required</span>
            <span className="text-xs leading-relaxed" style={{ color: cream(0.7) }}>
              {isPrivate
                ? "This Threads account has a private profile. Meta requires manual re-authorization every 90 days for private accounts (silent refresh is not supported)."
                : "Your connection requires re-authorization. Please reconnect to restore publishing access."}
            </span>
            <div className="mt-2">
              <OutlineButton onClick={() => (window.location.href = threadsConnectUrl())} accent size="sm">
                Reconnect Threads Account
              </OutlineButton>
            </div>
          </div>
        </div>
      )}

      {/* Connection Info */}
      <GlassPanel elevated float={1} delay={-2.4} style={{ padding: `${space[6]}px ${space[7]}px` }}>
        <PanelEyebrow icon={Settings}>Connection Details</PanelEyebrow>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Row
            label="Connection Status"
            value={
              <span className="flex items-center gap-1.5">
                <StatusDot color={status?.connected ? success[400] : cream(0.3)} />
                {status?.connected ? "Connected" : "Not connected"}
              </span>
            }
          />
          <Row label="Account Type" value={isPrivate ? "Private Profile" : "Public Profile"} />
          <Row label="Threads User ID" value={status?.threads_user_id || "—"} mono />
          <Row label="Handle" value={status?.username ? `@${status.username}` : "—"} />
          <Row label="Long-Lived Token Expiry" value={formatDate(status?.token_expires_at)} mono />
          <Row
            label="90-Day Permission Grant"
            value={formatDate(status?.permission_expires_at)}
            mono
            helper={isPrivate ? "Manual re-auth required every 90d" : "Auto-extended upon token refresh"}
          />
          <Row label="Permissions (Scopes)" value={status?.scope || "threads_basic, threads_content_publish"} />
          <Row
            label="Daily Publishing Quota"
            value={status?.rate_limit ? `${status.rate_limit.quota_usage} / ${status.rate_limit.quota_total} used` : "250 / 24h"}
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center justify-between">
          {status?.connected ? (
            <GhostLink onClick={handleDisconnect} disabled={busy} danger>
              {busy ? "Disconnecting…" : "Disconnect Account"}
            </GhostLink>
          ) : (
            <OutlineButton onClick={() => (window.location.href = threadsConnectUrl())} accent>
              Connect with Threads
            </OutlineButton>
          )}

          {status?.connected && (
            <OutlineButton onClick={() => (window.location.href = threadsConnectUrl())}>
              Switch Account
            </OutlineButton>
          )}
        </div>

        <div className="flex items-start gap-2 mt-6 pt-4 border-t border-white/5">
          <ShieldCheck size={16} style={{ color: cream(0.35), marginTop: 2, shrink: 0 }} />
          <p style={{ fontSize: 12, lineHeight: 1.6, color: cream(0.4), margin: 0 }}>
            Meta Threads access tokens last 60 days and are automatically refreshed by Mirabel's background workers
            when tokens are at least 24 hours old. Tokens are encrypted at rest using AES-256 Fernet.
          </p>
        </div>
      </GlassPanel>

      {/* Meta App Compliance URLs */}
      <GlassPanel style={{ padding: `${space[5]}px ${space[7]}px` }}>
        <PanelEyebrow icon={ShieldCheck}>Meta App Dashboard Compliance URLs</PanelEyebrow>
        <p className="text-xs mt-2 leading-relaxed" style={{ color: cream(0.5) }}>
          To pass Meta App Review, register these endpoints in your Meta Developer App under the Threads Use Case settings:
        </p>
        <div className="flex flex-col gap-2 mt-3 font-mono text-xs" style={{ color: cream(0.7) }}>
          <div className="p-2.5 rounded bg-black/20 border border-white/5 flex flex-col gap-0.5">
            <span className="text-gray-400 font-sans">Deauthorize Callback URL:</span>
            <span className="select-all text-emerald-400">{window.location.origin}/api/threads/deauthorize/</span>
          </div>
          <div className="p-2.5 rounded bg-black/20 border border-white/5 flex flex-col gap-0.5">
            <span className="text-gray-400 font-sans">Data Deletion Requests URL:</span>
            <span className="select-all text-emerald-400">{window.location.origin}/api/threads/data-deletion/</span>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function Row({ label, value, mono, helper }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs" style={{ color: cream(0.42) }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontFamily: mono ? fontMono : undefined, color: text.bright }}>
        {value}
      </span>
      {helper && <span className="text-[11px]" style={{ color: cream(0.35) }}>{helper}</span>}
    </div>
  );
}
