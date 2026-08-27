import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { space } from "../homeTheme";
import { GhostLink, IconButton, Tag, entryCardStyle, underlineInputStyle } from "../homeWidgets";

function emptyGroup() {
  return { id: crypto.randomUUID(), category: "", skills: [] };
}

function SkillGroup({ group, onChange, onRemove }) {
  const [draft, setDraft] = useState("");

  function addSkill() {
    const value = draft.trim();
    if (!value) return;
    onChange({ skills: [...group.skills, value] });
    setDraft("");
  }

  function removeSkill(index) {
    onChange({ skills: group.skills.filter((_, i) => i !== index) });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill();
    }
  }

  return (
    <div style={entryCardStyle}>
      <div className="flex items-start justify-between gap-3">
        <input
          value={group.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Category (e.g. Front-End)"
          style={{ ...underlineInputStyle, flex: 1 }}
        />
        <IconButton onClick={onRemove} title="Remove category" danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <div className="flex items-center" style={{ gap: space[3], marginTop: space[3] }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a skill and press Enter…"
          style={{ ...underlineInputStyle, flex: 1 }}
        />
        <GhostLink disabled={!draft.trim()} onClick={addSkill}>
          Add
        </GhostLink>
      </div>
      <div className="flex flex-wrap" style={{ gap: space[2], marginTop: space[3] }}>
        {group.skills.map((skill, i) => (
          <Tag key={i} onRemove={() => removeSkill(i)}>
            {skill}
          </Tag>
        ))}
      </div>
    </div>
  );
}

export default function CvSkillsTab({ sections, updateSections }) {
  function setGroups(fn) {
    updateSections((s) => ({ ...s, skill_groups: fn(s.skill_groups) }));
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

  return (
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      {sections.skill_groups.map((group) => (
        <SkillGroup
          key={group.id}
          group={group}
          onChange={(patch) => updateGroup(group.id, patch)}
          onRemove={() => removeGroup(group.id)}
        />
      ))}
      <GhostLink onClick={addGroup} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add category
      </GhostLink>
    </div>
  );
}
