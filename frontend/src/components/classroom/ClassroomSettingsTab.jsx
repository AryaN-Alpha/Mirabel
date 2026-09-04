import { useState } from "react";
import { Settings } from "lucide-react";
import { disconnectClassroom, classroomConnectUrl } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontMono, text, space, cream } from "../homeTheme";
import { labelStyle, GhostLink, OutlineButton, GlassPanel, PanelEyebrow, ErrorNote } from "../homeWidgets";

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

export default function ClassroomSettingsTab({ status, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDisconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectClassroom();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px`, maxWidth: 620 }}>
      <PanelEyebrow icon={Settings}>Settings</PanelEyebrow>
      <div style={{ ...labelStyle, paddingBottom: space[2], borderBottom: `1px solid ${cream(0.14)}` }}>
        Connection
      </div>
      <div className="flex flex-col" style={{ marginTop: space[3], gap: space[3] }}>
        <Row label="Connected" value={status?.connected ? "Yes" : "No"} />
        <Row label="Connection expired" value={status?.expired ? "Yes — reconnect to continue" : "No"} />
        <Row label="Google account" value={status?.email || "—"} />
        <Row label="Scopes granted" value={status?.scope || "—"} />
        <Row label="Token expires" value={formatDate(status?.token_expires_at)} mono />
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: space[6] }}>
        {status?.connected ? (
          <GhostLink onClick={handleDisconnect} disabled={busy} danger>
            {busy ? "Disconnecting…" : "Disconnect"}
          </GhostLink>
        ) : (
          <OutlineButton onClick={() => (window.location.href = classroomConnectUrl())}>
            Connect Google Classroom
          </OutlineButton>
        )}
      </div>

      <p style={{ fontSize: 12, marginTop: space[6], lineHeight: 1.7, color: cream(0.35) }}>
        Reading the text of attached handout documents uses a broad Drive read scope — see the README for exactly
        what's granted. Turning in an assignment always requires an explicit confirm from the Drafts tab; nothing
        is ever submitted automatically.
      </p>
    </GlassPanel>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 13, color: cream(0.5) }}>{label}</span>
      <span
        className="text-right"
        style={{ fontSize: 13.5, color: text.cream, fontFamily: mono ? fontMono : undefined, fontVariantNumeric: mono ? "tabular-nums" : undefined }}
      >
        {value}
      </span>
    </div>
  );
}
