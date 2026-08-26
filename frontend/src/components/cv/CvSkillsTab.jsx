import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { inputStyle, buttonStyle } from "../CvPage";

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
    <div
      className="rounded-2xl p-4 flex flex-col gap-2.5"
      style={{ background: "rgba(243,233,226,0.04)", border: "1px solid rgba(243,233,226,0.08)" }}
    >
      <div className="flex gap-2">
        <input
          value={group.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="Category (e.g. Front-End)"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <button
          onClick={onRemove}
          className="p-2 rounded-full border-none cursor-pointer"
          style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a skill and press Enter…"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <button
          onClick={addSkill}
          disabled={!draft.trim()}
          className="px-4 py-2.5 rounded-full text-[12.5px] border-none cursor-pointer"
          style={{ ...buttonStyle, opacity: draft.trim() ? 1 : 0.5 }}
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.skills.map((skill, i) => (
          <span
            key={i}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px]"
            style={{ background: "rgba(243,233,226,0.08)", color: "#f3e9e2" }}
          >
            {skill}
            <button
              onClick={() => removeSkill(i)}
              className="border-none bg-transparent cursor-pointer p-0 flex items-center"
              style={{ color: "rgba(243,233,226,0.5)" }}
            >
              <X size={12} />
            </button>
          </span>
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
    <div className="flex flex-col gap-5">
      {sections.skill_groups.map((group) => (
        <SkillGroup
          key={group.id}
          group={group}
          onChange={(patch) => updateGroup(group.id, patch)}
          onRemove={() => removeGroup(group.id)}
        />
      ))}
      <button
        onClick={addGroup}
        className="self-start flex items-center gap-1.5 text-[12.5px] px-4 py-2 rounded-full border-none cursor-pointer"
        style={buttonStyle}
      >
        <Plus size={13} /> Add category
      </button>
    </div>
  );
}
