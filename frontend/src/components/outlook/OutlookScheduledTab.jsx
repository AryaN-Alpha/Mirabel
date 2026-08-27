import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cancelOutlookScheduled, getOutlookScheduled } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, EmptyState, ErrorNote } from "../homeWidgets";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_COLOR = {
  pending: "#f0c9a2",
  sent: "#8fd6a8",
  failed: "rgba(224,140,140,0.95)",
};

export default function OutlookScheduledTab() {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    getOutlookScheduled()
      .then((data) => {
        if (!cancelled) setItems(data.scheduled);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, "Couldn't load scheduled emails."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  async function handleCancel(id) {
    setCancellingId(id);
    try {
      await cancelOutlookScheduled(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't cancel that email."));
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return <p style={{ fontSize: 15, color: cream(0.5) }}>Loading…</p>;
  }

  if (error) {
    return (
      <EmptyState>
        {error}
        <br />
        <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
      </EmptyState>
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyState>
        <Clock size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
        No scheduled emails yet.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start justify-between gap-4"
          style={{ padding: `${space[5] ?? 23}px ${space[3]}px`, borderBottom: `1px solid ${cream(0.09)}` }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base }}>
                {item.subject || "(no subject)"}
              </span>
              <span
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: STATUS_COLOR[item.status] || STATUS_COLOR.pending,
                  whiteSpace: "nowrap",
                }}
              >
                {item.status}
              </span>
            </div>
            <p style={{ fontSize: 13, marginTop: 4, color: cream(0.5) }}>To: {(item.to || []).join(", ")}</p>
            <p style={{ fontSize: 13, marginTop: 2, color: cream(0.45), fontVariantNumeric: "tabular-nums" }}>
              {formatDate(item.send_at)}
            </p>
            {item.status === "failed" && item.error_message && <ErrorNote>{item.error_message}</ErrorNote>}
          </div>
          {item.status === "pending" && (
            <GhostLink danger disabled={cancellingId === item.id} onClick={() => handleCancel(item.id)}>
              {cancellingId === item.id ? "Cancelling…" : "Cancel"}
            </GhostLink>
          )}
        </div>
      ))}
    </div>
  );
}
