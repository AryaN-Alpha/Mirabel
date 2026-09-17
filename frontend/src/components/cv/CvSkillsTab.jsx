import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { space, cream, accent, radius, fontMono, text } from "../homeTheme";
import { GhostLink, IconButton, entryCardStyle } from "../homeWidgets";
import { fieldStyle } from "./cvFieldStyle";

function emptyGroup() {
  return { id: crypto.randomUUID(), category: "", skills: [] };
}

function SortableSkillTag({ id, groupId, skill, index, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: "Skill",
      groupId,
      skill,
      index,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <span ref={setNodeRef} style={style} className="inline-flex items-center">
      <span
        className="inline-flex items-center gap-1.5"
        style={{
          padding: "3px 10px",
          border: `1px solid ${isDragging ? accent[400] : cream(0.18)}`,
          borderRadius: radius.sm,
          fontSize: 13,
          color: text.cream,
          background: isDragging ? "rgba(255, 151, 131, 0.12)" : "rgba(255, 255, 255, 0.03)",
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted hover:text-bright"
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: cream(0.42),
          }}
          title="Drag to reorder skill"
        >
          <GripVertical size={12} />
        </span>
        <span>{skill}</span>
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="inline-flex items-center border-none bg-transparent p-0 cursor-pointer ml-0.5"
            style={{ color: cream(0.45), transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(224,140,140,1)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = cream(0.45))}
            title={`Remove ${skill}`}
          >
            ✕
          </button>
        )}
      </span>
    </span>
  );
}

function SkillGroup({
  group,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}) {
  const [draft, setDraft] = useState("");
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: group.id,
    data: {
      type: "Group",
      group,
      index,
    },
  });

  const isFirst = index === 0;
  const isLast = index === total - 1;

  function addSkill() {
    const value = draft.trim();
    if (!value) return;
    onChange({ skills: [...group.skills, value] });
    setDraft("");
  }

  function removeSkill(skillIndex) {
    onChange({ skills: group.skills.filter((_, i) => i !== skillIndex) });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  }

  const groupStyle = {
    ...entryCardStyle,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    border: isDragging ? `1px solid ${accent[400]}` : entryCardStyle.border,
  };

  const skillIds = (group.skills || []).map((_, i) => `${group.id}::skill::${i}`);

  return (
    <div ref={setNodeRef} style={groupStyle}>
      {/* Category Header: Drag handle, Category # pill, Move Up/Down, Remove */}
      <div
        className="flex items-center justify-between"
        style={{
          marginBottom: space[3],
          paddingBottom: space[2],
          borderBottom: `1px solid ${cream(0.08)}`,
        }}
      >
        <div className="flex items-center min-w-0" style={{ gap: space[2] }}>
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing"
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: cream(0.45),
              padding: "2px 4px",
            }}
            title="Drag to reorder category"
          >
            <GripVertical size={15} />
          </span>
          <span
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              letterSpacing: "0.06em",
              padding: "2px 7px",
              borderRadius: radius.sm,
              background: "rgba(255, 151, 131, 0.1)",
              border: "1px solid rgba(255, 151, 131, 0.22)",
              color: accent[300],
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            Category #{index + 1}
          </span>
          {group.category && (
            <span
              style={{
                fontSize: 12,
                color: cream(0.6),
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {group.category} ({group.skills?.length || 0})
            </span>
          )}
        </div>
        <div className="flex items-center shrink-0" style={{ gap: 2 }}>
          <IconButton disabled={isFirst} onClick={onMoveUp} title={isFirst ? "First category" : "Move up"}>
            <ChevronUp size={15} />
          </IconButton>
          <IconButton disabled={isLast} onClick={onMoveDown} title={isLast ? "Last category" : "Move down"}>
            <ChevronDown size={15} />
          </IconButton>
          <IconButton onClick={onRemove} title="Remove category" danger>
            <Trash2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: space[3] }}>
        <input
          value={group.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Category (e.g. Front-End)"
          style={fieldStyle}
        />
        <div className="flex items-center" style={{ gap: space[3] }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a skill and press Enter…"
            style={{ ...fieldStyle, flex: 1 }}
          />
          <GhostLink disabled={!draft.trim()} onClick={addSkill}>
            Add
          </GhostLink>
        </div>
      </div>

      <div className="flex flex-wrap" style={{ gap: space[2], marginTop: space[3] }}>
        <SortableContext items={skillIds} strategy={rectSortingStrategy}>
          {(group.skills || []).map((skill, i) => (
            <SortableSkillTag
              key={`${group.id}::skill::${i}`}
              id={`${group.id}::skill::${i}`}
              groupId={group.id}
              skill={skill}
              index={i}
              onRemove={() => removeSkill(i)}
            />
          ))}
        </SortableContext>
        {(!group.skills || group.skills.length === 0) && (
          <span style={{ fontSize: 12, fontStyle: "italic", color: cream(0.4) }}>
            No skills added yet. Drag skills here or type above.
          </span>
        )}
      </div>
    </div>
  );
}

