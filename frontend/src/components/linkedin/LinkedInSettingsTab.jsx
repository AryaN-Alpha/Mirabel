import { useState } from "react";
import { disconnectLinkedIn, linkedinConnectUrl } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { text, space, cream } from "../homeTheme";
import { labelStyle, GhostLink, OutlineButton, ErrorNote } from "../homeWidgets";

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
    <div style={{ maxWidth: 560 }}>
      <div style={{ ...labelStyle, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}>
        Connection
      </div>
      <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
        <Row label="Connected" value={status?.connected ? "Yes" : "No"} />
        <Row label="Connection expired" value={status?.expired ? "Yes — reconnect to continue" : "No"} />
        <Row label="Scopes granted" value={status?.scope || "—"} />
        <Row label="Token expires" value={formatDate(status?.token_expires_at)} />
        <Row
          label="Refresh-token support"
          value={status?.refresh_token_supported ? "Enabled" : "Off (standard tier — reconnect on expiry)"}
        />
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: space[6] }}>
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

      <p style={{ fontSize: 12, marginTop: space[6], lineHeight: 1.7, color: cream(0.35) }}>
        Standard self-serve LinkedIn apps don't get refresh tokens — that's a partner-only program. Access tokens
        last about 60 days; when one expires, reconnect here rather than waiting on an automatic refresh.
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 13, color: cream(0.5) }}>{label}</span>
      <span className="text-right" style={{ fontSize: 13.5, color: text.cream }}>
        {value}
      </span>
    </div>
  );
}
