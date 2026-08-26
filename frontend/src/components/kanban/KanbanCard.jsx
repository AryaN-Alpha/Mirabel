import { Bot, Calendar, Gauge, Pencil, Trash2 } from "lucide-react";

const PRIORITY_STYLES = {
  High: { bg: "rgba(224,80,80,0.16)", fg: "#f3a3a3", dot: "#e85d5d", accent: "#e85d5d" },
  Medium: { bg: "rgba(230,175,60,0.16)", fg: "#f0cf8f", dot: "#e6b13c", accent: "#e6b13c" },
  Low: { bg: "rgba(90,190,140,0.16)", fg: "#9fdcb8", dot: "#4fc98a", accent: "#4fc98a" },
};

const EFFORT_LEVELS = { Low: 1, Medium: 2, High: 3 };
const EFFORT_TONE = { bg: "rgba(150,175,235,0.14)", fg: "rgba(198,211,245,0.9)", fill: "rgba(198,211,245,0.9)" };

function PriorityBadge({ priority }) {
  const tone = PRIORITY_STYLES[priority] || PRIORITY_STYLES.Medium;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.04em] px-2 py-[3px] rounded-full"
      style={{ background: tone.bg, color: tone.fg }}
    >
      <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: tone.dot }} />
      {priority}
    </span>
  );
}

function EffortMeter({ effort }) {
  const level = EFFORT_LEVELS[effort] || 2;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.04em] px-2 py-[3px] rounded-full"
      style={{ background: EFFORT_TONE.bg, color: EFFORT_TONE.fg }}
    >
      <Gauge size={10} strokeWidth={2.2} />
      <span className="flex items-center gap-[2px]">
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="w-[3px] h-[8px] rounded-full"
            style={{ background: i <= level ? EFFORT_TONE.fill : "rgba(198,211,245,0.22)" }}
          />
        ))}
      </span>
      {effort}
    </span>
  );
}

function dueDateTone(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return { bg: "rgba(224,80,80,0.16)", fg: "#f3a3a3" };
  if (diffDays <= 2) return { bg: "rgba(230,175,60,0.16)", fg: "#f0cf8f" };
  return { bg: "rgba(243,233,226,0.07)", fg: "rgba(243,233,226,0.55)" };
}

export default function KanbanCard({ task, onEdit, onDelete }) {
  const priorityTone = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.Medium;
  const dueTone = task.due_date ? dueDateTone(task.due_date) : null;

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(task.id));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="group rounded-2xl p-3.5 flex flex-col gap-2.5 cursor-grab active:cursor-grabbing transition-all duration-150 hover:-translate-y-[1px]"
      style={{
        background: "linear-gradient(165deg, rgba(243,233,226,0.06), rgba(243,233,226,0.03))",
        border: "1px solid rgba(243,233,226,0.08)",
        borderLeft: `3px solid ${priorityTone.accent}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] leading-snug" style={{ color: "#f3e9e2" }}>
          {task.title}
        </p>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <button
            onClick={onEdit}
            className="border-none bg-transparent cursor-pointer p-0.5"
            style={{ color: "rgba(243,233,226,0.45)" }}
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={onDelete}
            className="border-none bg-transparent cursor-pointer p-0.5"
            style={{ color: "rgba(224,140,140,0.6)" }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {task.description_markdown && (
        <p className="text-[11.5px] line-clamp-2" style={{ color: "rgba(243,233,226,0.5)" }}>
          {task.description_markdown}
        </p>
      )}

      <div className="flex items-center flex-wrap gap-1.5">
        <PriorityBadge priority={task.priority} />
        <EffortMeter effort={task.effort} />
        {task.due_date && (
          <span
            className="inline-flex items-center gap-1 text-[10px] px-2 py-[3px] rounded-full"
            style={{ background: dueTone.bg, color: dueTone.fg }}
          >
            <Calendar size={10} strokeWidth={2.2} />
            {task.due_date}
          </span>
        )}
        {task.source === "ai" && (
          <span className="ml-auto inline-flex items-center" title="Added from a brain dump">
            <Bot size={12} style={{ color: "rgba(243,233,226,0.35)" }} />
          </span>
        )}
      </div>
    </div>
  );
}
