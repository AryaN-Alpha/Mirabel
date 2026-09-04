import { useState } from "react";
import { Bot, Pencil, Trash2, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fontHeading, text, accent, accent2700, space, cream } from "../homeTheme";
import { IconButton } from "../homeWidgets";

const PRIORITY_COLOR = {
  High: "#f87171",
  Medium: "#facc15",
  Low: "#4ade80",
};

function dueDateColor(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return "#f87171";
  if (diffDays <= 2) return "#facc15";
  return text.secondary;
}

export function KanbanCardUI({ task, onEdit, onDelete, isDragging, isOverlay, listeners, attributes, setNodeRef, style }) {
  const [hovered, setHovered] = useState(false);
  const priorityColor = PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.Medium;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-task-id={task.id}
      className={`select-none ${isOverlay || isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        ...style,
        width: "100%",
        boxSizing: "border-box",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        padding: "16px 18px",
        border: `1px solid ${isOverlay ? accent[400] : hovered ? cream(0.18) : cream(0.09)}`,
        borderRadius: 14,
        background: isOverlay || isDragging 
          ? "rgba(225,173,102,0.18)"
          : hovered 
            ? "linear-gradient(165deg, rgba(26,22,34,0.85) 0%, rgba(14,12,20,0.80) 100%)" 
            : "linear-gradient(165deg, rgba(18,16,24,0.70) 0%, rgba(10,9,14,0.60) 100%)",
        backdropFilter: "blur(16px)",
        boxShadow: isOverlay
          ? "0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(225,173,102,0.4)"
          : isDragging
            ? "none"
            : hovered 
              ? "0 10px 24px -10px rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.06)" 
              : "0 4px 12px -6px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.03)",
        transition: isDragging || isOverlay ? "none" : "all 0.2s ease",
        marginBottom: isOverlay ? 0 : space[3],
        position: "relative",
        opacity: isDragging && !isOverlay ? 0.35 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="mt-1 opacity-50 shrink-0 text-white">
            <GripVertical size={16} />
          </div>
          <span style={{ fontFamily: fontHeading, fontSize: 17, fontWeight: 600, color: text.bright, lineHeight: 1.25, wordBreak: "break-word" }}>
            {task.title}
          </span>
        </div>
        <div
          className="flex items-center gap-1 shrink-0 pointer-events-auto"
          style={{ opacity: hovered && !isDragging && !isOverlay ? 1 : 0, transition: "opacity 0.15s ease" }}
        >
          <IconButton onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit card">
            <Pencil size={13} />
          </IconButton>
          <IconButton onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete card" danger>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>

      {task.description_markdown && (
        <p
          className="line-clamp-2 pointer-events-none"
          style={{ marginTop: 8, marginLeft: 26, fontSize: 14, lineHeight: 1.55, color: text.secondary }}
        >
          {task.description_markdown}
        </p>
      )}

      <div
        className="flex items-center flex-wrap pointer-events-none"
        style={{ gap: 12, marginTop: 12, marginLeft: 26, fontSize: 12, letterSpacing: "0.06em" }}
      >
        <span
          className="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
          style={{
            color: priorityColor,
            background: `${priorityColor}18`,
            border: `1px solid ${priorityColor}33`,
          }}
        >
          {task.priority}
        </span>
        <span style={{ color: text.secondary }}>{task.effort} effort</span>
        {task.due_date && (
          <span style={{ fontVariantNumeric: "tabular-nums", color: dueDateColor(task.due_date), fontWeight: 500 }}>
            {task.due_date}
          </span>
        )}
        {task.source === "ai" && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-[#38bdf8]" title="Added from a brain dump">
            <Bot size={13} />
            <span>AI</span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function KanbanCard({ task, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: "Task",
      task,
    },
  });

  const style = {
    // When using DragOverlay, do NOT transform the active dragged item across the screen.
    // CSS.Translate is used to avoid scale distortion on sibling items.
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    transition,
  };

  return (
    <KanbanCardUI
      task={task}
      onEdit={onEdit}
      onDelete={onDelete}
      isDragging={isDragging}
      listeners={listeners}
      attributes={attributes}
      setNodeRef={setNodeRef}
      style={style}
    />
  );
}
