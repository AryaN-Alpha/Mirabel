import { useState } from "react";
import { disconnectClassroom, classroomConnectUrl } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";

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
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: "rgba(243,233,226,0.03)" }}>
        <Row label="Connected" value={status?.connected ? "Yes" : "No"} />
        <Row label="Connection expired" value={status?.expired ? "Yes — reconnect to continue" : "No"} />
        <Row label="Google account" value={status?.email || "—"} />
        <Row label="Scopes granted" value={status?.scope || "—"} />
        <Row label="Token expires" value={formatDate(status?.token_expires_at)} />
      </div>

      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {status?.connected ? (
          <button
            onClick={handleDisconnect}
            disabled={busy}
            className="px-4 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
            style={{ background: "transparent", color: "rgba(224,140,140,0.85)", opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        ) : (
          <a
            href={classroomConnectUrl()}
            className="px-5 py-2.5 rounded-full text-[13px] no-underline"
            style={{
              background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
              color: "#2c1c16",
            }}
          >
            Connect Google Classroom
          </a>
        )}
      </div>

      <p className="text-[11px] px-1" style={{ color: "rgba(243,233,226,0.35)" }}>
        Reading the text of attached handout documents uses a broad Drive
        read scope — see the README for exactly what's granted. Turning in an
        assignment always requires an explicit confirm from the Drafts tab;
        nothing is ever submitted automatically.
      </p>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px]" style={{ color: "rgba(243,233,226,0.45)" }}>
        {label}
      </span>
      <span className="text-[12.5px] text-right" style={{ color: "#f3e9e2" }}>
        {value}
      </span>
    </div>
  );
}
