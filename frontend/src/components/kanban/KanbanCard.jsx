import { useState } from "react";
import { Bot, Pencil, Trash2, GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fontHeading, text, accent2700, space, cream } from "../homeTheme";
import { IconButton } from "../homeWidgets";

const PRIORITY_COLOR = {
  High: "rgba(224,140,140,0.95)",
  Medium: "#f0c9a2",
  Low: "#8fd6a8",
};

function dueDateColor(dueDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.round((due - today) / 86400000);
  if (diffDays < 0) return "rgba(224,140,140,0.95)";
  if (diffDays <= 2) return "#f0c9a2";
  return cream(0.45);
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
        padding: `${space[5] ?? 23}px 16px`,
        border: `1px solid ${isOverlay ? accent[400] : cream(0.12)}`,
        borderRadius: 12,
        background: isOverlay || isDragging 
          ? "rgba(225,173,102,0.14)"
          : hovered 
            ? "rgba(255,255,255,0.06)" 
            : "rgba(255,255,255,0.025)",
        backdropFilter: "blur(12px)",
        boxShadow: isOverlay
          ? "0 16px 36px rgba(0,0,0,0.5), 0 0 0 1px rgba(225,173,102,0.3)"
          : isDragging
            ? "none"
            : hovered 
              ? "0 4px 12px rgba(0,0,0,0.15)" 
              : "0 2px 6px rgba(0,0,0,0.1)",
        transition: isDragging || isOverlay ? "none" : "background 0.2s ease, box-shadow 0.2s ease",
        marginBottom: isOverlay ? 0 : space[3],
        position: "relative",
        opacity: isDragging && !isOverlay ? 0.35 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-start gap-2 min-w-0">
          <div className="mt-1 opacity-40 shrink-0">
            <GripVertical size={16} />
          </div>
          <span style={{ fontFamily: fontHeading, fontSize: 20, color: text.base, lineHeight: 1.2, wordBreak: "break-word" }}>{task.title}</span>
        </div>
        <div
          className="flex items-center gap-1 shrink-0 pointer-events-auto"
          style={{ opacity: hovered && !isDragging && !isOverlay ? 1 : 0, transition: "opacity 0.2s ease" }}
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
          style={{ marginTop: space[3], marginLeft: 24, fontSize: 13.5, lineHeight: 1.6, color: cream(0.62) }}
        >
          {task.description_markdown}
        </p>
      )}

      <div
        className="flex items-center flex-wrap pointer-events-none"
        style={{ gap: space[4], marginTop: space[4], marginLeft: 24, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: cream(0.45) }}
      >
        <span style={{ color: priorityColor }}>{task.priority}</span>
        <span>{task.effort} effort</span>
        {task.due_date && (
          <span style={{ fontVariantNumeric: "tabular-nums", color: dueDateColor(task.due_date) }}>{task.due_date}</span>
        )}
        {task.source === "ai" && (
          <span className="ml-auto inline-flex items-center" title="Added from a brain dump">
            <Bot size={13} style={{ color: cream(0.35) }} />
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
