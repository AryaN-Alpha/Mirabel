import { useState } from "react";
import { Plus } from "lucide-react";
import KanbanCard from "./KanbanCard";
import { cardStyle } from "../KanbanPage";

export default function KanbanColumn({ status, label, tasks, onReorder, onAddCard, onEdit, onDelete }) {
  const [dragOverIndex, setDragOverIndex] = useState(null);

  function handleDropAt(index, e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    const draggedId = Number(e.dataTransfer.getData("text/plain"));
    if (!draggedId) return;
    const ids = tasks.map((t) => t.id).filter((id) => id !== draggedId);
    const insertAt = Math.min(index, ids.length);
    ids.splice(insertAt, 0, draggedId);
    onReorder(ids);
  }

  return (
    <div className="rounded-3xl p-4 flex flex-col gap-3 min-h-[200px]" style={cardStyle}>
      <div className="flex items-center justify-between px-1">
        <p className="text-[12px] uppercase tracking-[0.08em]" style={{ color: "rgba(243,233,226,0.55)" }}>
          {label} <span style={{ color: "rgba(243,233,226,0.3)" }}>· {tasks.length}</span>
        </p>
        <button
          onClick={onAddCard}
          className="w-6 h-6 grid place-items-center rounded-full border-none cursor-pointer"
          style={{ background: "rgba(243,233,226,0.08)", color: "rgba(243,233,226,0.6)" }}
        >
          <Plus size={13} strokeWidth={2} />
        </button>
      </div>

      <div
        className="flex flex-col gap-2.5 flex-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDropAt(tasks.length, e)}
        data-status={status}
      >
        {tasks.map((task, index) => (
          <div
            key={task.id}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverIndex(index);
            }}
            onDrop={(e) => handleDropAt(index, e)}
            style={{ borderTop: dragOverIndex === index ? "2px solid rgba(240,168,120,0.6)" : "2px solid transparent" }}
          >
            <KanbanCard task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task.id)} />
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-[12px] text-center py-6" style={{ color: "rgba(243,233,226,0.3)" }}>
            No cards yet.
          </p>
        )}
      </div>
    </div>
  );
}
