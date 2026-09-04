import { useState } from "react";
import { Settings, ShieldCheck } from "lucide-react";
import { disconnectLinkedIn, linkedinConnectUrl } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontMono, text, success, danger, space, cream, glassBorder } from "../homeTheme";
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

export default function LinkedInSettingsTab({ status, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectLinkedIn();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={entrance(0)}>
      <GlassPanel elevated float={1} delay={-2.4} style={{ padding: `${space[6]}px ${space[7]}px`, maxWidth: 640 }}>
        <PanelEyebrow icon={Settings}>Connection</PanelEyebrow>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: space[4],
          }}
        >
          <Row
            label="Connected"
            value={
              <span className="flex items-center" style={{ gap: 6 }}>
                <StatusDot color={status?.connected ? success[400] : cream(0.3)} />
                {status?.connected ? "Yes" : "No"}
              </span>
            }
          />
          <Row
            label="Connection expired"
            value={status?.expired ? "Yes — reconnect to continue" : "No"}
            valueColor={status?.expired ? danger[300] : undefined}
          />
          <Row label="Scopes granted" value={status?.scope || "—"} />
          <Row label="Token expires" value={formatDate(status?.token_expires_at)} mono />
          <Row
            label="Refresh-token support"
            value={status?.refresh_token_supported ? "Enabled" : "Off (standard tier — reconnect on expiry)"}
          />
        </div>

        <ErrorNote>{error}</ErrorNote>

        <div style={{ marginTop: space[6], paddingTop: space[5], borderTop: `1px solid ${glassBorder.soft}` }}>
          {status?.connected ? (
            <GhostLink onClick={handleDisconnect} disabled={busy} danger>
              {busy ? "Disconnecting…" : "Disconnect"}
            </GhostLink>
          ) : (
            <OutlineButton onClick={() => (window.location.href = linkedinConnectUrl())}>
              Connect with LinkedIn
            </OutlineButton>
          )}
        </div>

        <div className="flex items-start" style={{ gap: space[2], marginTop: space[6] }}>
          <ShieldCheck size={14} strokeWidth={1.6} style={{ color: cream(0.35), marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, lineHeight: 1.7, color: cream(0.4), margin: 0 }}>
            Standard self-serve LinkedIn apps don't get refresh tokens — that's a partner-only program. Access tokens
            last about 60 days; when one expires, reconnect here rather than waiting on an automatic refresh.
          </p>
        </div>
      </GlassPanel>
    </div>
  );
}

function Row({ label, value, mono, valueColor }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.4) }}>{label}</div>
      <div
        style={{
          fontFamily: mono ? fontMono : undefined,
          fontSize: 14,
          marginTop: 3,
          color: valueColor ?? text.cream,
        }}
      >
        {value}
      </div>
    </div>
  );
}
