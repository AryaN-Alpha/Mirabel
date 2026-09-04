import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { regenerateCvSection } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { space } from "../homeTheme";
import { GhostLink, IconButton, ErrorNote, entryCardStyle } from "../homeWidgets";
import { fieldStyle, textareaFieldStyle } from "./cvFieldStyle";

function emptyExperience() {
  return { id: crypto.randomUUID(), title: "", company: "", location: "", start_date: "", end_date: "", bullets: [] };
}

function ExperienceEntry({ cvId, entry, onChange, onRemove }) {
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bulletsText = entry.bullets.join("\n");

  async function handleRewrite() {
    if (!bulletsText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateCvSection(cvId, "experience", bulletsText, instructions);
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
    <div style={entryCardStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 flex flex-col" style={{ gap: space[3] }}>
          <div className="flex" style={{ gap: space[4] }}>
            <input
              value={entry.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Job title"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <input
              value={entry.company}
              onChange={(e) => onChange({ company: e.target.value })}
              placeholder="Company"
              style={{ ...fieldStyle, flex: 1 }}
            />
          </div>
          <div className="flex" style={{ gap: space[4] }}>
            <input
              value={entry.location}
              onChange={(e) => onChange({ location: e.target.value })}
              placeholder="Location"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <input
              value={entry.start_date}
              onChange={(e) => onChange({ start_date: e.target.value })}
              placeholder="Start"
              style={{ ...fieldStyle, width: 100, flex: "0 0 auto" }}
            />
            <input
              value={entry.end_date}
              onChange={(e) => onChange({ end_date: e.target.value })}
              placeholder="End"
              style={{ ...fieldStyle, width: 100, flex: "0 0 auto" }}
            />
          </div>
        </div>
        <IconButton onClick={onRemove} title="Remove experience" danger>
          <Trash2 size={15} />
        </IconButton>
      </div>
      <textarea
        value={bulletsText}
        onChange={(e) => onChange({ bullets: e.target.value.split("\n") })}
        placeholder="One bullet per line…"
        rows={4}
        className="w-full resize-y"
        style={{ ...textareaFieldStyle, marginTop: space[4] }}
      />
      <input
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Optional instructions for the rewrite…"
        style={{ ...fieldStyle, marginTop: space[3] }}
      />
      <div style={{ marginTop: space[3] }}>
        <GhostLink onClick={handleRewrite} disabled={busy || !bulletsText.trim()}>
          {busy && <Loader2 size={13} className="animate-spin" />}
          Ask AI to rewrite →
        </GhostLink>
      </div>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}

export default function CvExperienceTab({ cvId, sections, updateSections }) {
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
    <div className="flex flex-col" style={{ gap: space[5] ?? 23 }}>
      {sections.experience.map((entry) => (
        <ExperienceEntry
          key={entry.id}
          cvId={cvId}
          entry={entry}
          onChange={(patch) => updateEntry(entry.id, patch)}
          onRemove={() => removeEntry(entry.id)}
        />
      ))}
      <GhostLink onClick={addEntry} muted style={{ alignSelf: "flex-start" }}>
        <Plus size={13} /> Add experience
      </GhostLink>
    </div>
  );
}
