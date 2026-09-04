import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { space } from "../homeTheme";
import { IconButton, GhostLink, TabLink } from "../homeWidgets";

function ProjectTab({ project, active, onSelect, onEdit, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center"
      style={{ gap: space[2] }}
    >
      <TabLink active={active} onClick={onSelect}>
        {project.name}
      </TabLink>
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
