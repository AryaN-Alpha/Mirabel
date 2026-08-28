import { useEffect, useState } from "react";
import { Bot, Check, Loader2, Send, X } from "lucide-react";

// Theme-agnostic on purpose: this same panel renders inside the Agent tab
// (home theme), text ChatScreen, and VoiceChatScreen — three different
// visual languages — so callers pass a small palette instead of this file
// importing any one screen's theme.
const DEFAULT_PALETTE = {
  text: "rgba(250,242,236,0.92)",
  muted: "rgba(243,233,226,0.55)",
  border: "rgba(243,233,226,0.16)",
  accent: "#f0c9a2",
  danger: "rgba(224,140,140,0.95)",
};

function fieldKind(value) {
  if (Array.isArray(value)) return "list";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string" && (value.length > 80 || value.includes("\n"))) return "textarea";
  return "text";
}

function EditableField({ label, value, onChange, palette }) {
  const kind = fieldKind(value);
  const inputStyle = {
    width: "100%",
    background: "rgba(0,0,0,0.2)",
    border: `1px solid ${palette.border}`,
    borderRadius: 6,
    padding: "8px 10px",
    color: palette.text,
    fontSize: 13.5,
    fontFamily: "inherit",
  };

  return (
    <label
      className="flex flex-col gap-1"
      style={{ fontSize: 11, color: palette.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}
    >
      {label.replace(/_/g, " ")}
      {kind === "textarea" && (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(8, Math.max(3, Math.ceil((value?.length || 1) / 60)))}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      )}
      {kind === "list" && (
        <input
          type="text"
          value={(value || []).join(", ")}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          }
          style={inputStyle}
        />
      )}
      {kind === "boolean" && (
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
      )}
      {kind !== "textarea" && kind !== "list" && kind !== "boolean" && (
        <input
          type={kind === "number" ? "number" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(kind === "number" ? Number(e.target.value) : e.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  );
}

// Renders whatever an AgentTask's current status warrants: a live "what
// she's doing right now" line while running, an editable approval card
// while awaiting_confirmation, or the final result/error once terminal.
// No bubble/card chrome of its own — callers wrap it in their own styling.
export default function AgentTaskPanel({ task, busy, onApprove, onReject, onAnswer, palette = DEFAULT_PALETTE }) {
  const [edited, setEdited] = useState(null);
  const [answerText, setAnswerText] = useState("");

  useEffect(() => {
    setEdited(null);
    setAnswerText("");
  }, [task.id, task.pending_action]);

  const btnBase = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 14px",
    borderRadius: 999,
    fontSize: 12.5,
    background: "transparent",
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.5 : 1,
  };

  if (task.status === "awaiting_clarification" && task.pending_action) {
    const submit = () => {
      const trimmed = answerText.trim();
      if (trimmed) onAnswer?.(trimmed);
    };
    return (
      <div className="flex flex-col gap-3" style={{ color: palette.text }}>
        <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
          <Bot size={15} strokeWidth={1.8} style={{ color: palette.muted, flexShrink: 0 }} />
          {task.pending_action.question}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={answerText}
            disabled={busy}
            onChange={(e) => setAnswerText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Type your answer…"
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.2)",
              border: `1px solid ${palette.border}`,
              borderRadius: 6,
              padding: "8px 10px",
              color: palette.text,
              fontSize: 13.5,
              fontFamily: "inherit",
            }}
          />
          <button
            disabled={busy || !answerText.trim()}
            onClick={submit}
            style={{ ...btnBase, border: `1px solid ${palette.accent}`, color: palette.accent }}
          >
            <Send size={14} strokeWidth={2} /> Send
          </button>
        </div>
      </div>
    );
  }

  if (task.status === "awaiting_confirmation" && task.pending_action) {
    const args = task.pending_action.args || {};
    const current = edited || args;
    return (
      <div className="flex flex-col gap-3" style={{ color: palette.text }}>
        <div className="flex items-center gap-2" style={{ fontSize: 14 }}>
          <Bot size={15} strokeWidth={1.8} style={{ color: palette.muted, flexShrink: 0 }} />
          {task.pending_action.summary}
        </div>
        {Object.keys(args).length > 0 && (
          <div className="flex flex-col gap-2.5">
            {Object.keys(args).map((key) => (
              <EditableField
                key={key}
                label={key}
                value={current[key]}
                palette={palette}
                onChange={(v) => setEdited({ ...current, [key]: v })}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            onClick={() => onApprove(edited)}
            style={{ ...btnBase, border: `1px solid ${palette.accent}`, color: palette.accent }}
          >
            <Check size={14} strokeWidth={2} /> {edited ? "Approve with changes" : "Approve"}
          </button>
          <button
            disabled={busy}
            onClick={onReject}
            style={{ ...btnBase, border: `1px solid ${palette.danger}`, color: palette.danger }}
          >
            <X size={14} strokeWidth={2} /> Reject
          </button>
        </div>
      </div>
    );
  }

  if (task.status === "done") {
    return <p style={{ color: palette.text, margin: 0 }}>{task.result_text}</p>;
  }
  if (task.status === "failed") {
    return (
      <p style={{ color: palette.danger, fontSize: 13, margin: 0 }}>
        {task.error_message || "Something went wrong."}
      </p>
    );
  }
  if (task.status === "cancelled") {
    return <p style={{ color: palette.muted, fontSize: 13, margin: 0 }}>Cancelled.</p>;
  }

  return (
    <div className="flex items-center gap-2" style={{ color: palette.muted, fontSize: 13.5 }}>
      <Loader2 size={13} className="animate-spin" />
      {task.current_step || (task.status === "queued" ? "Queued…" : "Working on it…")}
    </div>
  );
}
