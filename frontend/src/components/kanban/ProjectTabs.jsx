import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { fontHeading, accent, space, cream } from "../homeTheme";
import { IconButton, GhostLink } from "../homeWidgets";

function ProjectTab({ project, active, onSelect, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center"
      style={{ gap: space[2] }}
    >
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onSelect();
        }}
        className="no-underline"
        style={{
          paddingBottom: space[2],
          borderBottom: `1px solid ${active ? accent[400] : "transparent"}`,
          fontFamily: fontHeading,
          fontSize: 19,
          color: active ? "#f6efe4" : hovered ? "#f6efe4" : cream(0.6),
          transition: "color 0.4s ease, border-color 0.4s ease",
        }}
      >
        {project.name}
      </a>
      {hovered && (
        <div className="flex items-center gap-0.5" style={{ paddingBottom: 2 }}>
          <IconButton onClick={onEdit} title="Rename project">
            <Pencil size={12} />
          </IconButton>
          <IconButton onClick={onDelete} title="Delete project" danger>
            <Trash2 size={12} />
          </IconButton>
        </div>
      )}
    </div>
  );
}

export default function ProjectTabs({ projects, selectedId, onSelect, onNew, onEdit, onDelete }) {
  return (
    <div className="flex items-center flex-wrap" style={{ gap: space[6] }}>
      {projects.map((project) => (
        <ProjectTab
          key={project.id}
          project={project}
          active={project.id === selectedId}
          onSelect={() => onSelect(project.id)}
          onEdit={() => onEdit(project)}
          onDelete={() => onDelete(project)}
        />
      ))}
      <GhostLink onClick={onNew} muted style={{ fontSize: 15 }}>
        + New project
      </GhostLink>
    </div>
  );
}
