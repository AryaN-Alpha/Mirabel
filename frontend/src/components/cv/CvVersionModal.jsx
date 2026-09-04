import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space } from "../homeTheme";
import { ModalShell, OutlineButton, ErrorNote } from "../homeWidgets";
import { fieldStyle } from "./cvFieldStyle";

export default function CvVersionModal({ cv, onClose, onSave }) {
  const isEdit = Boolean(cv?.id);
  const [name, setName] = useState(cv?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim() });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that CV."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} maxWidth={420} busy={saving}>
      <p style={{ fontFamily: fontHeading, fontSize: 20, color: text.bright }}>{isEdit ? "Rename CV" : "New CV"}</p>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="CV name (e.g. Backend-focused)"
        maxLength={200}
        autoFocus
        style={fieldStyle}
      />

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: space[2] }}>
        <OutlineButton onClick={handleSave} disabled={!name.trim() || saving}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? "Save changes" : "Create CV"}
        </OutlineButton>
      </div>
    </ModalShell>
  );
}
