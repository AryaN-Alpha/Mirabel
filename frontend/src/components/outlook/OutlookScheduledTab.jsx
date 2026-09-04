import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { cancelOutlookScheduled, getOutlookScheduled } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, fontMono, text, warning, success, danger, space, radius, cream } from "../homeTheme";
import { GhostLink, GlassPanel, PanelEyebrow, EmptyState, ErrorNote } from "../homeWidgets";

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
  pending: warning[400],
  sent: success[400],
  failed: danger[400],
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

  return (
    <GlassPanel float={2} delay={-2.3} style={{ padding: `${space[6]}px ${space[6]}px` }}>
      <PanelEyebrow icon={Clock}>Scheduled</PanelEyebrow>

      {loading ? (
        <div className="w-full flex items-center justify-center" style={{ padding: `${space[7]}px 0`, color: cream(0.4) }}>
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : error ? (
        <EmptyState>
          {error}
          <br />
          <GhostLink onClick={() => setReloadToken((n) => n + 1)}>Retry</GhostLink>
        </EmptyState>
      ) : !items || items.length === 0 ? (
        <EmptyState>
          <Clock size={22} strokeWidth={1.6} style={{ color: cream(0.3), display: "block", margin: "0 auto 12px" }} />
          No scheduled emails yet.
        </EmptyState>
      ) : (
        <div className="flex flex-col">
          {items.map((item, i) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-4"
              style={{
                padding: `${space[4]}px ${space[3]}px`,
                borderRadius: radius.sm,
                borderBottom: `1px solid ${cream(0.09)}`,
                background: i % 2 === 1 ? cream(0.025) : "transparent",
              }}
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
                <p style={{ fontFamily: fontMono, fontSize: 13, marginTop: 2, color: cream(0.45), fontVariantNumeric: "tabular-nums" }}>
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
      )}
    </GlassPanel>
  );
}
