import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import KanbanCard from "./KanbanCard";
import { fontHeading, accent, space, cream } from "../homeTheme";
import { GhostLink } from "../homeWidgets";

const EMPTY_LABEL = {
  todo: "Nothing to do yet.",
  in_progress: "Nothing in hand.",
  done: "Nothing finished yet.",
};

export default function KanbanColumn({ status, label, tasks, first, last, onAddCard, onEdit, onDelete }) {
  const { setNodeRef } = useDroppable({
    id: status,
    data: {
      type: "Column",
      status,
    },
  });

  return (
    <div
      style={{
        paddingRight: last ? 0 : space[8] * 0.9,
        paddingLeft: first ? 0 : space[8] * 0.9,
        borderRight: last ? "none" : `1px solid ${cream(0.1)}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ paddingBottom: space[3], borderBottom: `1px solid ${tasks.length ? `${accent[400]}66` : cream(0.18)}` }}
      >
        <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.55) }}>
          {label}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, color: tasks.length ? accent[300] : cream(0.4) }}>
          {tasks.length}
        </span>
      </div>

      <div ref={setNodeRef} style={{ flexGrow: 1, paddingTop: space[4], minHeight: 150 }}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <p style={{ margin: `${space[6]}px 0 0`, fontFamily: fontHeading, fontSize: 19, fontStyle: "italic", color: cream(0.38) }}>
            {EMPTY_LABEL[status] || "Nothing here yet."}
          </p>
        )}
      </div>

      <div style={{ marginTop: space[4] }}>
        <GhostLink onClick={onAddCard} muted style={{ fontSize: 14, fontFamily: "inherit" }}>
          + Add a card
        </GhostLink>
      </div>
    </div>
  );
}
