import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle } from "../KanbanPage";

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,12,10,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-3xl p-6 flex flex-col gap-3.5"
        style={{
          background: "linear-gradient(165deg, rgba(46,30,26,0.98), rgba(30,19,17,0.98))",
          border: "1px solid rgba(243,233,226,0.12)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-[15px]" style={{ color: "#f7ece4" }}>
            {isEdit ? "Rename project" : "New project"}
          </p>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer" style={{ color: "rgba(243,233,226,0.5)" }}>
            <X size={18} />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          maxLength={200}
          autoFocus
          className="w-full px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={3}
          className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
          style={inputStyle}
        />

        {error && (
          <p className="text-[12px]" style={{ color: "rgba(224,140,140,0.9)" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="w-full py-3 rounded-full text-[13px] tracking-[0.02em] border-none cursor-pointer transition-opacity duration-200 flex items-center justify-center gap-2"
          style={{
            background: "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))",
            color: "#2c1c16",
            opacity: !name.trim() || saving ? 0.5 : 1,
          }}
        >
          {saving && <Loader2 size={13} className="animate-spin" />}
          {isEdit ? "Save changes" : "Create project"}
        </button>
      </div>
    </div>
  );
}
