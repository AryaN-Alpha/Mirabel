import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { fontHeading, text, accent, space, cream } from "../homeTheme";
import { IconButton, GhostLink } from "../homeWidgets";

export default function CvVersionTabs({ cvs, selectedId, onSelect, onNew, onEdit, onDelete }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div className="flex items-center flex-wrap" style={{ gap: space[6] }}>
      {cvs.map((cv) => {
        const active = cv.id === selectedId;
        const hovered = hoveredId === cv.id;
        return (
          <div
            key={cv.id}
            className="flex items-center"
            style={{ gap: space[1] }}
            onMouseEnter={() => setHoveredId(cv.id)}
            onMouseLeave={() => setHoveredId((h) => (h === cv.id ? null : h))}
          >
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onSelect(cv.id);
              }}
              className="no-underline inline-flex items-center"
              style={{
                paddingBottom: space[2],
                borderBottom: `1px solid ${active ? accent[400] : hovered ? accent[600] : "transparent"}`,
                fontFamily: fontHeading,
                fontSize: 19,
                color: active ? text.base : hovered ? text.base : cream(0.6),
                transition: "color 0.4s ease, border-color 0.4s ease",
              }}
            >
              {cv.name}
            </a>
            {hovered && (
              <span className="inline-flex items-center">
                <IconButton onClick={() => onEdit(cv)} title="Rename CV">
                  <Pencil size={12} />
                </IconButton>
                <IconButton onClick={() => onDelete(cv)} title="Delete CV" danger>
                  <Trash2 size={12} />
                </IconButton>
              </span>
            )}
          </div>
        );
      })}
      <GhostLink onClick={onNew} muted style={{ fontSize: 16, paddingBottom: space[2] }}>
        <Plus size={13} strokeWidth={1.8} />
        New CV
      </GhostLink>
    </div>
  );
}
