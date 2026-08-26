import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";

export default function ConfirmDialog({ title, message, confirmLabel = "Delete", onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't complete that action."));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,12,10,0.6)" }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-[380px] rounded-3xl p-6 flex flex-col gap-4"
        style={{
          background: "linear-gradient(165deg, rgba(46,30,26,0.98), rgba(30,19,17,0.98))",
          border: "1px solid rgba(243,233,226,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {title}
          </p>
          <p className="text-[13px] leading-snug" style={{ color: "rgba(243,233,226,0.55)" }}>
            {message}
          </p>
        </div>

        {error && (
          <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-full text-[13px] border-none cursor-pointer"
            style={{ background: "rgba(243,233,226,0.08)", color: "#f3e9e2", opacity: busy ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex-1 py-2.5 rounded-full text-[13px] border-none cursor-pointer flex items-center justify-center gap-2"
            style={{ background: "rgba(224,90,90,0.85)", color: "#fff5f5", opacity: busy ? 0.6 : 1 }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
