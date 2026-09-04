import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, surface, glassBorder, radius, motion } from "../homeTheme";
import { GhostLink, OutlineButton, ErrorNote, ModalShell } from "../homeWidgets";

// Sunken glass field — same recipe as AIModelPage's `fieldStyle`.
const fieldStyle = {
  width: "100%",
  padding: `${space[3]}px ${space[4]}px`,
  background: surface.sunken,
  border: `1px solid ${glassBorder.soft}`,
  borderRadius: radius.md,
  color: text.cream,
  fontSize: 15,
  outline: "none",
  transition: `border-color ${motion.hover}, background ${motion.hover}`,
};

export default function ProjectModal({ project, onClose, onSave }) {
  const isEdit = Boolean(project?.id);
  const [name, setName] = useState(project?.name || "");
  const [description, setDescription] = useState(project?.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), description });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that project."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} busy={saving}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: fontHeading, fontSize: 22, color: text.bright }}>
          {isEdit ? "Rename project" : "New project"}
        </span>
        <GhostLink onClick={onClose} muted style={{ fontSize: 14 }}>
          ✕
        </GhostLink>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        maxLength={200}
        autoFocus
        style={fieldStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={3}
        className="w-full resize-y"
        style={fieldStyle}
      />

      <ErrorNote>{error}</ErrorNote>

      <div style={{ marginTop: space[2] }}>
        <OutlineButton onClick={handleSave} disabled={!name.trim() || saving}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? "Save changes" : "Create project"}
        </OutlineButton>
      </div>
    </ModalShell>
  );
}