export default function CvSkillsTab({ sections, updateSections }) {
  const [activeItem, setActiveItem] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function setGroups(fn) {
    updateSections((s) => ({ ...s, skill_groups: fn(s.skill_groups || []) }));
  }

  function addGroup() {
    setGroups((groups) => [...groups, emptyGroup()]);
  }

  function removeGroup(id) {
    setGroups((groups) => groups.filter((g) => g.id !== id));
  }

  function updateGroup(id, patch) {
    setGroups((groups) => groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function moveGroup(index, direction) {
    const targetIndex = index + direction;
    setGroups((groups) => {
      if (targetIndex < 0 || targetIndex >= groups.length) return groups;
      return arrayMove(groups, index, targetIndex);
    });
  }

  function handleDragStart(event) {
    const { active } = event;
    const data = active.data.current;
    if (data?.type === "Group") {
      setActiveItem({ type: "Group", group: data.group });
    } else if (data?.type === "Skill") {
      setActiveItem({ type: "Skill", skill: data.skill, groupId: data.groupId });
    }
  }

  function handleDragEnd(event) {
    setActiveItem(null);
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === "Group") {
      const overGroupId = overData?.type === "Group" ? over.id : overData?.groupId;
      if (!overGroupId) return;
      setGroups((groups) => {
        const oldIndex = groups.findIndex((g) => g.id === active.id);
        const newIndex = groups.findIndex((g) => g.id === overGroupId);
        if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return groups;
        return arrayMove(groups, oldIndex, newIndex);
      });
    } else if (activeData?.type === "Skill") {
      const sourceGroupId = activeData.groupId;
      const sourceIndex = activeData.index;
      const targetGroupId = overData?.type === "Skill" ? overData.groupId : (overData?.type === "Group" ? over.id : null);

      if (!targetGroupId) return;

      setGroups((groups) => {
        const sourceGroup = groups.find((g) => g.id === sourceGroupId);
        if (!sourceGroup) return groups;

        if (sourceGroupId === targetGroupId) {
          const targetIndex = overData?.index != null ? overData.index : sourceGroup.skills.length - 1;
          if (sourceIndex === targetIndex) return groups;
          return groups.map((g) =>
            g.id === sourceGroupId
              ? { ...g, skills: arrayMove(g.skills, sourceIndex, targetIndex) }
              : g
          );
        } else {
          const targetGroup = groups.find((g) => g.id === targetGroupId);
          if (!targetGroup) return groups;

          const skillToMove = sourceGroup.skills[sourceIndex];
          if (!skillToMove) return groups;

          const targetIndex = overData?.type === "Skill" && overData?.index != null
            ? overData.index
            : targetGroup.skills.length;

          return groups.map((g) => {
            if (g.id === sourceGroupId) {
              return { ...g, skills: g.skills.filter((_, i) => i !== sourceIndex) };
            }
            if (g.id === targetGroupId) {
              const nextSkills = [...g.skills];
              nextSkills.splice(targetIndex, 0, skillToMove);
              return { ...g, skills: nextSkills };
            }
            return g;
          });
        }
      });
    }
  }

  const groups = sections?.skill_groups || [];
  const groupIds = groups.map((g) => g.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          {groups.map((group, index) => (
            <SkillGroup
              key={group.id}
              group={group}
              index={index}
              total={groups.length}
              onChange={(patch) => updateGroup(group.id, patch)}
              onRemove={() => removeGroup(group.id)}
              onMoveUp={() => moveGroup(index, -1)}
              onMoveDown={() => moveGroup(index, 1)}
            />
          ))}
        </SortableContext>
        <GhostLink onClick={addGroup} muted style={{ alignSelf: "flex-start" }}>
          <Plus size={13} /> Add category
        </GhostLink>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem?.type === "Group" && (
          <div
            style={{
              ...entryCardStyle,
              border: `1px solid ${accent[400]}`,
              boxShadow: "0 14px 34px rgba(0, 0, 0, 0.6)",
              background: "rgba(22, 19, 30, 0.95)",
              cursor: "grabbing",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: fontMono,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  padding: "2px 7px",
                  borderRadius: radius.sm,
                  background: "rgba(255, 151, 131, 0.15)",
                  border: "1px solid rgba(255, 151, 131, 0.3)",
                  color: accent[300],
                  fontWeight: 600,
                }}
              >
                {activeItem.group.category || "Skill Category"}
              </span>
              <span style={{ fontSize: 12, color: cream(0.6) }}>
                ({activeItem.group.skills?.length || 0} skills)
              </span>
            </div>
          </div>
        )}
        {activeItem?.type === "Skill" && (
          <span
            className="inline-flex items-center gap-1.5"
            style={{
              padding: "4px 11px",
              border: `1px solid ${accent[400]}`,
              borderRadius: radius.sm,
              fontSize: 13,
              color: text.bright,
              background: "rgba(255, 151, 131, 0.2)",
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.5)",
              cursor: "grabbing",
            }}
          >
            <GripVertical size={13} style={{ color: accent[300] }} />
            <span>{activeItem.skill}</span>
          </span>
        )}
      </DragOverlay>
    </DndContext>
  );
}
