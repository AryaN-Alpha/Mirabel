import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { inputStyle, buttonStyle } from "../CvPage";

function emptyExperience() {
  return { id: crypto.randomUUID(), title: "", company: "", location: "", start_date: "", end_date: "", bullets: [] };
}

function ExperienceEntry({ entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bulletsText = entry.bullets.join("\n");

  async function handleRewrite() {
    if (!bulletsText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection("experience", bulletsText, instructions);
      if (result.error) {
        setError(
          result.reason === "provider"
            ? "The model isn't cooperating right now. Try again in a sec."
            : "Something went wrong. Try again."
        );
      } else {
        onChange({
          bullets: result.text
            .split("\n")
            .map((line) => line.replace(/^[-•]\s*/, "").trim())
            .filter(Boolean),
        });
      }
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't rewrite that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2.5"
      style={{ background: "rgba(243,233,226,0.04)", border: "1px solid rgba(243,233,226,0.08)" }}
    >
      <div className="flex gap-2">
        <input
          value={entry.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Job title"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <input
          value={entry.company}
          onChange={(e) => onChange({ company: e.target.value })}
          placeholder="Company"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
      </div>
      <div className="flex gap-2">
        <input
          value={entry.location}
          onChange={(e) => onChange({ location: e.target.value })}
          placeholder="Location"
          className="flex-1 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <input
          value={entry.start_date}
          onChange={(e) => onChange({ start_date: e.target.value })}
          placeholder="Start"
          className="w-24 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
        <input
          value={entry.end_date}
          onChange={(e) => onChange({ end_date: e.target.value })}
          placeholder="End"
          className="w-24 px-3.5 py-2.5 rounded-full text-[13px] outline-none"
          style={inputStyle}
        />
      </div>
      <textarea
        value={bulletsText}
        onChange={(e) => onChange({ bullets: e.target.value.split("\n") })}
        placeholder="One bullet per line…"
        rows={4}
        className="w-full px-3.5 py-3 rounded-2xl text-[13px] outline-none resize-y"
        style={inputStyle}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        className="w-full px-3.5 py-2 rounded-full text-[12.5px] outline-none"
        style={inputStyle}
      />
      <div className="flex items-center justify-between">
        <button
          onClick={handleRewrite}
          disabled={busy || !bulletsText.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] border-none cursor-pointer"
          style={{ ...buttonStyle, opacity: busy || !bulletsText.trim() ? 0.5 : 1 }}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          Ask AI to rewrite
        </button>
        <button
          onClick={onRemove}
          className="p-2 rounded-full border-none cursor-pointer"
          style={{ background: "transparent", color: "rgba(224,140,140,0.85)" }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {error && (
        <p className="text-[12px] px-1" style={{ color: "rgba(224,140,140,0.9)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

export default function CvExperienceTab({ sections, updateSections }) {
  function setEntries(fn) {
    updateSections((s) => ({ ...s, experience: fn(s.experience) }));
  }

  function addEntry() {
    setEntries((entries) => [...entries, emptyExperience()]);
  }

  function removeEntry(id) {
    setEntries((entries) => entries.filter((e) => e.id !== id));
  }

  function updateEntry(id, patch) {
    setEntries((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  return (
    <div className="flex flex-col gap-5">
      {sections.experience.map((entry) => (
        <ExperienceEntry
          key={entry.id}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
      <button
        onClick={addEntry}
        className="self-start flex items-center gap-1.5 text-[12.5px] px-4 py-2 rounded-full border-none cursor-pointer"
        style={buttonStyle}
      >
        <Plus size={13} /> Add experience
      </button>
    </div>
  );
}
