import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../KanbanPage";
import CustomSelect from "../common/CustomSelect";

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];
const PRIORITY_OPTIONS = [
  { value: "High", label: "High Priority", badge: "High", badgeColor: { bg: "rgba(224,140,140,0.25)", fg: "#e0a0a0" } },
  { value: "Medium", label: "Medium Priority", badge: "Med", badgeColor: { bg: "rgba(230,190,120,0.25)", fg: "#e6be78" } },
  { value: "Low", label: "Low Priority", badge: "Low", badgeColor: { bg: "rgba(140,190,160,0.25)", fg: "#8cbea0" } },
];
const EFFORT_OPTIONS = [
  { value: "High", label: "High Effort", badge: "High", badgeColor: { bg: "rgba(224,140,140,0.25)", fg: "#e0a0a0" } },
  { value: "Medium", label: "Medium Effort", badge: "Med", badgeColor: { bg: "rgba(230,190,120,0.25)", fg: "#e6be78" } },
  { value: "Low", label: "Low Effort", badge: "Low", badgeColor: { bg: "rgba(140,190,160,0.25)", fg: "#8cbea0" } },
];

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,12,10,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-3xl p-6 flex flex-col gap-3.5"
        style={{
          background: "linear-gradient(165deg, rgba(46,30,26,0.98), rgba(30,19,17,0.98))",
          border: "1px solid rgba(243,233,226,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {isEdit ? "Edit card" : "New card"}
          </p>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer" style={{ color: "rgba(243,233,226,0.5)" }}>
            <X size={18} />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          maxLength={200}
          className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (Markdown supported)"
          rows={5}
          className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
          style={inputStyle}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5 text-[11px]" style={{ color: "rgba(243,233,226,0.6)" }}>
            <span>Status</span>
            <CustomSelect
              options={STATUS_OPTIONS}
              value={status}
              onChange={(val) => setStatus(val)}
              variant="input"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]" style={{ color: "rgba(243,233,226,0.6)" }}>
            <span>Due date</span>
            <input
              type="date"
              value={dueDate || ""}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-[13px] outline-none transition-all duration-200"
              style={{
                ...inputStyle,
                background: "rgba(34, 23, 20, 0.72)",
                border: "1px solid rgba(240, 168, 120, 0.22)",
                color: "#f7ece4",
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]" style={{ color: "rgba(243,233,226,0.6)" }}>
            <span>Priority</span>
            <CustomSelect
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={(val) => setPriority(val)}
              variant="input"
              size="md"
            />
          </div>
          <div className="flex flex-col gap-1.5 text-[11px]" style={{ color: "rgba(243,233,226,0.6)" }}>
            <span>Effort</span>
            <CustomSelect
              options={EFFORT_OPTIONS}
              value={effort}
              onChange={(val) => setEffort(val)}
              variant="input"
              size="md"
            />
          </div>
        </div>

        {error && (
          <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="w-full py-3 rounded-full text-[13px] tracking-[0.02em] border-none cursor-pointer transition-opacity duration-200 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
            color: "#2c1c16",
            opacity: !title.trim() || saving ? 0.5 : 1,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? "Save changes" : "Add card"}
        </button>
      </div>
    </div>
  );
}
