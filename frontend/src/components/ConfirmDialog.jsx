import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../utils/errors";
import { space, cream } from "./homeTheme";
import { ModalShell, OutlineButton, GhostLink, ErrorNote } from "./homeWidgets";

// Generic confirm/delete dialog — portalled to document.body so the fixed
// backdrop always covers the full viewport even when rendered inside an
// ancestor that has a CSS transform/animation (which would otherwise create a
// new stacking context and trap `position:fixed` children).
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

  return createPortal(
    <ModalShell onClose={onCancel} maxWidth={380} busy={busy}>
      <div className="flex flex-col" style={{ gap: space[2] }}>
        <p style={{ fontSize: 17, fontFamily: "inherit", color: "#f7ece4" }}>{title}</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, color: cream(0.55) }}>{message}</p>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center justify-end" style={{ gap: space[5] ?? 23, marginTop: space[2] }}>
        <GhostLink onClick={onCancel} disabled={busy} muted>
          Cancel
        </GhostLink>
        <OutlineButton onClick={handleConfirm} disabled={busy} danger>
          {busy && <Loader2 size={13} className="animate-spin" />}
          {confirmLabel}
        </OutlineButton>
      </div>
    </ModalShell>,
    document.body,
  );
}
