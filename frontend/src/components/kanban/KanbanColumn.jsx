import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";
import { fontHeading, accent, space, text, surface, glassBorder } from "../homeTheme";
import { GhostLink } from "../homeWidgets";

const EMPTY_LABEL = {
  todo: "Nothing to do yet.",
  in_progress: "Nothing in hand.",
  done: "Nothing finished yet.",
};

const COLUMN_COLORS = {
  todo: "#38bdf8",
  in_progress: "#fbbf24",
  done: "#34d399",
};

export default function KanbanColumn({ status, label, tasks, first, last, onAddCard, onEdit, onDelete }) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: {
      type: "Column",
      status,
    },
  });

  const dotColor = COLUMN_COLORS[status] || accent[400];

  return (
    <div
      style={{
        paddingRight: last ? 0 : space[6],
        paddingLeft: first ? 0 : space[6],
        borderRight: last ? "none" : `1px solid ${glassBorder}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{
          paddingBottom: space[3],
          borderBottom: `1px solid ${tasks.length ? "rgba(255,151,131,0.35)" : "rgba(255,255,255,0.08)"}`,
        }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: dotColor,
              boxShadow: `0 0 8px ${dotColor}80`,
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: text.bright,
            }}
          >
            {label}
          </span>
        </div>
        <span
          style={{
            fontVariantNumeric: "tabular-nums",
            fontSize: 12,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 9999,
            background: tasks.length ? "rgba(255,151,131,0.14)" : "rgba(255,255,255,0.06)",
            color: tasks.length ? accent[300] : text.muted,
            border: `1px solid ${tasks.length ? "rgba(255,151,131,0.25)" : "rgba(255,255,255,0.06)"}`,
          }}
        >
          {tasks.length}
        </span>
      </div>

      <div ref={setNodeRef} style={{ flexGrow: 1, paddingTop: space[4], minHeight: 180 }}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p
            style={{
              margin: `${space[6]}px 0 0`,
              fontFamily: fontHeading,
              fontSize: 18,
              fontStyle: "italic",
              color: text.muted,
              textAlign: "center",
              padding: "28px 16px",
              border: `1px dashed ${glassBorder}`,
              borderRadius: 8,
              background: "rgba(255,255,255,0.01)",
            }}
          >
            {EMPTY_LABEL[status] || "Nothing here yet."}
          </p>
        )}
      </div>

      <div style={{ marginTop: space[4], paddingTop: space[2] }}>
        <GhostLink onClick={onAddCard} muted style={{ fontSize: 14, fontFamily: "inherit" }}>
          + Add a card
        </GhostLink>
      </div>
    </div>
  );
}
