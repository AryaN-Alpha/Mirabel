import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

export default function ProjectTabs({ projects, selectedId, onSelect, onNew, onEdit, onDelete }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {projects.map((project) => {
        const active = project.id === selectedId;
        const hovered = hoveredId === project.id;
        return (
          <div
            key={project.id}
            onMouseEnter={() => setHoveredId(project.id)}
            onMouseLeave={() => setHoveredId((h) => (h === project.id ? null : h))}
            className="flex items-center rounded-full transition-all duration-200"
            style={{
              background: active
                ? "linear-gradient(150deg, rgba(255,224,199,0.92), rgba(224,168,168,0.85))"
                : "rgba(243,233,226,0.06)",
              border: active ? "none" : "1px solid rgba(243,233,226,0.09)",
            }}
          >
            <button
              onClick={() => onSelect(project.id)}
              className="px-4 py-2 rounded-full text-[13px] tracking-[0.01em] border-none cursor-pointer bg-transparent"
              style={{ color: active ? "#2c1c16" : "rgba(243,233,226,0.65)" }}
            >
              {project.name}
            </button>
            {hovered && (
              <div className="flex items-center gap-0.5 pr-1.5">
                <button
                  onClick={() => onEdit(project)}
                  className="w-5 h-5 grid place-items-center rounded-full border-none cursor-pointer bg-transparent"
                  style={{ color: active ? "rgba(44,28,22,0.65)" : "rgba(243,233,226,0.45)" }}
                  title="Rename project"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() => onDelete(project)}
                  className="w-5 h-5 grid place-items-center rounded-full border-none cursor-pointer bg-transparent"
                  style={{ color: active ? "rgba(150,30,30,0.75)" : "rgba(224,140,140,0.6)" }}
                  title="Delete project"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onNew}
        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] cursor-pointer"
        style={{
          background: "rgba(243,233,226,0.03)",
          border: "1px dashed rgba(243,233,226,0.22)",
          color: "rgba(243,233,226,0.55)",
        }}
      >
        <Plus size={13} strokeWidth={2} />
        New project
      </button>
    </div>
  );
}
