import { useEffect, useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { cancelOutlookScheduled, getOutlookScheduled } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_STYLE = {
  pending: { background: "rgba(240,201,162,0.14)", color: "#f0c9a2" },
  sent: { background: "rgba(120,200,150,0.14)", color: "#8fd6a8" },
  failed: { background: "rgba(224,140,140,0.14)", color: "rgba(224,140,140,0.95)" },
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
    return (
      <div className="flex items-center justify-center py-16" style={{ color: "rgba(243,233,226,0.5)" }}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-[13px]" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
        <button
          onClick={() => setReloadToken((n) => n + 1)}
          className="px-4 py-2 rounded-full text-[13px] border-none cursor-pointer"
          style={{ background: "rgba(243,233,226,0.1)", color: "#f3e9e2" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-14 text-center">
        <Clock size={22} strokeWidth={1.6} style={{ color: "rgba(243,233,226,0.3)" }} />
        <p className="text-[13px]" style={{ color: "rgba(243,233,226,0.45)" }}>
          No scheduled emails yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 px-4 py-3.5 rounded-2xl"
          style={{ background: "rgba(243,233,226,0.03)" }}
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-0.5">
              <p className="text-[13.5px] truncate" style={{ color: "#f3e9e2" }}>
                {item.subject || "(no subject)"}
              </p>
              <span
                className="text-[11px] shrink-0 px-2 py-0.5 rounded-full"
                style={STATUS_STYLE[item.status] || STATUS_STYLE.pending}
              >
                {item.status}
              </span>
            </div>
            <p className="text-[12px] truncate mb-0.5" style={{ color: "rgba(243,233,226,0.5)" }}>
              To: {(item.to || []).join(", ")}
            </p>
            <p className="text-[12px]" style={{ color: "rgba(243,233,226,0.45)" }}>
              {formatDate(item.send_at)}
            </p>
            {item.status === "failed" && item.error_message && (
              <p className="text-[12px] mt-1" style={{ color: "rgba(224,140,140,0.85)" }}>
                {item.error_message}
              </p>
            )}
          </div>
          {item.status === "pending" && (
            <button
              onClick={() => handleCancel(item.id)}
              disabled={cancellingId === item.id}
              className="shrink-0 px-3.5 py-2 rounded-full text-[12px] border-none cursor-pointer"
              style={{
                background: "transparent",
                color: "rgba(224,140,140,0.85)",
                opacity: cancellingId === item.id ? 0.5 : 1,
              }}
            >
              {cancellingId === item.id ? "Cancelling…" : "Cancel"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
