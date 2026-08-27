import { useState } from "react";
import { Loader2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { fontHeading, text, space, cream } from "../homeTheme";
import { GhostLink, OutlineButton, ErrorNote, ModalShell, underlineInputStyle, underlineSelectStyle } from "../homeWidgets";

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const EFFORT_OPTIONS = ["High", "Medium", "Low"];

export default function TaskModal({ task, defaultStatus, onClose, onSave }) {
  const isEdit = Boolean(task.id);
  const [title, setTitle] = useState(task.title || "");
  const [description, setDescription] = useState(task.description_markdown || "");
  const [status, setStatus] = useState(task.status || defaultStatus);
  const [priority, setPriority] = useState(task.priority || "Medium");
  const [effort, setEffort] = useState(task.effort || "Medium");
  const [dueDate, setDueDate] = useState(task.due_date || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      await onSave({
        title: title.trim(),
        description_markdown: description,
        status,
        priority,
        effort,
        due_date: dueDate || null,
      });
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save that card."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell onClose={onClose} busy={saving} maxWidth={520}>
      <div className="flex items-center justify-between">
        <span style={{ fontFamily: fontHeading, fontSize: 22, color: text.bright }}>{isEdit ? "Edit card" : "New card"}</span>
        <GhostLink onClick={onClose} muted style={{ fontSize: 14 }}>
          ✕
        </GhostLink>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        maxLength={200}
        style={underlineInputStyle}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (Markdown supported)"
        rows={4}
        className="w-full resize-y"
        style={underlineInputStyle}
      />

      <div className="grid grid-cols-2" style={{ gap: space[4] }}>
        <label className="flex flex-col" style={{ gap: space[2] }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.45) }}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={underlineSelectStyle}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col" style={{ gap: space[2] }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.45) }}>Due date</span>
          <input
            type="date"
            value={dueDate || ""}
            onChange={(e) => setDueDate(e.target.value)}
            style={{ ...underlineInputStyle, colorScheme: "dark" }}
          />
        </label>
        <label className="flex flex-col" style={{ gap: space[2] }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.45) }}>Priority</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={underlineSelectStyle}>
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col" style={{ gap: space[2] }}>
          <span style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: cream(0.45) }}>Effort</span>
          <select value={effort} onChange={(e) => setEffort(e.target.value)} style={underlineSelectStyle}>
            {EFFORT_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex items-center" style={{ gap: space[4] }}>
        <OutlineButton onClick={handleSave} disabled={!title.trim() || saving}>
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? "Save changes" : "Add card"}
        </OutlineButton>
      </div>
    </ModalShell>
  );
}
